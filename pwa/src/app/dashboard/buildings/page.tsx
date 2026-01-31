'use client';

import { useState, useMemo } from 'react';
import Select from 'react-select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from '@/providers/SyncProvider';
import toast from "react-hot-toast";

// --- TYPES ---

interface Building {
    '@id': string;
    id: number | string; // string pour ID temporaire
    name: string;
    surface: number;
    maxCapacity?: number;
    activated: boolean;
    flocks: any[]; 
    customer: { id: number; name: string; } | string; // Gère l'objet ou l'IRI
    // UI Optimiste
    __isPending?: boolean;
    __pendingAction?: 'CREATE' | 'UPDATE' | 'DELETE' | 'PATCH';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Fonction de fetch (Lecture seule)
async function fetchBuildings(customerId: string) {
    const token = localStorage.getItem('sav_token');
    if (!token) throw new Error("Non authentifié");

    const res = await fetch(`${API_URL}/buildings?customer=${customerId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
    });

    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    return data['hydra:member'] || data['member'] || [];
}

export default function BuildingsPage() {
    const queryClient = useQueryClient();
    const { addToQueue, queue } = useSync(); // ✅ Récupération Queue
    const { options: customerOptions, loading: customersLoading } = useCustomers();

    const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);

    // --- 1. REQUÊTE SERVEUR ---
    const { data: buildings = [], isLoading, isError } = useQuery<Building[]>({
        queryKey: ['buildings', selectedCustomer?.value],
        queryFn: () => fetchBuildings(selectedCustomer!.value),
        enabled: !!selectedCustomer,
    });

    // --- 2. FUSION OPTIMISTE (API + QUEUE) ---
    const displayedBuildings = useMemo(() => {
        if (!selectedCustomer) return [];

        // A. Base : Données serveur
        let merged = [...buildings];

        // B. Application des SUPPRESSIONS en attente (DELETE)
        const pendingDeletes = queue.filter((item: any) => 
            item.url.startsWith('/buildings/') && item.method === 'DELETE'
        );
        const deletedIds = pendingDeletes.map((item: any) => parseInt(item.url.split('/').pop()));
        merged = merged.filter(b => !deletedIds.includes(Number(b.id)));

        // C. Application des MODIFICATIONS en attente (PUT / PATCH)
        const pendingUpdates = queue.filter((item: any) => 
            item.url.startsWith('/buildings/') && ['PUT', 'PATCH'].includes(item.method)
        );

        merged = merged.map(b => {
            const updateItem = pendingUpdates.find((item: any) => parseInt(item.url.split('/').pop()) === Number(b.id));
            if (updateItem) {
                return {
                    ...b,
                    ...updateItem.body,
                    __isPending: true,
                    __pendingAction: updateItem.method === 'PATCH' ? 'PATCH' : 'UPDATE'
                };
            }
            return b;
        });

        // D. Application des CRÉATIONS en attente (POST)
        // On ne montre que ceux créés pour le client ACTUELLEMENT SÉLECTIONNÉ
        const pendingCreates = queue.filter((item: any) => 
            item.url === '/buildings' && item.method === 'POST' &&
            item.body?.customer === selectedCustomer.value
        );

        pendingCreates.forEach((item: any) => {
            const tempBuilding: Building = {
                ...item.body,
                id: `TEMP_${Date.now()}_${Math.random()}`,
                '@id': `TEMP_IRI_${Date.now()}`,
                flocks: [], // Un nouveau bâtiment n'a pas encore de lots
                activated: true,
                __isPending: true,
                __pendingAction: 'CREATE'
            };
            merged.unshift(tempBuilding); // Ajout en haut
        });

        return merged;
    }, [buildings, queue, selectedCustomer]);

    // --- FORM STATE ---
    const [formData, setFormData] = useState<{
        name: string;
        surface: string;
        maxCapacity: string;
        customer: CustomerOption | null;
    }>({ 
        name: '', 
        surface: '', 
        maxCapacity: '', 
        customer: null 
    });

    // --- HANDLERS ---
    const handleCreate = () => {
        setEditingBuilding(null);
        setFormData({ 
            name: '', 
            surface: '', 
            maxCapacity: '', 
            customer: selectedCustomer || null 
        });
        setIsModalOpen(true);
    };

    const handleEdit = (building: Building) => {
        if (building.__isPending) {
            toast("Veuillez attendre la synchronisation avant de modifier ce bâtiment.", {
                icon: "⚠️",
                style: {
                    borderRadius: "10px",
                    background: "#f59e0b", // Orange pour avertissement
                    color: "#fff",
                },
                duration: 4000,
            });
            return;
        }
        setEditingBuilding(building);
        
        setFormData({ 
            name: building.name, 
            surface: building.surface.toString(),
            maxCapacity: building.maxCapacity ? building.maxCapacity.toString() : '',
            customer: selectedCustomer 
        });
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setIsSubmitting(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.surface || !formData.customer) {
            toast("Merci de remplir le nom, la surface et le client.", {
                icon: "⚠️",
                style: {
                    borderRadius: "10px",
                    background: "#f59e0b", // Orange pour avertissement
                    color: "#fff",
                },
                duration: 4000,
            });
            return;
        }

        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            surface: parseFloat(formData.surface),
            maxCapacity: parseInt(formData.maxCapacity) || 0,
            customer: formData.customer.value,
            activated: true
        };

        const url = editingBuilding ? `/buildings/${editingBuilding.id}` : '/buildings';
        const method = editingBuilding ? 'PUT' : 'POST';

        // 1. OFFLINE -> SAUVEGARDE AUTO
        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            toast("🌐 Hors ligne : Action enregistrée et mise en file d'attente.", {
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6", // Bleu pour info
                    color: "#fff",
                },
                duration: 4000,
            });
            handleClose();
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

            queryClient.invalidateQueries({ queryKey: ['buildings', selectedCustomer?.value] });
            handleClose();

        } catch (e: any) {
            console.error(e);
            if (e.status) {
                toast.error(`⛔ Erreur (${e.status}): ${e.message}`);
                setIsSubmitting(false);
            } else {
                // Erreur réseau -> Queue
                addToQueue({ url, method: method as any, body: payload });
                toast("⚠️ Connexion perdue. Action sauvegardée en mode hors-ligne.", {
                    icon: "⚠️",
                    style: {
                        borderRadius: "10px",
                        background: "#f59e0b", // Orange pour avertissement
                        color: "#fff",
                    },
                    duration: 4000,
                });
                handleClose();
            }
        }
    };

    const handleToggleStatus = async (building: Building) => {
        if (building.__isPending) return;

        const url = `/buildings/${building.id}`;
        const method = 'PATCH';
        const body = { activated: !building.activated };

        // 1. OFFLINE
        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            return; // UI mise à jour via useMemo
        }

        try {
            const token = localStorage.getItem('sav_token');
            await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            queryClient.invalidateQueries({ queryKey: ['buildings', selectedCustomer?.value] });
        } catch (e) {
            addToQueue({ url, method, body });
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer ce bâtiment ?")) return;

        const url = `/buildings/${id}`;
        const method = 'DELETE';

        // 1. OFFLINE
        if (!navigator.onLine) {
            addToQueue({ url, method, body: {} });
            return;
        }

        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Erreur suppression");
            queryClient.invalidateQueries({ queryKey: ['buildings', selectedCustomer?.value] });
        } catch (e) {
            addToQueue({ url, method, body: {} });
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Gestion des Bâtiments</h1>
                {selectedCustomer && (
                    <button 
                        onClick={handleCreate}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition flex items-center gap-2"
                    >
                        <span>+</span> Nouveau Bâtiment
                    </button>
                )}
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sélectionner un client</label>
                <Select
                    instanceId="customer-select-buildings"
                    options={customerOptions}
                    value={selectedCustomer}
                    onChange={setSelectedCustomer}
                    placeholder="Rechercher un client..."
                    isLoading={customersLoading}
                />
            </div>

            {/* MODALE FORMULAIRE */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                        <h2 className="text-xl font-bold mb-4">{editingBuilding ? 'Modifier le bâtiment' : 'Nouveau Bâtiment'}</h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            
                            {/* Sélection Client */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Client</label>
                                <Select
                                    options={customerOptions}
                                    value={formData.customer}
                                    onChange={(option) => setFormData({ ...formData, customer: option })}
                                    placeholder="Sélectionner le client..."
                                    isDisabled={!!editingBuilding}
                                    className="text-sm"
                                />
                            </div>

                            {/* Nom */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nom du Bâtiment</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Ex: Bâtiment A, Serre 1..."
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Surface */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Surface (m²)</label>
                                    <input 
                                        type="number" 
                                        required
                                        step="0.1"
                                        className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                        placeholder="0.0"
                                        value={formData.surface}
                                        onChange={e => setFormData({ ...formData, surface: e.target.value })}
                                    />
                                </div>

                                {/* Capacité Max */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Capacité Max (Sujets)</label>
                                    <input 
                                        type="number" 
                                        required
                                        className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                        placeholder="Ex: 2000"
                                        value={formData.maxCapacity}
                                        onChange={e => setFormData({ ...formData, maxCapacity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <button type="button" onClick={handleClose} className="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded-lg">Annuler</button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting} 
                                    className={`px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition text-sm ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* LISTE DES BÂTIMENTS */}
            <div>
                {!selectedCustomer ? (
                    <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p>Veuillez sélectionner un client ci-dessus.</p>
                    </div>
                ) : isLoading ? (
                    <div className="text-center py-10 text-blue-600">Chargement des bâtiments...</div>
                ) : isError ? (
                    <div className="bg-red-50 text-red-600 p-4 rounded text-center">Erreur lors du chargement.</div>
                ) : displayedBuildings.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-gray-500 mb-4">Aucun bâtiment trouvé pour ce client.</p>
                        <button onClick={handleCreate} className="text-blue-600 font-bold hover:underline">Créer le premier bâtiment</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {displayedBuildings.map((building) => (
                            <div 
                                key={building.id} 
                                className={`bg-white p-5 rounded-xl shadow-sm border-l-4 relative overflow-hidden flex justify-between items-center group hover:shadow-md transition ${
                                    building.__isPending 
                                        ? 'border-yellow-400 opacity-90' 
                                        : building.activated ? 'border-green-500' : 'border-gray-300 opacity-75'
                                }`}
                            >
                                {/* INDICATEUR EN ATTENTE */}
                                {building.__isPending && (
                                    <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-bl-lg shadow-sm animate-pulse z-10">
                                        ⏳ {building.__pendingAction === 'CREATE' ? 'CRÉATION' : 'MODIF'}
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        {building.name}
                                        {!building.activated && <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">ARCHIVÉ</span>}
                                    </h3>
                                    <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                                        <p>📏 Surface : <strong>{building.surface} m²</strong></p>
                                        <p>🐔 Capacité : <strong>{building.maxCapacity || 'Non définie'}</strong></p>
                                        <p className="text-xs text-gray-400 mt-1">{building.flocks ? `${building.flocks.length} bandes associées` : 'Aucune bande'}</p>
                                    </div>
                                </div>
                                
                                <div className={`flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${building.__isPending ? 'pointer-events-none opacity-50' : ''}`}>
                                    <button onClick={() => handleToggleStatus(building)} className={`text-xs font-bold px-3 py-1 rounded ${building.activated ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50'}`}>
                                        {building.activated ? 'Archiver' : 'Activer'}
                                    </button>
                                    <button onClick={() => handleEdit(building)} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded">
                                        Modifier
                                    </button>
                                    {(!building.flocks || building.flocks.length === 0) ? (
                                        <button onClick={() => handleDelete(building.id)} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded">
                                            Supprimer
                                        </button>
                                    ) : (
                                        <span className="text-xs text-gray-400 text-center cursor-help" title="Contient des lots">🔒</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}