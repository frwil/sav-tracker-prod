"use client";

import { useState, useRef } from "react";
import { ReportFilters } from "../components/ReportFilters";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image'; // ✅ Remplacement de html2canvas
import jsPDF from "jspdf";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CommercialReport() {
    const chartRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null); // ✅ Référence pour l'impression PDF
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);

    const loadData = async (filters: any) => {
        setLoading(true);
        const token = localStorage.getItem("sav_token");
        try {
            const techFilter = filters.technicians.map((t:any) => `technician[]=${t.value}`).join('&');
            const url = `${API_URL}/prospections?date[after]=${filters.start}&date[before]=${filters.end}&pagination=false&${techFilter}`;
            
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
            const prospects = await res.json();

            // --- KPI ---
            let total = 0, converted = 0, withRdv = 0;
            const timelineMap: Record<string, number> = {};

            prospects.forEach((p: any) => {
                total++;
                if (p.status === 'CONVERTED') converted++;
                if (p.appointmentTaken) withRdv++;

                // Timeline (Par jour)
                const day = new Date(p.date).toLocaleDateString('fr-FR', {day: '2-digit', month:'2-digit'});
                timelineMap[day] = (timelineMap[day] || 0) + 1;
            });

            const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0";
            
            setData({
                raw: prospects,
                kpi: { total, converted, withRdv, conversionRate },
                charts: {
                    timeline: Object.keys(timelineMap).map(k => ({ date: k, value: timelineMap[k] })),
                    conversion: [
                        { name: 'Convertis (Clients)', value: converted },
                        { name: 'En cours (Prospects)', value: total - converted }
                    ]
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
            const dataUrl = await toPng(reportRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfW = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfH = (imgProps.height * pdfW) / imgProps.width;
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);
            pdf.save(`Rapport_Commercial_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.success("PDF prêt !", { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error("Erreur PDF", { id: toastId });
        }
    };

    // --- 2. EXPORT EXCEL ---
    const exportExcel = async () => {
        if(!data) return;
        const toastId = toast.loading("Génération Excel...");

        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Commercial');
            
            // A. Données Brutes
            ws.columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Prospect', key: 'name', width: 25 },
                { header: 'Statut', key: 'status', width: 15 },
                { header: 'RDV', key: 'rdv', width: 10 },
                { header: 'Tech', key: 'tech', width: 20 }
            ];

            // Style Header
            ws.getRow(1).font = { bold: true };

            data.raw.forEach((p:any) => ws.addRow({
                date: new Date(p.date).toLocaleDateString(),
                name: p.prospectName,
                status: p.status === 'CONVERTED' ? 'CLIENT' : 'PROSPECT',
                rdv: p.appointmentTaken ? 'OUI' : 'NON',
                tech: p.technician?.username
            }));

            // B. Capture du Graphique
            if (chartRef.current) {
                const chartDataUrl = await toPng(chartRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
                
                const imgId = wb.addImage({
                    base64: chartDataUrl,
                    extension: 'png',
                });

                ws.addImage(imgId, { tl: { col: 6, row: 1 }, ext: { width: 500, height: 300 } });
            }

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Commercial_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success("Excel téléchargé !", { id: toastId });

        } catch (e) {
            console.error(e);
            toast.error("Erreur Excel", { id: toastId });
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 pb-20">
            <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
                <span className="text-purple-600">🔭</span> Entonnoir Commercial
            </h1>
            
            <ReportFilters onFilter={loadData} isAdmin={true} />

            {loading && <div className="text-center py-10 animate-pulse text-gray-500">Analyse des conversions...</div>}

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
                            <h2 className="text-3xl font-black text-gray-800">Performance Commerciale</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Période analysée : {new Date().toLocaleDateString()}
                            </p>
                        </div>

                        {/* KPI CARDS */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="p-4 bg-gray-50 rounded-xl text-center border">
                                <p className="text-xs font-bold text-gray-500 uppercase">Total Prospects</p>
                                <p className="text-3xl font-black text-gray-800">{data.kpi.total}</p>
                            </div>
                            <div className="p-4 bg-purple-50 rounded-xl text-center border border-purple-100">
                                <p className="text-xs font-bold text-purple-600 uppercase">RDV Pris</p>
                                <p className="text-3xl font-black text-purple-800">{data.kpi.withRdv}</p>
                            </div>
                            <div className="p-4 bg-green-50 rounded-xl text-center border border-green-100">
                                <p className="text-xs font-bold text-green-600 uppercase">Nouveaux Clients</p>
                                <p className="text-3xl font-black text-green-800">{data.kpi.converted}</p>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-100">
                                <p className="text-xs font-bold text-blue-600 uppercase">Taux Transfo.</p>
                                <p className="text-3xl font-black text-blue-800">{data.kpi.conversionRate}%</p>
                            </div>
                        </div>

                        {/* GRAPHIQUES (Capturés pour Excel) */}
                        <div ref={chartRef} className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-2">
                            <div className="h-72">
                                <h3 className="font-bold text-gray-600 mb-2 text-center">Évolution de l'activité (Jours)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.charts.timeline}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="h-72">
                                <h3 className="font-bold text-gray-600 mb-2 text-center">Répartition du Statut</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={data.charts.conversion} 
                                            cx="50%" 
                                            cy="50%" 
                                            innerRadius={60} 
                                            outerRadius={80} 
                                            dataKey="value" 
                                            label
                                        >
                                            <Cell fill="#10B981" /> {/* Convertis */}
                                            <Cell fill="#E5E7EB" /> {/* En cours */}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}