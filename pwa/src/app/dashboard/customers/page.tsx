'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSync } from '@/providers/SyncProvider';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from "react-hot-toast";

// --- TYPES ---

interface Customer {
    '@id': string;
    id: number | string;
    name: string;
    zone: string;
    phoneNumber?: string;
    exactLocation?: string;
    erpCode?: string;
    activated: boolean;
    __isPending?: boolean;
    __pendingAction?: 'CREATE' | 'UPDATE' | 'DELETE' | 'PATCH';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ITEMS_PER_PAGE = 10; // ⚡ Pagination

// --- FETCH (PAGINÉ) ---
async function fetchCustomers(page: number, search: string) {
    const token = localStorage.getItem('sav_token');
    if (!token) throw new Error("Non authentifié");

    // On utilise la recherche serveur sur le nom (assurez-vous que SearchFilter est activé sur 'name' dans l'entité Customer)
    const searchQuery = search ? `&name=${search}` : '';
    const url = `${API_URL}/customers?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}${searchQuery}`;

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
    });

    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    const data = await res.json();
    
    return {
        items: data['hydra:member'] || data['member'] || [],
        totalItems: data['hydra:totalItems'] || 0
    };
}

export default function CustomersPage() {
    const queryClient = useQueryClient();
    const { addToQueue, queue } = useSync();
    
    // Hooks navigation
    const searchParams = useSearchParams();
    const router = useRouter();

    // --- ÉTATS ---
    const [page, setPage] = useState(1);
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

    const [prospectionSourceId, setProspectionSourceId] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('sav_token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setIsAdmin(payload.roles?.includes('ROLE_ADMIN'));
            } catch (e) { console.error(e); }
        }
    }, []);

    // Détection Conversion Prospect -> Client
    useEffect(() => {
        const fromId = searchParams.get('from_prospection');
        if (fromId && !isModalOpen) {
            setProspectionSourceId(fromId);
            setEditingCustomer(null);
            setFormData({
                name: searchParams.get('name') || '',
                zone: searchParams.get('address') || '',
                phoneNumber: searchParams.get('phone') || '',
                exactLocation: searchParams.get('gps') || '',
                erpCode: ''
            });
            setIsModalOpen(true);
            toast("🚀 Formulaire pré-rempli depuis la prospection !", { icon: "✨" });
        }
    }, [searchParams]);

    // --- REQUÊTE REACT QUERY ---
    const { data, isLoading, isError } = useQuery({
        queryKey: ['customers', page, searchTerm], // Clé unique par page/recherche
        queryFn: () => fetchCustomers(page, searchTerm),
        placeholderData: (previousData) => previousData, // Garde l'affichage fluide
        staleTime: 1000 * 60 * 5,
    });

    const customers = data?.items || [];
    const totalItems = data?.totalItems || 0;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // Reset page si recherche change
    const handleSearch = (term: string) => {
        setSearchTerm(term);
        setPage(1);
    };

    // --- FUSION OPTIMISTE (SERVER + QUEUE) ---
    const displayedCustomers = useMemo(() => {
        // A. Base : Données serveur de la page courante
        let merged = [...customers];

        // B. Suppression Optimiste (DELETE)
        const pendingDeletes = queue.filter((item: any) => item.url.startsWith('/customers/') && item.method === 'DELETE');
        const deletedIds = pendingDeletes.map((item: any) => parseInt(item.url.split('/').pop()));
        merged = merged.filter(c => !deletedIds.includes(Number(c.id)));

        // C. Modif Optimiste (PUT/PATCH)
        const pendingUpdates = queue.filter((item: any) => item.url.startsWith('/customers/') && ['PUT', 'PATCH'].includes(item.method));
        merged = merged.map(c => {
            const updateItem = pendingUpdates.find((item: any) => parseInt(item.url.split('/').pop()) === Number(c.id));
            if (updateItem) return { ...c, ...updateItem.body, __isPending: true, __pendingAction: 'UPDATE' };
            return c;
        });

        // D. Création Optimiste (POST) - UNIQUEMENT PAGE 1
        // Si on est page 2, on ne voit pas le nouveau client tout de suite (logique standard)
        if (page === 1) {
            const pendingCreates = queue.filter((item: any) => item.url === '/customers' && item.method === 'POST');
            pendingCreates.forEach((item: any) => {
                const tempCustomer: Customer = {
                    ...item.body,
                    id: `TEMP_${Date.now()}_${Math.random()}`,
                    '@id': `TEMP_IRI_${Date.now()}`,
                    activated: true,
                    __isPending: true,
                    __pendingAction: 'CREATE'
                };
                merged.unshift(tempCustomer);
            });
        }

        return merged;
    }, [customers, queue, page]); // Plus besoin de filtrer par searchTerm ici, le serveur le fait

    // --- HANDLERS (Identiques) ---

    const handleCreate = () => {
        setEditingCustomer(null);
        setProspectionSourceId(null);
        setFormData({ name: '', zone: '', phoneNumber: '', exactLocation: '', erpCode: '' });
        setIsModalOpen(true);
    };

    const handleEdit = (customer: Customer) => {
        if (customer.__isPending) return toast.error("Veuillez attendre la synchronisation.");
        setEditingCustomer(customer);
        setProspectionSourceId(null);
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
        if (prospectionSourceId) {
            router.replace('/dashboard/customers');
            setProspectionSourceId(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.zone) return toast.error("Nom et Zone obligatoires.");

        setIsSubmitting(true);
        const payload = { ...formData, activated: true };
        const url = editingCustomer ? `/customers/${editingCustomer.id}` : '/customers';
        const method = editingCustomer ? 'PATCH' : 'POST';

        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            toast("🌐 Hors ligne : Action mise en file d'attente.", { icon: "💾", style: { background: "#3b82f6", color: "#fff" } });
            handleClose();
            return;
        }

        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': editingCustomer ? 'application/merge-patch+json' : 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erreur API");

            if (prospectionSourceId && !editingCustomer) {
                try {
                    await fetch(`${API_URL}/prospections/${prospectionSourceId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ status: 'CONVERTED' })
                    });
                    toast.success("Prospection convertie ! 🎉");
                } catch (err) { console.error(err); }
            }

            queryClient.invalidateQueries({ queryKey: ['customers'] });
            toast.success(editingCustomer ? "Client modifié" : "Client créé");
            if (prospectionSourceId) router.replace('/dashboard/customers');
            handleClose();

        } catch (e: any) {
            // Fallback Offline
            addToQueue({ url, method: method as any, body: payload });
            toast("⚠️ Sauvegardé hors-ligne.");
            handleClose();
        }
    };

    const handleToggleStatus = async (customer: Customer) => {
        if (customer.__isPending) return;
        const url = `/customers/${customer.id}`;
        const method = 'PATCH';
        const body = { activated: !customer.activated };

        if (!navigator.onLine) { addToQueue({ url, method, body }); return; }

        try {
            const token = localStorage.getItem('sav_token');
            await fetch(`${API_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) { addToQueue({ url, method, body }); }
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm("Supprimer ce client ?")) return;
        const url = `/customers/${id}`;
        
        if (!navigator.onLine) { addToQueue({ url, method: 'DELETE', body: {} }); return; }

        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Erreur");
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) { addToQueue({ url, method: 'DELETE', body: {} }); }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                <button onClick={handleCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition flex items-center gap-2">
                    <span>+</span> Nouveau Client
                </button>
            </div>

            {/* BARRE DE RECHERCHE */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-2">
                <span className="text-xl">🔍</span>
                <input 
                    type="text" 
                    placeholder="Rechercher par nom..." 
                    className="w-full outline-none text-gray-700"
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                />
            </div>

            {/* LISTE */}
            {isLoading ? <div className="text-center py-10">Chargement...</div> : isError ? <div className="text-center text-red-500">Erreur de chargement</div> : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {displayedCustomers.length === 0 ? (
                            <div className="col-span-full text-center py-10 text-gray-500 italic">Aucun client trouvé.</div>
                        ) : (
                            displayedCustomers.map(customer => (
                                <div key={customer.id} className={`bg-white p-5 rounded-xl shadow-sm border-l-4 relative overflow-hidden group ${customer.__isPending ? 'border-yellow-400 opacity-90' : customer.activated ? 'border-green-500' : 'border-gray-300 opacity-75'}`}>
                                    {customer.__isPending && <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-bl-lg">⏳ {customer.__pendingAction === 'CREATE' ? 'CRÉATION' : 'MODIF'}</div>}
                                    
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
                                                <button onClick={() => handleToggleStatus(customer)} className={`text-xs font-bold px-2 py-1 rounded ${customer.activated ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50'}`}>{customer.activated ? 'Archiver' : 'Activer'}</button>
                                                <button onClick={() => handleDelete(customer.id)} className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">🗑️</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* --- PAGINATION --- */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 py-4 bg-white rounded-xl shadow-sm border border-gray-100 mt-4">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition"
                            >
                                ← Précédent
                            </button>
                            <span className="text-sm font-medium text-gray-600">
                                Page <span className="font-bold text-indigo-600">{page}</span> sur {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
                                disabled={page >= totalPages}
                                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition"
                            >
                                Suivant →
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* MODALE (Inchangée) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                        <h2 className="text-xl font-bold mb-4 text-gray-800">{editingCustomer ? 'Modifier' : prospectionSourceId ? '🚀 Convertir' : 'Nouveau Client'}</h2>
                        
                        {prospectionSourceId && (
                            <div className="bg-green-50 text-green-800 text-xs p-3 rounded mb-4 border border-green-200">✨ Données pré-remplies.</div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">Nom *</label><input required className="w-full border rounded p-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">Zone *</label><input required className="w-full border rounded p-2" value={formData.zone} onChange={e => setFormData({...formData, zone: e.target.value})} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Téléphone</label><input className="w-full border rounded p-2" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} /></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Code ERP</label><input className="w-full border rounded p-2" value={formData.erpCode} onChange={e => setFormData({...formData, erpCode: e.target.value})} /></div>
                            </div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">Localisation (GPS)</label><input className="w-full border rounded p-2" value={formData.exactLocation} onChange={e => setFormData({...formData, exactLocation: e.target.value})} /></div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <button type="button" onClick={handleClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">Annuler</button>
                                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 disabled:opacity-50">{isSubmitting ? '...' : 'Enregistrer'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}