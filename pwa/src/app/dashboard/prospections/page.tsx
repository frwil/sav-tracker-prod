"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSync } from "@/providers/SyncProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const ITEMS_PER_PAGE = 10;

// --- TYPES ---
interface Customer {
    id: number | string;
    '@id': string;
    name: string;
    status: string;
    zone?: string;
}

interface CommonItem {
    id: number | string;
    '@id'?: string;
    date: string;
    client?: Customer;   // Pour Prospection
    customer?: Customer; // Pour Consultation
    appointmentTaken: boolean;
    appointmentDate?: string;
    appointmentReason?: string;
    interventionDone: boolean;
    interventionComments?: string;
    concerns?: string;
    expectations?: string;
    farmDetails?: any[];
    photos?: any[];
    technician?: { username: string };
    isPending?: boolean;
    status?: string; 
}

// --- FETCH DATA (GÉNÉRIQUE) ---
async function fetchData(endpoint: string, params: string, page: number) {
    const token = localStorage.getItem("sav_token");
    const url = `${API_URL}/${endpoint}?order[date]=desc&itemsPerPage=${ITEMS_PER_PAGE}&page=${page}${params}`;
    
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/ld+json",
        },
    });

    if (!res.ok) throw new Error(`Erreur chargement ${endpoint}`);
    const data = await res.json();
    
    return {
        items: data["hydra:member"] || data["member"] || [],
        totalItems: data["hydra:totalItems"] || 0
    };
}

