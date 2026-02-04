"use client";

import { useState, useRef, useMemo } from "react";
import { ReportFilters } from "../components/ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import jsPDF from "jspdf";
import toast from "react-hot-toast";
import Link from "next/link";

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function PerformanceReport() {
    const reportRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<HTMLDivElement>(null);
    
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);

    // Chargement des données (Visites + Clients pour le portefeuille)
    const loadData = async (filters: any) => {
        setLoading(true);
        const token = localStorage.getItem("sav_token");
        
        try {
            const techFilter = filters.technicians.map((t:any) => `technician[]=${t.value}`).join('&');
            
            // 1. URL Visites
            const visitsUrl = `${API_URL}/visits?visitedAt[after]=${filters.start}&visitedAt[before]=${filters.end}&pagination=false&${techFilter}`;
            
            // 2. URL Clients (Pour calculer le portefeuille)
            // On récupère tous les clients pour déterminer la taille des portefeuilles
            const customersUrl = `${API_URL}/customers?pagination=false`;

            // Appel parallèle
            const [resVisits, resCustomers] = await Promise.all([
                fetch(visitsUrl, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }),
                fetch(customersUrl, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
            ]);
            
            if(!resVisits.ok || !resCustomers.ok) throw new Error("Erreur réseau");
            
            const visits = await resVisits.json();
            const customers = await resCustomers.json();

            // --- AGRÉGATION ---
            const visitsByTech: any = {};
            const closedVisitsByTech: any = {};
            const clientSet = new Set();
            const statusCounts: Record<string, number> = { 'CLOSED': 0, 'OPEN': 0 };

            // Analyse des Visites
            visits.forEach((v: any) => {
                const tech = v.technician?.username || "Non assigné";
                visitsByTech[tech] = (visitsByTech[tech] || 0) + 1;
                
                if(v.customer) clientSet.add(v.customer.id);

                if (v.closed) {
                    statusCounts['CLOSED']++;
                    closedVisitsByTech[tech] = (closedVisitsByTech[tech] || 0) + 1;
                } else {
                    statusCounts['OPEN']++;
                }
            });

            // Analyse des Portefeuilles (Clients)
            const portfolioByTech: Record<string, number> = {};
            customers.forEach((c: any) => {
                // Règle : Si affectedTo est null, c'est le portefeuille "Non assigné" (souvent Admin)
                // Sinon, c'est le portefeuille du technicien assigné
                const techName = c.affectedTo?.username || "Non assigné";
                portfolioByTech[techName] = (portfolioByTech[techName] || 0) + 1;
            });

            // Données graphiques
            const chartData = Object.keys(visitsByTech).map(k => ({ name: k, value: visitsByTech[k] }));

            // Calcul Moyenne
            const nbProductiveTechs = Object.keys(closedVisitsByTech).length;
            const avgClosed = nbProductiveTechs > 0 ? (statusCounts['CLOSED'] / nbProductiveTechs).toFixed(1) : "0";

            setData({
                rawVisits: visits,
                portfolioByTech, // ✅ On stocke la taille des portefeuilles
                chartData,
                statusCounts,
                kpi: {
                    total: visits.length,
                    uniqueClients: clientSet.size,
                    avgClosed
                }
            });

        } catch (e) {
            console.error(e);
            toast.error("Impossible de charger les données");
        } finally {
            setLoading(false);
        }
    };

    // ... (exportPDF et exportExcel restent inchangés, vous pouvez les garder tels quels)
    // --- EXPORTS ---
    const exportPDF = async () => {
        if (!reportRef.current) return;
        const toastId = toast.loading("Génération du PDF...");
        try {
            const dataUrl = await toPng(reportRef.current, { quality: 0.95, pixelRatio: 2 });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfW = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfH = (imgProps.height * pdfW) / imgProps.width;
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);
            pdf.save(`Rapport_Performance_${new Date().toISOString().slice(0,10)}.pdf`);
            toast.success("PDF prêt !", { id: toastId });
        } catch (e) {
            toast.error("Erreur PDF", { id: toastId });
        }
    };

    const exportExcel = async () => {
        if (!data) return;
        const toastId = toast.loading("Génération Excel...");
        try {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Synthèse');
            sheet.columns = [
                { header: 'Technicien', key: 'tech', width: 20 },
                { header: 'Client', key: 'client', width: 25 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Statut', key: 'status', width: 15 },
                { header: 'Détails Lot', key: 'spec', width: 30 },
                { header: 'Date Lancement', key: 'startDate', width: 15 },
            ];
            const sortedVisits = [...data.rawVisits].sort((a: any, b: any) => {
                const techA = a.technician?.username || "";
                const techB = b.technician?.username || "";
                if (techA !== techB) return techA.localeCompare(techB);
                return new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime();
            });
            sortedVisits.forEach((v: any) => {
                const obs = v.observations?.[0];
                sheet.addRow({
                    date: new Date(v.visitedAt).toLocaleDateString(),
                    client: v.customer?.name,
                    tech: v.technician?.username,
                    status: v.closed ? 'CLÔTURÉE' : 'EN COURS',
                    spec: obs ? `${obs.flock?.speculation?.name} (${obs.flock?.subjectCount})` : '',
                    startDate: obs?.flock?.startDate ? new Date(obs.flock.startDate).toLocaleDateString() : '-'
                });
            });
            if (chartRef.current) {
                const chartDataUrl = await toPng(chartRef.current, { quality: 0.95, pixelRatio: 2 });
                const imageId = workbook.addImage({ base64: chartDataUrl, extension: 'png' });
                sheet.addImage(imageId, { tl: { col: 6, row: 1 }, ext: { width: 500, height: 300 } });
            }
            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Performance_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success("Excel téléchargé", { id: toastId });
        } catch(e) {
            toast.error("Erreur Excel", { id: toastId });
        }
    };

    // --- LOGIQUE DE GROUPEMENT AMÉLIORÉE ---
    const groupedData = useMemo(() => {
        if (!data?.rawVisits) return {};
        const groups: any = {};

        data.rawVisits.forEach((v: any) => {
            const techName = v.technician?.username || "Non assigné";
            const clientName = v.customer?.name || "Client Inconnu";

            if (!groups[techName]) {
                // On initialise le groupe avec des compteurs
                groups[techName] = { 
                    clients: {}, 
                    stats: { total: 0, planned: 0, closed: 0 } 
                };
            }

            // Incrémentation des stats globales du technicien
            groups[techName].stats.total++;
            if (v.closed) groups[techName].stats.closed++;
            else groups[techName].stats.planned++;

            // Groupement par client
            if (!groups[techName].clients[clientName]) {
                groups[techName].clients[clientName] = [];
            }
            groups[techName].clients[clientName].push(v);
        });

        return groups;
    }, [data]);

    return (
        <div className="max-w-7xl mx-auto p-4 pb-20">
            <Link href="/dashboard/reports" className="text-indigo-600 font-bold hover:underline mb-4 inline-block">← Retour au Centre de Rapports</Link>
            <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
                <span className="text-blue-600">🚀</span> Rapport de Performance
            </h1>
            
            <ReportFilters onFilter={loadData} isAdmin={true} />

            {loading && <div className="text-center py-10 animate-pulse text-gray-500">Calcul des indicateurs...</div>}

            {data && (
                <div className="space-y-6 animate-fade-in">
                    
                    <div className="flex justify-end gap-3 mb-4 no-print">
                        <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-green-700 flex items-center gap-2">
                            <span>📥</span> Excel
                        </button>
                        <button onClick={exportPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-red-700 flex items-center gap-2">
                            <span>📄</span> PDF
                        </button>
                    </div>

                    <div ref={reportRef} className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 space-y-8" id="report-content">
                        
                        <div className="text-center border-b pb-4">
                            <h2 className="text-3xl font-black text-indigo-900 uppercase">Synthèse d'Activité</h2>
                            <p className="text-sm text-gray-500 mt-1">Généré le {new Date().toLocaleString()}</p>
                        </div>

                        {/* KPI GLOBAUX */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-100">
                                <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">Visites Totales</p>
                                <p className="text-3xl font-black text-blue-900 mt-1">{data.kpi.total}</p>
                            </div>
                            <div className="p-4 bg-purple-50 rounded-xl text-center border border-purple-100">
                                <p className="text-[10px] font-bold text-purple-800 uppercase tracking-wide">Portefeuille Touché</p>
                                <p className="text-3xl font-black text-purple-900 mt-1">{data.kpi.uniqueClients}</p>
                            </div>
                            <div className="p-4 bg-indigo-50 rounded-xl text-center border border-indigo-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-indigo-200 text-indigo-800 text-[9px] px-2 py-0.5 rounded-bl">Clôturées</div>
                                <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">Moyenne / Tech</p>
                                <p className="text-3xl font-black text-indigo-900 mt-1">{data.kpi.avgClosed}</p>
                            </div>
                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-center">
                                <div className="flex justify-around items-center h-full">
                                    <div className="text-center">
                                        <span className="block text-xl font-black text-green-600">{data.statusCounts['CLOSED'] || 0}</span>
                                        <span className="text-[9px] font-bold text-green-700 uppercase">Clôturées</span>
                                    </div>
                                    <div className="w-px h-8 bg-gray-300"></div>
                                    <div className="text-center">
                                        <span className="block text-xl font-black text-orange-500">{data.statusCounts['OPEN'] || 0}</span>
                                        <span className="text-[9px] font-bold text-orange-600 uppercase">En cours</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GRAPHIQUES */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="h-80" ref={chartRef} style={{ padding:'10px' }}>
                                <h3 className="font-bold text-gray-700 mb-4 text-center">Répartition par Technicien</h3>
                                <ResponsiveContainer width="100%" height="95%">
                                    <BarChart data={data.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" tick={{fontSize: 12}} />
                                        <YAxis />
                                        <Tooltip cursor={{fill: '#F3F4F6'}} />
                                        <Bar dataKey="value" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="h-80">
                                <h3 className="font-bold text-gray-700 mb-4 text-center">Parts de marché (Interne)</h3>
                                <ResponsiveContainer width="100%" height="95%">
                                    <PieChart>
                                        <Pie data={data.chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                            {data.chartData.map((entry:any, index:number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* DÉTAILS GROUPÉS AVEC RÉCAP */}
                        <div className="mt-8 space-y-8">
                            <h3 className="font-black text-xl text-gray-900 border-b pb-2">Détails des Activités</h3>
                            
                            {Object.entries(groupedData).map(([techName, group]: any) => {
                                // Calculs locaux pour ce technicien
                                const clientsList = group.clients;
                                const uniqueClientsVisited = Object.keys(clientsList).length;
                                const portfolioSize = data.portfolioByTech[techName] || 0;
                                const visitsTotal = group.stats.total;
                                const visitsPlanned = group.stats.planned;
                                const visitsClosed = group.stats.closed;

                                return (
                                    <div key={techName} className="bg-gray-50 rounded-xl p-5 border border-gray-200 break-inside-avoid">
                                        {/* En-tête Technicien Enrichi */}
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-gray-200 pb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-sm">
                                                    {techName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-indigo-900 text-xl">{techName}</h4>
                                                    <div className="flex gap-3 text-xs mt-1">
                                                        <span className="bg-white px-2 py-1 rounded border text-gray-600">
                                                            👥 <strong>{uniqueClientsVisited}</strong> / {portfolioSize} Clients ({uniqueClientsVisited > 0 ? ((uniqueClientsVisited / portfolioSize * 100).toFixed(1) + '%') : '0%'})
                                                        </span>
                                                        <span className="bg-white px-2 py-1 rounded border text-gray-600">
                                                            🚜 <strong>{visitsTotal}</strong> Visites ({visitsPlanned} planifiées ({visitsTotal > 0 ? ((visitsTotal / visitsPlanned * 100).toFixed(1) + '%') : '0%'}))
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Mini Gauge Visuelle */}
                                            <div className="flex gap-4">
                                                <div className="text-center">
                                                    <span className="block text-lg font-black text-green-600">{visitsClosed}</span>
                                                    <span className="text-[9px] uppercase font-bold text-gray-400">Clôturées</span>
                                                </div>
                                                <div className="w-px bg-gray-300"></div>
                                                <div className="text-center">
                                                    <span className="block text-lg font-black text-orange-500">{visitsPlanned}</span>
                                                    <span className="text-[9px] uppercase font-bold text-gray-400">En cours</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tableaux des Clients */}
                                        <div className="grid grid-cols-1 gap-4">
                                            {Object.entries(clientsList).map(([clientName, clientVisits]: any) => (
                                                <div key={clientName} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                                    <div className="bg-gray-100 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                                                        <span className="font-bold text-gray-700">{clientName}</span>
                                                        <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-gray-300">
                                                            {clientVisits.length} visite(s)
                                                        </span>
                                                    </div>
                                                    <table className="w-full text-xs text-left">
                                                        <thead>
                                                            <tr className="text-gray-400 border-b border-gray-100">
                                                                <th className="px-4 py-2 font-medium">Date</th>
                                                                <th className="px-4 py-2 font-medium">Statut</th>
                                                                <th className="px-4 py-2 font-medium">Spéculation</th>
                                                                <th className="px-4 py-2 font-medium">Observations</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50">
                                                            {clientVisits.map((v: any) => (
                                                                <tr key={v.id}>
                                                                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                                                                        {new Date(v.visitedAt).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="px-4 py-2">
                                                                        {v.closed ? (
                                                                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-green-200">
                                                                                ✅ Clôturée
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-orange-200">
                                                                                ⏳ En cours
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td 
                                                                        className="px-4 py-2 font-medium text-indigo-600 cursor-help border-b border-dotted border-indigo-200 hover:bg-indigo-50 transition"
                                                                        title={v.observations?.[0]?.flock?.startDate 
                                                                            ? `📅 Date de lancement : ${new Date(v.observations[0].flock.startDate).toLocaleDateString()}` 
                                                                            : "Date de lancement inconnue"
                                                                        }
                                                                    >
                                                                        {v.observations?.[0]?.flock?.speculation?.name || '-'}
                                                                        {v.observations?.[0]?.flock?.subjectCount ? ` (${v.observations[0].flock.subjectCount})` : ''}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-gray-500 italic truncate max-w-[200px]">
                                                                        {v.observations?.length} obs. enregistrée(s)
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}