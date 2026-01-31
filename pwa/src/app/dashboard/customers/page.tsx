'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSync } from '@/providers/SyncProvider';

// --- TYPES ---

interface Customer {
    '@id': string;
    id: number | string; // string pour les IDs temporaires
    name: string;
    zone: string;
    phoneNumber?: string;
    exactLocation?: string;
    erpCode?: string;
    activated: boolean;
    // Champs pour l'UI Optimiste
    __isPending?: boolean;
    __pendingAction?: 'CREATE' | 'UPDATE' | 'DELETE' | 'PATCH';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Fonction de fetch isolée
async function fetchCustomers() {
    const token = localStorage.getItem('sav_token');
    if (!token) throw new Error("Non authentifié");

    const res = await fetch(`${API_URL}/customers?pagination=false`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
    });

    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    return data['hydra:member'] || data['member'] || [];
}

export default function CustomersPage() {
    const queryClient = useQueryClient();
    const { addToQueue, queue } = useSync(); // ✅ Récupération de la file d'attente

    // --- 1. DONNÉES SERVEUR ---
    const { data: customers = [], isLoading, isError } = useQuery<Customer[]>({
        queryKey: ['customers'],
        queryFn: fetchCustomers,
        staleTime: 1000 * 60 * 10,
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    
    // États Formulaire
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        zone: '',
        phoneNumber: '',
        exactLocation: '',
        erpCode: ''
    });

    useEffect(() => {
        const token = localStorage.getItem('sav_token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setIsAdmin(payload.roles?.includes('ROLE_ADMIN'));
            } catch (e) {
                console.error("Erreur lecture token", e);
            }
        }
    }, []);

    // --- 2. FUSION OPTIMISTE (SERVER + QUEUE) ---
    const displayedCustomers = useMemo(() => {
        // A. Base : Données serveur
        let merged = [...customers];

        // B. Application des SUPPRESSIONS en attente (DELETE)
        const pendingDeletes = queue.filter((item: any) => 
            item.url.startsWith('/customers/') && item.method === 'DELETE'
        );
        const deletedIds = pendingDeletes.map((item: any) => parseInt(item.url.split('/').pop()));
        merged = merged.filter(c => !deletedIds.includes(Number(c.id)));

        // C. Application des MODIFICATIONS en attente (PUT / PATCH)
        const pendingUpdates = queue.filter((item: any) => 
            item.url.startsWith('/customers/') && ['PUT', 'PATCH'].includes(item.method)
        );

        merged = merged.map(c => {
            const updateItem = pendingUpdates.find((item: any) => parseInt(item.url.split('/').pop()) === Number(c.id));
            if (updateItem) {
                return {
                    ...c,
                    ...updateItem.body, // On écrase les anciennes valeurs avec les nouvelles en attente
                    __isPending: true,
                    __pendingAction: updateItem.method === 'PATCH' ? 'PATCH' : 'UPDATE'
                };
            }
            return c;
        });

        // D. Application des CRÉATIONS en attente (POST)
        const pendingCreates = queue.filter((item: any) => 
            item.url === '/customers' && item.method === 'POST'
        );

        pendingCreates.forEach((item: any) => {
            const tempCustomer: Customer = {
                ...item.body,
                id: `TEMP_${Date.now()}_${Math.random()}`,
                '@id': `TEMP_IRI_${Date.now()}`,
                activated: true, // Par défaut actif à la création
                __isPending: true,
                __pendingAction: 'CREATE'
            };
            merged.unshift(tempCustomer); // Ajout en haut de liste
        });

        // E. FILTRAGE (Recherche) sur la liste fusionnée
        return merged.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.erpCode && c.erpCode.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    }, [customers, queue, searchTerm]);


    // --- 3. HANDLERS ---

    const handleCreate = () => {
        setEditingCustomer(null);
        setFormData({ name: '', zone: '', phoneNumber: '', exactLocation: '', erpCode: '' });
        setIsModalOpen(true);
    };

    const handleEdit = (customer: Customer) => {
        if (customer.__isPending) {
            alert("Veuillez attendre la synchronisation avant de modifier ce client.");
            return;
        }
        setEditingCustomer(customer);
        setFormData({
            name: customer.name,
            zone: customer.zone,
            phoneNumber: customer.phoneNumber || '',
            exactLocation: customer.exactLocation || '',
            erpCode: customer.erpCode || ''
        });
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setIsSubmitting(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.zone) {
            alert("Le nom et la zone sont obligatoires.");
            return;
        }

        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            zone: formData.zone,
            phoneNumber: formData.phoneNumber,
            exactLocation: formData.exactLocation,
            erpCode: formData.erpCode || null,
            activated: true
        };

        const url = editingCustomer ? `/customers/${editingCustomer.id}` : '/customers';
        const method = editingCustomer ? 'PUT' : 'POST';

        // 1. OFFLINE -> SAUVEGARDE AUTO
        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            alert("🌐 Hors ligne : Action enregistrée et mise en file d'attente.");
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

            queryClient.invalidateQueries({ queryKey: ['customers'] });
            handleClose();

        } catch (e: any) {
            console.error(e);
            // En cas d'erreur (réseau ou autre), on met en queue par sécurité si ce n'est pas une erreur 4xx
            if (!e.status || e.status >= 500) {
                addToQueue({ url, method: method as any, body: payload });
                alert("⚠️ Connexion instable. Action sauvegardée en mode hors-ligne.");
                handleClose();
            } else {
                alert(`⛔ Erreur (${e.status}): ${e.message}`);
                setIsSubmitting(false);
            }
        }
    };

    const handleToggleStatus = async (customer: Customer) => {
        if (customer.__isPending) return;

        const url = `/customers/${customer.id}`;
        const method = 'PATCH';
        const body = { activated: !customer.activated };

        // 1. OFFLINE
        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            return; // L'UI se mettra à jour grâce au useMemo
        }

        try {
            const token = localStorage.getItem('sav_token');
            await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) {
            addToQueue({ url, method, body });
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce client ?")) return;

        const url = `/customers/${id}`;
        const method = 'DELETE';

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
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) {
            addToQueue({ url, method, body: {} });
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                <button 
                    onClick={handleCreate}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition flex items-center gap-2"
                >
                    <span>+</span> Nouveau Client
                </button>
            </div>

            {/* BARRE DE RECHERCHE */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-2">
                <span className="text-xl">🔍</span>
                <input 
                    type="text" 
                    placeholder="Rechercher par nom, zone ou code ERP..." 
                    className="w-full outline-none text-gray-700"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* MODALE */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                        <h2 className="text-xl font-bold mb-4 text-gray-800">{editingCustomer ? 'Modifier le client' : 'Nouveau Client'}</h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nom du client *</label>
                                <input required type="text" className="w-full border rounded p-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Zone *</label>
                                <input required type="text" className="w-full border rounded p-2" placeholder="Ex: Douala, Bonanjo" value={formData.zone} onChange={e => setFormData({...formData, zone: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Téléphone</label>
                                    <input type="text" className="w-full border rounded p-2" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Code ERP</label>
                                    <input type="text" className="w-full border rounded p-2" placeholder="Facultatif" value={formData.erpCode} onChange={e => setFormData({...formData, erpCode: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Localisation Exacte</label>
                                <input type="text" className="w-full border rounded p-2" placeholder="Repère géographique..." value={formData.exactLocation} onChange={e => setFormData({...formData, exactLocation: e.target.value})} />
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <button type="button" onClick={handleClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">Annuler</button>
                                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 disabled:opacity-50">
                                    {isSubmitting ? '...' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* LISTE DES CLIENTS */}
            {isLoading ? (
                <div className="text-center py-10 text-indigo-600">Chargement...</div>
            ) : isError ? (
                <div className="bg-red-50 text-red-600 p-4 rounded text-center">Erreur de chargement.</div>
            ) : displayedCustomers.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded text-gray-500">Aucun client trouvé.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedCustomers.map(customer => (
                        <div 
                            key={customer.id} 
                            className={`bg-white p-5 rounded-xl shadow-sm border-l-4 relative overflow-hidden transition-all group ${
                                customer.__isPending 
                                    ? 'border-yellow-400 opacity-90' 
                                    : customer.activated ? 'border-green-500' : 'border-gray-300 opacity-75'
                            } hover:shadow-md`}
                        >
                            {/* INDICATEUR EN ATTENTE */}
                            {customer.__isPending && (
                                <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-bl-lg shadow-sm animate-pulse z-10">
                                    ⏳ {customer.__pendingAction === 'CREATE' ? 'CRÉATION' : 'MODIF'}
                                </div>
                            )}

                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg">{customer.name}</h3>
                                    <p className="text-sm text-gray-500">📍 {customer.zone}</p>
                                </div>
                                {customer.erpCode && <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded">{customer.erpCode}</span>}
                            </div>
                            
                            <div className={`mt-4 pt-4 border-t border-gray-100 flex justify-between items-center ${customer.__isPending ? 'pointer-events-none opacity-50' : ''}`}>
                                <button onClick={() => handleEdit(customer)} className="text-indigo-600 font-bold text-sm hover:underline">Modifier</button>
                                
                                {isAdmin && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleToggleStatus(customer)}
                                            className={`text-xs font-bold px-2 py-1 rounded transition ${customer.activated ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50'}`}
                                        >
                                            {customer.activated ? 'Archiver' : 'Activer'}
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleDelete(customer.id)}
                                            className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition"
                                            title="Suppression définitive"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}