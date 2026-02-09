"use client";
import { useMemo } from "react";
import { StepProps, SupplyData } from "../types";
import { getFeedingStage } from "../../shared";

interface StepFeedingProps extends StepProps {
    feedStrategy: "INDUSTRIAL" | "SELF_MIX" | "THIRD_PARTY";
    setFeedStrategy: (s: "INDUSTRIAL" | "SELF_MIX" | "THIRD_PARTY") => void;
    feedBrand: string;
    setFeedBrand: (b: string) => void;
    inventory: any;
    updateInventory: (
        type: string,
        field: "current" | "added",
        value: number,
    ) => void;
    bagForecast: { bags: number; dailyKg: string; days: number };
    supply: SupplyData;
}

export const StepFeeding = ({
    data,
    updateData,
    flock,
    errors,
    feedStrategy,
    setFeedStrategy,
    feedBrand,
    setFeedBrand,
    inventory,
    updateInventory,
    bagForecast,
    supply,
}: StepFeedingProps) => {
    const currentStage = useMemo(
        () => getFeedingStage(flock.speculation?.name, data.age),
        [flock.speculation?.name, data.age],
    );

    const specName = flock.speculation?.name?.toLowerCase() || "";
    const isFish =
        specName.includes("pisciculture") || specName.includes("poisson");
    const isPig = specName.includes("porc") || specName.includes("suidé");

    const availableFormulas = useMemo(() => {
        if (feedStrategy === "THIRD_PARTY") return [];
        if (isFish) {
            if (feedStrategy === "INDUSTRIAL")
                return [
                    "BELGO FISH 2mm",
                    "BELGO FISH 3mm",
                    "BELGO FISH 4.5mm",
                    "BELGO FISH 6mm",
                    "BELGO FISH 8mm",
                    "Autre Extrudé",
                ];
            return [];
        }
        if (isPig) {
            if (feedStrategy === "INDUSTRIAL")
                return [
                    "Piglet Booster",
                    "Démarrage Porc",
                    "Croissance Porc",
                    "Finition Porc",
                    "Truie Gestante",
                    "Truie Allaitante",
                ];
            if (feedStrategy === "SELF_MIX")
                return ["BELGOCAM 10%", "BELGOCAM 5%", "Autre Concentré"];
        }
        if (feedStrategy === "INDUSTRIAL")
            return [
                "SPC (Standard)",
                "Chick Booster (Pré-dém)",
                "Démarrage",
                "Croissance",
                "Finition",
                "Pondeuse Phase 1",
                "Pondeuse Phase 2",
            ];
        if (feedStrategy === "SELF_MIX")
            return [
                "BELGOCAM 10%",
                "BELGOCAM 5%",
                "KOUDIJS",
                "TROUW",
                "Autre Concentré",
            ];
        return [];
    }, [feedStrategy, isFish, isPig]);

    const handleStrategyChange = (newStrategy: any) => {
        setFeedStrategy(newStrategy);
        setFeedBrand("");
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Alimentation</h3>
            {/* Récap approvisionnement */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
                <span className="font-bold">Source:</span>{" "}
                {supply.source === "AGENCE"
                    ? `Agence ${supply.agency?.agencies}`
                    : supply.source === "PROVENDERIE"
                      ? supply.provenderie?.name
                      : supply.competitor?.name}
                {supply.hasPreOrder && supply.plannedPurchaseDate && (
                    <span className="ml-2 text-green-600 font-medium">
                        • Précommande prévue le{" "}
                        {new Date(supply.plannedPurchaseDate).toLocaleDateString()}
                    </span>
                )}
            </p>
        </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                    Stratégie
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        {
                            key: "INDUSTRIAL",
                            label: "🏭 Industriel",
                            desc: "Aliment Complet",
                        },
                        {
                            key: "SELF_MIX",
                            label: "🏗️ Fabrication",
                            desc: "Concentré/Soja",
                        },
                        {
                            key: "THIRD_PARTY",
                            label: "🛒 Vrac",
                            desc: "Achat externe",
                        },
                    ].map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleStrategyChange(opt.key)}
                            disabled={opt.key === "SELF_MIX" && isFish}
                            className={`p-3 rounded-lg border text-center transition ${
                                feedStrategy === opt.key
                                    ? "bg-orange-100 border-orange-500 text-orange-900"
                                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                            } ${opt.key === "SELF_MIX" && isFish ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            <div className="text-lg mb-1">
                                {opt.label.split(" ")[0]}
                            </div>
                            <div className="text-xs font-bold">
                                {opt.label.split(" ")[1]}
                            </div>
                            <div className="text-[10px] opacity-70">
                                {opt.desc}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                    {feedStrategy === "THIRD_PARTY"
                        ? "Marque / Provenance *"
                        : "Formule *"}
                </label>
                {feedStrategy === "THIRD_PARTY" ? (
                    <input
                        type="text"
                        className={`w-full border p-3 rounded-lg text-base ${
                            errors.feedBrand
                                ? "border-red-500 bg-red-50"
                                : "border-gray-200"
                        }`}
                        placeholder="Ex: Provenderie..."
                        value={feedBrand}
                        onChange={(e) => setFeedBrand(e.target.value)}
                    />
                ) : (
                    <select
                        className={`w-full border p-3 rounded-lg text-base ${
                            errors.feedBrand
                                ? "border-red-500 bg-red-50"
                                : "border-gray-200"
                        } ${!feedBrand ? "text-orange-900 font-bold" : ""}`}
                        value={feedBrand}
                        onChange={(e) => setFeedBrand(e.target.value)}
                    >
                        <option value="">
                            -- Sélectionner ({currentStage}) --
                        </option>
                        {availableFormulas.map((f, i) => (
                            <option key={i} value={f}>
                                {f}
                            </option>
                        ))}
                    </select>
                )}
                {errors.feedBrand && (
                    <span className="text-xs text-red-600 mt-1 block">
                        {errors.feedBrand}
                    </span>
                )}
            </div>

            {bagForecast.days > 0 && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-bold text-orange-800 uppercase">
                            Fin de phase {currentStage}
                        </p>
                        <p className="text-xs text-orange-900">
                            Dans <strong>{bagForecast.days} jours</strong> (
                            {bagForecast.dailyKg} kg/j)
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-orange-400 uppercase">
                            Besoin
                        </p>
                        <p className="text-lg font-black text-orange-600">
                            {bagForecast.bags}{" "}
                            <span className="text-xs">Sacs</span>
                        </p>
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">
                    Stock
                </h4>

                {feedStrategy === "SELF_MIX" ? (
                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                {
                                    key: "mais" as const,
                                    label: "🌽 Maïs",
                                    color: "yellow",
                                },
                                {
                                    key: "soja" as const,
                                    label: "🌱 Soja",
                                    color: "green",
                                },
                                {
                                    key: "concentre" as const,
                                    label: "🧪 Concentré",
                                    color: "indigo",
                                },
                            ] as const
                        ).map((item) => (
                            <div
                                key={item.key}
                                className="bg-gray-50 p-2 rounded border"
                            >
                                <label className="text-[10px] font-bold block mb-1">
                                    {item.label}
                                </label>
                                <div className="space-y-1">
                                    <input
                                        type="number"
                                        placeholder="Entrée"
                                        className="w-full text-xs p-1 border rounded"
                                        value={inventory[item.key].added}
                                        onChange={(e) =>
                                            updateInventory(
                                                item.key,
                                                "added",
                                                parseFloat(e.target.value),
                                            )
                                        }
                                        onFocus={(e)=> e.target.select()}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Stock"
                                        className={`w-full text-xs p-1 border rounded font-bold bg-${item.color}-50`}
                                        value={inventory[item.key].current}
                                        onChange={(e) =>
                                            updateInventory(
                                                item.key,
                                                "current",
                                                parseFloat(e.target.value),
                                            )
                                        }
                                        onFocus={(e)=> e.target.select()}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-green-600 uppercase">
                                ➕ Arrivage (kg)
                            </label>
                            <input
                                type="number"
                                className="w-full p-2 border rounded text-base font-bold text-green-800"
                                value={inventory.complete.added}
                                onChange={(e) =>
                                    updateInventory(
                                        "complete",
                                        "added",
                                        parseFloat(e.target.value),
                                    )
                                }
                                onFocus={(e)=> e.target.select()}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-blue-600 uppercase">
                                📦 Stock (kg)
                            </label>
                            <input
                                type="number"
                                className="w-full p-2 border rounded text-base font-bold text-blue-800"
                                value={inventory.complete.current}
                                onChange={(e) =>
                                    updateInventory(
                                        "complete",
                                        "current",
                                        parseFloat(e.target.value),
                                    )
                                }
                                onFocus={(e)=> e.target.select()}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
