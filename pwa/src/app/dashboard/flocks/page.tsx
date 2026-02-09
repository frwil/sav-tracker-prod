'use client';

import { useState, useMemo } from 'react';
import Select from 'react-select'; 
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from '@/providers/SyncProvider';
import toast from "react-hot-toast";

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
    id: number | string;
    name: string; 
    startDate: string; 
    subjectCount: number; 
    building?: Building | { name: string };
    speculation: Speculation | { name: string };
    standard?: Standard | { name: string };
    observations: FlockObservation[]; 
    closed: boolean;
    activated: boolean;
    __isPending?: boolean;
    __pendingAction?: 'CREATE' | 'UPDATE' | 'DELETE' | 'CLOSE';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function fetchWithAuth(url: string) {
    const token = localStorage.getItem('sav_token');
    if (!token) throw new Error("Non authentifié");
    
    const res = await fetch(`${API_URL}${url}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
    });
    
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    
    const collection = data['hydra:member'] || data['member'] || data;
    return Array.isArray(collection) ? collection : [];
}

export default function FlocksPage() {
    const queryClient = useQueryClient();
    const { addToQueue, queue } = useSync();
    const { options: customerOptions, loading: customersLoading } = useCustomers();
    
    const [selectedCustomerOption, setSelectedCustomerOption] = useState<CustomerOption | null>(null);

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

    const [isFormVisible, setFormVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingFlock, setEditingFlock] = useState<Flock | null>(null);

    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [subjectCount, setSubjectCount] = useState<number>(0);
    const [selectedBuilding, setSelectedBuilding] = useState<string>('');
    const [selectedSpeculation, setSelectedSpeculation] = useState<string>('');
    const [selectedStandard, setSelectedStandard] = useState<string>('');

    const displayedFlocks = useMemo(() => {
        if (!selectedCustomerOption) return [];
        
        let merged = [...flocks];

        const pendingDeletes = queue.filter((item: any) => 
            item.url.startsWith('/flocks/') && item.method === 'DELETE'
        );
        const deletedIds = pendingDeletes.map((item: any) => {
            const parts = item.url.split('/');
            return parseInt(parts[parts.length - 1]);
        });
        merged = merged.filter(f => !deletedIds.includes(Number(f.id)));

        const pendingUpdates = queue.filter((item: any) => 
            (item.url.startsWith('/flocks/') || item.url.startsWith('/close_flock/')) && 
            ['PUT', 'PATCH', 'POST'].includes(item.method)
        );

        merged = merged.map(f => {
            const updateItem = pendingUpdates.find((item: any) => {
                const urlId = parseInt(item.url.split('/').pop());
                if (item.url.includes('close_flock') && item.method === 'POST') return urlId === Number(f.id);
                if (item.url.includes('flocks') && urlId === Number(f.id)) return true;
                return false;
            });

            if (updateItem) {
                const isCloseAction = updateItem.url.includes('close_flock');
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

        const pendingCreates = queue.filter((item: any) => 
            item.url === '/flocks' && item.method === 'POST' &&
            item.body?.customer === selectedCustomerOption.value
        );

        pendingCreates.forEach((item: any) => {
            const specName = Array.isArray(speculations) ? speculations.find(s => s['@id'] === item.body.speculation)?.name : '...';
            const stdName = Array.isArray(standards) ? standards.find(s => s['@id'] === item.body.standard)?.name : null;
            const buildName = Array.isArray(buildings) ? buildings.find(b => b['@id'] === item.body.building)?.name : null;

            const tempFlock: Flock = {
                ...item.body,
                id: `TEMP_${Date.now()}_${Math.random()}`,
                name: item.body.name,
                startDate: item.body.startDate,
                subjectCount: item.body.subjectCount,
                closed: false,
                activated: true,
                speculation: { name: specName || "Spéculation..." } as Speculation,
                standard: stdName ? { name: stdName } as Standard : undefined,
                building: buildName ? { name: buildName } as Building : undefined,
                observations: [],
                __isPending: true,
                __pendingAction: 'CREATE'
            };
            
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
            toast("Veuillez attendre la synchronisation avant de modifier ce lot.", {
                icon: "⚠️",
                style: {
                    borderRadius: "10px",
                    background: "#f59e0b",
                    color: "#fff",
                },
                duration: 4000,
            });
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomerOption) return;
        
        if (!name || !startDate || !subjectCount || !selectedSpeculation) {
            toast("Veuillez remplir les champs obligatoires.", {
                icon: "⚠️",
                style: {
                    borderRadius: "10px",
                    background: "#f59e0b",
                    color: "#fff",
                },
                duration: 4000,
            });
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

        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            toast("🌐 Hors ligne : Action enregistrée et mise en file d'attente.", {
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6",
                    color: "#fff",
                },
                duration: 4000,
            });
            resetForm();
            return;
        }

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
                toast(`⛔ Erreur (${error.status}): ${error.message}`, {
                    icon: "⛔",
                    style: {
                        borderRadius: "10px",
                        background: "#ef4444",
                        color: "#fff",
                    },
                    duration: 4000,
                });
                setIsSubmitting(false); 
            } else {
                addToQueue({ url, method: method as any, body: payload });
                toast("⚠️ Connexion perdue. Action sauvegardée en mode hors-ligne.", {
                    icon: "⚠️",
                    style: {
                        borderRadius: "10px",
                        background: "#f59e0b",
                        color: "#fff",
                    },
                    duration: 4000,
                });
                resetForm();
            }
        }
    };

    const handleAction = async (action: 'DELETE' | 'CLOSE' | 'REOPEN', flock: Flock) => {
        if (flock.__isPending) {
            toast("Action impossible : synchronisation en attente.", {
                icon: "⚠️",
                style: {
                    borderRadius: "10px",
                    background: "#f59e0b",
                    color: "#fff",
                },
                duration: 4000,
            });
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

        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body });
            toast("🌐 Hors ligne : Action mise en file d'attente.", {
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6",
                    color: "#fff",
                },
                duration: 4000,
            });
            return;
        }

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
                toast(`⛔ Impossible d'effectuer l'action (${e.status}): ${e.message}`, {
                    icon: "⛔",
                    style: {
                        borderRadius: "10px",
                        background: "#ef4444",
                        color: "#fff",
                    },
                    duration: 4000,
                });
            } else {
                addToQueue({ url, method: method as any, body });
                toast("⚠️ Connexion perdue. Action mise en file d'attente.", {
                    icon: "⚠️",
                    style: {
                        borderRadius: "10px",
                        background: "#f59e0b",
                        color: "#fff",
                    },
                    duration: 4000,
                });
            }
        }
    };

    // Filtre les standards par spéculation sélectionnée
    const filteredStandards = useMemo(() => {
        if (!selectedSpeculation) return standards;
        return standards.filter(s => 
            typeof s.speculation === 'object' 
                ? s.speculation['@id'] === selectedSpeculation 
                : s.speculation === selectedSpeculation
        );
    }, [standards, selectedSpeculation]);

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 px-4 sm:px-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Gestion des Lots</h1>
                {selectedCustomerOption && !isFormVisible && (
                    <button 
                        onClick={handleCreate} 
                        className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                    >
                        <span>+</span> Nouveau Lot
                    </button>
                )}
            </div>

            {/* Sélection Client */}
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

            {/* Formulaire - Design Card Responsive */}
            {isFormVisible && (
                <div className="bg-white rounded-xl shadow-lg border-t-4 border-indigo-600 overflow-hidden">
                    {/* Header du formulaire */}
                    <div className="bg-gray-50 px-4 sm:px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-bold text-gray-900">
                            {editingFlock ? 'Modifier le lot' : 'Nouveau lot'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Remplissez les informations ci-dessous. Les champs marqués d'une * sont obligatoires.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 sm:p-6">
                        {/* Section: Informations de base */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                Informations générales
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Nom du lot */}
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nom du lot <span className="text-red-500">*</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                        value={name} 
                                        onChange={e => setName(e.target.value)} 
                                        placeholder="Ex: Lot B3 - Janvier" 
                                        readOnly
                                    />
                                </div>

                                {/* Date de mise en place */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Date de mise en place <span className="text-red-500">*</span>
                                    </label>
                                    <input 
                                        type="date" 
                                        required 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                        value={startDate} 
                                        onChange={e => setStartDate(e.target.value)} 
                                    />
                                </div>

                                {/* Effectif */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Effectif de départ <span className="text-red-500">*</span>
                                    </label>
                                    <input 
                                        type="number" 
                                        required 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                        value={subjectCount} 
                                        onChange={e => Number(e.target.value)<0 ? setSubjectCount(0) : setSubjectCount(Number(e.target.value))} 
                                        placeholder="0"
                                        onFocus={e => e.target.select()}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section: Classification */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                Classification
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Spéculation */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Spéculation <span className="text-red-500">*</span>
                                    </label>
                                    <select 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
                                        value={selectedSpeculation} 
                                        onChange={e => {
                                            setSelectedSpeculation(e.target.value);
                                            setSelectedStandard(''); // Reset standard quand speculation change
                                        }} 
                                        required
                                    >
                                        <option value="">-- Choisir --</option>
                                        {Array.isArray(speculations) && speculations.map(s => (
                                            <option key={s['@id']} value={s['@id']}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Standard/Souche */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Souche (Standard) <span className="text-red-500">*</span>
                                    </label>
                                    <select 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        value={selectedStandard} 
                                        onChange={e => setSelectedStandard(e.target.value)}
                                        disabled={!selectedSpeculation}
                                        required
                                    >
                                        <option value="">
                                            {!selectedSpeculation ? 'Sélectionnez d\'abord une spéculation' : '-- Aucun --'}
                                        </option>
                                        {Array.isArray(filteredStandards) && filteredStandards.map(s => (
                                            <option key={s['@id']} value={s['@id']}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Bâtiment */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Bâtiment <span className="text-red-500">*</span>
                                    </label>
                                    <select 
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
                                        value={selectedBuilding} 
                                        onChange={e => setSelectedBuilding(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Aucun --</option>
                                        {Array.isArray(buildings) && buildings.map(b => (
                                            <option key={b['@id']} value={b['@id']}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
                            <button 
                                type="button" 
                                onClick={resetForm} 
                                className="w-full sm:w-auto px-4 py-2 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
                            >
                                Annuler
                            </button>
                            <button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                        </svg>
                                        Enregistrement...
                                    </>
                                ) : (
                                    'Enregistrer'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Liste des lots */}
            <div>
                {!selectedCustomerOption ? (
                    <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                        <p className="text-lg mb-2">👆</p>
                        <p>Veuillez sélectionner un client pour voir ses lots.</p>
                    </div>
                ) : flocksLoading ? (
                    <div className="text-center py-10">
                        <div className="inline-flex items-center gap-2 text-indigo-600">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                            </svg>
                            Chargement des lots...
                        </div>
                    </div>
                ) : flocksError ? (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-center gap-3">
                        <span>⚠️</span>
                        <span>Erreur lors du chargement des lots.</span>
                    </div>
                ) : displayedFlocks.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-500 mb-3">Aucun lot trouvé pour ce client.</p>
                        <button 
                            onClick={handleCreate} 
                            className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1"
                        >
                            <span>+</span> Créer le premier lot
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {displayedFlocks.map((flock) => {
                            const hasObservations = flock.observations && flock.observations.length > 0;
                            const isBuildingArchived = flock.building && '@id' in flock.building && !flock.building.activated;
                            const canDelete = !hasObservations && !isBuildingArchived;

                            return (
                                <div 
                                    key={flock.id} 
                                    className={`bg-white rounded-xl shadow-sm border-l-4 transition-all relative overflow-hidden ${
                                        flock.__isPending ? 'border-yellow-400' : flock.closed ? 'border-gray-400' : 'border-green-500'
                                    }`}
                                >
                                    {/* Indicateur pending */}
                                    {flock.__isPending && (
                                        <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm animate-pulse">
                                            ⏳ {flock.__pendingAction === 'CLOSE' ? 'CLÔTURE' : flock.__pendingAction === 'UPDATE' ? 'MODIF' : 'CRÉATION'} EN ATTENTE
                                        </div>
                                    )}

                                    <div className="p-4 sm:p-5">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            {/* Info principale */}
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <h3 className="text-lg font-bold text-gray-900">{flock.name}</h3>
                                                    {flock.closed && (
                                                        <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full font-bold">
                                                            CLÔTURÉ
                                                        </span>
                                                    )}
                                                    {!flock.closed && !flock.__isPending && (
                                                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                                                            ACTIF
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm text-gray-600">
                                                    <div>
                                                        <span className="text-gray-400">📅</span> {' '}
                                                        {flock.startDate ? new Date(flock.startDate).toLocaleDateString() : 'N/A'}
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">🐔</span> {' '}
                                                        <strong>{flock.subjectCount}</strong> sujets
                                                    </div>
                                                    <div className="col-span-2 sm:col-span-1">
                                                        <span className="text-gray-400">🏷️</span> {' '}
                                                        {flock.speculation?.name}
                                                        {flock.standard && ` (${flock.standard.name})`}
                                                    </div>
                                                    {flock.building && (
                                                        <div>
                                                            <span className="text-gray-400">🏠</span> {' '}
                                                            {flock.building.name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className={`flex flex-wrap gap-2 ${flock.__isPending ? 'opacity-50 pointer-events-none' : ''}`}>
                                                {!flock.closed ? (
                                                    <button 
                                                        onClick={() => handleAction('CLOSE', flock)} 
                                                        className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 transition"
                                                    >
                                                        🏁 Clôturer
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleAction('REOPEN', flock)} 
                                                        className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-gray-200 transition"
                                                    >
                                                        🔓 Réouvrir
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => handleEdit(flock)} 
                                                    className="bg-blue-50 text-blue-600 border border-blue-200 p-2 rounded-lg hover:bg-blue-100 transition"
                                                    title="Modifier"
                                                >
                                                    ✏️
                                                </button>
                                                
                                                {canDelete ? (
                                                    <button 
                                                        onClick={() => handleAction('DELETE', flock)} 
                                                        className="bg-red-50 text-red-600 border border-red-200 p-2 rounded-lg hover:bg-red-100 transition"
                                                        title="Supprimer"
                                                    >
                                                        🗑️
                                                    </button>
                                                ) : (
                                                    <div className="group relative">
                                                        <span className="cursor-not-allowed text-gray-300 text-xl p-2 block">🔒</span>
                                                        <div className="absolute right-0 bottom-full mb-2 w-56 bg-gray-800 text-white text-xs p-3 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                                            <p className="font-bold mb-1">Impossible de supprimer :</p>
                                                            {hasObservations && <p className="text-red-300">• Contient des observations</p>}
                                                            {isBuildingArchived && <p className="text-orange-300">• Bâtiment archivé</p>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
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