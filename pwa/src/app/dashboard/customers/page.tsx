'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSync } from '@/providers/SyncProvider';
import toast from "react-hot-toast";
import Link from 'next/link';

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

interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalItems: number;
}

interface CachedData {
    items: Customer[];
    pagination: PaginationInfo;
    timestamp: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ITEMS_PER_PAGE = 10;
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24h

// --- CACHE HELPERS ---

const getCacheKey = (page: number, search: string) => 
    `customers_v1_${page}_${search || 'all'}`;

const getCachedData = (page: number, search: string): CachedData | null => {
    try {
        const cached = localStorage.getItem(getCacheKey(page, search));
        if (!cached) return null;
        return JSON.parse(cached);
    } catch {
        return null;
    }
};

const setCachedData = (page: number, search: string, data: CachedData) => {
    try {
        localStorage.setItem(getCacheKey(page, search), JSON.stringify(data));
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
};

const clearCustomersCache = () => {
    Object.keys(localStorage)
        .filter(key => key.startsWith('customers_v1_'))
        .forEach(key => localStorage.removeItem(key));
};

// --- FETCH ---

async function fetchCustomersFromAPI(page: number, search: string, token: string) {
    const searchQuery = search ? `&name=${encodeURIComponent(search)}` : '';
    const url = `${API_URL}/customers?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}${searchQuery}`;

    const res = await fetch(url, {
        headers: { 
            'Authorization': `Bearer ${token}`, 
            'Accept': 'application/ld+json' 
        }
    });

    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    
    const data = await res.json();
    
    return {
        items: data['hydra:member'] || data['member'] || [],
        totalItems: data['hydra:totalItems'] || 0
    };
}

export default function CustomersPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToQueue, queue, processQueue } = useSync();
    
    // --- ÉTATS ---
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    
    // Données
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState<PaginationInfo>({
        currentPage: 1,
        totalPages: 1,
        totalItems: 0
    });

    // Modal
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

    const preloadRef = useRef<Set<string>>(new Set());

    // --- INIT ---

    useEffect(() => {
        const token = localStorage.getItem('sav_token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setIsAdmin(payload.roles?.includes('ROLE_ADMIN'));
            } catch (e) { 
                console.error(e); 
            }
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
    }, [searchParams, isModalOpen]);

    // --- FETCH OFFLINE-FIRST ---

    const fetchCustomers = useCallback(async (targetPage: number = page, targetSearch: string = searchTerm, forceRefresh = false) => {
        setLoading(true);
        
        const token = localStorage.getItem('sav_token');
        if (!token) {
            router.push('/');
            return;
        }

        const cacheKey = getCacheKey(targetPage, targetSearch);
        const cached = getCachedData(targetPage, targetSearch);

        // Si offline et cache dispo → utiliser cache
        if (!navigator.onLine && cached) {
            setCustomers(cached.items);
            setPagination(cached.pagination);
            setCacheAge(Date.now() - cached.timestamp);
            setIsOfflineMode(true);
            setLoading(false);
            return;
        }

        // Si online mais pas forceRefresh et cache frais (< 5min) → utiliser cache
        if (!forceRefresh && cached && (Date.now() - cached.timestamp < 5 * 60 * 1000) && navigator.onLine) {
            setCustomers(cached.items);
            setPagination(cached.pagination);
            setCacheAge(Date.now() - cached.timestamp);
        }

        // Fetch API si online
        if (navigator.onLine) {
            try {
                const data = await fetchCustomersFromAPI(targetPage, targetSearch, token);
                const totalPages = Math.ceil(data.totalItems / ITEMS_PER_PAGE);

                const newPagination = {
                    currentPage: targetPage,
                    totalPages,
                    totalItems: data.totalItems
                };

                setCustomers(data.items);
                setPagination(newPagination);
                setIsOfflineMode(false);
                setCacheAge(null);

                // Sauvegarder dans cache
                setCachedData(targetPage, targetSearch, {
                    items: data.items,
                    pagination: newPagination,
                    timestamp: Date.now()
                });

                // Précharger pages adjacentes
                preloadAdjacentPages(targetPage, targetSearch, token);

            } catch (err) {
                console.error('Fetch error:', err);
                
                // Fallback sur cache si dispo
                if (cached) {
                    setCustomers(cached.items);
                    setPagination(cached.pagination);
                    setCacheAge(Date.now() - cached.timestamp);
                    setIsOfflineMode(true);
                    toast("Mode hors ligne 📡 (données en cache)", { id: 'offline-toast' });
                } else {
                    toast.error("Impossible de charger les données");
                    setCustomers([]);
                }
            }
        } else {
            // Offline sans cache
            setIsOfflineMode(true);
            if (!cached) {
                setCustomers([]);
                toast.error("Aucune donnée disponible hors ligne");
            }
        }

        setLoading(false);
    }, [page, searchTerm, router]);