// --- FETCH ALL (POUR EXPORT) ---
async function fetchAllForExport(endpoint: string) {
    const token = localStorage.getItem("sav_token");
    // On récupère tout sans pagination
    const res = await fetch(`${API_URL}/${endpoint}?pagination=false&order[date]=desc`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/ld+json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data["hydra:member"] || data["member"] ||[];
}

export default function ActivitiesPage() {
    const router = useRouter();
    const { queue, addToQueue } = useSync();
    const queryClient = useQueryClient();

    // --- ÉTATS ---
    const [activeTab, setActiveTab] = useState<'prospections' | 'consultations'>('prospections');
    const [searchName, setSearchName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [page, setPage] = useState(1);
    const [selectedItem, setSelectedItem] = useState<CommonItem | null>(null);

    // --- REQUÊTE DYNAMIQUE ---
    // Prospections utilise 'client.name', Consultations utilise 'customer.name'
    const searchField = activeTab === 'prospections' ? 'client.name' : 'customer.name';
    
    const queryParams = `
        ${searchName ? `&${searchField}=${searchName}` : ''}
        ${startDate ? `&date[after]=${startDate}` : ''}
        ${endDate ? `&date[before]=${endDate}` : ''}
    `;

    // Réinitialiser la page quand on change d'onglet ou de filtre
    const handleTabChange = (tab: 'prospections' | 'consultations') => {
        setActiveTab(tab);
        setPage(1);
        setSearchName(""); // Optionnel : reset recherche
        setSelectedItem(null);
    };

    const { data, isLoading } = useQuery({
        queryKey: [activeTab, queryParams, page], // La clé change selon l'onglet
        queryFn: () => fetchData(activeTab, queryParams, page),
        placeholderData: (previousData) => previousData,
    });

    const items = data?.items || [];
    const totalItems = data?.totalItems || 0;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // --- FUSION DONNÉES LOCALES (OFFLINE) ---
    const endpointUrl = `/${activeTab}`;
    const pendingItems = queue
        .filter((task) => task.url === endpointUrl && task.method === "POST")
        .map((task) => ({
            ...task.body,
            id: `TEMP-${task.id}`,
            isPending: true,
            status: 'NEW',
            // Normalisation pour l'affichage immédiat
            client: activeTab === 'prospections' ? (typeof task.body.client === 'object' ? task.body.client : { name: 'Nouveau (Sync)' }) : undefined,
            customer: activeTab === 'consultations' ? (typeof task.body.customer === 'object' ? task.body.customer : { name: 'Client (Sync)' }) : undefined,
            date: task.body.date || new Date().toISOString()
        }));

    const allItems = page === 1 ? [...pendingItems, ...items] : items;

    // --- HELPER NORMALISATION ---
    // Permet d'accéder au contact quel que soit le type (Prospection ou Consultation)
    const getContact = (item: CommonItem) => item.client || item.customer || { name: 'Inconnu', status: 'UNKNOWN', zone: '', '@id': '' };

    // --- ACTIONS ---

    const handleGlobalExport = async () => {
        const loadingToast = toast.loading("Génération du rapport complet (Prospections + Consultations)...");

        try {
            // 1. Récupération parallèle des deux sources de données
            const [prospectionsData, consultationsData] = await Promise.all([
                fetchAllForExport('prospections'),
                fetchAllForExport('consultations')
            ]);

            console.log(prospectionsData, consultationsData);

            if (prospectionsData.length === 0 && consultationsData.length === 0) {
                toast.dismiss(loadingToast);
                toast.error("Aucune donnée à exporter.");
                return;
            }

            // 2. Création du Workbook
            const workbook = new ExcelJS.Workbook();
            
            // --- Helper pour configurer une feuille ---
            const setupSheet = (sheetName: string, data: any[], contactKey: 'client' | 'customer') => {
                const sheet = workbook.addWorksheet(sheetName);
                sheet.columns = [
                    { header: 'Date', key: 'date', width: 15 },
                    { header: 'Contact', key: 'contact', width: 25 },
                    { header: 'Zone', key: 'zone', width: 20 },
                    { header: 'Statut', key: 'status', width: 12 },
                    { header: 'Activités', key: 'activities', width: 35 },
                    { header: 'Intervention', key: 'intervention', width: 12 },
                    { header: 'RDV', key: 'rdv', width: 12 },
                    { header: 'Date RDV', key: 'rdvDate', width: 20 },
                    { header: 'Diagnostic', key: 'concerns', width: 40 },
                    { header: 'Technicien', key: 'tech', width: 20 },
                ];
                sheet.getRow(1).font = { bold: true };

                data.forEach((p: any) => {
                    const contact = p[contactKey];
                    sheet.addRow({
                        date: new Date(p.date).toLocaleDateString(),
                        contact: contact?.name || "Inconnu",
                        zone: contact?.zone || "",
                        status: contact?.status || p.status,
                        activities: p.farmDetails?.map((f:any) => `${f.spec} (${f.eff})`).join(", ") || "",
                        intervention: p.interventionDone ? "OUI" : "NON",
                        rdv: p.appointmentTaken ? "OUI" : "NON",
                        rdvDate: p.appointmentDate ? new Date(p.appointmentDate).toLocaleString() : "",
                        concerns: `Pb: ${p.concerns || ''} / Att: ${p.expectations || ''}`,
                        tech: p.technician?.username || "Moi"
                    });
                });
            };

            // 3. Remplissage des feuilles
            setupSheet('🔭 Prospections', prospectionsData, 'client');
            setupSheet('🩺 Consultations', consultationsData, 'customer');

            // 4. Téléchargement
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `Rapport_Complet_${new Date().toISOString().slice(0,10)}.xlsx`;
            saveAs(new Blob([buffer]), fileName);

            toast.dismiss(loadingToast);
            toast.success("Export Excel complet téléchargé !");

        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error("Erreur lors de l'export.");
        }
    };

    const handleDelete = async (item: CommonItem) => {
        if (!confirm("Supprimer cet élément définitivement ?")) return;
        if (item.isPending) return toast.error("Impossible de supprimer une donnée en cours d'envoi.");

        const url = `/${activeTab}/${item.id}`;
        
        if (!navigator.onLine) {
            addToQueue({ url, method: 'DELETE', body: {} });
            toast("Suppression mise en file d'attente 🗑️");
            return;
        }

        try {
            const token = localStorage.getItem("sav_token");
            const res = await fetch(`${API_URL}${url}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Erreur suppression");
            toast.success("Supprimé avec succès");
            queryClient.invalidateQueries({ queryKey: [activeTab] });
        } catch (e) {
            toast.error("Erreur lors de la suppression");
        }
    };

    const handleConvert = async (item: CommonItem) => {
        const contact = getContact(item);
        if (item.isPending) return toast.error("Attendez la synchronisation.");
        if (!contact['@id']) return toast.error("Erreur: Contact introuvable.");

        const token = localStorage.getItem("sav_token");
        
        // Nettoyage URL
        const resolveApiUrl = (endpoint: string) => {
            if (API_URL.endsWith('/api') && endpoint.startsWith('/api')) {
                return `${API_URL.slice(0, -4)}${endpoint}`;
            }
            return `${API_URL}${endpoint}`;
        };

        const customerIri = contact['@id'];
        const fullCustomerUrl = resolveApiUrl(customerIri);
        const itemEndpoint = `/${activeTab}/${item.id}`;
        const fullItemUrl = `${API_URL}${itemEndpoint}`;

        const payloadCustomer = { status: 'CLIENT' };
        const payloadItem = { status: 'CONVERTED' }; // Uniquement pertinent pour Prospections, mais sans effet néfaste sur Consultations

        if (!navigator.onLine) {
            const relativeCustomerUrl = customerIri.startsWith('/api') ? customerIri.replace('/api', '') : customerIri;
            addToQueue({ url: relativeCustomerUrl, method: 'PATCH', body: payloadCustomer });
            if (activeTab === 'prospections') {
                addToQueue({ url: itemEndpoint, method: 'PATCH', body: payloadItem });
            }
            toast("🌐 Conversion mise en file d'attente.", { icon: "💾", style: { background: "#F59E0B", color: "#fff" } });
            return;
        }

        try {
            // A. Mise à jour du client
            const resCust = await fetch(fullCustomerUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payloadCustomer)
            });

            if (!resCust.ok) throw new Error("Erreur mise à jour contact");

            // B. Mise à jour de l'item (Uniquement si c'est une prospection pour le passer en CONVERTED)
            if (activeTab === 'prospections') {
                await fetch(fullItemUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payloadItem)
                });
            }

            toast.success("Félicitations ! Contact converti en Client 🚀");
            queryClient.invalidateQueries({ queryKey: [activeTab] });
            setSelectedItem(null);

        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de la conversion.");
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 pb-24">
            
            {/* EN-TÊTE & CONTROLES */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 font-bold transition flex items-center gap-2 mb-1">←Retour</Link>
                        <h1 className="text-2xl font-black text-gray-900">Activités Commerciales</h1>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleGlobalExport} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition flex items-center gap-2">
                            📊 Excel (Tout)
                        </button>
                        <Link href="/dashboard/prospections/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2">
                            + Nouveau
                        </Link>
                    </div>
                </div>

                {/* --- ONGLETS --- */}
                <div className="flex border-b border-gray-200 mb-4">
                    <button 
                        onClick={() => handleTabChange('prospections')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'prospections' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        🔭 PROSPECTIONS
                    </button>
                    <button 
                        onClick={() => handleTabChange('consultations')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'consultations' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        🩺 CONSULTATIONS
                    </button>
                </div>

                {/* --- FILTRES --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Rechercher</label>
                        <input type="text" className="w-full border p-2 rounded-lg text-sm" placeholder={activeTab === 'prospections' ? "Nom du prospect..." : "Nom du client..."} value={searchName} onChange={e => { setSearchName(e.target.value); setPage(1); }} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Du</label>
                        <input type="date" className="w-full border p-2 rounded-lg text-sm" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Au</label>
                        <input type="date" className="w-full border p-2 rounded-lg text-sm" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
                    </div>
                </div>
            </div>

            {/* LISTE DES CARTES */}
            {isLoading ? (
                <div className="text-center py-10 text-gray-400 animate-pulse">Chargement...</div>
            ) : allItems.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <span className="text-4xl block mb-2">📂</span>
                    <p className="text-gray-500 font-medium">Aucune donnée trouvée.</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 mb-6">
                        {allItems.map((item: CommonItem) => {
                            const contact = getContact(item);
                            return (
                                <div key={item.id} className={`bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative ${item.isPending ? "opacity-80 border-yellow-300" : ""} ${(item.status === 'CONVERTED' || contact.status === 'CLIENT') ? "border-l-4 border-l-green-500" : ""}`}>
                                    
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                                {contact.name.toUpperCase()}
                                                {item.isPending && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full font-bold">⏳ EN ATTENTE</span>}
                                                {(item.status === 'CONVERTED' || contact.status === 'CLIENT') && <span className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-bold">✅ CLIENT</span>}
                                            </h3>
                                            <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                                🗓️ {new Date(item.date).toLocaleDateString()}
                                                {contact.zone && <span>📍 {contact.zone}</span>}
                                            </p>
                                        </div>
                                        <button onClick={() => setSelectedItem(item)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition">
                                            👁️ Voir
                                        </button>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {item.farmDetails?.map((f: any, i: number) => (
                                            <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                                                {f.spec} ({f.eff})
                                            </span>
                                        ))}
                                    </div>

                                    <div className="pt-3 border-t border-gray-50 flex flex-wrap justify-between items-center gap-2">
                                        <div className="flex gap-2 items-center">
                                            {item.appointmentTaken && (
                                                <span className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded font-bold">
                                                    📅 RDV : {item.appointmentReason || 'Prévu'+(item.appointmentDate ? ` - (Date ${new Date(item.appointmentDate).toLocaleDateString()})` : ' - Date inconnue')}
                                                </span>
                                            )}
                                            {item.interventionDone && <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold">🔧 Interv.</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {/* Bouton Convertir (Seulement si pas déjà client et pas en attente) */}
                                            {item.status !== 'CONVERTED' && contact.status !== 'CLIENT' && !item.isPending && (
                                                <button onClick={() => handleConvert(item)} className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-black transition flex items-center gap-1">
                                                    🚀 Convertir
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(item)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1.5">
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 py-4 bg-white rounded-xl shadow-sm border border-gray-100">
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition">←</button>
                            <span className="text-sm font-medium text-gray-600">Page <span className="font-bold text-indigo-600">{page}</span> / {totalPages}</span>
                            <button onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))} disabled={page >= totalPages} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-200 transition">→</button>
                        </div>
                    )}
                </>
            )}

            {/* MODALE DÉTAILS */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center sticky top-0 z-10">
                            <h2 className="font-bold text-lg">Détails {activeTab === 'prospections' ? 'Prospection' : 'Consultation'}</h2>
                            <button onClick={() => setSelectedItem(null)} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition">✕</button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Les détails sont communs aux deux entités, seule la source change (client vs customer) */}
                            {(() => {
                                const contact = getContact(selectedItem);
                                return (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Contact</label>
                                                <p className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                                    {contact.name}
                                                    {(selectedItem.status === 'CONVERTED' || contact.status === 'CLIENT') && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Client</span>}
                                                </p>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Statut</label>
                                                <p className="font-medium text-indigo-600 text-lg">{contact.status}</p> 
                                            </div>
                                            <div className="col-span-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Localisation</label>
                                                <p className="font-medium text-gray-800">{contact.zone || 'Non renseignée'}</p>
                                            </div>
                                        </div>

                                        {/* Activités */}
                                        {selectedItem.farmDetails && selectedItem.farmDetails.length > 0 && (
                                            <div>
                                                <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Activités</h3>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {selectedItem.farmDetails.map((f:any, i:number) => (
                                                        <div key={i} className="bg-green-50 p-2 rounded border border-green-100">
                                                            <strong className="text-green-900 block text-sm">{f.spec}</strong>
                                                            <span className="text-xs text-green-700">{f.bat} Bâtiment(s) • {f.eff} Sujets</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Diagnostic */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Préoccupations</h3>
                                                <p className="text-sm text-gray-700 italic">"{selectedItem.concerns || 'R.A.S'}"</p>
                                            </div>
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Attentes</h3>
                                                <p className="text-sm text-gray-700 italic">"{selectedItem.expectations || 'R.A.S'}"</p>
                                            </div>
                                        </div>

                                        {/* Intervention */}
                                        {selectedItem.interventionDone && (
                                            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                                <h3 className="text-xs font-bold text-orange-800 uppercase mb-2">🔧 Rapport d'Intervention</h3>
                                                <p className="text-sm text-gray-800">{selectedItem.interventionComments}</p>
                                            </div>
                                        )}

                                        {/* Photos */}
                                        {selectedItem.photos && selectedItem.photos.length > 0 && (
                                            <div>
                                                <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Photos ({selectedItem.photos.length})</h3>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {selectedItem.photos.map((p: any, i: number) => (
                                                        <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                                                            <img src={p.contentUrl?.startsWith('http') ? p.contentUrl : `${API_URL}${p.contentUrl}`} className="w-full h-full object-cover" alt="Photo" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        
                        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setSelectedItem(null)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}