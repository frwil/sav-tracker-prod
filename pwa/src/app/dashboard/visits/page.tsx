'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Select from 'react-select';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from "@/providers/SyncProvider";

interface Visit {
    id: number | string;
    visitedAt?: string;
    plannedAt?: string; // Important
    technician: { fullname: string };
    customer: { name: string; zone: string };
    gpsCoordinates?: string;
    closed: boolean;
    activated: boolean;
    __isPending?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const getDateRange = (type: string, dateRef: string, dateEndRef?: string) => {
    const start = new Date(dateRef);
    const end = new Date(dateEndRef || dateRef);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (type === 'week') {
        const day = start.getDay() || 7; 
        if (day !== 1) start.setHours(-24 * (day - 1));
        end.setTime(start.getTime() + 6 * 24 * 60 * 60 * 1000);
        end.setHours(23, 59, 59, 999);
    } else if (type === 'month') {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0); 
        end.setHours(23, 59, 59, 999);
    }

    return { 
        after: start.toISOString(), 
        before: end.toISOString() 
    };
};

export default function VisitsListPage() {
    const router = useRouter();
    const { options: customerOptions, loading: customersLoading } = useCustomers();
    const { queue } = useSync();

    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);

    // États des filtres
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
    const [filterType, setFilterType] = useState('today'); 
    const [datePrimary, setDatePrimary] = useState(new Date().toISOString().slice(0, 10));
    const [dateSecondary, setDateSecondary] = useState('');
    
    // 👇 NOUVEAU : Mode d'affichage (Planning ou Historique)
    const [viewMode, setViewMode] = useState<'planning' | 'history'>('planning');

    useEffect(() => {
        const fetchVisits = async () => {
            setLoading(true);
            const token = localStorage.getItem('sav_token');
            if (!token) { router.push('/'); return; }

            if (!navigator.onLine) {
                setLoading(false);
                return;
            }

            let url = `${API_URL}/visits?page=1`;

            // Filtre Client
            if (selectedCustomer) {
                const customerId = selectedCustomer.value.split('/').pop();
                url += `&customer=${customerId}`;
            }

            // 👇 MODIFICATION MAJEURE ICI
            // On détermine sur quel champ filtrer et comment trier
            const dateField = viewMode === 'planning' ? 'plannedAt' : 'visitedAt';
            const sortOrder = viewMode === 'planning' ? 'asc' : 'desc'; // Planning = Chronologique, Historique = Antéchronologique

            // Application du tri
            url += `&order[${dateField}]=${sortOrder}`;

            // Application des filtres de date
            if (filterType !== 'all') {
                let range = { after: '', before: '' };
                if (filterType === 'today') range = getDateRange('day', new Date().toISOString());
                else if (filterType === 'date') range = getDateRange('day', datePrimary);
                else if (filterType === 'week') range = getDateRange('week', datePrimary);
                else if (filterType === 'month') range = getDateRange('month', datePrimary);
                else if (filterType === 'interval' && datePrimary && dateSecondary) range = getDateRange('interval', datePrimary, dateSecondary);

                if (range.after && range.before) {
                    // On utilise le champ dynamique (plannedAt ou visitedAt)
                    url += `&${dateField}[after]=${range.after}&${dateField}[before]=${range.before}`;
                }
            } else {
                // Si "Tout l'historique", on s'assure quand même de ne récupérer que ce qui a du sens
                // Ex: Pour le planning, on veut plannedAt existant
                if (viewMode === 'planning') url += `&plannedAt[exists]=true`;
                if (viewMode === 'history') url += `&visitedAt[exists]=true`;
            }

            try {
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                });

                if (res.status === 401) {
                    localStorage.removeItem('sav_token');
                    router.push('/');
                    return;
                }

                const data = await res.json();
                setVisits(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchVisits();
    }, [router, selectedCustomer, filterType, datePrimary, dateSecondary, viewMode]); // Déclenche au changement de mode

    const displayedVisits = useMemo(() => {
        // ... (Logique Sync existante inchangée, elle fusionne juste les données)
        const pendingVisits: Visit[] = queue
            .filter((item: any) => item.url === '/visits' && item.method === 'POST')
            .map((item: any) => ({
                id: `TEMP_${Date.now()}_${Math.random()}`,
                visitedAt: item.body.visitedAt,
                plannedAt: item.body.plannedAt,
                technician: { fullname: "Moi (En attente)" }, 
                customer: { name: "Client...", zone: "..." },
                closed: false,
                activated: true,
                __isPending: true
            }));

        const validVisits = visits.filter((visit: Visit) => visit && visit.customer);
        const all = [...pendingVisits, ...validVisits];
        
        // Tri visuel local (au cas où)
        return all; 
    }, [visits, queue]);

    const getVisitStatus = (visit: Visit) => {
        if (visit.__isPending) return { label: 'Sync...', color: 'yellow', border: 'border-yellow-300', bg: 'bg-yellow-50' };
        if (visit.closed) return { label: 'Clôturée', color: 'gray', border: 'border-gray-200', bg: 'bg-white' };
        if (visit.visitedAt) return { label: 'Réalisée', color: 'green', border: 'border-green-500', bg: 'bg-white' };
        if (visit.plannedAt) {
            // Petit calcul pour voir si en retard
            const isLate = new Date(visit.plannedAt) < new Date() && !visit.visitedAt;
            return isLate 
                ? { label: 'En retard', color: 'red', border: 'border-red-400', bg: 'bg-red-50' }
                : { label: 'Planifiée', color: 'blue', border: 'border-blue-500', bg: 'bg-blue-50' };
        }
        return { label: 'Inconnu', color: 'gray', border: 'border-gray-200', bg: 'bg-white' };
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            <div className="bg-white shadow px-6 py-4 mb-6">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div>
                        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-indigo-600">← Retour</Link>
                        <h1 className="text-2xl font-extrabold text-gray-800">Visites Techniques</h1>
                    </div>
                    <Link href="/dashboard/visits/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 text-sm">
                        + Nouvelle Visite
                    </Link>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4">
                
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4">
                    
                    {/* 👇 NOUVEAU : Onglets Planning / Historique */}
                    <div className="flex p-1 bg-gray-100 rounded-lg mb-4 w-full md:w-fit">
                        <button 
                            onClick={() => setViewMode('planning')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'planning' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📅 Agenda (Prévu)
                        </button>
                        <button 
                            onClick={() => setViewMode('history')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            ✅ Historique (Réalisé)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        {/* ... (Le reste des filtres Période/Client reste identique) ... */}
                        <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Période</label>
                            <select 
                                className="w-full border p-2 rounded-lg bg-gray-50 text-sm"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                            >
                                <option value="today">Aujourd'hui</option>
                                <option value="date">Date précise</option>
                                <option value="week">Semaine</option>
                                <option value="month">Mois</option>
                                <option value="all">Tout</option>
                            </select>
                        </div>

                        {filterType !== 'today' && filterType !== 'all' && (
                            <div className="md:col-span-4 flex gap-2">
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
                                    <input type="date" className="w-full border p-2 rounded-lg bg-white text-sm" value={datePrimary} onChange={(e) => setDatePrimary(e.target.value)}/>
                                </div>
                            </div>
                        )}

                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Client</label>
                            <Select
                                instanceId="customer-filter"
                                options={customerOptions}
                                value={selectedCustomer}
                                onChange={setSelectedCustomer}
                                isLoading={customersLoading}
                                placeholder="Tous..."
                                isClearable
                                className="text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Liste des visites */}
                {loading && visits.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 animate-pulse">Chargement...</div>
                ) : (
                    <div className="grid gap-4">
                        {displayedVisits.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-500 mb-2">Aucune visite trouvée.</p>
                                {viewMode === 'planning' && filterType === 'today' && (
                                    <p className="text-sm text-indigo-600">Rien de prévu pour aujourd'hui ! 🎉</p>
                                )}
                            </div>
                        )}

                        {displayedVisits.map(visit => {
                            if (!visit || !visit.customer) return null;
                            const status = getVisitStatus(visit);
                            // On affiche la date pertinente selon le mode
                            const displayDate = viewMode === 'planning' ? visit.plannedAt : (visit.visitedAt || visit.plannedAt);

                            return (
                                <Link 
                                    key={visit.id} 
                                    href={visit.__isPending ? '#' : `/dashboard/visits/${visit.id}`}
                                >
                                    <div className={`p-5 rounded-xl border transition-all flex justify-between items-center group shadow-sm hover:shadow-md relative overflow-hidden ${status.bg} ${status.border} border-l-4`}>
                                        
                                        <div className="absolute top-0 right-0">
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-bl-lg uppercase tracking-wide bg-white/50 text-gray-600 border-b border-l border-gray-100`}>
                                                {status.label}
                                            </span>
                                        </div>

                                        <div>
                                            <h2 className="font-bold text-lg text-gray-800 mb-1">{visit.customer.name}</h2>
                                            <div className="text-sm text-gray-500 flex gap-3">
                                                {displayDate && (
                                                    <span>
                                                        {viewMode === 'planning' ? '📅 Prévu : ' : '📅 Fait : '}
                                                        {new Date(displayDate).toLocaleDateString()}
                                                        {' ' + new Date(displayDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                )}
                                                <span>📍 {visit.customer.zone}</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">Tech: {visit.technician?.fullname}</p>
                                        </div>
                                        
                                        <div className="text-2xl text-gray-300 group-hover:text-indigo-500">→</div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}