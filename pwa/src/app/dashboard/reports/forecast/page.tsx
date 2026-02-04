"use client";

import { useState, useRef, useEffect } from "react";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image'; // ✅ Remplacement de html2canvas
import jsPDF from "jspdf";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Durée moyenne d'un cycle en jours (Référentiel)
const CYCLE_DURATIONS: Record<string, number> = {
    "chair": 45,
    "poulet": 45,
    "porc": 180,
    "suidé": 180,
    "poisson": 150,
    "pisciculture": 150,
    "pondeuse": 500 // Réforme
};

export default function ForecastReport() {
    const reportRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [forecasts, setForecasts] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const token = localStorage.getItem("sav_token");
        try {
            // 1. Récupérer les lots actifs (sans date de fin)
            const res = await fetch(`${API_URL}/flocks?exists[endDate]=false&pagination=false`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
            });
            const flocks = await res.json();

            // 2. Calculer les projections pour chaque lot
            const now = new Date();
            const projections = flocks.map((f: any) => {
                const specName = f.speculation?.name?.toLowerCase() || "";
                
                // Déterminer la durée cible
                let targetDays = 90; // Valeur par défaut si inconnue
                for (const [key, days] of Object.entries(CYCLE_DURATIONS)) {
                    if (specName.includes(key)) { targetDays = days; break; }
                }

                // Calculer dates
                const startDate = new Date(f.startDate);
                const targetDate = new Date(startDate);
                targetDate.setDate(startDate.getDate() + targetDays);
                
                const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                const currentAge = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

                return {
                    client: f.customer?.name,
                    flock: f.name,
                    spec: f.speculation?.name,
                    count: f.subjectCount,
                    age: currentAge,
                    targetDate: targetDate,
                    daysRemaining: daysRemaining,
                    status: daysRemaining <= 7 ? 'URGENT' : daysRemaining <= 21 ? 'PROCHE' : 'LOIN'
                };
            });

            // Trier par date de sortie la plus proche
            projections.sort((a:any, b:any) => a.daysRemaining - b.daysRemaining);
            
            // Filtrer pour ne garder que les sorties futures (ou très récentes, ex: -30 jours de retard max)
            setForecasts(projections.filter((p:any) => p.daysRemaining > -30));

        } catch (e) { 
            console.error(e);
            toast.error("Erreur calcul prévisions"); 
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
            pdf.save(`Previsionnel_Ventes_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.success("PDF prêt !", { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error("Erreur PDF", { id: toastId });
        }
    };

    // --- 2. EXPORT EXCEL ---
    const exportExcel = async () => {
        const toastId = toast.loading("Génération Excel...");
        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Prévisions');
            
            ws.columns = [
                { header: 'Date Sortie', key: 'date', width: 15 },
                { header: 'Jours Restants', key: 'days', width: 15 },
                { header: 'Client', key: 'client', width: 25 },
                { header: 'Effectif', key: 'count', width: 10 },
                { header: 'Lot', key: 'flock', width: 20 },
                { header: 'Spéculation', key: 'spec', width: 20 },
                { header: 'Âge Actuel', key: 'age', width: 10 },
            ];

            // Style Header
            ws.getRow(1).font = { bold: true };

            forecasts.forEach((f) => {
                ws.addRow({
                    date: f.targetDate.toLocaleDateString(),
                    days: f.daysRemaining,
                    client: f.client,
                    count: f.count,
                    flock: f.flock,
                    spec: f.spec,
                    age: f.age
                });
            });

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Previsionnel_Ventes_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success("Excel téléchargé !", { id: toastId });
        } catch(e) {
            console.error(e);
            toast.error("Erreur Excel", { id: toastId });
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 pb-20">
            <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
                <span className="text-indigo-600">🔮</span> Prévisionnel de Sorties
            </h1>
            
            {/* BARRE D'ACTIONS */}
            <div className="flex justify-end gap-3 mb-6 no-print">
                <button 
                    onClick={exportExcel} 
                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-green-700 flex items-center gap-2"
                >
                    <span>📥</span> Excel
                </button>
                <button 
                    onClick={exportPDF} 
                    className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-red-700 flex items-center gap-2"
                >
                    <span>📄</span> PDF
                </button>
            </div>

            {loading ? <div className="text-center py-10 animate-pulse text-gray-500">Calcul des dates prévisionnelles...</div> : (
                <div ref={reportRef} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b bg-indigo-50">
                        <h2 className="text-lg font-bold text-indigo-900">Calendrier des Ventes à venir</h2>
                        <p className="text-sm text-indigo-700">
                            Basé sur la date de mise en place et le cycle théorique ({forecasts.length} lots analysés).
                        </p>
                    </div>

                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                            <tr>
                                <th className="p-4">Sortie Prévue</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Lot / Effectif</th>
                                <th className="p-4 text-center">Âge Actuel</th>
                                <th className="p-4 text-center">État</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {forecasts.map((f, idx) => (
                                <tr key={idx} className={`hover:bg-gray-50 transition ${f.daysRemaining <= 0 ? 'bg-red-50' : ''}`}>
                                    <td className="p-4">
                                        <div className="font-black text-gray-800">{f.targetDate.toLocaleDateString()}</div>
                                        <div className={`text-xs font-bold ${f.daysRemaining < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                            {f.daysRemaining < 0 ? `Retard de ${Math.abs(f.daysRemaining)}j` : `Dans ${f.daysRemaining} jours`}
                                        </div>
                                    </td>
                                    <td className="p-4 font-bold text-gray-700">{f.client}</td>
                                    <td className="p-4">
                                        <div className="font-bold">{f.flock}</div>
                                        <div className="text-xs text-gray-500">{f.spec} ({f.count} sujets)</div>
                                    </td>
                                    <td className="p-4 text-center font-mono font-bold text-blue-600">{f.age}j</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                            f.status === 'URGENT' ? 'bg-red-100 text-red-800 animate-pulse' :
                                            f.status === 'PROCHE' ? 'bg-orange-100 text-orange-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {f.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {forecasts.length === 0 && (
                        <div className="p-10 text-center text-gray-400 italic">Aucun lot actif trouvé dans le portefeuille.</div>
                    )}
                    
                    <div className="p-4 bg-gray-50 text-xs text-gray-400 text-center border-t border-gray-100">
                        Généré le {new Date().toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}