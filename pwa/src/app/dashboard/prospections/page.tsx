"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSync } from "@/providers/SyncProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
// ✅ 1. NOUVEAUX IMPORTS (Au lieu de xlsx)
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ITEMS_PER_PAGE = 10;

// --- TYPES ---
interface Prospection {
    id: number | string;
    date: string;
    prospectName: string;
    locationLabel?: string;
    phoneNumber?: string;
    gpsCoordinates?: string;
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
    status: string; // 'NEW', 'CONVERTED', 'LOST'
}

// --- FETCH DATA (PAGINÉ) ---
async function fetchProspections(params: string, page: number) {
    const token = localStorage.getItem("sav_token");
    const url = `${API_URL}/prospections?order[date]=desc&itemsPerPage=${ITEMS_PER_PAGE}&page=${page}${params}`;
    
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/ld+json",
        },
    });

    if (!res.ok) throw new Error("Erreur chargement");
    const data = await res.json();
    
    return {
        items: data["hydra:member"] || data["member"] || [],
        totalItems: data["hydra:totalItems"] || 0
    };
}

export default function ProspectionsListPage() {
    const router = useRouter();
    const { queue, addToQueue } = useSync();
    const queryClient = useQueryClient();

    // --- ÉTATS ---
    const [searchName, setSearchName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [page, setPage] = useState(1);
    const [selectedProspection, setSelectedProspection] = useState<Prospection | null>(null);

    // --- REQUÊTE ---
    const queryParams = `
        ${searchName ? `&prospectName=${searchName}` : ''}
        ${startDate ? `&date[after]=${startDate}` : ''}
        ${endDate ? `&date[before]=${endDate}` : ''}
    `;

    // Reset page quand on filtre
    const handleFilterChange = (setter: any, value: string) => {
        setter(value);
        setPage(1);
    };

    const { data, isLoading } = useQuery({
        queryKey: ["prospections", queryParams, page],
        queryFn: () => fetchProspections(queryParams, page),
        placeholderData: (previousData) => previousData,
    });

    const prospections = data?.items || [];
    const totalItems = data?.totalItems || 0;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // --- FUSION DONNÉES LOCALES (OFFLINE) ---
    const pendingProspections = queue
        .filter((task) => task.url === "/prospections" && task.method === "POST")
        .map((task) => ({
            ...task.body,
            id: `TEMP-${task.id}`,
            isPending: true,
            status: 'NEW',
            date: task.body.date || new Date().toISOString()
        }));

    // On affiche les données en attente uniquement sur la page 1
    const allProspections = page === 1 
        ? [...pendingProspections, ...prospections] 
        : prospections;

    // --- ACTIONS ---

    // ✅ 2. NOUVELLE FONCTION D'EXPORT (ExcelJS)
    const handleExport = async () => {
        if (allProspections.length === 0) {
            toast.error("Aucune donnée affichée à exporter");
            return;
        }

        try {
            const loadingToast = toast.loading("Génération du fichier Excel...");

            // A. Création du classeur
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Prospections');

            // B. Définition des colonnes (Largeur + Clé)
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Prospect', key: 'prospect', width: 25 },
                { header: 'Téléphone', key: 'phone', width: 15 },
                { header: 'Lieu', key: 'location', width: 20 },
                { header: 'Statut', key: 'status', width: 12 },
                { header: 'Activités', key: 'activities', width: 30 },
                { header: 'Intervention', key: 'intervention', width: 12 },
                { header: 'RDV Pris', key: 'rdv', width: 12 },
                { header: 'Date RDV', key: 'rdvDate', width: 20 },
                { header: 'Préoccupations', key: 'concerns', width: 30 },
                { header: 'Attentes', key: 'expectations', width: 30 },
                { header: 'Technicien', key: 'tech', width: 20 },
            ];

            // C. Style de l'en-tête (Gras)
            worksheet.getRow(1).font = { bold: true };

            // D. Ajout des données
            allProspections.forEach((p: any) => {
                worksheet.addRow({
                    date: new Date(p.date).toLocaleDateString(),
                    prospect: p.prospectName,
                    phone: p.phoneNumber || "",
                    location: p.locationLabel || "",
                    status: p.status === 'CONVERTED' ? 'CLIENT' : 'PROSPECT',
                    activities: p.farmDetails?.map((f:any) => `${f.spec} (${f.eff})`).join(", ") || "",
                    intervention: p.interventionDone ? "OUI" : "NON",
                    rdv: p.appointmentTaken ? "OUI" : "NON",
                    rdvDate: p.appointmentDate ? new Date(p.appointmentDate).toLocaleString() : "",
                    concerns: p.concerns || "",
                    expectations: p.expectations || "",
                    tech: p.technician?.username || "Moi"
                });
            });

            // E. Écriture du fichier et téléchargement
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `Prospections_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
            saveAs(new Blob([buffer]), fileName);

            toast.dismiss(loadingToast);
            toast.success("Export Excel généré !");
        } catch (error) {
            console.error(error);
            toast.error("Erreur lors de la génération Excel");
        }
    };

    const handleDelete = async (prospection: any) => {
        if (!confirm("Supprimer cette fiche ?")) return;
        if (prospection.isPending) {
            toast.error("Impossible de supprimer une donnée en cours d'envoi.");
            return;
        }

        const url = `/prospections/${prospection.id}`;
        
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
            queryClient.invalidateQueries({ queryKey: ["prospections"] });
        } catch (e) {
            toast.error("Erreur lors de la suppression");
        }
    };

    const handleConvert = (p: Prospection) => {
        if (p.isPending) {
            toast.error("Attendez la synchronisation pour convertir.");
            return;
        }
        const params = new URLSearchParams({
            from_prospection: p.id.toString(),
            name: p.prospectName,
            phone: p.phoneNumber || '',
            address: p.locationLabel || '',
            gps: p.gpsCoordinates || ''
        });
        router.push(`/dashboard/customers?${params.toString()}`);
    };

    return (
        <div className="max-w-5xl mx-auto p-4 pb-24">
            
            {/* EN-TÊTE & FILTRES */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 font-bold transition flex items-center gap-2 mb-1">&larr;Retour</Link>
                        <h1 className="text-2xl font-black text-gray-900">🔭 Prospections</h1>
                        <p className="text-sm text-gray-500">Suivi commercial & consultations</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExport}
                            disabled={allProspections.length === 0}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
                        >
                            📊 Excel
                        </button>
                        <Link
                            href="/dashboard/prospections/new"
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2"
                        >
                            + Nouveau
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Rechercher</label>
                        <input 
                            type="text" className="w-full border p-2 rounded-lg text-sm" placeholder="Nom du prospect..." 
                            value={searchName} onChange={e => handleFilterChange(setSearchName, e.target.value)} 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Du</label>
                        <input 
                            type="date" className="w-full border p-2 rounded-lg text-sm" 
                            value={startDate} onChange={e => handleFilterChange(setStartDate, e.target.value)} 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Au</label>
                        <input 
                            type="date" className="w-full border p-2 rounded-lg text-sm" 
                            value={endDate} onChange={e => handleFilterChange(setEndDate, e.target.value)} 
                        />
                    </div>
                </div>
            </div>

            {/* LISTE DES CARTES */}
            {isLoading ? (
                <div className="text-center py-10 text-gray-400 animate-pulse">Chargement des données...</div>
            ) : allProspections.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <span className="text-4xl block mb-2">🤷‍♂️</span>
                    <p className="text-gray-500 font-medium">Aucune prospection trouvée.</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 mb-6">
                        {allProspections.map((p: any) => (
                            <div key={p.id} className={`bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative ${p.isPending ? "opacity-80 border-yellow-300" : ""} ${p.status === 'CONVERTED' ? "border-l-4 border-l-green-500" : ""}`}>
                                
                                {/* Header Carte */}
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                            {p.prospectName}
                                            {p.isPending && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full font-bold">⏳ EN ATTENTE</span>}
                                            {p.status === 'CONVERTED' && <span className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-bold">✅ CLIENT</span>}
                                        </h3>
                                        <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                            🗓️ {new Date(p.date).toLocaleDateString()}
                                            {p.locationLabel && <span>📍 {p.locationLabel}</span>}
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedProspection(p)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition">
                                        👁️ Voir
                                    </button>
                                </div>

                                {/* Résumé Activités */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {p.farmDetails?.map((f: any, i: number) => (
                                        <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                                            {f.spec} ({f.eff})
                                        </span>
                                    ))}
                                </div>

                                {/* Actions Footer */}
                                <div className="pt-3 border-t border-gray-50 flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex gap-2 items-center">
                                        {p.appointmentTaken && (
                                            <span className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded font-bold">
                                                📅 RDV : {p.appointmentReason || 'Prévu'} {p.appointmentDate && `pour le ${new Date(p.appointmentDate).toLocaleDateString()}`}
                                            </span>
                                        )}
                                        {p.interventionDone && (
                                            <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold">
                                                🔧 Interv.
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {p.status !== 'CONVERTED' && !p.isPending && (
                                            <button onClick={() => handleConvert(p)} className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-black transition flex items-center gap-1">
                                                🚀 Convertir
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1.5">
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* --- PAGINATION --- */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 py-4 bg-white rounded-xl shadow-sm border border-gray-100">
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

            {/* MODALE DÉTAILS */}
            {selectedProspection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center sticky top-0 z-10">
                            <h2 className="font-bold text-lg">Détails Prospection</h2>
                            <button onClick={() => setSelectedProspection(null)} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition">✕</button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Infos Principales */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Prospect</label>
                                    <p className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                        {selectedProspection.prospectName}
                                        {selectedProspection.status === 'CONVERTED' && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Client</span>}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Téléphone</label>
                                    <p className="font-medium text-indigo-600 text-lg">{selectedProspection.phoneNumber || '-'}</p>
                                </div>
                                <div className="col-span-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Localisation</label>
                                    <p className="font-medium text-gray-800">{selectedProspection.locationLabel || 'Non renseignée'}</p>
                                    {selectedProspection.gpsCoordinates && (
                                        <a href={`https://www.google.com/maps?q=${selectedProspection.gpsCoordinates}`} target="_blank" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1">
                                            📍 Ouvrir GPS ({selectedProspection.gpsCoordinates})
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Activités */}
                            {selectedProspection.farmDetails && selectedProspection.farmDetails.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Activités</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedProspection.farmDetails.map((f:any, i:number) => (
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
                                    <p className="text-sm text-gray-700 italic">"{selectedProspection.concerns || 'R.A.S'}"</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Attentes</h3>
                                    <p className="text-sm text-gray-700 italic">"{selectedProspection.expectations || 'R.A.S'}"</p>
                                </div>
                            </div>

                            {/* Intervention */}
                            {selectedProspection.interventionDone && (
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <h3 className="text-xs font-bold text-orange-800 uppercase mb-2">🔧 Rapport d'Intervention</h3>
                                    <p className="text-sm text-gray-800">{selectedProspection.interventionComments}</p>
                                </div>
                            )}

                            {/* Photos */}
                            {selectedProspection.photos && selectedProspection.photos.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Photos ({selectedProspection.photos.length})</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                        {selectedProspection.photos.map((p: any, i: number) => (
                                            <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                                                <img 
                                                    src={p.contentUrl?.startsWith('http') ? p.contentUrl : `${API_URL}${p.contentUrl}`} 
                                                    className="w-full h-full object-cover" 
                                                    alt="Photo" 
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
                            {selectedProspection.status !== 'CONVERTED' && !selectedProspection.isPending && (
                                <button 
                                    onClick={() => {
                                        handleConvert(selectedProspection);
                                        setSelectedProspection(null);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition"
                                >
                                    🚀 Convertir en Client
                                </button>
                            )}
                            <button onClick={() => setSelectedProspection(null)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}