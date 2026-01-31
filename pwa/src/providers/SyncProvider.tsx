// pwa/src/providers/SyncProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { syncQueueStorage } from "../services/storage"; // ✅ Import IndexedDB
import { SyncTask } from "@/types/SyncTask"; // ✅ Utilisation de votre type existant

interface SyncContextType {
    queue: SyncTask[];
    addToQueue: (task: Omit<SyncTask, "id" | "timestamp" | "retryCount">) => void;
    isSyncing: boolean;
}

const SyncContext = createContext<SyncContextType>({
    queue: [],
    addToQueue: () => {},
    isSyncing: false,
});

export const useSync = () => useContext(SyncContext);

export default function SyncProvider({ children }: { children: React.ReactNode }) {
    const [queue, setQueue] = useState<SyncTask[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false); // État pour attendre le chargement de la DB
    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // 1. CHARGEMENT INITIAL (Asynchrone via IndexedDB)
    useEffect(() => {
        const loadQueue = async () => {
            try {
                const savedQueue = await syncQueueStorage.getItem<SyncTask[]>("queue");
                if (savedQueue && Array.isArray(savedQueue)) {
                    setQueue(savedQueue);
                    console.log(`📂 ${savedQueue.length} tâches chargées depuis IndexedDB`);
                }
            } catch (e) {
                console.error("Erreur lecture IndexedDB", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadQueue();
    }, []);

    // 2. PERSISTANCE AUTOMATIQUE (Asynchrone)
    useEffect(() => {
        // On n'écrit que si le chargement initial est terminé pour ne pas écraser la DB
        if (isLoaded) {
            syncQueueStorage.setItem("queue", queue).catch(e => 
                console.error("Erreur écriture IndexedDB", e)
            );
        }
    }, [queue, isLoaded]);

    /**
     * 🔴 LOG DE L'ERREUR FATALE (AuditLog)
     * Envoie un rapport au serveur si une requête est rejetée (400, 500)
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
            console.warn(`📝 Incident enregistré dans AuditLog pour l'item ${item.id}`);
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
            console.warn("Sync annulée : Pas de token.");
            setIsSyncing(false);
            return;
        }

        const processedIds: string[] = [];
        const currentQueue = [...queue]; 

        for (const item of currentQueue) {
            try {
                const res = await fetch(`${API_URL}${item.url}`, {
                    method: item.method,
                    headers: {
                        "Content-Type": item.method === "PATCH" ? "application/merge-patch+json" : "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(item.body),
                });

                // CAS A : SUCCÈS
                if (res.ok) {
                    console.log(`✅ Synchro réussie : ${item.url}`);
                    processedIds.push(item.id);
                } 
                // CAS B : ERREUR FATALE API (400, 500...)
                else {
                    const errorJson = await res.json().catch(() => ({}));
                    const errorMsg = errorJson["hydra:description"] || errorJson.detail || `Erreur HTTP ${res.status}`;
                    console.error(`❌ Erreur Fatale API (${res.status}) sur ${item.url}.`);
                    
                    await logSyncError(item, `Status ${res.status}: ${errorMsg}`, token);
                    processedIds.push(item.id); // On supprime pour ne pas bloquer la file
                }

            } catch (error) {
                // CAS C : ERREUR RÉSEAU
                console.warn(`🌐 Erreur Réseau sur ${item.url}. Pause de la synchronisation.`);
                break; // ON ARRÊTE TOUT et on attend le retour du réseau
            }
        }

        // Mise à jour de la file (suppression des éléments traités)
        if (processedIds.length > 0) {
            setQueue((prevQueue) => prevQueue.filter((task) => !processedIds.includes(task.id)));
        }

        setIsSyncing(false);
    }, [queue, isSyncing, API_URL]);

    // 4. DÉCLENCHEURS
    useEffect(() => {
        const handleOnline = () => {
            console.log("🟢 Connexion rétablie !");
            processQueue();
        };

        window.addEventListener("online", handleOnline);

        // Tenter une sync au montage si on est déjà en ligne et que la DB est chargée
        if (navigator.onLine && queue.length > 0 && isLoaded) {
            processQueue();
        }

        return () => window.removeEventListener("online", handleOnline);
    }, [processQueue, queue.length, isLoaded]);

    // 5. FONCTION D'AJOUT
    const addToQueue = (taskData: Omit<SyncTask, "id" | "timestamp" | "retryCount">) => {
        const newTask: SyncTask = {
            ...taskData,
            id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            retryCount: 0,
        };
        
        setQueue((prev) => [...prev, newTask]);
        console.log("💾 Action sauvegardée localement (IndexedDB)");

        if (navigator.onLine) {
            setTimeout(() => processQueue(), 500);
        }
    };

    return (
        <SyncContext.Provider value={{ queue, addToQueue, isSyncing }}>
            {children}

            {/* INDICATEUR VISUEL DISCRET */}
            {queue.length > 0 && (
                <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-4">
                    <div className={`px-4 py-2 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 transition-colors ${
                        isSyncing 
                            ? "bg-blue-600 text-white" 
                            : navigator.onLine 
                                ? "bg-yellow-400 text-yellow-900" 
                                : "bg-gray-800 text-white"
                    }`}>
                        {isSyncing ? (
                            <>🔄 Synchronisation...</>
                        ) : navigator.onLine ? (
                            <>⏳ En attente ({queue.length})</>
                        ) : (
                            <>🌐 Hors ligne ({queue.length})</>
                        )}
                    </div>
                </div>
            )}
        </SyncContext.Provider>
    );
}