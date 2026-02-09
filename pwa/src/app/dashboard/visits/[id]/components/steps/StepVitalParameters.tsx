"use client";
import { useMemo, useEffect } from "react";
import { StepProps } from "../types";
import {
    calculateAgeInDays,
    calculateBenchmark,
    getFeedingStage,
    BenchmarkCard,
} from "../../shared";

interface StepVitalParametersProps extends StepProps {
    // Ne PAS étendre StepWithBuildingProps
    vaccines: any[];
    dueVaccines: any[];
    setDueVaccines: (v: any[]) => void;
    historyList: any[];
    selectedHistoryId: number | null;
    setSelectedHistoryId: (id: number | null) => void;
    showHistory: boolean;
    setShowHistory: (show: boolean) => void;
    displayedHistory: any;
    onViewHistoryDetail?: (history: any) => void;
}

export const StepVitalParameters = ({
    data,
    updateData,
    flock,
    isFirstObservation,
    errors,
    vaccines,
    dueVaccines,
    setDueVaccines,
    historyList,
    selectedHistoryId,
    setSelectedHistoryId,
    showHistory,
    setShowHistory,
    displayedHistory,
    onViewHistoryDetail,
}: StepVitalParametersProps) => {
    const currentStage = useMemo(
        () => getFeedingStage(flock.speculation?.name, data.age),
        [flock.speculation?.name, data.age],
    );

    const benchmark = calculateBenchmark(
        data.age,
        data.poidsMoyen,
        data.consoTete,
        flock.standard?.curveData || [],
    );

    useEffect(() => {
        if (flock.startDate && !data.age) {
            const today = new Date().toISOString();
            const calcAge = calculateAgeInDays(flock.startDate, today);
            updateData("age", calcAge);
        }
    }, [flock.startDate, data.age, updateData]);

    // 2. Calculer les vaccins dus (indépendamment de l'initialisation)
    useEffect(() => {
        if (data.age && vaccines.length > 0) {
            const calcAge = parseInt(data.age.toString());
            const doneIds = data.vaccinesDone || [];

            // Filtrer : targetDay <= age + 2 ET pas encore fait
            const due = vaccines.filter((v) => {
                const isDue = v.targetDay <= calcAge + 2;
                const isDone = doneIds.includes(v.id);
                return isDue && !isDone;
            });

            setDueVaccines(due);
        } else {
            setDueVaccines([]);
        }
    }, [data.age, vaccines, data.vaccinesDone, setDueVaccines]);

    return (
        <div className="space-y-4">
            <div className="bg-indigo-900 p-3 rounded-xl text-white">
                <h3 className="text-lg font-bold">{currentStage}</h3>
                <p className="text-sm opacity-80">Âge: {data.age} jours</p>
            </div>

            {historyList.length > 0 && (
                <div className="mb-4">
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-yellow-50 text-yellow-800 rounded-lg font-bold text-xs border border-yellow-200 hover:bg-yellow-100 transition"
                    >
                        <span>
                            📚 Historique ({historyList.length} visites
                            précédentes)
                        </span>
                        <span>{showHistory ? "▲" : "▼"}</span>
                    </button>

                    {showHistory && (
                        <div className="mt-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200 space-y-2">
                            {historyList.map((h: any) => (
                                <div
                                    key={h.id}
                                    className="flex items-center justify-between bg-white p-3 rounded border border-yellow-100 hover:shadow-md transition"
                                >
                                    <div className="text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-yellow-900">
                                                J{h.data?.age}
                                            </span>
                                            <span className="text-gray-500">
                                                {new Date(
                                                    h.observedAt,
                                                ).toLocaleDateString("fr-FR")}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1 flex items-center gap-3">
                                            <span>
                                                ⚖️ {h.data?.poidsMoyen}g
                                            </span>
                                            <span>
                                                ☠️ {h.data?.mortalite} morts
                                            </span>
                                            {h.detectedProblems?.length > 0 && (
                                                <span className="text-red-600">
                                                    ⚠️{" "}
                                                    {h.detectedProblems.length}{" "}
                                                    problème(s)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onViewHistoryDetail?.(h)}
                                        className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-bold rounded hover:bg-yellow-600 transition shadow-sm"
                                    >
                                        Voir détails
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {dueVaccines.length > 0 && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg">
                    <h4 className="font-bold text-blue-900 text-xs uppercase mb-2">
                        💉 Vaccination Requise (J{data.age})
                    </h4>
                    <div className="space-y-2">
                        {dueVaccines.map((task) => (
                            <div
                                key={task.id}
                                className="flex items-center justify-between bg-white p-2 rounded border border-blue-100"
                            >
                                <span className="font-bold text-sm text-gray-700">
                                    {task.name}
                                </span>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 rounded text-blue-600"
                                        checked={data.vaccinesDone?.includes(
                                            task.id,
                                        )}
                                        onChange={(e) => {
                                            const done =
                                                data.vaccinesDone || [];
                                            updateData(
                                                "vaccinesDone",
                                                e.target.checked
                                                    ? [...done, task.id]
                                                    : done.filter(
                                                          (id: any) =>
                                                              id !== task.id,
                                                      ),
                                            );
                                        }}
                                    />
                                    <span className="font-medium">Fait</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div
                    className={`p-3 rounded-lg border ${
                        data.mortalite > 100
                            ? "bg-red-50 border-red-200"
                            : data.mortalite > 0
                              ? "bg-orange-50 border-orange-200"
                              : "bg-green-50 border-green-200"
                    }`}
                >
                    <label
                        className={`text-[10px] font-bold uppercase block mb-1 ${
                            data.mortalite > 100
                                ? "text-red-600"
                                : data.mortalite > 0
                                  ? "text-orange-600"
                                  : "text-green-600"
                        }`}
                    >
                        Mortalité
                    </label>
                    <input
                        type="number"
                        className="w-full bg-transparent text-xl font-black text-gray-800 focus:outline-none"
                        placeholder="0"
                        value={data.mortalite}
                        onChange={(e) =>
                            updateData(
                                "mortalite",
                                parseInt(e.target.value) || 0,
                            )
                        }
                        onFocus={(e) => e.target.select()}
                    />
                    {errors.mortalite && (
                        <span className="text-xs text-red-600">
                            {errors.mortalite}
                        </span>
                    )}
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Poids (g) *
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        className={`w-full bg-transparent text-xl font-black focus:outline-none ${
                            errors.poidsMoyen
                                ? "text-red-600 placeholder-red-300"
                                : "text-gray-800"
                        }`}
                        placeholder="0"
                        value={data.poidsMoyen}
                        onChange={(e) =>
                            updateData(
                                "poidsMoyen",
                                parseFloat(e.target.value) || 0,
                            )
                        }
                        onFocus={(e) => e.target.select()}
                    />
                    {errors.poidsMoyen ? (
                        <span className="text-xs text-red-600">
                            {errors.poidsMoyen}
                        </span>
                    ) : (
                        <BenchmarkCard benchmark={benchmark} type="weight" />
                    )}
                </div>

                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Conso (g/tête) *
                    </label>
                    <input
                        type="number"
                        className={`w-full bg-transparent text-xl font-black focus:outline-none ${
                            errors.consoTete
                                ? "text-red-600 placeholder-red-300"
                                : "text-gray-800"
                        }`}
                        placeholder="0"
                        value={data.consoTete}
                        onChange={(e) =>
                            updateData(
                                "consoTete",
                                parseFloat(e.target.value) || 0,
                            )
                        }
                        onFocus={(e) => e.target.select()}
                    />
                    {errors.consoTete ? (
                        <span className="text-xs text-red-600">
                            {errors.consoTete}
                        </span>
                    ) : (
                        <BenchmarkCard benchmark={benchmark} type="feed" />
                    )}
                </div>

                <div
                    className={`p-3 rounded-lg border ${
                        isFirstObservation
                            ? "bg-gray-50 border-gray-200"
                            : "bg-blue-50 border-blue-100"
                    }`}
                >
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-bold uppercase text-gray-500">
                            Eau {isFirstObservation && "(Réf.)"}
                        </label>
                    </div>

                    <div className="flex gap-1 h-8">
                        {["yes", "stable", "no"].map((val) => (
                            <button
                                key={val}
                                type="button"
                                disabled={isFirstObservation}
                                onClick={() =>
                                    updateData("waterConsumptionIncrease", val)
                                }
                                className={`flex-1 rounded text-xs font-bold transition-colors ${
                                    isFirstObservation
                                        ? "bg-gray-100 text-gray-300"
                                        : data.waterConsumptionIncrease === val
                                          ? val === "no"
                                              ? "bg-red-500 text-white"
                                              : "bg-blue-600 text-white"
                                          : "bg-white text-gray-600 hover:bg-gray-100"
                                }`}
                            >
                                {val === "yes"
                                    ? "↗️"
                                    : val === "stable"
                                      ? "➡️"
                                      : "↘️"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
