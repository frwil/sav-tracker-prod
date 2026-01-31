'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import Link from 'next/link';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from '@/providers/SyncProvider';

// Types
interface Checkpoint {
    id: number;
    text: string;
    status: 'resolved' | 'partial' | 'unresolved';
}

interface LastVisitInfo {
    date: string;
    tech: string;
    problems: string[] | { description: string, severity: string, status: string }[];
    recommendations: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function NewVisitPage() {
    const router = useRouter();
    const { addToQueue } = useSync();
    // useCustomers gère déjà le cache React Query, donc ça marche offline si déjà chargé
    const { options: customerOptions, loading: customersLoading } = useCustomers();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    
    // Étape 1
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
    const [activeVisit, setActiveVisit] = useState<{ id: number, date: string, tech?: string } | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(false);

    // Étape 2
    const [lastVisit, setLastVisit] = useState<LastVisitInfo | null>(null);
    const [checklist, setChecklist] = useState<Checkpoint[]>([]);

    // Étape 3
    const [objective, setObjective] = useState('');
    const [gpsCoordinates, setGpsCoordinates] = useState('');
    const [isGeolocating, setIsGeolocating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // --- 1. DÉTECTION AUTOMATIQUE ---
    useEffect(() => {
        const checkExistingVisit = async () => {
            if (!selectedCustomer) {
                setActiveVisit(null);
                return;
            }

            // OFFLINE : On ne peut pas vérifier les doublons serveur, on fait confiance.
            if (!navigator.onLine) {
                return;
            }

            setCheckingStatus(true);
            const token = localStorage.getItem('sav_token');

            try {
                // On cherche une visite active
                const res = await fetch(`${API_URL}/visits?customer=${selectedCustomer.value}&closed=false&activated=true`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
                });

                if (res.ok) {
                    const data = await res.json();
                    const visits = data['hydra:member'] || [];
                    
                    if (visits.length > 0) {
                        const v = visits[0];
                        setActiveVisit({ 
                            id: v.id, 
                            date: v.visitedAt,
                            tech: v.technician?.fullname || v.technician?.username 
                        });
                    } else {
                        setActiveVisit(null);
                    }
                }
            } catch (e) {
                console.error("Erreur vérification visite", e);
                // On ne bloque pas en cas d'erreur technique
            } finally {
                setCheckingStatus(false);
            }
        };

        checkExistingVisit();
    }, [selectedCustomer]);

    // --- 2. NAVIGATION INTELLIGENTE ---
    const handleNextStep = async () => {
        if (!selectedCustomer) return;
        if (activeVisit) return;

        // OFFLINE : On saute l'étape "Revue historique" car on ne peut pas charger les données
        if (!navigator.onLine) {
            setLastVisit(null); 
            setStep(3); 
            return;
        }

        const token = localStorage.getItem('sav_token');

        try {
            // Récupérer la dernière visite TERMINÉE
            const lastRes = await fetch(`${API_URL}/visits?customer=${selectedCustomer.value}&order[createdAt]=desc&itemsPerPage=1`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
            });

            if (lastRes.ok) {
                const lastData = await lastRes.json();
                const lastVisits = lastData['hydra:member'] || [];
                
                if (lastVisits.length > 0) {
                    const lv = lastVisits[0];
                    
                    // Extraction des problèmes
                    let problems: any[] = [];
                    if (lv.observations && lv.observations.length > 0) {
                        lv.observations.forEach((obs: any) => {
                            if (obs.problems) problems.push(obs.problems);
                            if (obs.detectedProblems) {
                                obs.detectedProblems.forEach((p: any) => problems.push({
                                    description: p.description,
                                    severity: p.severity,
                                    status: p.status
                                }));
                            }
                        });
                    }

                    setLastVisit({
                        date: new Date(lv.createdAt || lv.visitedAt).toLocaleDateString('fr-FR'),
                        tech: lv.technician?.fullname || lv.technician?.username || 'Inconnu',
                        problems: problems,
                        recommendations: lv.report || "Aucune recommandation enregistrée."
                    });
                    
                    // Génération Checklist
                    const newChecklist = problems.map((p: any, idx: number) => ({
                        id: idx,
                        text: typeof p === 'string' ? p : `Vérifier : ${p.description}`,
                        status: 'unresolved' as const
                    }));

                    if (newChecklist.length === 0) {
                        newChecklist.push({ id: 0, text: "Vérifier l'application des recommandations", status: 'unresolved' });
                    }

                    setChecklist(newChecklist);
                    setStep(2);
                } else {
                    setStep(3); // Pas d'historique
                }
            } else {
                setStep(3);
            }
        } catch (err) {
            console.error("Erreur historique", err);
            setStep(3); // En cas d'erreur, on laisse avancer
        }
    };

