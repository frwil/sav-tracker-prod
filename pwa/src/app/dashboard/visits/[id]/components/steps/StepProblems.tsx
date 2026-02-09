"use client";
import { useState } from "react";
import { Problem } from "../../shared";
import { ValidationErrors } from "../validation";


interface StepProblemsProps {
    common: {
        concerns: string;
        observation: string;
        recommendations: string;
    };
    setCommon: (c: any) => void;
    existingOpenProblems: Problem[];
    newProblems: Partial<Problem>[];
    setNewProblems: (p: any[]) => void;
    resolvedProblemIds: string[];
    toggleProblemResolution: (id: string) => void;
    isEditMode: boolean;
    errors: ValidationErrors;
    isValid:boolean;
}

export const StepProblems = ({
    common,
    errors,
    setCommon,
    existingOpenProblems,
    newProblems,
    setNewProblems,
    resolvedProblemIds,
    toggleProblemResolution,
}: StepProblemsProps) => {
    const [tempProblem, setTempProblem] = useState({
        description: "",
        severity: "medium" as "low" | "medium" | "high" | "critical",
    });

    const handleAddProblem = () => {
        if (!tempProblem.description.trim()) return;
        setNewProblems([
            ...newProblems,
            {
                description: tempProblem.description,
                severity: tempProblem.severity,
                status: "open",
            },
        ]);
        setTempProblem({ description: "", severity: "medium" });
    };

    const handleRemoveProblem = (index: number) => {
        setNewProblems(newProblems.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">
                Observations & Problèmes
            </h3>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Observations Générales
                </label>
                <textarea
                    className="w-full border p-3 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder="Comportement, ambiance, notes..."
                    value={common.observation}
                    onChange={(e) =>
                        setCommon({ ...common, observation: e.target.value })
                    }
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-green-600 uppercase mb-1">
                    Recommandations & Actions *
                </label>
                <textarea
                    className={`w-full border p-3 rounded-lg text-base focus:ring-2 focus:ring-${errors.recommendations ? 'red' : 'green'}-500 outline-none`}
                    rows={3}
                    placeholder="Conseils, traitements, ajustements..."
                    value={common.recommendations}
                    onChange={(e) =>
                        setCommon({
                            ...common,
                            recommendations: e.target.value,
                        })
                    }
                    required
                />
                {errors.recommendations && (
                    <span className="text-xs text-red-600 mt-1 block">
                        {errors.recommendations}
                    </span>
                )}
            </div>

            {existingOpenProblems.length > 0 && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                    <h4 className="text-xs font-bold text-orange-900 mb-2 uppercase">
                        ⏳ Problèmes en cours
                    </h4>
                    <div className="space-y-2">
                        {existingOpenProblems.map((p: any) => (
                            <label
                                key={p["@id"]}
                                className={`flex items-center gap-2 text-xs p-2 rounded border cursor-pointer ${
                                    resolvedProblemIds.includes(p["@id"])
                                        ? "bg-green-100 border-green-300 opacity-60"
                                        : "bg-white border-orange-200"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 text-green-600 rounded"
                                    checked={resolvedProblemIds.includes(
                                        p["@id"],
                                    )}
                                    onChange={() =>
                                        toggleProblemResolution(p["@id"])
                                    }
                                />
                                <span
                                    className={
                                        resolvedProblemIds.includes(p["@id"])
                                            ? "line-through text-gray-500"
                                            : "font-medium"
                                    }
                                >
                                    {p.description}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                <h4 className="text-xs font-bold text-red-900 mb-2 uppercase">
                    ⚡ Nouveau Problème ?
                </h4>

                {newProblems.length > 0 && (
                    <ul className="mb-3 space-y-2">
                        {newProblems.map((p, idx) => (
                            <li
                                key={idx}
                                className="flex justify-between items-center text-xs bg-white p-2 rounded border border-red-100"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            p.severity === "critical"
                                                ? "bg-red-600"
                                                : p.severity === "high"
                                                  ? "bg-orange-500"
                                                  : "bg-yellow-400"
                                        }`}
                                    />
                                    <span>{p.description}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveProblem(idx)}
                                    className="text-red-400 hover:text-red-600 font-bold px-2"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div>
                    <input
                        type="text"
                        className="flex-1 border p-2 rounded text-sm"
                        placeholder="Description..."
                        value={tempProblem.description}
                        onChange={(e) =>
                            setTempProblem({
                                ...tempProblem,
                                description: e.target.value,
                            })
                        }
                        onKeyPress={(e) =>
                            e.key === "Enter" && handleAddProblem()
                        }
                    />
                </div>
                <div className="mb-2">
                    <h4 className="text-xs font-bold text-red-900 m-2 uppercase">
                        Sévérité
                    </h4>
                </div>
                <div className="flex">
                    <select
                        className="w-full border p-2 rounded text-sm"
                        value={tempProblem.severity}
                        onChange={(e) =>
                            setTempProblem({
                                ...tempProblem,
                                severity: e.target.value as any,
                            })
                        }
                    >
                        <option value="medium">Moyen</option>
                        <option value="high">Élevé</option>
                        <option value="critical">Critique</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleAddProblem}
                        className="bg-red-600 text-white text-xs font-bold px-4 rounded"
                    >
                        +
                    </button>
                </div>
            </div>
        </div>
    );
};
