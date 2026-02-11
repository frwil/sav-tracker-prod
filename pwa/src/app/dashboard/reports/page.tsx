"use client";

import Link from "next/link";

const REPORTS = [
    { 
        id: "performance", 
        title: "Performance Globale", 
        icon: "🚀", 
        desc: "Taux de couverture, intensité de visite et répartition du portefeuille.", 
        color: "blue",
        href: "/dashboard/reports/performance"
    },
    { 
        id: "interventions", 
        title: "Santé & Pathologies", 
        icon: "❤️‍🩹", 
        desc: "Top maladies, taux de résolution et récurrence des problèmes.", 
        color: "red",
        href: "/dashboard/reports/interventions" // À créer plus tard
    },
    { 
        id: "visites", 
        title: "Analyse des Visites", 
        icon: "🚜", 
        desc: "Caractéristiques des lots visités (Ages, Spéculations).", 
        color: "green",
        href: "/dashboard/reports/visites"
    },
    { 
        id: "commercial", 
        title: "Entonnoir Commercial", 
        icon: "🔭", 
        desc: "Prospections, Conversions et Taux de transformation.", 
        color: "purple",
        href: "/dashboard/reports/commercial"
    },
    { 
        id: "forecast", 
        title: "Prévisionnel Sorties", 
        icon: "🔮", 
        desc: "Calendrier prévisionnel des ventes (Basé sur l'âge).", 
        color: "indigo",
        href: "/dashboard/reports/forecast"
    },
    {
        id: "aliment",
        title: "Conso & Rentabilité",
        icon: "🌽",
        desc: "Analyse des coûts alimentaires et Indices de Consommation.",
        color: "orange",
        href: "/dashboard/reports/aliment"
    },
    { 
        id: "adherence", 
        title: "Adhérence & Planning", 
        icon: "🎯", 
        desc: "Analyse de la ponctualité et du respect des tournées.", 
        color: "teal",
        href: "/dashboard/reports/adherence"
    }
];

export default function ReportsMenu() {
    return (
        <div className="max-w-6xl mx-auto p-4 pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-black text-gray-900">📊 Centre de Rapports</h1>
                <p className="text-gray-500">Outils d'aide à la décision et statistiques avancées.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {REPORTS.map((report) => (
                    <Link 
                        key={report.id} 
                        href={report.href}
                        className={`group bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-${report.color}-200 transition-all cursor-pointer`}
                    >
                        <div className={`w-12 h-12 rounded-xl bg-${report.color}-50 text-${report.color}-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition`}>
                            {report.icon}
                        </div>
                        <h3 className="font-bold text-lg text-gray-800 mb-1">{report.title}</h3>
                        <p className="text-sm text-gray-500">{report.desc}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}