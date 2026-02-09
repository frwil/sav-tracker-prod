"use client";
import { useMemo } from "react";
import { StepProps } from "../types";
import { generateExpertInsights, calculateBenchmark } from "../../shared";

interface StepSummaryProps extends StepProps {
    common: {
        concerns: string;
        observation: string;
        recommendations: string;
    };
    newProblems: any[];
    existingOpenProblems: any[];
    resolvedProblemIds: string[];
    photos: { content: string; filename: string }[];
    dueVaccines: any[];
    totalMortalite: number;
    density: number;
    onConfirm: (e?: React.FormEvent) => void | Promise<void>;
    onEditStep: (stepIndex: number) => void;
}

export const StepSummary = ({
    data,
    flock,
    common,
    newProblems,
    existingOpenProblems,
    resolvedProblemIds,
    photos,
    dueVaccines,
    totalMortalite,
    density,
    onConfirm,
    onEditStep,
}: StepSummaryProps) => {
    const benchmark = calculateBenchmark(
        data.age,
        data.poidsMoyen,
        data.consoTete,
        flock.standard?.curveData || [],
    );

    // Générer les insights experts
    const insights = useMemo(() => {
        const mockObs = {
            data,
            observedAt: new Date().toISOString(),
        };
        return generateExpertInsights(
            mockObs,
            flock,
            benchmark,
            density,
            totalMortalite,
            dueVaccines,
        );
    }, [data, flock, benchmark, density, totalMortalite, dueVaccines]);

    // Grouper les insights par type
    const dangerInsights = insights.filter((i) => i.type === "danger");
    const warningInsights = insights.filter((i) => i.type === "warning");
    const infoInsights = insights.filter(
        (i) => i.type !== "danger" && i.type !== "warning",
    );

    // Calculer les stats clés
    const sujetsRestants = flock.subjectCount - data.mortalite;
    const mortalitePct = ((data.mortalite / flock.subjectCount) * 100).toFixed(
        1,
    );
    const ic =
        data.poidsMoyen > 0
            ? ((data.consoTete / data.poidsMoyen) * 100).toFixed(1)
            : "0";

    const isFish =
        flock.speculation?.name?.toLowerCase().includes("poisson") ||
        flock.speculation?.name?.toLowerCase().includes("pisciculture");

    // Récap des étapes précédentes
    const stepsRecap = [
        {
            id: 0,
            title: "Paramètres vitaux",
            icon: "🩺",
            data: `J${data.age} | ${data.mortalite} morts | ${data.poidsMoyen}g`,
        },
        {
            id: 1,
            title: "Environnement",
            icon: "🏠",
            data: `pH: ${data.phValue?.split(" ")[0] || "-"} | ${data.litiere?.split(" ")[0] || "-"}`,
        },
        {
            id: 2,
            title: "Matériel",
            icon: "🔧",
            data: isFish
                ? "N/A"
                : `${data.abreuvoirs} abr. | ${data.mangeoires} mang.`,
        },
        {
            id: 3,
            title: "Approvisionnement",
            icon: "📦",
            data: `${data.supply.source}${data.supply.hasPreOrder ? " + Précmd" : ""}`,
        },
        {
            id: 4,
            title: "Alimentation",
            icon: "🌾",
            data: `${data.feedBrand?.substring(0, 15) || "-"}${data.feedBrand?.length > 15 ? "..." : ""} | Stock: ${data.inventory.complete?.current || 0}kg`,
        },
        {
            id: 5,
            title: "Problèmes",
            icon: "⚠️",
            data: `${newProblems.length} nouv. | ${resolvedProblemIds.length} rés.`,
        },
        {
            id: 6,
            title: "Photos",
            icon: "📷",
            data: `${photos.length} photo(s)`,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">
                    Sommaire de la visite
                </h3>
                <span className="text-sm text-gray-500">
                    Vérifiez avant validation
                </span>
            </div>

            {/* Alertes critiques */}
            {dangerInsights.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg animate-pulse">
                    <h4 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                        🚨 Alertes critiques ({dangerInsights.length})
                    </h4>
                    <ul className="space-y-2">
                        {dangerInsights.map((insight, idx) => (
                            <li
                                key={idx}
                                className="text-sm text-red-800 flex items-start gap-2"
                            >
                                <span className="font-bold">•</span>
                                {insight.text}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Avertissements */}
            {warningInsights.length > 0 && (
                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
                    <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
                        ⚠️ Points d'attention ({warningInsights.length})
                    </h4>
                    <ul className="space-y-2">
                        {warningInsights.map((insight, idx) => (
                            <li
                                key={idx}
                                className="text-sm text-orange-800 flex items-start gap-2"
                            >
                                <span className="font-bold">•</span>
                                {insight.text}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Carte de synthèse */}
            <div className="bg-indigo-900 text-white p-4 rounded-xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div className="border-b sm:border-b-0 sm:border-r border-indigo-700 pb-2 sm:pb-0">
                        <p className="text-2xl font-black">{sujetsRestants}</p>
                        <p className="text-xs opacity-80">Sujets restants</p>
                    </div>
                    <div className="border-b sm:border-b-0 sm:border-r border-indigo-700 pb-2 sm:pb-0">
                        <p
                            className={`text-2xl font-black ${parseFloat(mortalitePct) > 5 ? "text-red-400" : ""}`}
                        >
                            {mortalitePct}%
                        </p>
                        <p className="text-xs opacity-80">Mortalité</p>
                    </div>
                    <div>
                        <p className="text-2xl font-black">{ic}%</p>
                        <p className="text-xs opacity-80">Indice Conso</p>
                    </div>
                </div>
            </div>

            {/* Récap des étapes - Cliquable pour modifier */}
            <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-700 uppercase">
                    Récapitulatif par étape
                </h4>
                <div className="grid gap-2">
                    {stepsRecap.map((step) => (
                        <button
                            key={step.id}
                            type="button"
                            onClick={() => onEditStep(step.id)}
                            className="flex items-start sm:items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition text-left group"
                        >
                            <span className="text-xl shrink-0">
                                {step.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-800 group-hover:text-indigo-600 truncate">
                                    {step.title}
                                </p>
                                <p className="text-xs text-gray-500 break-words sm:truncate">
                                    {step.data}
                                </p>
                            </div>
                            <span className="text-gray-400 group-hover:text-indigo-600 shrink-0">
                                ✏️
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Observations et recommandations */}
            {(common.observation || common.recommendations) && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                    {common.observation && (
                        <div>
                            <p className="text-xs font-bold text-blue-900 uppercase mb-1">
                                Observations
                            </p>
                            <p className="text-sm text-blue-800">
                                {common.observation}
                            </p>
                        </div>
                    )}
                    {common.recommendations && (
                        <div>
                            <p className="text-xs font-bold text-green-900 uppercase mb-1">
                                Recommandations
                            </p>
                            <p className="text-sm text-green-800">
                                {common.recommendations}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Problèmes détectés */}
            {(newProblems.length > 0 || existingOpenProblems.length > 0) && (
                <div className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-700 uppercase">
                        Gestion des problèmes
                    </h4>

                    {newProblems.length > 0 && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                            <p className="text-xs font-bold text-red-900 mb-2">
                                Nouveaux problèmes ({newProblems.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {newProblems.map((p, idx) => (
                                    <span
                                        key={idx}
                                        className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                                            p.severity === "critical"
                                                ? "bg-red-200 text-red-900"
                                                : p.severity === "high"
                                                  ? "bg-orange-200 text-orange-900"
                                                  : "bg-yellow-200 text-yellow-900"
                                        }`}
                                    >
                                        {p.description?.substring(0, 20)}
                                        {p.description?.length > 20
                                            ? "..."
                                            : ""}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {resolvedProblemIds.length > 0 && (
                        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                            <p className="text-xs font-bold text-green-900">
                                ✅ {resolvedProblemIds.length} problème(s)
                                résolu(s)
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Prévisualisation photos */}
            {photos.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase mb-2">
                        Photos ({photos.length})
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                        {photos.slice(0, 4).map((photo, idx) => (
                            <div
                                key={idx}
                                className="aspect-square rounded-lg overflow-hidden border border-gray-200"
                            >
                                <img
                                    src={photo.content}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ))}
                        {photos.length > 4 && (
                            <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                                +{photos.length - 4}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bouton de confirmation */}
            <button
                type="button"
                onClick={onConfirm}
                className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
                <span>✓</span>
                Confirmer et enregistrer l'observation
            </button>
        </div>
    );
};
