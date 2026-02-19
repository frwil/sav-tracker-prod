"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import { syncQueueStorage } from "../services/storage";
import { SyncTask } from "@/types/SyncTask";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";

interface SyncContextType {
    queue: SyncTask[];
    addToQueue: (
        task: Omit<SyncTask, "id" | "timestamp" | "retryCount">,
    ) => void;
    processQueue: () => Promise<void>; // ✅ AJOUTÉ
    isSyncing: boolean;
    isOnline: boolean;
    refreshAllData: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
    queue: [],
    addToQueue: () => {},
    processQueue: async () => {}, // ✅ AJOUTÉ
    isSyncing: false,
    isOnline: true,
    refreshAllData: async () => {},
});

export const useSync = () => useContext(SyncContext);

export default function SyncProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [queue, setQueue] = useState<SyncTask[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    
    const queryClient = useQueryClient();
    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // 1. CHARGEMENT INITIAL
    useEffect(() => {
        setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

        const loadQueue = async () => {
            try {
                const savedQueue =
                    await syncQueueStorage.getItem<SyncTask[]>("queue");
                if (savedQueue && Array.isArray(savedQueue)) {
                    setQueue(savedQueue);
                    console.log(
                        `📂 ${savedQueue.length} tâches chargées depuis IndexedDB`,
                    );
                }
            } catch (e) {
                console.error("Erreur lecture IndexedDB", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadQueue();
    }, []);

    // 2. PERSISTANCE AUTOMATIQUE
    useEffect(() => {
        if (isLoaded) {
            syncQueueStorage
                .setItem("queue", queue)
                .catch((e) => console.error("Erreur écriture IndexedDB", e));
        }
    }, [queue, isLoaded]);

    /**
     * 🟢 RAFRAÎCHISSEMENT GLOBAL DES DONNÉES
     */
    const refreshAllData = useCallback(async () => {
        if (!navigator.onLine) {
            toast("Pas de connexion internet pour mettre à jour.", { icon: "📴" });
            return;
        }

        const toastId = toast.loading("Mise à jour des données...");

        try {
            const token = localStorage.getItem("sav_token");
            if (!token) return;

            const resCustomers = await fetch(`${API_URL}/customers?pagination=false`, {
                headers: { 
                    Authorization: `Bearer ${token}`, 
                    Accept: "application/ld+json" 
                }
            });
            
            if (resCustomers.ok) {
                const data = await resCustomers.json();
                const rawMembers = data['hydra:member'] || data['member'] || [];
                
                const formattedOptions = rawMembers.map((c: any) => ({
                    value: c['@id'] || `/api/customers/${c.id}`, 
                    label: c.zone ? `${c.name} (${c.zone})` : c.name
                }));
                
                localStorage.setItem('sav_customers_cache', JSON.stringify(formattedOptions));
            }

            await queryClient.invalidateQueries();

            toast.success("Données à jour !", { id: toastId });
            console.log("🔄 Données rafraîchies depuis le serveur");

        } catch (e) {
            console.error("Erreur refreshAllData", e);
            toast.error("Erreur lors de la mise à jour", { id: toastId });
        }
    }, [API_URL, queryClient]);

    /**
     * 🔴 LOG ERREUR SYNC
     */
    const logSyncError = async (item: SyncTask, errorMsg: string, token: string) => {
        try {
            await fetch(`${API_URL}/audit_logs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    action: "SYNC_ERROR",
                    endpoint: `${item.method} ${item.url}`,
                    errorMessage: errorMsg,
                    requestPayload: item.body,
                }),
            });
            toast(`Note : Erreur enregistrée pour l'élément ${item.id.slice(0,4)}...`, {
                icon: "📝",
                duration: 4000,
            });
        } catch (e) {
            console.error("Impossible d'envoyer le log d'erreur", e);
        }
    };

    /**
     * ⚡ MOTEUR DE SYNCHRONISATION
     */
    const processQueue = useCallback(async () => {
        if (queue.length === 0 || isSyncing || !navigator.onLine) return;

        setIsSyncing(true);
        const token = localStorage.getItem("sav_token");

        if (!token) {
            setIsSyncing(false);
            return;
        }

        const processedIds: string[] = [];
        const currentQueue = [...queue];

        for (const item of currentQueue) {
            let shouldRemove = false;

            try {
                const res = await fetch(`${API_URL}${item.url}`, {
                    method: item.method,
                    headers: {
                        "Content-Type": item.method === "PATCH" ? "application/merge-patch+json" : "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(item.body),
                });

                if (res.ok) {
                    console.log(`✅ Synchro réussie : ${item.url}`);
                    shouldRemove = true;
                } else {
                    const errorJson = await res.json().catch(() => ({}));
                    const errorMsg = errorJson["hydra:description"] || errorJson.detail || `Erreur ${res.status}`;
                    
                    toast.error(`❌ Erreur sync sur ${item.url} (Abandon)`);
                    console.error(`❌ Erreur API (${res.status}) sur ${item.url} - Élément retiré de la file.`);

                    shouldRemove = true;
                    logSyncError(item, `Status ${res.status}: ${errorMsg}`, token).catch(console.error);
                }
            } catch (error) {
                toast.error(`🌐 Réseau instable sur ${item.url}. Pause.`);
                console.warn(`🌐 Erreur Réseau. Pause.`);
                break;
            } finally {
                if (shouldRemove) {
                    processedIds.push(item.id);
                }
            }
        }

        if (processedIds.length > 0) {
            setQueue((prev) => prev.filter((task) => !processedIds.includes(task.id)));
            
            const allProcessed = currentQueue.every(task => processedIds.includes(task.id));
            if (allProcessed && processedIds.length > 0) {
                 setTimeout(() => refreshAllData(), 1000);
            }
        }

        setIsSyncing(false);
    }, [queue, isSyncing, API_URL, refreshAllData]);

    // 4. GESTION ÉVÉNEMENTS RÉSEAU
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            toast.success("🟢 Connexion rétablie !");
            processQueue();
            refreshAllData();
        };

        const handleOffline = () => {
            setIsOnline(false);
            toast("📴 Mode hors ligne activé");
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        if (navigator.onLine && queue.length > 0 && isLoaded) {
            processQueue();
        }

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [processQueue, refreshAllData, queue.length, isLoaded]);

    const addToQueue = (taskData: Omit<SyncTask, "id" | "timestamp" | "retryCount">) => {
        const newTask: SyncTask = {
            ...taskData,
            id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            retryCount: 0,
        };

        setQueue((prev) => [...prev, newTask]);
        toast("💾 Action sauvegardée localement.", {
            icon: "💾",
            style: { background: "#e4c61c", color: "#000" },
            duration: 3000,
        });

        if (navigator.onLine) {
            setTimeout(() => processQueue(), 500);
        }
    };

    return (
        <SyncContext.Provider value={{ 
            queue, 
            addToQueue, 
            processQueue, // ✅ AJOUTÉ ICI
            isSyncing, 
            isOnline, 
            refreshAllData 
        }}>
            {children}

            {queue.length > 0 && (
                <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-4">
                    <div className={`px-4 py-2 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 transition-colors ${
                        isSyncing ? "bg-blue-600 text-white" : navigator.onLine ? "bg-yellow-400 text-yellow-900" : "bg-gray-800 text-white"
                    }`}>
                        {isSyncing ? <>🔄 Synchronisation...</> : navigator.onLine ? <>⏳ En attente ({queue.length})</> : <>🌐 Hors ligne ({queue.length})</>}
                    </div>
                </div>
            )}
        </SyncContext.Provider>
    );
}