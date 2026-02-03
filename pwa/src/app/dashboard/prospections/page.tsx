"use client";

import { useState } from "react";
import Link from "next/link";
import { useSync } from "@/providers/SyncProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as XLSX from "xlsx"; // ✅ Import Excel

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
}

// --- FONCTION FETCH AVEC FILTRES ---
async function fetchProspections(params: string) {
    const token = localStorage.getItem("sav_token");
    const res = await fetch(`${API_URL}/prospections?order[date]=desc${params}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/ld+json",
        },
    });
    if (!res.ok) throw new Error("Erreur chargement");
    const data = await res.json();
    return data["hydra:member"] || data["member"] || [];
}

export default function ProspectionsListPage() {
    const { queue, addToQueue } = useSync();
    const queryClient = useQueryClient();

    // --- ÉTATS FILTRES ---
    const [searchName, setSearchName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    
    // --- ÉTAT MODALE ---
    const [selectedProspection, setSelectedProspection] = useState<Prospection | null>(null);

    // Construction de la Query String pour l'API
    const queryParams = `
        ${searchName ? `&prospectName=${searchName}` : ''}
        ${startDate ? `&date[after]=${startDate}` : ''}
        ${endDate ? `&date[before]=${endDate}` : ''}
    `;

    // 1. Récupération des données serveur (dépend des filtres)
    const { data: prospections = [], isLoading } = useQuery<Prospection[]>({
        queryKey: ["prospections", queryParams], // Recharge quand les filtres changent
        queryFn: () => fetchProspections(queryParams),
    });

    // 2. Fusion Optimiste (Données locales en attente)
    // Note: Le filtrage local est basique ici, l'idéal est de filtrer aussi pendingProspections
    const pendingProspections = queue
        .filter((task) => task.url === "/prospections" && task.method === "POST")
        .map((task) => ({
            ...task.body,
            id: `TEMP-${task.id}`,
            isPending: true,
            date: task.body.date || new Date().toISOString()
        }));

    const allProspections = [...pendingProspections, ...prospections];

    // --- FONCTION EXPORT EXCEL ---
    const handleExport = () => {
        if (allProspections.length === 0) {
            toast.error("Aucune donnée à exporter");
            return;
        }

        // Formatage des données pour Excel (Aplatir les objets)
        const dataToExport = allProspections.map((p, index) => ({
            Num: index + 1,
            Date: new Date(p.date).toLocaleDateString(),
            Prospect: p.prospectName,
            Telephone: p.phoneNumber || "",
            Lieu: p.locationLabel || "",
            Speculations: p.farmDetails?.map((f:any) => `${f.spec} (${f.eff})`).join("\r\n") || "",
            "Intervention Faite": p.interventionDone ? "OUI" : "NON",
            "Details Intervention": p.interventionComments || "",
            "RDV Pris": p.appointmentTaken ? "OUI" : "NON",
            "Date RDV": p.appointmentDate ? new Date(p.appointmentDate).toLocaleString('',{day:"2-digit", month:"2-digit", year:"numeric"}) : "",
            "Motif RDV": p.appointmentReason || "",
            Preoccupations: p.concerns || "",
            Attentes: p.expectations || "",
            Technicien: p.technician?.fullname || "Moi"
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Prospections");
        XLSX.writeFile(wb, `Prospections_${new Date().toISOString().slice(0,10)}.xlsx`);
        toast.success("Export Excel généré ! 📥");
    };

    // --- SUPPRESSION ---
    const handleDelete = async (prospection: any) => {
        if (!confirm("Voulez-vous vraiment supprimer cette fiche ?")) return;
        if (prospection.isPending) {
            toast.error("Impossible de supprimer une donnée en cours d'envoi.");
            return;
        }

        const url = `/prospections/${prospection.id}`;
        
        if (!navigator.onLine) {
            addToQueue({ url, method: 'DELETE', body: {} });
            toast("Suppression mise en file d'attente 🗑️");
            queryClient.setQueryData(["prospections", queryParams], (old: any[]) =>
                old.filter((p) => p.id !== prospection.id),
            );
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
            toast.error("Erreur suppression");
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 pb-24">
            
            {/* HEADER & FILTRES */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">🔭 Prospections</h1>
                        <p className="text-sm text-gray-500">Suivi commercial & consultations</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExport}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition flex items-center gap-2"
                            disabled={allProspections.length === 0}
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

                {/* BARRE DE FILTRES */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Rechercher (Nom)</label>
                        <input 
                            type="text" 
                            className="w-full border p-2 rounded-lg text-sm" 
                            placeholder="Nom du prospect..."
                            value={searchName}
                            onChange={e => setSearchName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Du</label>
                        <input 
                            type="date" 
                            className="w-full border p-2 rounded-lg text-sm" 
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Au</label>
                        <input 
                            type="date" 
                            className="w-full border p-2 rounded-lg text-sm" 
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* LISTE */}
            {isLoading ? (
                <div className="text-center py-10 text-gray-400 animate-pulse">Chargement des données...</div>
            ) : allProspections.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <span className="text-4xl block mb-2">🤷‍♂️</span>
                    <p className="text-gray-500 font-medium">Aucune prospection trouvée.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {allProspections.map((p: any) => (
                        <div key={p.id} className={`bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative ${p.isPending ? "opacity-80 border-yellow-300" : ""}`}>
                            
                            {/* EN-TÊTE CARTE */}
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                        {p.prospectName}
                                        {p.isPending && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full">EN ATTENTE</span>}
                                    </h3>
                                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                        🗓️ {new Date(p.date).toLocaleDateString()}
                                        {p.locationLabel && <span>📍 {p.locationLabel}</span>}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSelectedProspection(p)}
                                        className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition"
                                    >
                                        👁️ Voir Détails
                                    </button>
                                </div>
                            </div>

                            {/* CORPS RAPIDE */}
                            <div className="flex flex-wrap gap-2 mb-3">
                                {p.farmDetails?.map((f: any, i: number) => (
                                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                                        {f.spec} ({f.eff})
                                    </span>
                                ))}
                            </div>

                            {/* FOOTER ACTIONS */}
                            <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                                <div className="flex gap-2">
                                    {p.appointmentTaken ? (
                                        <span className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded font-bold flex items-center gap-1">
                                            📅 RDV : {p.appointmentDate ? new Date(p.appointmentDate).toLocaleDateString() : 'Prévu'}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">Pas de RDV</span>
                                    )}
                                    {p.interventionDone && (
                                        <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold">
                                            🔧 Intervention
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2">
                                    Supprimer
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODALE DE DÉTAILS */}
            {selectedProspection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        
                        {/* Header Modale */}
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center sticky top-0 z-10">
                            <h2 className="font-bold text-lg">Détails Prospection</h2>
                            <button onClick={() => setSelectedProspection(null)} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition">✕</button>
                        </div>

                        {/* Contenu Scrollable */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            
                            {/* 1. Infos Contact */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Prospect</label>
                                    <p className="font-bold text-gray-900 text-lg">{selectedProspection.prospectName}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Téléphone</label>
                                    <p className="font-medium text-indigo-600 text-lg">{selectedProspection.phoneNumber || '-'}</p>
                                </div>
                                <div className="col-span-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Localisation</label>
                                    <p className="font-medium text-gray-800">{selectedProspection.locationLabel || 'Non renseignée'}</p>
                                    {selectedProspection.gpsCoordinates && (
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${selectedProspection.gpsCoordinates}`}
                                            target="_blank"
                                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
                                        >
                                            📍 Ouvrir GPS ({selectedProspection.gpsCoordinates})
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* 2. Activités */}
                            {selectedProspection.farmDetails && selectedProspection.farmDetails.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Activités Agricoles</h3>
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

                            {/* 3. Diagnostic */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Préoccupations</h3>
                                    <p className="text-sm text-gray-700 italic">"{selectedProspection.concerns || 'Aucune'}"</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Attentes</h3>
                                    <p className="text-sm text-gray-700 italic">"{selectedProspection.expectations || 'Aucune'}"</p>
                                </div>
                            </div>

                            {/* 4. Intervention */}
                            {selectedProspection.interventionDone && (
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <h3 className="text-xs font-bold text-orange-800 uppercase mb-2">🔧 Rapport d'Intervention</h3>
                                    <p className="text-sm text-gray-800">{selectedProspection.interventionComments}</p>
                                </div>
                            )}

                            {/* 5. Rendez-vous */}
                            {selectedProspection.appointmentTaken && (
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    <h3 className="text-xs font-bold text-blue-800 uppercase mb-2">📅 Rendez-vous programmé</h3>
                                    <div className="flex justify-between items-center">
                                        <p className="text-lg font-bold text-blue-900">
                                            {selectedProspection.appointmentDate ? new Date(selectedProspection.appointmentDate).toLocaleString() : 'Date non définie'}
                                        </p>
                                        {selectedProspection.appointmentReason && (<span className="bg-white text-blue-600 px-3 py-1 rounded text-xs font-bold border border-blue-200">
                                            {selectedProspection.appointmentReason}
                                        </span>)}
                                    </div>
                                </div>
                            )}

                            {/* 6. Photos */}
                            {selectedProspection.photos && selectedProspection.photos.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-2">Photos Jointes ({selectedProspection.photos.length})</h3>
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
                        
                        <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end">
                            <button 
                                onClick={() => setSelectedProspection(null)} 
                                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}