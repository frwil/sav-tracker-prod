"use client";

import { useState, useRef } from "react";
import { ReportFilters } from "../components/ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image'; // ✅ Remplacement de html2canvas
import jsPDF from "jspdf";
import toast from "react-hot-toast";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VisitsReport() {
    const chartRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);

    const loadData = async (filters: any) => {
        setLoading(true);
        const token = localStorage.getItem("sav_token");
        try {
            // On récupère les visites avec les détails du lot (flock)
            const techFilter = filters.technicians.map((t:any) => `technician[]=${t.value}`).join('&');
            const url = `${API_URL}/visits?visitedAt[after]=${filters.start}&visitedAt[before]=${filters.end}&pagination=false&${techFilter}`;
            
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
            if(!res.ok) throw new Error("Erreur");
            const visits = await res.json();

            // --- AGRÉGATION DES DONNÉES ---
            const bySpec: Record<string, number> = {};
            const byAge: Record<string, number> = { "Démarrage (0-14j)": 0, "Croissance (15-30j)": 0, "Finition (30j+)": 0 };

            visits.forEach((v: any) => {
                // 1. Par Spéculation
                const spec = v.flock?.speculation?.name || "Inconnu";
                bySpec[spec] = (bySpec[spec] || 0) + 1;

                // 2. Par tranche d'âge (Basé sur la 1ère observation liée ou par défaut)
                const obs = v.observations?.[0]; // On prend la première observation liée
                const age = obs?.data?.age || 0;

                if (age <= 14) byAge["Démarrage (0-14j)"]++;
                else if (age <= 30) byAge["Croissance (15-30j)"]++;
                else byAge["Finition (30j+)"]++;
            });

            setData({
                raw: visits,
                charts: {
                    specs: Object.keys(bySpec).map(k => ({ name: k, value: bySpec[k] })),
                    ages: Object.keys(byAge).map(k => ({ name: k, value: byAge[k] })),
                }
            });

        } catch (e) { 
            console.error(e);
            toast.error("Erreur chargement données"); 
        } finally { 
            setLoading(false); 
        }
    };

    // --- 1. EXPORT PDF (IMAGE) ---
    const exportPDF = async () => {
        if (!reportRef.current) return;
        const toastId = toast.loading("Génération du PDF...");
        
        try {
            // Utilisation de html-to-image
            const dataUrl = await toPng(reportRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfW = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfH = (imgProps.height * pdfW) / imgProps.width;
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);
            pdf.save(`Rapport_Visites_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.success("PDF prêt !", { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error("Erreur PDF", { id: toastId });
        }
    };
    
    // --- 2. EXPORT EXCEL (DATA + GRAPHIQUE) ---
    const exportExcel = async () => {
        if (!data) return;
        const toastId = toast.loading("Génération Excel...");

        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Visites');

            // A. Données Brutes
            ws.columns = [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Client', key: 'client', width: 25 },
                { header: 'Lot', key: 'flock', width: 20 },
                { header: 'Spéculation', key: 'spec', width: 20 },
                { header: 'Technicien', key: 'tech', width: 20 },
            ];

            // Style Header
            ws.getRow(1).font = { bold: true };

            data.raw.forEach((v: any) => {
                ws.addRow({
                    date: new Date(v.visitedAt).toLocaleDateString(),
                    client: v.customer?.name,
                    flock: v.flock?.name,
                    spec: v.flock?.speculation?.name,
                    tech: v.technician?.username
                });
            });

            // B. Capture du Graphique pour l'intégrer
            if (chartRef.current) {
                const chartDataUrl = await toPng(chartRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
                
                const imgId = wb.addImage({
                    base64: chartDataUrl,
                    extension: 'png',
                });

                // On insère l'image à droite du tableau (Colonne G, Ligne 2)
                ws.addImage(imgId, {
                    tl: { col: 6, row: 1 },
                    ext: { width: 600, height: 350 }
                });
            }

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Visites_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success("Excel téléchargé !", { id: toastId });

        } catch (e) {
            console.error(e);
            toast.error("Erreur Excel", { id: toastId });
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 pb-20">
            <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
                <span className="text-green-600">🚜</span> Analyse des Visites
            </h1>
            
            <ReportFilters onFilter={loadData} isAdmin={true} />

            {loading && <div className="text-center py-10 animate-pulse text-gray-500">Analyse des lots en cours...</div>}

            {data && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* BARRE D'ACTIONS */}
                    <div className="flex justify-end gap-3 mb-4 no-print">
                        <button 
                            onClick={exportExcel} 
                            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-green-700 flex items-center gap-2"
                        >
                            <span>📥</span> Excel (Data + Graph)
                        </button>
                        <button 
                            onClick={exportPDF} 
                            className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-red-700 flex items-center gap-2"
                        >
                            <span>📄</span> PDF (Visuel)
                        </button>
                    </div>

                    {/* ZONE IMPRIMABLE */}
                    <div ref={reportRef} className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 space-y-8">
                        <div className="text-center border-b pb-4">
                            <h2 className="text-3xl font-black text-gray-800">Typologie des Visites</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Période : {new Date().toLocaleDateString()} • {data.raw.length} visites analysées
                            </p>
                        </div>

                        {/* ZONE GRAPHIQUES (Pour capture Excel) */}
                        <div ref={chartRef} className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-4">
                            
                            {/* Graph 1 : Spéculations */}
                            <div className="h-80">
                                <h3 className="font-bold text-gray-700 mb-2 text-center">Répartition par Spéculation</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={data.charts.specs} 
                                            cx="50%" 
                                            cy="50%" 
                                            innerRadius={60} 
                                            outerRadius={80} 
                                            paddingAngle={5} 
                                            dataKey="value" 
                                            label
                                        >
                                            {data.charts.specs.map((_:any, i:number) => (
                                                <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Legend />
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Graph 2 : Tranches d'âge */}
                            <div className="h-80">
                                <h3 className="font-bold text-gray-700 mb-2 text-center">Répartition par Stade Physiologique</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.charts.ages} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#82ca9d" barSize={30} radius={[0, 4, 4, 0]}>
                                            <Cell fill="#82ca9d" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* TABLEAU RÉCAP (Aperçu) */}
                        <div className="mt-8">
                            <h3 className="font-bold text-gray-700 mb-4 text-sm uppercase border-b pb-2">Dernières visites</h3>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Client</th>
                                        <th className="p-3">Lot</th>
                                        <th className="p-3">Tech</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.raw.slice(0, 5).map((v: any) => (
                                        <tr key={v.id}>
                                            <td className="p-3 text-gray-600">{new Date(v.visitedAt).toLocaleDateString()}</td>
                                            <td className="p-3 font-bold text-gray-800">{v.customer?.name}</td>
                                            <td className="p-3">{v.flock?.name}</td>
                                            <td className="p-3 text-indigo-600 font-medium">{v.technician?.username}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="text-center text-xs text-gray-400 mt-4 italic">
                                Téléchargez le rapport Excel pour voir l'intégralité des données.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}