"use client";

import { useState, useRef } from "react";
import { ReportFilters } from "../components/ReportFilters";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, Scatter } from 'recharts';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image'; // ✅ Remplacement de html2canvas
import jsPDF from "jspdf";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AlimentReport() {
    const chartRef = useRef<HTMLDivElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);

    const loadData = async (filters: any) => {
        setLoading(true);
        const token = localStorage.getItem("sav_token");
        try {
            // On charge les observations pour avoir les poids et consos
            const techFilter = filters.technicians.map((t:any) => `visit.technician[]=${t.value}`).join('&');
            const url = `${API_URL}/observations?observedAt[after]=${filters.start}&observedAt[before]=${filters.end}&pagination=false&${techFilter}`;
            
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
            const obsList = await res.json();

            // --- MOTEUR DE CALCUL IC & PERFS ---
            let totalConso = 0;
            let totalBiomasse = 0;
            const pointsGraph: any[] = [];
            
            // On regroupe par bande pour éviter les doublons
            const flockMap: Record<string, any> = {};

            obsList.forEach((o: any) => {
                const flockId = o.flock?.id;
                if(!flockId) return;

                // On ne garde que la dernière obs de la période pour chaque lot pour le KPI global
                if (!flockMap[flockId] || new Date(o.observedAt) > new Date(flockMap[flockId].observedAt)) {
                    flockMap[flockId] = o;
                }

                // Pour le graphique, on garde tout (Nuage de points Poids/Age)
                if (o.data?.poidsMoyen && o.data?.age) {
                    pointsGraph.push({
                        age: o.data.age,
                        poids: o.data.poidsMoyen,
                        conso: o.data.consoTete,
                        flock: o.flock?.name
                    });
                }
            });

            // Calcul des KPI sur les dernières observations
            Object.values(flockMap).forEach((o: any) => {
                const eff = (o.flock?.subjectCount || 0) - (o.data?.mortalite || 0);
                const poidsTotal = (eff * (o.data?.poidsMoyen || 0)) / 1000; // Tonnes
                // Estimation grossière de la conso cumulée (Age * Conso Moyenne jour)
                const consoEstimee = (eff * (o.data?.consoTete || 0) * (o.data?.age || 1)) / 1000;

                totalBiomasse += poidsTotal;
                totalConso += consoEstimee;
            });

            // IC Moyen (Ratio)
            const fcr = totalBiomasse > 0 ? (totalConso / totalBiomasse).toFixed(2) : "0.00";

            // Tri des points pour le graph
            pointsGraph.sort((a, b) => a.age - b.age);

            setData({
                raw: obsList,
                kpi: { fcr, totalBiomasse: totalBiomasse.toFixed(1), totalConso: totalConso.toFixed(1) },
                charts: { points: pointsGraph }
            });

        } catch (e) { 
            console.error(e);
            toast.error("Erreur calculs"); 
        } finally { 
            setLoading(false); 
        }
    };

    // --- 1. EXPORT EXCEL (Data + Graph) ---
    const exportExcel = async () => {
        if (!data) return;
        const toastId = toast.loading("Génération Excel...");

        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Performance Alimentaire');

            ws.columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Lot', key: 'flock', width: 20 },
                { header: 'Âge (j)', key: 'age', width: 10 },
                { header: 'Poids (g)', key: 'weight', width: 12 },
                { header: 'Conso/j (g)', key: 'feed', width: 12 },
                { header: 'IC Est.', key: 'fcr', width: 10 },
            ];

            // Style Header
            ws.getRow(1).font = { bold: true };

            data.raw.forEach((o: any) => {
                // Calcul IC Ligne (Conso cumulée théorique / Poids)
                const ic = o.data.poidsMoyen > 0 ? ((o.data.consoTete * o.data.age) / o.data.poidsMoyen).toFixed(2) : '-';
                ws.addRow({
                    date: new Date(o.observedAt).toLocaleDateString(),
                    flock: o.flock?.name,
                    age: o.data.age,
                    weight: o.data.poidsMoyen,
                    feed: o.data.consoTete,
                    fcr: ic
                });
            });

            // Capture du graphique
            if (chartRef.current) {
                const chartDataUrl = await toPng(chartRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
                const imgId = wb.addImage({ base64: chartDataUrl, extension: 'png' });
                ws.addImage(imgId, { tl: { col: 7, row: 1 }, ext: { width: 600, height: 350 } });
            }

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Performance_Alimentaire_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success("Excel téléchargé !", { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error("Erreur Excel", { id: toastId });
        }
    };

    // --- 2. EXPORT PDF (Visuel) ---
    const exportPDF = async () => {
        if (!reportRef.current) return;
        const toastId = toast.loading("PDF en cours...");
        try {
            const dataUrl = await toPng(reportRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const w = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(dataUrl);
            const h = (imgProps.height * w) / imgProps.width;
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
            pdf.save(`Rapport_Alimentaire_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.success("Terminé !", { id: toastId });
        } catch(e) {
            console.error(e);
            toast.error("Erreur PDF", { id: toastId });
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 pb-20">
            <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
                <span className="text-orange-600">🌽</span> Conso & Rentabilité
            </h1>
            <ReportFilters onFilter={loadData} isAdmin={true} />

            {loading && <div className="text-center py-10 animate-pulse text-gray-500">Calcul de l'IC en cours...</div>}

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
                            <h2 className="text-3xl font-black text-gray-800">Performance Zootechnique</h2>
                            <p className="text-sm text-gray-500 mt-1">Analyse de la conversion alimentaire</p>
                        </div>

                        {/* KPI */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-4 bg-orange-50 rounded-xl text-center border border-orange-100">
                                <p className="text-xs font-bold text-orange-800 uppercase">IC Moyen (FCR)</p>
                                <p className="text-4xl font-black text-orange-900">{data.kpi.fcr}</p>
                                <p className="text-[10px] text-orange-600 mt-1">Objectif: &lt; 1.6</p>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-100">
                                <p className="text-xs font-bold text-blue-800 uppercase">Biomasse Produite</p>
                                <p className="text-4xl font-black text-blue-900">{data.kpi.totalBiomasse} T</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl text-center border border-gray-100">
                                <p className="text-xs font-bold text-gray-500 uppercase">Aliment Estimé</p>
                                <p className="text-4xl font-black text-gray-700">{data.kpi.totalConso} T</p>
                            </div>
                        </div>

                        {/* GRAPHIQUE COMBINÉ (Capturé pour Excel) */}
                        <div ref={chartRef} className="h-96 bg-white p-4">
                            <h3 className="font-bold text-gray-700 mb-4 text-center">Courbe de Croissance (Poids vs Âge)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data.charts.points}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis 
                                        dataKey="age" 
                                        type="number" 
                                        label={{ value: 'Âge (Jours)', position: 'insideBottomRight', offset: -5 }} 
                                        domain={[0, 'auto']}
                                    />
                                    <YAxis 
                                        yAxisId="left" 
                                        label={{ value: 'Poids (g)', angle: -90, position: 'insideLeft' }} 
                                    />
                                    <YAxis 
                                        yAxisId="right" 
                                        orientation="right" 
                                        label={{ value: 'Conso (g)', angle: 90, position: 'insideRight' }} 
                                    />
                                    <Tooltip />
                                    <Legend />
                                    
                                    <Scatter 
                                        yAxisId="left"
                                        name="Poids Réel" 
                                        dataKey="poids" 
                                        fill="#4F46E5" 
                                        shape="circle"
                                    />
                                    <Line 
                                        yAxisId="right"
                                        type="monotone" 
                                        dataKey="conso" 
                                        name="Conso Quotidienne" 
                                        stroke="#F59E0B" 
                                        dot={false}
                                        strokeWidth={2}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                            <p className="text-center text-xs text-gray-400 mt-2">Chaque point représente une observation terrain.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}