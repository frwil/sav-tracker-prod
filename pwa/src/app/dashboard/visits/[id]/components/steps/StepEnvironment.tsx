"use client";
import { StepProps } from "../types";
import { getWaterOptions, getFieldFeedback } from "../../shared";

interface StepEnvironmentProps extends StepProps {}

export const StepEnvironment = ({ data, updateData, flock, errors }: StepEnvironmentProps) => {
    const waterOptions = getWaterOptions(flock.speculation?.name);
    const phFeedback = getFieldFeedback("phValue", data.phValue);
    const litiereFeedback = getFieldFeedback("litiere", data.litiere);
    const unifFeedback = getFieldFeedback("uniformite", data.uniformite);
    const cvFeedback = getFieldFeedback("cv", data.cv);

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Environnement</h3>
            
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        pH Eau *
                    </label>
                    <select
                        className={`w-full p-2 border rounded text-sm h-[40px] ${
                            errors.phValue ? "border-red-500 bg-red-50" : "border-gray-200"
                        } ${phFeedback.style}`}
                        value={data.phValue}
                        onChange={(e) => updateData("phValue", e.target.value)}
                    >
                        <option value="">-- Mesure --</option>
                        {waterOptions.map((opt, idx) => (
                            <option key={idx} value={opt}>{opt}</option>
                        ))}
                    </select>
                    {errors.phValue ? (
                        <span className="text-xs text-red-600">{errors.phValue}</span>
                    ) : (
                        <span className="text-[10px] text-gray-400">{phFeedback.message}</span>
                    )}
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        Litière *
                    </label>
                    <select
                        className={`w-full p-2 border rounded text-sm h-[40px] ${
                            errors.litiere ? "border-red-500 bg-red-50" : "border-gray-200"
                        } ${litiereFeedback.style}`}
                        value={data.litiere}
                        onChange={(e) => updateData("litiere", e.target.value)}
                    >
                        <option value="">-- État --</option>
                        <option value="Sèche / Friable">✅ Sèche</option>
                        <option value="Légèrement Humide">⚠️ Humide</option>
                        <option value="Collante / Détrempée">🚨 Détrempée</option>
                        <option value="Croûteuse">🚨 Croûteuse</option>
                    </select>
                    {errors.litiere ? (
                        <span className="text-xs text-red-600">{errors.litiere}</span>
                    ) : (
                        <span className="text-[10px] text-gray-400">{litiereFeedback.message}</span>
                    )}
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        Uniformité *
                    </label>
                    <select
                        className={`w-full p-2 border rounded text-sm h-[40px] ${
                            errors.uniformite ? "border-red-500 bg-red-50" : "border-gray-200"
                        } ${unifFeedback.style}`}
                        value={data.uniformite}
                        onChange={(e) => updateData("uniformite", e.target.value)}
                    >
                        <option value="">-- % --</option>
                        <option value="> 90% (Excellent)">🏆 &gt; 90%</option>
                        <option value="80% - 90% (Bon)">✅ 80-90%</option>
                        <option value="60% - 80% (Moyen)">⚠️ 60-80%</option>
                        <option value="< 60% (Mauvais)">🚨 &lt; 60%</option>
                    </select>
                    {errors.uniformite ? (
                        <span className="text-xs text-red-600">{errors.uniformite}</span>
                    ) : (
                        <span className="text-[10px] text-gray-400">{unifFeedback.message}</span>
                    )}
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        CV (%) *
                    </label>
                    <select
                        className={`w-full p-2 border rounded text-sm h-[40px] ${
                            errors.cv ? "border-red-500 bg-red-50" : "border-gray-200"
                        } ${cvFeedback.style}`}
                        value={data.cv}
                        onChange={(e) => updateData("cv", e.target.value)}
                    >
                        <option value="">-- Coeff --</option>
                        <option value="< 8 (Excellent)">🏆 &lt; 8</option>
                        <option value="8 - 10 (Bon)">✅ 8 - 10</option>
                        <option value="10 - 12 (Moyen)">⚠️ 10 - 12</option>
                        <option value="> 12 (Mauvais)">🚨 &gt; 12</option>
                    </select>
                    {errors.cv ? (
                        <span className="text-xs text-red-600">{errors.cv}</span>
                    ) : (
                        <span className="text-[10px] text-gray-400">{cvFeedback.message}</span>
                    )}
                </div>
            </div>
        </div>
    );
};