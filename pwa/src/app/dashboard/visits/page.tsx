'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Select from 'react-select';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { useSync } from "@/providers/SyncProvider";

interface Visit {
    id: number | string;
    visitedAt: string;
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

    const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
    const [filterType, setFilterType] = useState('today'); 
    const [datePrimary, setDatePrimary] = useState(new Date().toISOString().slice(0, 10));
    const [dateSecondary, setDateSecondary] = useState('');

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

            if (selectedCustomer) {
                const customerId = selectedCustomer.value.split('/').pop();
                url += `&customer=${customerId}`;
            }

            if (filterType !== 'all') {
                let range = { after: '', before: '' };
                if (filterType === 'today') range = getDateRange('day', new Date().toISOString());
                else if (filterType === 'date') range = getDateRange('day', datePrimary);
                else if (filterType === 'week') range = getDateRange('week', datePrimary);
                else if (filterType === 'month') range = getDateRange('month', datePrimary);
                else if (filterType === 'interval' && datePrimary && dateSecondary) range = getDateRange('interval', datePrimary, dateSecondary);

                if (range.after && range.before) {
                    url += `&visitedAt[after]=${range.after}&visitedAt[before]=${range.before}`;
                }
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
    }, [router, selectedCustomer, filterType, datePrimary, dateSecondary]);

    const displayedVisits = useMemo(() => {
        const pendingVisits: Visit[] = queue
            .filter((item: any) => item.url === '/visits' && item.method === 'POST')
            .map((item: any) => {
                const customerOpt = customerOptions.find(opt => opt.value === item.body.customer);
                
                return {
                    id: `TEMP_${Date.now()}_${Math.random()}`,
                    visitedAt: item.body.visitedAt,
                    technician: { fullname: "Moi (En attente)" }, 
                    customer: { 
                        name: customerOpt ? customerOpt.label : "Client...", 
                        zone: "..." 
                    },
                    closed: false,
                    activated: true,
                    __isPending: true
                };
            });

        const validVisits = visits.filter((visit: Visit) => visit && visit.customer);

        const filteredPending = pendingVisits.filter(v => {
            if (selectedCustomer) {
                if (v.customer.name !== selectedCustomer.label) return false;
            }

            if (filterType !== 'all') {
                const d = new Date(v.visitedAt);
                let range = { after: new Date(0), before: new Date(9999, 11, 31) };
                
                if (filterType === 'today') {
                    const r = getDateRange('day', new Date().toISOString());
                    range = { after: new Date(r.after), before: new Date(r.before) };
                } else if (filterType === 'date') {
                    const r = getDateRange('day', datePrimary);
                    range = { after: new Date(r.after), before: new Date(r.before) };
                } 
                
                if (filterType === 'today' || filterType === 'date') {
                    return d >= range.after && d <= range.before;
                }
            }
            return true;
        });

        const all = [...filteredPending, ...validVisits];
        
        return all.sort((a, b) => {
            if (!a?.customer && !b?.customer) return 0;
            if (!a?.customer) return 1;
            if (!b?.customer) return -1;

            if (a.__isPending && !b.__isPending) return -1;
            if (!a.__isPending && b.__isPending) return 1;

            if (a.closed !== b.closed) return a.closed ? 1 : -1; 
            
            return new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime();
        });

    }, [visits, queue, customerOptions, selectedCustomer, filterType, datePrimary]);

    const getFilterLabel = () => {
        if (filterType === 'today') return "Aujourd'hui";
        if (filterType === 'week') return "Semaine du";
        if (filterType === 'month') return "Mois de";
        return "Date";
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
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
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
                                <option value="interval">Intervalle</option>
                                <option value="all">Tout l'historique</option>
                            </select>
                        </div>

                        {filterType !== 'today' && filterType !== 'all' && (
                            <div className={`${filterType === 'interval' ? 'md:col-span-4' : 'md:col-span-3'} flex gap-2`}>
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">
                                        {filterType === 'interval' ? 'Du' : getFilterLabel()}
                                    </label>
                                    <input 
                                        type="date" 
                                        className="w-full border p-2 rounded-lg bg-white text-sm"
                                        value={datePrimary}
                                        onChange={(e) => setDatePrimary(e.target.value)}
                                    />
                                </div>
                                {filterType === 'interval' && (
                                    <div className="w-full">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Au</label>
                                        <input 
                                            type="date" 
                                            className="w-full border p-2 rounded-lg bg-white text-sm"
                                            value={dateSecondary}
                                            onChange={(e) => setDateSecondary(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Filtrer par Client</label>
                            <Select
                                instanceId="customer-filter"
                                options={customerOptions}
                                value={selectedCustomer}
                                onChange={setSelectedCustomer}
                                isLoading={customersLoading}
                                placeholder="Tous les clients..."
                                isClearable
                                className="text-sm"
                                styles={{ control: (base) => ({ ...base, minHeight: '38px', borderRadius: '0.5rem' }) }}
                            />
                        </div>

                        <div className="md:col-span-1">
                            <button 
                                onClick={() => {
                                    setFilterType('today');
                                    setSelectedCustomer(null);
                                    setDatePrimary(new Date().toISOString().slice(0, 10));
                                }}
                                className="w-full py-2 text-xs font-bold text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg border border-gray-200 transition"
                                title="Réinitialiser les filtres"
                            >
                                ↺
                            </button>
                        </div>
                    </div>
                </div>

                {loading && visits.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 animate-pulse">Chargement des visites...</div>
                ) : (
                    <div className="grid gap-4">
                        {displayedVisits.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-500 mb-2">Aucune visite trouvée pour ces critères.</p>
                                {filterType === 'today' && (
                                    <p className="text-sm text-indigo-600">Le planning est vide pour aujourd'hui.</p>
                                )}
                            </div>
                        )}

                        {displayedVisits.map(visit => {
                            if (!visit || !visit.customer) {
                                console.warn('Visite sans customer ignorée:', visit);
                                return null;
                            }
                            
                            return (
                                <Link 
                                    key={visit.id} 
                                    href={visit.__isPending ? '#' : `/dashboard/visits/${visit.id}`}
                                    className={visit.__isPending ? 'cursor-not-allowed' : ''}
                                >
                                    <div className={`p-5 rounded-xl border transition-all duration-200 flex justify-between items-center group shadow-sm hover:shadow-md relative overflow-hidden ${
                                        visit.__isPending 
                                            ? 'bg-yellow-50 border-yellow-300 opacity-90' 
                                            : visit.closed 
                                                ? 'bg-white border-gray-200 opacity-90' 
                                                : 'bg-white border-l-4 border-l-green-500 border-gray-100'
                                    }`}>
                                        
                                        {visit.__isPending && (
                                            <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-2 py-1 rounded-bl-lg z-10 animate-pulse">
                                                ⏳ EN ATTENTE DE SYNCHRO
                                            </div>
                                        )}

                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h2 className={`font-bold text-lg transition-colors ${visit.__isPending ? 'text-yellow-900' : 'text-gray-800 group-hover:text-indigo-700'}`}>
                                                    {visit.customer?.name || 'INCONNU'}
                                                </h2>
                                                {visit.__isPending ? (
                                                    null
                                                ) : visit.closed ? (
                                                    <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-gray-200">Clôturée</span>
                                                ) : (
                                                    <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-green-200 animate-pulse">En cours</span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-500 flex flex-col md:flex-row gap-1 md:gap-3">
                                                <span>📅 {new Date(visit.visitedAt).toLocaleDateString()} à {new Date(visit.visitedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                <span className="hidden md:inline">•</span>
                                                <span>📍 {visit.customer?.zone || 'Zone inconnue'}</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">Tech: {visit.technician?.fullname || 'Inconnu'}</p>
                                        </div>
                                        
                                        {!visit.__isPending && (
                                            <div className="text-2xl text-gray-300 group-hover:text-indigo-500 transition-colors">→</div>
                                        )}
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