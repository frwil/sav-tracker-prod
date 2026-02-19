"use client";

import { useEffect, useState, use, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSync } from "@/providers/SyncProvider";
import { API_URL, Visit } from "./shared";
import { NewBuildingForm, NewFlockForm } from "./components/Forms";
import { FlockItem } from "./components/FlockItem";
import toast from "react-hot-toast";

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24h

interface CachedVisit {
    data: Visit;
    timestamp: number;
    source: 'api' | 'fallback';
}

export default function VisitDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const { addToQueue, queue, processQueue } = useSync();

    const [visit, setVisit] = useState<Visit | null>(null);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [showNewBuilding, setShowNewBuilding] = useState(false);
    const [showNewFlockForBuilding, setShowNewFlockForBuilding] = useState<string | null>(null);
    const [speculations, setSpeculations] = useState<any[]>([]);
    const [standards, setStandards] = useState<any[]>([]);

    const getCacheKey = useCallback(() => `visit_detail_v2_${id}`, [id]);

    const loadFromCache = useCallback((): CachedVisit | null => {
        const cacheKey = getCacheKey();
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }

        // Fallback : chercher dans les caches de liste
        const listCacheKeys = Object.keys(localStorage).filter(k => 
            k.startsWith('visits_v3_') && k.includes(`_${id}_`)
        );

        for (const key of listCacheKeys) {
            const listCached = localStorage.getItem(key);
            if (listCached) {
                const parsed = JSON.parse(listCached);
                const visitFromList = parsed.visits?.find((v: any) => v.id == id);
                if (visitFromList) {
                    return {
                        data: { ...visitFromList, observations: [], customer: { ...visitFromList.customer, buildings: [] } },
                        timestamp: parsed.timestamp,
                        source: 'fallback'
                    };
                }
            }
        }

        return null;
    }, [id, getCacheKey]);

    const saveToCache = useCallback((data: Visit) => {
        const cacheKey = getCacheKey();
        const cacheData: CachedVisit = {
            data,
            timestamp: Date.now(),
            source: 'api'
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        setCacheAge(0);
    }, [getCacheKey]);

    const fetchVisit = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        
        const token = localStorage.getItem("sav_token");
        const cached = loadFromCache();

        // 1. Afficher cache immédiatement si disponible et pas force refresh
        if (cached && !forceRefresh) {
            setVisit(cached.data);
            setCacheAge(Date.now() - cached.timestamp);
            setLoading(false);
            
            if (cached.source === 'fallback') {
                toast("Données partielles (depuis la liste)", { id: 'partial-data' });
            }
        }

        // 2. Si offline, on s'arrête là
        if (!navigator.onLine) {
            setIsOffline(true);
            if (!cached) {
                setError("Données non disponibles hors ligne");
                setLoading(false);
            }
            return;
        }

        // 3. Fetch depuis API
        if (!token) {
            router.push("/");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/visits/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/ld+json",
                },
            });

            if (res.status === 401) {
                localStorage.removeItem("sav_token");
                router.push("/");
                return;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            setVisit(data);
            setIsOffline(false);
            setCacheAge(null);
            saveToCache(data);
            
            // Précharger les données annexes
            fetchAuxiliaryData(token);
        } catch (err) {
            console.error("Erreur fetch visite:", err);
            
            if (!cached) {
                setIsOffline(true);
                setError("Impossible de charger la visite");
            } else {
                toast.error("Erreur de connexion, données en cache affichées");
            }
        } finally {
            if (!cached) setLoading(false);
        }
    }, [id, router, loadFromCache, saveToCache]);

    const fetchAuxiliaryData = async (token: string) => {
        if (!navigator.onLine) return;

        try {
            const [specRes, stdRes] = await Promise.all([
                fetch(`${API_URL}/speculations`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/ld+json" },
                }),
                fetch(`${API_URL}/standards`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/ld+json" },
                }),
            ]);

            if (specRes.ok) {
                const data = await specRes.json();
                setSpeculations(data["hydra:member"] || data["member"] || []);
            }
            if (stdRes.ok) {
                const data = await stdRes.json();
                setStandards(data["hydra:member"] || data["member"] || []);
            }
        } catch (e) {
            console.error("Erreur chargement options annexes", e);
        }
    };

    // Écouteurs online/offline
    useEffect(() => {
        const handleOnline = async () => {
            setIsOffline(false);
            toast.success("Connexion rétablie 🌐", { id: 'online-back' });

            // Sync file d'attente
            if (queue.length > 0 && processQueue) {
                setIsSyncing(true);
                toast.loading("Synchronisation...", { id: 'syncing' });
                try {
                    await processQueue();
                    toast.success("Synchronisation terminée ✅", { id: 'syncing' });
                } catch {
                    toast.error("Erreur de synchronisation", { id: 'syncing' });
                } finally {
                    setIsSyncing(false);
                }
            }

            // Rafraîchir les données
            fetchVisit(true);
        };

        const handleOffline = () => {
            setIsOffline(true);
            toast("Mode hors ligne 📡", { id: 'offline' });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Vérifier état initial
        if (!navigator.onLine) handleOffline();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [fetchVisit, queue, processQueue]);

    // Chargement initial
    useEffect(() => {
        fetchVisit();
    }, [fetchVisit]);

    // Fusion optimiste avec file d'attente
    const displayVisit = useMemo(() => {
        if (!visit) return null;

        const localVisit = JSON.parse(JSON.stringify(visit));
        
        if (!localVisit.customer.buildings) localVisit.customer.buildings = [];
        if (!localVisit.observations) localVisit.observations = [];

        // Injection bâtiments en attente
        const pendingBuildings = queue.filter(
            (item: any) => 
                item.url === '/buildings' && 
                item.method === 'POST' &&
                (item.body.customer === localVisit.customer['@id'] || item.body.customer === localVisit.customer.id)
        );

        pendingBuildings.forEach((item: any) => {
            const tempBuilding = {
                ...item.body,
                id: `TEMP_BUILD_${Date.now()}_${Math.random()}`,
                "@id": `TEMP_IRI_BUILD_${Date.now()}`,
                flocks: [],
                activated: true,
                __isPending: true
            };
            localVisit.customer.buildings.unshift(tempBuilding);
        });

        // Injection bandes en attente
        const pendingFlocks = queue.filter((item: any) => item.url === '/flocks' && item.method === 'POST');
        
        pendingFlocks.forEach((item: any) => {
            const buildingIri = item.body.building;
            const targetBuilding = localVisit.customer.buildings.find((b: any) => b["@id"] === buildingIri);
            
            if (targetBuilding) {
                const specName = speculations.find((s: any) => s["@id"] === item.body.speculation)?.name || "Spéculation...";
                
                const pendingFlock = {
                    ...item.body,
                    id: `TEMP_FLOCK_${Date.now()}_${Math.random()}`,
                    "@id": `TEMP_IRI_FLOCK_${Date.now()}`,
                    observations: [],
                    speculation: { name: specName },
                    __isPending: true
                };
                
                if (!targetBuilding.flocks) targetBuilding.flocks = [];
                targetBuilding.flocks.push(pendingFlock);
            }
        });

        // Injection observations en attente
        const pendingObservations = queue.filter(
            (item: any) => 
                item.url === '/observations' && 
                item.method === 'POST' &&
                item.body?.visit === localVisit["@id"]
        );

        pendingObservations.forEach((item: any) => {
            const pendingObs = { 
                ...item.body, 
                id: `TEMP_OBS_${Date.now()}_${Math.random()}`, 
                __isPending: true
            };
            
            localVisit.observations.unshift(pendingObs);

            if (item.body.flock) {
                localVisit.customer.buildings.forEach((b: any) => {
                    if (!b.flocks) return;
                    const flockIndex = b.flocks.findIndex((f: any) => f["@id"] === item.body.flock);
                    if (flockIndex !== -1) {
                        if (!b.flocks[flockIndex].observations) b.flocks[flockIndex].observations = [];
                        b.flocks[flockIndex].observations.unshift(pendingObs);
                    }
                });
            }
        });

        return localVisit;
    }, [visit, queue, speculations]);

    const hasAtLeastOneObservation = () => {
        return displayVisit && displayVisit.observations && displayVisit.observations.length > 0;
    };

    const handleCloseVisit = async () => {
        if (!visit) return;
        
        if (!hasAtLeastOneObservation()) {
            toast("⚠️ IMPOSSIBLE DE TERMINER !\n\nVous devez saisir au moins une observation pour valider la visite.", {
                icon: "⚠️",
                style: { borderRadius: "10px", background: "#f59e0b", color: "#fff" },
                duration: 4000,
            });
            return;
        }

        if (!confirm("Voulez-vous vraiment clôturer cette visite ?\nCette action est irréversible.")) return;

        const url = `/visits/${visit.id}/close`;
        const method = "PATCH";
        const body = {};

        // Gestion offline
        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            toast("🌐 Hors ligne : La clôture sera synchronisée dès le retour de la connexion.", {
                icon: "🌐",
                style: { borderRadius: "10px", background: "#3b82f6", color: "#fff" },
                duration: 4000,
            });
            router.push("/dashboard/visits");
            return;
        }

        const token = localStorage.getItem("sav_token");
        try {
            await fetch(`${API_URL}${url}`, {
                method,
                headers: {
                    "Content-Type": "application/merge-patch+json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            fetchVisit();
            toast.success("Visite clôturée avec succès.");
            router.push("/dashboard/visits");
        } catch (e) {
            toast.error("Erreur lors de la clôture.");
        }
    };

    const isStale = cacheAge && cacheAge > CACHE_MAX_AGE;

    // Render
    if (loading && !visit) {
        return (
            <div className="min-h-screen flex items-center justify-center text-indigo-600 animate-pulse">
                Chargement...
            </div>
        );
    }

    if (error && !visit) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md mx-auto px-4">
                    <div className="text-6xl mb-4">📡</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">Données non disponibles</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button 
                        onClick={() => router.push("/dashboard/visits")}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700"
                    >
                        Retour à la liste
                    </button>
                </div>
            </div>
        );
    }

    if (!displayVisit) return null;

    return (
        <div className={`min-h-screen bg-gray-50 pb-24 font-sans ${isOffline ? 'opacity-95' : ''}`}>
            {/* Indicateurs de statut */}
            {isOffline && (
                <div className="bg-orange-500 text-white text-center py-2 font-bold sticky top-0 z-50">
                    📡 Mode Hors Ligne {isStale && `(${Math.round(cacheAge! / 3600000)}h)`}
                </div>
            )}
            {isSyncing && (
                <div className="bg-blue-500 text-white text-center py-2 font-bold sticky top-0 z-50 animate-pulse">
                    🔄 Synchronisation...
                </div>
            )}

            {/* Header */}
            <div className={`px-6 py-8 pb-12 rounded-b-[3rem] shadow-xl text-white mb-6 ${displayVisit.closed ? "bg-gray-800" : "bg-gradient-to-r from-indigo-600 to-purple-600"}`}>
                <div className="max-w-4xl mx-auto flex justify-between items-start">
                    <div>
                        <Link href="/dashboard/visits" className="text-indigo-200 text-xs font-bold uppercase mb-2 block">
                            ← Retour
                        </Link>
                        <h1 className="text-3xl font-extrabold">{displayVisit.customer.name}</h1>
                        <p className="text-sm opacity-90">📍 {displayVisit.customer.zone}</p>
                        <p className="text-sm font-bold bg-white/20 inline-block px-2 py-0.5 rounded mt-1">
                            👨‍🔧 @{displayVisit.technician?.fullname || "Technicien"}
                        </p>
                        {isOffline && <p className="text-xs text-orange-200 mt-1">⚠️ Données locales</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold">
                            {new Date(displayVisit.visitedAt).toLocaleDateString()}
                        </p>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${displayVisit.closed ? "bg-gray-700" : "bg-white/20"}`}>
                            {displayVisit.closed ? "🔒 CLÔTURÉE" : "🟢 EN COURS"}
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-8 relative z-10 space-y-6">
                {!displayVisit.closed && !isOffline && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowNewBuilding(!showNewBuilding)}
                            className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-50 text-sm transition"
                        >
                            {showNewBuilding ? "Annuler" : "+ Nouveau Bâtiment"}
                        </button>
                    </div>
                )}

                {!displayVisit.closed && isOffline && (
                    <div className="bg-orange-100 border-l-4 border-orange-500 p-4 rounded text-sm text-orange-800">
                        ⚠️ Mode hors ligne : La création de bâtiments/bandes sera mise en file d'attente
                    </div>
                )}

                {showNewBuilding && (
                    <NewBuildingForm
                        customerIri={displayVisit.customer["@id"]}
                        existingBuildings={displayVisit.customer.buildings || []}
                        onSuccess={() => {
                            setShowNewBuilding(false);
                            fetchVisit();
                        }}
                        onCancel={() => setShowNewBuilding(false)}
                    />
                )}

                {/* Bâtiments */}
                {displayVisit.customer.buildings?.map((b: any) => (
                    <div key={b.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${b.__isPending ? 'border-yellow-400' : 'border-gray-100'}`}>
                        <div className={`px-4 py-2 border-b flex justify-between items-center ${b.__isPending ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">{b.name}</h3>
                                {b.__isPending && (
                                    <span className="bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse">
                                        ⏳ CRÉATION EN ATTENTE
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {!b.activated && <span className="text-[10px] text-red-500 font-bold">INACTIF</span>}
                                {!displayVisit.closed && b.activated && (
                                    <button
                                        onClick={() => setShowNewFlockForBuilding(b["@id"])}
                                        className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200"
                                    >
                                        + Bande
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="p-4 space-y-4">
                            {showNewFlockForBuilding === b["@id"] && (
                                <NewFlockForm
                                    buildingIri={b["@id"]}
                                    customerIri={displayVisit.customer["@id"] || displayVisit.customer.id}
                                    speculations={speculations}
                                    standards={standards}
                                    onSuccess={() => {
                                        setShowNewFlockForBuilding(null);
                                        fetchVisit();
                                    }}
                                    onCancel={() => setShowNewFlockForBuilding(null)}
                                />
                            )}

                            {/* Bandes */}
                            {b.flocks && b.flocks.length > 0 ? (
                                b.flocks.map((f: any) => (
                                    <div key={f.id} className="relative">
                                        {f.__isPending && (
                                            <div className="absolute -top-2 -right-2 z-20 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded shadow-sm flex items-center gap-1 animate-pulse">
                                                ⏳ EN ATTENTE SYNCHRO
                                            </div>
                                        )}
                                        
                                        <div className={f.__isPending ? "opacity-80 border-2 border-dashed border-yellow-300 rounded-xl" : ""}>
                                            <FlockItem
                                                flock={f}
                                                building={b}
                                                visit={displayVisit}
                                                visitObservations={displayVisit.observations}
                                                visitIri={displayVisit["@id"]}
                                                isVisitClosed={displayVisit.closed}
                                                onRefresh={fetchVisit}
                                                isOffline={isOffline}
                                            />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                !showNewFlockForBuilding && (
                                    <p className="text-center text-sm text-gray-400 italic">Aucune bande active.</p>
                                )
                            )}
                        </div>
                    </div>
                ))}

                {/* Clôture */}
                {!displayVisit.closed && (
                    <div className="flex flex-col items-center justify-center pt-8 pb-4 gap-3 border-t border-gray-200 mt-8">
                        <button
                            onClick={handleCloseVisit}
                            disabled={isOffline}
                            className={`px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all ${hasAtLeastOneObservation() && !isOffline ? "bg-gray-900 text-white hover:bg-black hover:scale-105" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                        >
                            🏁 Terminer la Visite
                        </button>
                        
                        {isOffline && (
                            <p className="text-xs text-orange-600 font-bold bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                                ⚠️ Connexion requise pour clôturer
                            </p>
                        )}
                        
                        {!hasAtLeastOneObservation() && !isOffline && (
                            <p className="text-xs text-red-500 font-bold bg-red-50 px-3 py-1 rounded-full animate-pulse border border-red-100">
                                ⚠️ Saisissez une observation pour débloquer la clôture
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}