    const handleGeolocate = () => {
        setIsGeolocating(true);
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGpsCoordinates(`${position.coords.latitude}, ${position.coords.longitude}`);
                    setIsGeolocating(false);
                },
                (error) => {
                    alert('Erreur GPS: ' + error.message);
                    setIsGeolocating(false);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            alert("Géolocalisation non supportée.");
            setIsGeolocating(false);
        }
    };

    // --- 3. SOUMISSION ROBUSTE (OFFLINE-FIRST) ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!objective || objective.trim().length === 0) {
            setError("L'objectif de la visite est obligatoire.");
            return;
        }

        setIsSubmitting(true);
        setError('');

        const payload = {
            customer: selectedCustomer?.value, // C'est une IRI (/api/customers/123)
            objective: objective,
            gpsCoordinates: gpsCoordinates,
            visitedAt: new Date().toISOString(), // Important pour l'affichage optimiste
            activated: true,
            closed: false
        };

        const url = '/visits';
        const method = 'POST';

        // A. CAS OFFLINE DÉTECTÉ
        if (!navigator.onLine) {
            addToQueue({ url, method, body: payload });
            alert("🌐 Mode Hors-Ligne : Visite créée localement. Elle sera synchronisée dès le retour de la connexion.");
            router.push('/dashboard/visits');
            return;
        }

        // B. CAS ONLINE
        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const errorMessage = errorData['hydra:description'] || errorData.detail || 'Erreur lors de la création';
                const apiError: any = new Error(errorMessage);
                apiError.status = res.status;
                throw apiError;
            }

            // Succès
            router.push('/dashboard/visits');

        } catch (err: any) {
            console.error(err);

            // Si c'est une erreur API (400, 500), c'est une vraie erreur, on affiche
            if (err.status) {
                setError(`Erreur serveur (${err.status}) : ${err.message}`);
                setIsSubmitting(false);
            } else {
                // Si pas de status, c'est une erreur RÉSEAU (coupure pendant l'envoi)
                // => SAUVEGARDE AUTOMATIQUE EN QUEUE
                addToQueue({ url, method, body: payload });
                alert("⚠️ Connexion perdue pendant l'envoi. Visite sauvegardée en mode hors-ligne.");
                router.push('/dashboard/visits');
            }
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
            <h1 className="text-2xl font-bold text-gray-900">Nouvelle Visite</h1>

            {/* Barre de progression */}
            <div className="flex items-center justify-between mb-8">
                <div className={`h-2 flex-1 rounded transition-colors ${step >= 1 ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
                <div className={`h-2 flex-1 rounded mx-2 transition-colors ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
                <div className={`h-2 flex-1 rounded transition-colors ${step >= 3 ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
            </div>

            {/* ÉTAPE 1 : CHOIX CLIENT */}
            {step === 1 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Sélectionner le Client</label>
                    
                    <Select
                        className="mb-6"
                        options={customerOptions}
                        isLoading={customersLoading}
                        value={selectedCustomer}
                        onChange={setSelectedCustomer}
                        placeholder="Rechercher un client..."
                        noOptionsMessage={() => "Aucun client trouvé"}
                        isDisabled={checkingStatus}
                    />

                    {checkingStatus && <p className="text-sm text-gray-500 animate-pulse mb-4">🔍 Vérification du dossier client...</p>}

                    {/* ALERTE VISITE DÉJÀ ACTIVE */}
                    {activeVisit ? (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">⛔</span>
                                <div>
                                    <h3 className="font-bold text-red-900 text-sm">IMPOSSIBLE DE CRÉER UNE VISITE</h3>
                                    <p className="text-red-700 text-xs mt-1">
                                        Une visite est déjà ouverte chez ce client depuis le <strong>{new Date(activeVisit.date).toLocaleDateString()}</strong>.
                                        {activeVisit.tech && <span> (Tech: {activeVisit.tech})</span>}
                                    </p>
                                </div>
                            </div>
                            
                            <Link 
                                href={`/dashboard/visits/${activeVisit.id}`}
                                className="mt-4 block w-full text-center py-3 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 transition"
                            >
                                👉 REPRENDRE LA VISITE #{activeVisit.id}
                            </Link>
                        </div>
                    ) : (
                        <button
                            onClick={handleNextStep}
                            disabled={!selectedCustomer || checkingStatus}
                            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition mt-4 
                                ${!selectedCustomer || checkingStatus ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02]'}
                            `}
                        >
                            Suivant ➜
                        </button>
                    )}
                </div>
            )}

            {/* ÉTAPE 2 : REVUE HISTORIQUE */}
            {step === 2 && lastVisit && (
                <div className="bg-white p-6 rounded-xl shadow-sm space-y-6 animate-in slide-in-from-right-4">
                    <h2 className="text-lg font-semibold">2. Revue de la dernière visite</h2>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase">Le {lastVisit.date}</span>
                            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">{lastVisit.tech}</span>
                        </div>
                        
                        {lastVisit.problems && lastVisit.problems.length > 0 && (
                            <div className="mb-4">
                                <h4 className="text-xs font-bold text-red-800 uppercase mb-1">Problèmes signalés :</h4>
                                <ul className="list-disc pl-4 text-sm text-gray-700">
                                    {lastVisit.problems.map((p, idx) => (
                                        <li key={idx}>
                                            {typeof p === 'string' ? p : `${p.description} (${p.severity})`}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="mt-2">
                            <h4 className="text-xs font-bold text-green-800 uppercase mb-1">Recommandations :</h4>
                            <p className="text-gray-800 italic text-sm">"{lastVisit.recommendations}"</p>
                        </div>
                    </div>
                    
                    <div>
                        <h3 className="font-bold text-sm text-gray-700 mb-2">Checklist de vérification</h3>
                        <div className="space-y-2">
                            {checklist.map((item) => (
                                <label key={item.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                                    <input type="checkbox" className="w-5 h-5 text-indigo-600 rounded" />
                                    <span className="text-sm text-gray-700">{item.text}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between pt-4">
                        <button onClick={() => setStep(1)} className="text-gray-500 font-medium hover:text-gray-700">Retour</button>
                        <button onClick={() => setStep(3)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition shadow">
                            Tout est vu, commencer
                        </button>
                    </div>
                </div>
            )}

            {/* ÉTAPE 3 : FORMULAIRE FINAL */}
            {step === 3 && (
                <div className="bg-white p-6 rounded-xl shadow-sm space-y-6 animate-in slide-in-from-right-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        🚀 Démarrer la visite
                        <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {selectedCustomer?.label}
                        </span>
                    </h2>
                    
                    {error && (<div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">{error}</div>)}
                    
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Objectif principal</label>
                            <textarea 
                                required 
                                className="w-full rounded-lg border-gray-300 shadow-sm border p-3 focus:ring-2 focus:ring-indigo-500 outline-none transition" 
                                rows={3} 
                                placeholder="Ex: Contrôle de routine, Problème sanitaire..."
                                value={objective} 
                                onChange={(e) => setObjective(e.target.value)} 
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Position GPS</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    readOnly 
                                    className="block w-full rounded-lg border border-gray-300 bg-gray-100 p-2 text-sm text-gray-500" 
                                    value={gpsCoordinates} 
                                    placeholder="Non localisé" 
                                />
                                <button 
                                    type="button" 
                                    onClick={handleGeolocate} 
                                    disabled={isGeolocating} 
                                    className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-200 transition disabled:opacity-50"
                                >
                                    {isGeolocating ? '⏳ ...' : '📍 Localiser'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Nécessaire pour valider le passage.</p>
                        </div>

                        <div className="flex justify-between pt-4 border-t border-gray-100">
                            <button type="button" onClick={() => setStep(lastVisit ? 2 : 1)} className="text-gray-500 font-medium text-sm px-4 py-2 hover:text-gray-700">Retour</button>
                            <button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg transition transform active:scale-95 
                                    ${isSubmitting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
                                `}
                            >
                                {isSubmitting ? 'Enregistrement...' : '🚀 DÉMARRER LA VISITE'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}