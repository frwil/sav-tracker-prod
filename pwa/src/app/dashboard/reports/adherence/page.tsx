"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ReportFilters } from "../components/ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toPng } from 'html-to-image';
import jsPDF from "jspdf";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Couleurs
const COLORS = {
    adherence: '#3B82F6',   // Bleu
    realization: '#8B5CF6', // Violet
    objective: '#10B981',   // Vert (Nouveau KPI)
    planned: '#E5E7EB',     // Gris
    pie: ['#3B82F6', '#E5E7EB']
};

interface TechnicianStats {
    technicianName: string;
    visitsPlanned: number;
    visitsRealized: number;
    visitsOnTime: number;
    visitsObjective: number; // Nouvel indicateur
    adherenceScore: number;
    realizationScore: number;
    objectiveCompletionScore: number; // Nouvel indicateur
}

export default function AdherenceReportPage() {
    const reportRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<TechnicianStats | null>(null);
    const [currentRange, setCurrentRange] = useState<{start: string, end: string} | null>(null);
    // 👇 AJOUT DU STATE POUR LES FILTRES
    const [lastFilters, setLastFilters] = useState<any>(null);

    const loadData = async (filters: any) => {
        setLoading(true);
        setCurrentRange({ start: filters.start, end: filters.end });
        setLastFilters(filters); // 👇 SAUVEGARDE DES FILTRES

        const token = localStorage.getItem("sav_token");

        // Construction des paramètres d'URL pour le tableau de techniciens
        const params = new URLSearchParams();
        params.append('start', filters.start);
        params.append('end', filters.end);
        
        if (filters.technicians && filters.technicians.length > 0) {
            filters.technicians.forEach((t: any) => params.append('technicians[]', t.value));
        }

        try {
            const response = await fetch(`${API_URL}/stats/adherence?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            
            if (response.ok) {
                const stats = await response.json();
                setData(stats);
                toast.success("Rapport généré");
            } else {
                toast.error("Erreur serveur lors du calcul");
            }
        } catch (error) {
            console.error(error);
            toast.error("Erreur de connexion");
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        const loadToast = toast.loading("Export PDF...");
        try {
            const dataUrl = await toPng(reportRef.current, { cacheBust: true });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const width = pdf.internal.pageSize.getWidth();
            const height = (pdf.getImageProperties(dataUrl).height * width) / pdf.getImageProperties(dataUrl).width;
            pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
            pdf.save(`Rapport_Performance_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.dismiss(loadToast);
            toast.success("PDF Téléchargé");
        } catch(e) { toast.dismiss(loadToast); toast.error("Erreur export"); }
    };

    const handleExportExcel = async () => {
        const token = localStorage.getItem("sav_token");
        const params = new URLSearchParams();
        
        // On reprend les dates stockées
        if (currentRange) {
            params.append('start', currentRange.start);
            params.append('end', currentRange.end);
        } else {
             return toast.error("Veuillez d'abord générer le rapport");
        }

        // On reprend les techniciens stockés
        if (lastFilters?.technicians) {
             lastFilters.technicians.forEach((t: any) => params.append('technicians[]', t.value));
        }

        try {
            const loadToast = toast.loading("Génération Excel...");
            
            const response = await fetch(`${API_URL}/stats/export/excel?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Performance_Export_${currentRange?.start}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success("Excel téléchargé");
            } else {
                toast.error("Erreur génération Excel");
            }
            toast.dismiss(loadToast);
        } catch (e) {
            console.error(e);
            toast.error("Erreur téléchargement");
        }
    };

    // Données pour le graphique comparatif
    const chartData = data ? [
        {
            name: 'Global',
            Objectif: data.visitsObjective,
            Planifié: data.visitsPlanned,
            Réalisé: data.visitsRealized
        }
    ] : [];

    return (
        <div className="max-w-7xl mx-auto p-6 pb-20 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/dashboard/reports" className="text-gray-400 hover:text-blue-600">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                        </Link>
                        <h1 className="text-2xl font-black text-gray-900">Performance & Adhérence</h1>
                    </div>
                    <p className="text-gray-500 ml-7">Suivi des objectifs, du planning et de la réalité terrain.</p>
                </div>
                {data && (
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl hover:bg-green-100 transition-all font-medium text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            Excel
                        </button>
                        <button 
                            onClick={handleExportPDF} 
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-sm"
                        >
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            PDF
                        </button>
                    </div>
                )}
            </div>

            <ReportFilters onFilter={loadData} isAdmin={true} />

            {loading && <div className="text-center py-10 text-gray-400">Chargement des indicateurs...</div>}

            {!loading && data && (
                <div ref={reportRef} className="space-y-6 bg-slate-50/50 p-6 -m-6">
                    
                    {/* KPIs Principaux */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* 1. Performance Contrat (Vert) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-green-50 rounded-full -mr-8 -mt-8 opacity-50"></div>
                            <div className="text-sm font-bold text-green-600 mb-1">OBJECTIF CONTRAT</div>
                            <div className="text-4xl font-black text-gray-900">{data.objectiveCompletionScore}%</div>
                            <p className="text-xs text-gray-400 mt-2">
                                {data.visitsRealized} visites faites / {data.visitsObjective} attendues
                            </p>
                            <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${Math.min(data.objectiveCompletionScore, 100)}%` }}></div>
                            </div>
                        </div>

                        {/* 2. Productivité Agenda (Violet) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-50 rounded-full -mr-8 -mt-8 opacity-50"></div>
                            <div className="text-sm font-bold text-purple-600 mb-1">RÉALISATION PLANNING</div>
                            <div className="text-4xl font-black text-gray-900">{data.realizationScore}%</div>
                            <p className="text-xs text-gray-400 mt-2">
                                {data.visitsRealized} visites faites / {data.visitsPlanned} planifiées
                            </p>
                            <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${Math.min(data.realizationScore, 100)}%` }}></div>
                            </div>
                        </div>

                        {/* 3. Adhérence (Bleu) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -mr-8 -mt-8 opacity-50"></div>
                            <div className="text-sm font-bold text-blue-600 mb-1">ADHÉRENCE / PONCTUALITÉ</div>
                            <div className="text-4xl font-black text-gray-900">{data.adherenceScore}%</div>
                            <p className="text-xs text-gray-400 mt-2">
                                {data.visitsOnTime} visites le jour J / {data.visitsPlanned} planifiées
                            </p>
                            <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(data.adherenceScore, 100)}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Graphique Comparatif */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-6">Comparatif : Objectif vs Planifié vs Réalisé</h3>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} barSize={60}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip cursor={{fill: 'transparent'}} />
                                    <Legend />
                                    <Bar dataKey="Objectif" fill={COLORS.objective} radius={[4, 4, 0, 0]} name="Objectif (Théorique)" />
                                    <Bar dataKey="Planifié" fill={COLORS.planned} radius={[4, 4, 0, 0]} name="Agenda (Planifié)" />
                                    <Bar dataKey="Réalisé" fill={COLORS.realization} radius={[4, 4, 0, 0]} name="Réalisé (Terrain)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tableau Détails */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700">
                            Détails pour {data.technicianName}
                        </div>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="p-4 text-gray-500">Période</td>
                                    <td className="p-4 font-medium text-right">{currentRange?.start} au {currentRange?.end}</td>
                                </tr>
                                <tr>
                                    <td className="p-4 text-gray-500">Objectif théorique (Contrat)</td>
                                    <td className="p-4 font-bold text-right">{data.visitsObjective}</td>
                                </tr>
                                <tr>
                                    <td className="p-4 text-gray-500">Total Planifié (Agenda)</td>
                                    <td className="p-4 font-bold text-right">{data.visitsPlanned}</td>
                                </tr>
                                <tr>
                                    <td className="p-4 text-gray-500">Total Réalisé (Fait)</td>
                                    <td className="p-4 font-bold text-right text-purple-600">{data.visitsRealized}</td>
                                </tr>
                                <tr>
                                    <td className="p-4 text-gray-500">Dont réalisés à la date prévue</td>
                                    <td className="p-4 font-bold text-right text-blue-600">{data.visitsOnTime}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}