    // Préchargement des pages adjacentes
    const preloadAdjacentPages = async (currentPage: number, search: string, token: string) => {
        const pagesToPreload = [currentPage - 1, currentPage + 1].filter(p => p > 0);
        
        for (const p of pagesToPreload) {
            const cacheKey = getCacheKey(p, search);
            if (preloadRef.current.has(cacheKey)) continue;
            
            try {
                const data = await fetchCustomersFromAPI(p, search, token);
                const totalPages = Math.ceil(data.totalItems / ITEMS_PER_PAGE);
                
                setCachedData(p, search, {
                    items: data.items,
                    pagination: {
                        currentPage: p,
                        totalPages,
                        totalItems: data.totalItems
                    },
                    timestamp: Date.now()
                });
                
                preloadRef.current.add(cacheKey);
            } catch {
                // Silencieux
            }
        }
    };

    // --- GESTION ONLINE/OFFLINE ---

    useEffect(() => {
        const handleOnline = async () => {
            setIsOfflineMode(false);
            toast.success("Connexion rétablie 🌐", { id: 'online-back' });

            // Sync si file d'attente
            if (queue.length > 0 && processQueue) {
                setIsSyncing(true);
                toast.loading("Synchronisation...", { id: 'syncing' });
                try {
                    await processQueue();
                    toast.success("Synchronisation terminée ✅", { id: 'syncing' });
                    clearCustomersCache(); // Invalider cache après sync
                    fetchCustomers(page, searchTerm, true); // Refresh
                } catch {
                    toast.error("Erreur de synchronisation", { id: 'syncing' });
                } finally {
                    setIsSyncing(false);
                }
            } else {
                fetchCustomers(page, searchTerm, true);
            }
        };

        const handleOffline = () => {
            setIsOfflineMode(true);
            toast("Mode hors ligne 📡", { id: 'offline' });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (!navigator.onLine) handleOffline();

        // Fetch initial
        fetchCustomers();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [fetchCustomers, page, searchTerm, queue, processQueue]);

    // --- ACTIONS ---

    const handleSearch = (term: string) => {
        setSearchTerm(term);
        setPage(1);
        fetchCustomers(1, term, true);
    };

    const goToPage = (newPage: number) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        
        // Utiliser cache immédiatement si dispo
        const cached = getCachedData(newPage, searchTerm);
        if (cached) {
            setCustomers(cached.items);
            setPagination(cached.pagination);
            setCacheAge(Date.now() - cached.timestamp);
        }
        
        setPage(newPage);
        fetchCustomers(newPage, searchTerm);
    };

    // --- FUSION OPTIMISTE ---

    const displayedCustomers = useMemo(() => {
        let merged = [...customers];

        // Suppressions pending
        const pendingDeletes = queue.filter((item: any) => 
            item.url.startsWith('/customers/') && item.method === 'DELETE'
        );
        const deletedIds = pendingDeletes.map((item: any) => 
            parseInt(item.url.split('/').pop())
        );
        merged = merged.filter(c => !deletedIds.includes(Number(c.id)));

        // Modifications pending
        const pendingUpdates = queue.filter((item: any) => 
            item.url.startsWith('/customers/') && ['PUT', 'PATCH'].includes(item.method)
        );
        merged = merged.map(c => {
            const updateItem = pendingUpdates.find((item: any) => 
                parseInt(item.url.split('/').pop()) === Number(c.id)
            );
            if (updateItem) {
                return { 
                    ...c, 
                    ...updateItem.body, 
                    __isPending: true, 
                    __pendingAction: 'UPDATE' as const 
                };
            }
            return c;
        });

        // Créations pending (uniquement page 1 et recherche vide)
        if (page === 1 && !searchTerm) {
            const pendingCreates = queue.filter((item: any) => 
                item.url === '/customers' && item.method === 'POST'
            );
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
    }, [customers, queue, page, searchTerm]);

    // --- HANDLERS CRUD ---

    const handleCreate = () => {
        setEditingCustomer(null);
        setProspectionSourceId(null);
        setFormData({ name: '', zone: '', phoneNumber: '', exactLocation: '', erpCode: '' });
        setIsModalOpen(true);
    };

    const handleEdit = (customer: Customer) => {
        if (customer.__isPending) {
            return toast.error("Veuillez attendre la synchronisation.");
        }
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
        if (!formData.name || !formData.zone) {
            return toast.error("Nom et Zone obligatoires.");
        }

        setIsSubmitting(true);
        const payload = { ...formData, activated: true };
        const url = editingCustomer ? `/customers/${editingCustomer.id}` : '/customers';
        const method = editingCustomer ? 'PATCH' : 'POST';

        // Mode offline → queue
        if (!navigator.onLine) {
            addToQueue({ url, method: method as any, body: payload });
            toast("🌐 Hors ligne : Action mise en file d'attente.", { 
                icon: "💾", 
                style: { background: "#3b82f6", color: "#fff" } 
            });
            
            // Optimistic update local
            if (!editingCustomer) {
                const tempCustomer: Customer = {
                    ...payload,
                    id: `TEMP_${Date.now()}`,
                    '@id': `TEMP_IRI_${Date.now()}`,
                    __isPending: true,
                    __pendingAction: 'CREATE'
                };
                setCustomers(prev => [tempCustomer, ...prev]);
            }
            
            handleClose();
            return;
        }

        // Mode online → API direct
        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 
                    'Content-Type': editingCustomer ? 'application/merge-patch+json' : 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erreur API");

            // Conversion prospection
            if (prospectionSourceId && !editingCustomer) {
                try {
                    await fetch(`${API_URL}/prospections/${prospectionSourceId}`, {
                        method: 'PATCH',
                        headers: { 
                            'Content-Type': 'application/merge-patch+json', 
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify({ status: 'CONVERTED' })
                    });
                    toast.success("Prospection convertie ! 🎉");
                } catch (err) { 
                    console.error(err); 
                }
            }

            // Invalider cache et refresh
            clearCustomersCache();
            fetchCustomers(page, searchTerm, true);
            
            toast.success(editingCustomer ? "Client modifié" : "Client créé");
            if (prospectionSourceId) router.replace('/dashboard/customers');
            handleClose();

        } catch (e: any) {
            // Fallback offline
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

        // Optimistic update
        setCustomers(prev => prev.map(c => 
            c.id === customer.id ? { ...c, activated: !c.activated, __isPending: true, __pendingAction: 'UPDATE' } : c
        ));

        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            toast("Modification en attente de sync", { icon: "💾" });
            return;
        }

        try {
            const token = localStorage.getItem('sav_token');
            await fetch(`${API_URL}${url}`, {
                method,
                headers: { 
                    'Content-Type': 'application/merge-patch+json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(body)
            });
            
            clearCustomersCache();
            fetchCustomers(page, searchTerm, true);
        } catch (e) {
            addToQueue({ url, method, body });
            toast("⚠️ Sauvegardé hors-ligne");
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm("Supprimer ce client ?")) return;
        
        const url = `/customers/${id}`;
        
        // Optimistic delete
        setCustomers(prev => prev.filter(c => c.id !== id));
        
        if (!navigator.onLine) {
            addToQueue({ url, method: 'DELETE', body: {} });
            toast("Suppression en attente de sync", { icon: "🗑️" });
            return;
        }

        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error("Erreur");
            
            clearCustomersCache();
            fetchCustomers(page, searchTerm, true);
        } catch (e) {
            // Rollback optimistic
            fetchCustomers(page, searchTerm, true);
            addToQueue({ url, method: 'DELETE', body: {} });
            toast("⚠️ Suppression sauvegardée hors-ligne");
        }
    };

    // --- RENDER ---

    const isStale = cacheAge && cacheAge > CACHE_MAX_AGE;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            {/* Bannières d'état */}
            {isOfflineMode && (
                <div className="bg-orange-500 text-white text-xs font-bold text-center py-1">
                    📡 Mode Hors Ligne {isStale && `(${Math.round(cacheAge! / 3600000)}h)`}
                </div>
            )}
            {isStale && !isOfflineMode && (
                <div className="bg-yellow-500 text-white text-xs font-bold text-center py-1">
                    ⚠️ Données potentiellement obsolètes
                </div>
            )}
            {isSyncing && (
                <div className="bg-blue-500 text-white text-xs font-bold text-center py-1 animate-pulse">
                    🔄 Synchronisation...
                </div>
            )}

            <div className="max-w-6xl mx-auto px-4 space-y-6 pt-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-indigo-600">
                            ← Retour
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                    </div>
                    <button 
                        onClick={handleCreate} 
                        disabled={isOfflineMode}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>+</span> Nouveau Client
                    </button>
                </div>

                {/* Barre de recherche */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-2">
                    <span className="text-xl">🔍</span>
                    <input 
                        type="text" 
                        placeholder={isOfflineMode ? "Recherche limitée hors ligne..." : "Rechercher par nom..."}
                        className="w-full outline-none text-gray-700"
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                        disabled={isOfflineMode && !getCachedData(1, searchTerm)}
                    />
                    {cacheAge && !isOfflineMode && (
                        <span className="text-xs text-gray-400">
                            Cache: {Math.round(cacheAge / 60000)}min
                        </span>
                    )}
                </div>

                {/* Liste */}
                {loading && customers.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 animate-pulse">
                        <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p>Chargement...</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {displayedCustomers.length === 0 ? (
                                <div className="col-span-full text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                    <div className="text-4xl mb-4">📭</div>
                                    <p className="text-gray-500 font-medium text-lg">Aucun client trouvé</p>
                                    {!navigator.onLine && (
                                        <p className="text-sm text-gray-400 mt-2">Mode hors ligne - données limitées</p>
                                    )}
                                </div>
                            ) : (
                                displayedCustomers.map(customer => (
                                    <div 
                                        key={customer.id} 
                                        className={`bg-white p-5 rounded-xl shadow-sm border-l-4 relative overflow-hidden group transition-all hover:shadow-md ${customer.__isPending ? 'border-yellow-400 opacity-90' : customer.activated ? 'border-green-500' : 'border-gray-300 opacity-75'}`}
                                    >
                                        {customer.__isPending && (
                                            <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded-bl-lg">
                                                ⏳ {customer.__pendingAction === 'CREATE' ? 'CRÉATION' : 'MODIF'}
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-lg">{customer.name}</h3>
                                                <p className="text-sm text-gray-500">📍 {customer.zone}</p>
                                                {customer.phoneNumber && (
                                                    <p className="text-xs text-gray-400 mt-1">📞 {customer.phoneNumber}</p>
                                                )}
                                            </div>
                                            {customer.erpCode && (
                                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded">
                                                    {customer.erpCode}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className={`mt-4 pt-4 border-t border-gray-100 flex justify-between items-center ${customer.__isPending ? 'pointer-events-none opacity-50' : ''}`}>
                                            <button 
                                                onClick={() => handleEdit(customer)} 
                                                className="text-indigo-600 font-bold text-sm hover:underline"
                                            >
                                                Modifier
                                            </button>
                                            {isAdmin && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleToggleStatus(customer)} 
                                                        className={`text-xs font-bold px-2 py-1 rounded ${customer.activated ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50'}`}
                                                    >
                                                        {customer.activated ? 'Archiver' : 'Activer'}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(customer.id)} 
                                                        className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 py-6 bg-white rounded-xl shadow-sm border border-gray-100">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page === 1 || loading}
                                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition"
                                >
                                    ← Précédent
                                </button>
                                <span className="text-sm font-medium text-gray-600">
                                    Page <span className="font-bold text-indigo-600">{page}</span> sur {pagination.totalPages}
                                    {isOfflineMode && " (offline)"}
                                </span>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page >= pagination.totalPages || loading}
                                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition"
                                >
                                    Suivant →
                                </button>
                            </div>
                        )}

                        <div className="text-center text-sm text-gray-400 pb-8">
                            {pagination.totalItems} résultat{pagination.totalItems > 1 ? 's' : ''}
                            {isOfflineMode && " • Mode hors ligne"}
                        </div>
                    </>
                )}
            </div>

            {/* MODALE */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                        <h2 className="text-xl font-bold mb-4 text-gray-800">
                            {editingCustomer ? 'Modifier' : prospectionSourceId ? '🚀 Convertir' : 'Nouveau Client'}
                        </h2>
                        
                        {prospectionSourceId && (
                            <div className="bg-green-50 text-green-800 text-xs p-3 rounded mb-4 border border-green-200">
                                ✨ Données pré-remplies.
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nom *</label>
                                <input 
                                    required 
                                    className="w-full border rounded p-2" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Zone *</label>
                                <input 
                                    required 
                                    className="w-full border rounded p-2" 
                                    value={formData.zone} 
                                    onChange={e => setFormData({...formData, zone: e.target.value})} 
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Téléphone</label>
                                    <input 
                                        className="w-full border rounded p-2" 
                                        value={formData.phoneNumber} 
                                        onChange={e => setFormData({...formData, phoneNumber: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Code ERP</label>
                                    <input 
                                        className="w-full border rounded p-2" 
                                        value={formData.erpCode} 
                                        onChange={e => setFormData({...formData, erpCode: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Localisation (GPS)</label>
                                <input 
                                    className="w-full border rounded p-2" 
                                    value={formData.exactLocation} 
                                    onChange={e => setFormData({...formData, exactLocation: e.target.value})} 
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <button 
                                    type="button" 
                                    onClick={handleClose} 
                                    className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting} 
                                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isSubmitting ? '...' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}