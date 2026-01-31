'use client';

import { useState, useMemo } from 'react';
import Select from 'react-select'; 
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from '@/providers/SyncProvider';

// --- TYPES ---

interface Speculation { '@id': string; name: string; }
interface Standard { '@id': string; name: string; speculation: string | Speculation } 

interface Building { 
    '@id': string; 
    id: number; 
    name: string; 
    activated: boolean; 
    flocks: Flock[]; 
}

interface FlockObservation {
    id: number;
    observedAt: string;
    problems?: string;
}

interface Flock { 
    '@id': string;
    id: number | string; // string pour ID temporaire
    name: string; 
    startDate: string; 
    subjectCount: number; 
    building?: Building | { name: string }; // Flexibilité pour l'UI optimiste
    speculation: Speculation | { name: string };
    standard?: Standard | { name: string };
    observations: FlockObservation[]; 
    closed: boolean;
    activated: boolean;
    __isPending?: boolean; // Flag UI Optimiste
    __pendingAction?: 'CREATE' | 'UPDATE' | 'DELETE' | 'CLOSE'; // Type d'action en attente
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Helper pour le fetching de données (Lecture seule)
async function fetchWithAuth(url: string) {
    const token = localStorage.getItem('sav_token');
    if (!token) throw new Error("Non authentifié");
    
    const res = await fetch(`${API_URL}${url}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
    });
    
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    
    // Protection tableau
    const collection = data['hydra:member'] || data['member'] || data;
    return Array.isArray(collection) ? collection : [];
}

export default function FlocksPage() {
    const queryClient = useQueryClient();
    const { addToQueue, queue } = useSync(); // ✅ Récupération Queue
    const { options: customerOptions, loading: customersLoading } = useCustomers();
    
    const [selectedCustomerOption, setSelectedCustomerOption] = useState<CustomerOption | null>(null);

    // --- REQUÊTES (Cache v2) ---
    const { data: flocks = [], isLoading: flocksLoading, isError: flocksError } = useQuery<Flock[]>({
        queryKey: ['flocks_v2', selectedCustomerOption?.value], 
        queryFn: () => fetchWithAuth(`/flocks?building.customer=${selectedCustomerOption?.value}&order[startDate]=DESC`),
        enabled: !!selectedCustomerOption?.value,
        staleTime: 1000 * 60 * 5, 
    });

    const { data: buildings = [] } = useQuery<Building[]>({
        queryKey: ['buildings_v2', selectedCustomerOption?.value],
        queryFn: () => fetchWithAuth(`/buildings?customer=${selectedCustomerOption?.value}`),
        enabled: !!selectedCustomerOption?.value
    });

    const { data: speculations = [] } = useQuery<Speculation[]>({
        queryKey: ['speculations_v2'],
        queryFn: () => fetchWithAuth(`/speculations`),
        staleTime: 1000 * 60 * 60 * 24 
    });

    const { data: standards = [] } = useQuery<Standard[]>({
        queryKey: ['standards_v2'],
        queryFn: () => fetchWithAuth(`/standards`),
        staleTime: 1000 * 60 * 60 * 24
    });

    // --- ÉTATS FORMULAIRE ---
    const [isFormVisible, setFormVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingFlock, setEditingFlock] = useState<Flock | null>(null);

    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [subjectCount, setSubjectCount] = useState<number>(0);
    const [selectedBuilding, setSelectedBuilding] = useState<string>('');
    const [selectedSpeculation, setSelectedSpeculation] = useState<string>('');
    const [selectedStandard, setSelectedStandard] = useState<string>('');

    // --- FUSION OPTIMISTE (API + QUEUE) ---
    const displayedFlocks = useMemo(() => {
        if (!selectedCustomerOption) return [];
        
        // 1. Base : Données serveur (Clonage superficiel pour éviter mutation)
        let merged = [...flocks];

        // 2. Application des SUPPRESSIONS en attente (DELETE)
        // Si un DELETE est dans la queue pour l'ID X, on le retire de l'affichage
        const pendingDeletes = queue.filter((item: any) => 
            item.url.startsWith('/flocks/') && item.method === 'DELETE'
        );
        const deletedIds = pendingDeletes.map((item: any) => {
            const parts = item.url.split('/');
            return parseInt(parts[parts.length - 1]);
        });
        merged = merged.filter(f => !deletedIds.includes(Number(f.id)));

        // 3. Application des MODIFICATIONS en attente (PUT / PATCH / CLOSE)
        const pendingUpdates = queue.filter((item: any) => 
            (item.url.startsWith('/flocks/') || item.url.startsWith('/close_flock/')) && 
            ['PUT', 'PATCH', 'POST'].includes(item.method)
        );

        merged = merged.map(f => {
            // Est-ce qu'une modif concerne ce flock ?
            const updateItem = pendingUpdates.find((item: any) => {
                const urlId = parseInt(item.url.split('/').pop());
                if (item.url.includes('close_flock') && item.method === 'POST') return urlId === Number(f.id);
                if (item.url.includes('flocks') && urlId === Number(f.id)) return true;
                return false;
            });

            if (updateItem) {
                const isCloseAction = updateItem.url.includes('close_flock');
                // On fusionne les nouvelles données avec l'existant
                return {
                    ...f,
                    ...updateItem.body,
                    closed: isCloseAction ? true : (updateItem.body?.closed ?? f.closed),
                    __isPending: true,
                    __pendingAction: isCloseAction ? 'CLOSE' : 'UPDATE'
                };
            }
            return f;
        });

        // 4. Application des CRÉATIONS en attente (POST /flocks)
        const pendingCreates = queue.filter((item: any) => 
            item.url === '/flocks' && item.method === 'POST' &&
            item.body?.customer === selectedCustomerOption.value
        );

        pendingCreates.forEach((item: any) => {
            // Résolution des noms (Car le body n'a que des IRIs)
            const specName = Array.isArray(speculations) ? speculations.find(s => s['@id'] === item.body.speculation)?.name : '...';
            const stdName = Array.isArray(standards) ? standards.find(s => s['@id'] === item.body.standard)?.name : null;
            const buildName = Array.isArray(buildings) ? buildings.find(b => b['@id'] === item.body.building)?.name : null;

            const tempFlock: Flock = {
                ...item.body,
                id: `TEMP_${Date.now()}_${Math.random()}`, // ID temporaire
                name: item.body.name,
                startDate: item.body.startDate,
                subjectCount: item.body.subjectCount,
                closed: false,
                activated: true,
                // Reconstruction des objets liés pour l'affichage
                speculation: { name: specName || "Spéculation..." } as Speculation,
                standard: stdName ? { name: stdName } as Standard : undefined,
                building: buildName ? { name: buildName } as Building : undefined,
                observations: [],
                __isPending: true,
                __pendingAction: 'CREATE'
            };
            
            // Ajout en haut de liste
            merged.unshift(tempFlock);
        });

        return merged;
    }, [flocks, queue, selectedCustomerOption, speculations, standards, buildings]);


    const resetForm = () => {
        setEditingFlock(null);
        setName('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setSubjectCount(0);
        setSelectedBuilding('');
        setSelectedSpeculation('');
        setSelectedStandard('');
        setFormVisible(false);
        setIsSubmitting(false);
    };

    const handleCreate = () => {
        resetForm();
        setFormVisible(true);
    };

    const handleEdit = (flock: Flock) => {
        if (flock.__isPending) {
            alert("Veuillez attendre la synchronisation avant de modifier ce lot.");
            return;
        }
        setEditingFlock(flock);
        setName(flock.name);
        setStartDate(flock.startDate ? new Date(flock.startDate).toISOString().split('T')[0] : '');
        setSubjectCount(flock.subjectCount);
        setSelectedBuilding(flock.building && '@id' in flock.building ? flock.building['@id'] : '');
        setSelectedSpeculation(
            flock.speculation && '@id' in flock.speculation 
            ? flock.speculation['@id'] 
            : typeof flock.speculation === 'string' ? flock.speculation : ''
        );
        setSelectedStandard(
            flock.standard && '@id' in flock.standard 
            ? flock.standard['@id'] 
            : typeof flock.standard === 'string' ? flock.standard : ''
        );
        setFormVisible(true);
    };

    // ✅ GESTION SOUMISSION SÉCURISÉE
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomerOption) return;
        
        if (!name || !startDate || !subjectCount || !selectedSpeculation) {
            alert("Veuillez remplir les champs obligatoires.");
            return;
        }

        setIsSubmitting(true);

        const payload = {
            name,
            startDate,
            subjectCount: Number(subjectCount),
            customer: selectedCustomerOption.value,
            building: selectedBuilding || null,
            speculation: selectedSpeculation,
            standard: selectedStandard || null,
            activated: true
        };

        const url = editingFlock ? `/flocks/${editingFlock.id}` : '/flocks';
        const method = editingFlock ? 'PUT' : 'POST';

        // 1. DÉTECTION OFFLINE -> SAUVEGARDE AUTO
        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            alert("🌐 Hors ligne : Action enregistrée et mise en file d'attente.");
            resetForm();
            return;
        }

        // 2. ONLINE
        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const e: any = new Error(errData['hydra:description'] || 'Erreur API');
                e.status = res.status;
                throw e;
            }

            queryClient.invalidateQueries({ queryKey: ['flocks_v2', selectedCustomerOption.value] });
            resetForm();

        } catch (error: any) {
            console.error(error);
            if (error.status) {
                alert(`⛔ Erreur (${error.status}): ${error.message}`);
                setIsSubmitting(false); 
            } else {
                addToQueue({ url, method: method as any, body: payload });
                alert("⚠️ Connexion perdue. Action sauvegardée en mode hors-ligne.");
                resetForm();
            }
        }
    };

    // ✅ GESTION ACTIONS SÉCURISÉES
    const handleAction = async (action: 'DELETE' | 'CLOSE' | 'REOPEN', flock: Flock) => {
        if (flock.__isPending) {
            alert("Action impossible : synchronisation en attente.");
            return;
        }
        if (!confirm("Êtes-vous sûr de vouloir effectuer cette action ?")) return;

        let url = `/flocks/${flock.id}`;
        let method = 'DELETE';
        let body = {};

        if (action === 'CLOSE') {
            url = `/close_flock/${flock.id}`; 
            method = 'POST'; 
        } else if (action === 'REOPEN') {
            url = `/flocks/${flock.id}`;
            method = 'PATCH';
            body = { closed: false };
        }

        // 1. OFFLINE
        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body });
            alert("🌐 Hors ligne : Action mise en file d'attente.");
            return;
        }

        // 2. ONLINE
        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: method !== 'DELETE' ? JSON.stringify(body) : undefined
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const e: any = new Error(errData['hydra:description'] || 'Erreur API');
                e.status = res.status;
                throw e;
            }
            queryClient.invalidateQueries({ queryKey: ['flocks_v2', selectedCustomerOption?.value] });
        } catch (e: any) {
            if (e.status) {
                alert(`⛔ Impossible d'effectuer l'action (${e.status}): ${e.message}`);
            } else {
                addToQueue({ url, method: method as any, body });
                alert("⚠️ Connexion perdue. Action mise en file d'attente.");
            }
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Gestion des Lots</h1>
                {selectedCustomerOption && !isFormVisible && (
                    <button onClick={handleCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition flex items-center gap-2">
                        <span>+</span> Nouveau Lot
                    </button>
                )}
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sélectionner un client</label>
                <Select
                    instanceId="customer-select-flocks"
                    options={customerOptions}
                    value={selectedCustomerOption}
                    onChange={setSelectedCustomerOption}
                    placeholder="Rechercher un client..."
                    isLoading={customersLoading}
                />
            </div>

            {isFormVisible && (
                <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-indigo-600 animate-in slide-in-from-top-4">
                    <h2 className="text-lg font-bold mb-4">{editingFlock ? 'Modifier le lot' : 'Nouveau lot'}</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700">Nom du lot</label>
                            <input type="text" required className="w-full border p-2 rounded" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Lot B3 - Janvier" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700">Date de mise en place</label>
                            <input type="date" required className="w-full border p-2 rounded" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700">Effectif de départ</label>
                            <input type="number" required className="w-full border p-2 rounded" value={subjectCount} onChange={e => setSubjectCount(Number(e.target.value))} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700">Spéculation</label>
                            <select className="w-full border p-2 rounded" value={selectedSpeculation} onChange={e => setSelectedSpeculation(e.target.value)} required>
                                <option value="">-- Choisir --</option>
                                {Array.isArray(speculations) && speculations.map(s => <option key={s['@id']} value={s['@id']}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700">Souche (Standard)</label>
                            <select className="w-full border p-2 rounded" value={selectedStandard} onChange={e => setSelectedStandard(e.target.value)}>
                                <option value="">-- Aucun --</option>
                                {Array.isArray(standards) && standards
                                    .filter(s => !selectedSpeculation || (typeof s.speculation === 'object' ? s.speculation['@id'] === selectedSpeculation : s.speculation === selectedSpeculation))
                                    .map(s => <option key={s['@id']} value={s['@id']}>{s.name}</option>)
                                }
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700">Bâtiment (Optionnel)</label>
                            <select className="w-full border p-2 rounded" value={selectedBuilding} onChange={e => setSelectedBuilding(e.target.value)}>
                                <option value="">-- Aucun --</option>
                                {Array.isArray(buildings) && buildings.map(b => <option key={b['@id']} value={b['@id']}>{b.name}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 mt-4">
                            <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-500 font-bold">Annuler</button>
                            <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold hover:bg-indigo-700 disabled:opacity-50">
                                {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div>
                {!selectedCustomerOption ? (
                    <div className="text-center py-10 text-gray-500">
                        <p>Veuillez sélectionner un client pour voir ses lots.</p>
                    </div>
                ) : flocksLoading ? (
                    <div className="text-center py-10 text-indigo-600">Chargement des lots...</div>
                ) : flocksError ? (
                    <div className="bg-red-50 text-red-600 p-4 rounded">Erreur lors du chargement des lots.</div>
                ) : displayedFlocks.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-500">Aucun lot trouvé pour ce client.</p>
                        <button onClick={handleCreate} className="mt-2 text-indigo-600 font-bold hover:underline">Créer le premier lot</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {displayedFlocks.map((flock) => {
                            // LOGIQUE DE SUPPRESSION SÉCURISÉE (Cadenas)
                            const hasObservations = flock.observations && flock.observations.length > 0;
                            const isBuildingArchived = flock.building && '@id' in flock.building && !flock.building.activated;
                            const canDelete = !hasObservations && !isBuildingArchived;

                            return (
                                <div key={flock.id} className={`bg-white p-5 rounded-xl shadow-sm border-l-4 transition-all relative overflow-hidden ${
                                    flock.__isPending ? 'border-yellow-400 opacity-90' : flock.closed ? 'border-gray-400 opacity-75' : 'border-green-500'
                                } flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
                                    
                                    {/* INDICATEUR EN ATTENTE */}
                                    {flock.__isPending && (
                                        <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-bl-lg shadow-sm animate-pulse z-10">
                                            ⏳ {flock.__pendingAction === 'CLOSE' ? 'CLÔTURE' : flock.__pendingAction === 'UPDATE' ? 'MODIF' : 'CRÉATION'} EN ATTENTE
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-lg font-bold text-gray-900">{flock.name}</h3>
                                            {flock.closed && <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full font-bold">CLÔTURÉ</span>}
                                            {!flock.closed && !flock.__isPending && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">ACTIF</span>}
                                        </div>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            <p>📅 Début : {flock.startDate ? new Date(flock.startDate).toLocaleDateString() : 'N/A'}</p>
                                            <p>🐔 Effectif : <strong>{flock.subjectCount}</strong> sujets</p>
                                            <p>🏷️ {flock.speculation?.name} {flock.standard ? `(${flock.standard.name})` : ''}</p>
                                            {flock.building && <p>🏠 {flock.building.name}</p>}
                                        </div>
                                    </div>
                                    <div className={`flex flex-wrap gap-2 w-full md:w-auto items-center ${flock.__isPending ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {!flock.closed && (
                                            <button onClick={() => handleAction('CLOSE', flock)} className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded text-sm font-bold hover:bg-orange-100">🏁 Clôturer</button>
                                        )}
                                        {flock.closed && (
                                            <button onClick={() => handleAction('REOPEN', flock)} className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded text-sm font-bold hover:bg-gray-200">🔓 Réouvrir</button>
                                        )}
                                        <button onClick={() => handleEdit(flock)} className="bg-blue-50 text-blue-600 border border-blue-200 p-1.5 rounded hover:bg-blue-100" title="Modifier">✏️</button>
                                        
                                        {canDelete ? (
                                            <button onClick={() => handleAction('DELETE', flock)} className="bg-red-50 text-red-600 border border-red-200 p-1.5 rounded hover:bg-red-100" title="Supprimer">🗑️</button>
                                        ) : (
                                            <div className="group relative">
                                                <span className="cursor-not-allowed text-gray-300 text-xl p-1">🔒</span>
                                                {/* Tooltip */}
                                                <div className="absolute right-0 bottom-full mb-2 w-48 bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                                    Impossible de supprimer :
                                                    {hasObservations && <div className="text-red-300">• Contient des observations</div>}
                                                    {isBuildingArchived && <div className="text-orange-300">• Bâtiment archivé</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}