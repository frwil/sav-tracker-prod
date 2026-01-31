"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSync } from "@/providers/SyncProvider"; // ✅ Import Sync
import { API_URL, Visit } from "./shared";
import { NewBuildingForm, NewFlockForm } from "./components/Forms";
import { FlockItem } from "./components/FlockItem";

export default function VisitDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    
    // 1. Récupération de la queue pour l'UI Optimiste
    const { addToQueue, queue } = useSync(); 
    
    const [visit, setVisit] = useState<Visit | null>(null);
    const [loading, setLoading] = useState(true);
    const [showNewBuilding, setShowNewBuilding] = useState(false);
    const [showNewFlockForBuilding, setShowNewFlockForBuilding] = useState<string | null>(null);
    const [speculations, setSpeculations] = useState<any[]>([]);
    const [standards, setStandards] = useState<any[]>([]);

    // --- CHARGEMENT DES DONNÉES ---
    const fetchVisit = async () => {
        const token = localStorage.getItem("sav_token");
        if (!token) {
            router.push("/");
            return;
        }

        // En offline, on garde ce qu'on a déjà chargé si possible
        if (!navigator.onLine && !visit) {
            console.warn("Hors ligne : affichage limité.");
        }

        try {
            const res = await fetch(`${API_URL}/visits/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/ld+json",
                },
            });
            if (res.ok) setVisit(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVisit();
    }, [id]);

    useEffect(() => {
        const fetchOptions = async () => {
            const token = localStorage.getItem("sav_token");
            if (!token) return;

            if (!navigator.onLine) return; // Évite les erreurs fetch inutiles

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
                console.error("Erreur chargement options", e);
            }
        };

        fetchOptions();
    }, []);

    // --- 2. LOGIQUE DE FUSION OPTIMISTE (API + QUEUE) ---
    const displayVisit = useMemo(() => {
        // Si pas de visite chargée, on ne peut rien afficher
        if (!visit) return null;

        // On clone la visite pour y injecter les données locales sans muter le state
        const localVisit = JSON.parse(JSON.stringify(visit));
        
        // S'assurer que les tableaux existent
        if (!localVisit.customer.buildings) localVisit.customer.buildings = [];
        if (!localVisit.observations) localVisit.observations = [];

        // --- A. Injection des BÂTIMENTS en attente (POST /buildings) ---
        const pendingBuildings = queue.filter(
            (item: any) => 
                item.url === '/buildings' && 
                item.method === 'POST' &&
                // On vérifie que c'est bien pour ce client (par ID ou IRI)
                (item.body.customer === localVisit.customer['@id'] || item.body.customer === localVisit.customer.id)
        );

        pendingBuildings.forEach((item: any) => {
            const tempBuilding = {
                ...item.body,
                id: `TEMP_BUILD_${Date.now()}_${Math.random()}`,
                "@id": `TEMP_IRI_BUILD_${Date.now()}`, // IRI Temporaire pour le lien avec les bandes
                flocks: [],
                activated: true,
                __isPending: true // Flag pour l'UI
            };
            // Ajout en haut de liste des bâtiments
            localVisit.customer.buildings.unshift(tempBuilding);
        });

        // --- B. Injection des BANDES en attente (POST /flocks) ---
        const pendingFlocks = queue.filter(
            (item: any) => 
                item.url === '/flocks' && 
                item.method === 'POST'
        );

        pendingFlocks.forEach((item: any) => {
            const buildingIri = item.body.building;
            // On cherche le bâtiment (même s'il est temporaire)
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

        // --- C. Injection des OBSERVATIONS en attente (POST /observations) ---
        const pendingObservations = queue.filter(
            (item: any) => 
                item.url === '/observations' && 
                item.method === 'POST' &&
                item.body?.visit === visit["@id"]
        );

        pendingObservations.forEach((item: any) => {
            const pendingObs = { 
                ...item.body, 
                id: `TEMP_OBS_${Date.now()}_${Math.random()}`, 
                __isPending: true
            };
            
            // Ajout à la liste globale
            localVisit.observations.unshift(pendingObs);

            // Ajout à la bande concernée
            if (item.body.flock) {
                localVisit.customer.buildings.forEach((b: any) => {
                    if (!b.flocks) return;
                    const flockIndex = b.flocks.findIndex((f: any) => f["@id"] === item.body.flock);
                    if (flockIndex !== -1) {
                        if (!b.flocks[flockIndex].observations) {
                            b.flocks[flockIndex].observations = [];
                        }
                        b.flocks[flockIndex].observations.unshift(pendingObs);
                    }
                });
            }
        });

        return localVisit;
    }, [visit, queue, speculations]); 

    // --- ACTIONS ---

    const hasAtLeastOneObservation = () => {
        return displayVisit && displayVisit.observations && displayVisit.observations.length > 0;
    };

    const handleCloseVisit = async () => {
        if (!visit) return;
        if (!hasAtLeastOneObservation()) {
            alert("⚠️ IMPOSSIBLE DE TERMINER !\n\nVous devez saisir au moins une observation pour valider la visite.");
            return;
        }
        if (!confirm("Voulez-vous vraiment clôturer cette visite ?\nCette action est irréversible.")) return;

        const url = `/visits/${visit.id}/close`;
        const method = "PATCH";
        const body = {};

        // ✅ Gestion Offline pour la clôture
        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            alert("🌐 Hors ligne : La clôture sera synchronisée dès le retour de la connexion.");
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
            alert("Visite clôturée avec succès.");
            router.push("/dashboard/visits");
        } catch (e) {
            alert("Erreur lors de la clôture.");
        }
    };

    // --- RENDER ---

    if (loading)
        return (
            <div className="min-h-screen flex items-center justify-center text-indigo-600 animate-pulse">
                Chargement...
            </div>
        );
    
    if (!displayVisit)
        return (
            <div className="p-8 text-center text-gray-500">
                Visite introuvable ou problème de connexion.
            </div>
        );

    return (
        <div className="min-h-screen bg-gray-50 pb-24 font-sans">
            {/* Header */}
            <div
                className={`px-6 py-8 pb-12 rounded-b-[3rem] shadow-xl text-white mb-6 ${displayVisit.closed ? "bg-gray-800" : "bg-gradient-to-r from-indigo-600 to-purple-600"}`}
            >
                <div className="max-w-4xl mx-auto flex justify-between items-start">
                    <div>
                        <Link
                            href="/dashboard/visits"
                            className="text-indigo-200 text-xs font-bold uppercase mb-2 block"
                        >
                            ← Retour
                        </Link>
                        <h1 className="text-3xl font-extrabold">
                            {displayVisit.customer.name}
                        </h1>
                        <p className="text-sm opacity-90">
                            📍 {displayVisit.customer.zone}
                        </p>
                        <p className="text-sm font-bold bg-white/20 inline-block px-2 py-0.5 rounded mt-1">
                            👨‍🔧 @{displayVisit.technician?.fullname || "Technicien"}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold">
                            {new Date(displayVisit.visitedAt).toLocaleDateString()}
                        </p>
                        <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${displayVisit.closed ? "bg-gray-700" : "bg-white/20"}`}
                        >
                            {displayVisit.closed ? "🔒 CLÔTURÉE" : "🟢 EN COURS"}
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-8 relative z-10 space-y-6">
                {!displayVisit.closed && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowNewBuilding(!showNewBuilding)}
                            className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-50 text-sm transition"
                        >
                            {showNewBuilding ? "Annuler" : "+ Nouveau Bâtiment"}
                        </button>
                    </div>
                )}

                {showNewBuilding && (
                    <NewBuildingForm
                        customerIri={displayVisit.customer["@id"]}
                        existingBuildings={displayVisit.customer.buildings || []}
                        onSuccess={() => {
                            setShowNewBuilding(false);
                            fetchVisit(); // Rafraîchit (ou pas si offline, mais le useMemo prendra le relais)
                        }}
                        onCancel={() => setShowNewBuilding(false)}
                    />
                )}

                {/* BOUCLE SUR LES BÂTIMENTS (Avec fusion optimiste) */}
                {displayVisit.customer.buildings?.map((b: any) => (
                    <div
                        key={b.id}
                        className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${b.__isPending ? 'border-yellow-400' : 'border-gray-100'}`}
                    >
                        <div className={`px-4 py-2 border-b flex justify-between items-center ${b.__isPending ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">
                                    {b.name}
                                </h3>
                                {b.__isPending && (
                                    <span className="bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse">
                                        ⏳ CRÉATION EN ATTENTE
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {!b.activated && (
                                    <span className="text-[10px] text-red-500 font-bold">
                                        INACTIF
                                    </span>
                                )}
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

                            {/* LISTE DES BANDES (INCLUANT CELLES EN ATTENTE) */}
                            {b.flocks && b.flocks.length > 0 ? (
                                b.flocks.map((f: any) => (
                                    <div key={f.id} className="relative">
                                        {/* INDICATEUR VISUEL POUR LES DONNÉES OPTIMISTES */}
                                        {f.__isPending && (
                                            <div className="absolute -top-2 -right-2 z-20 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded shadow-sm flex items-center gap-1 animate-pulse">
                                                ⏳ EN ATTENTE SYNCHRO
                                            </div>
                                        )}
                                        
                                        {/* Conteneur stylisé si en attente */}
                                        <div className={f.__isPending ? "opacity-80 border-2 border-dashed border-yellow-300 rounded-xl" : ""}>
                                            <FlockItem
                                                flock={f}
                                                building={b}
                                                visit={displayVisit}
                                                visitObservations={displayVisit.observations}
                                                visitIri={displayVisit["@id"]}
                                                isVisitClosed={displayVisit.closed}
                                                onRefresh={fetchVisit}
                                            />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                !showNewFlockForBuilding && (
                                    <p className="text-center text-sm text-gray-400 italic">
                                        Aucune bande active.
                                    </p>
                                )
                            )}
                        </div>
                    </div>
                ))}

                {!displayVisit.closed && (
                    <div className="flex flex-col items-center justify-center pt-8 pb-4 gap-3 border-t border-gray-200 mt-8">
                        <button
                            onClick={handleCloseVisit}
                            className={`px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all transform hover:scale-105 ${hasAtLeastOneObservation() ? "bg-gray-900 text-white hover:bg-black" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                        >
                            🏁 Terminer la Visite
                        </button>
                        {!hasAtLeastOneObservation() && (
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