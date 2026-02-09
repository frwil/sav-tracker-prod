"use client";
import { StepWithBuildingProps } from "../types";

interface StepEquipmentProps extends StepWithBuildingProps {}

export const StepEquipment = ({ data, updateData, flock, errors }: StepEquipmentProps) => {
    const remainingSubjects = flock.subjectCount - data.mortalite;
    const abreuvoirRatio = data.abreuvoirs > 0 ? remainingSubjects / data.abreuvoirs : 0;
    const mangeoireRatio = data.mangeoires > 0 ? remainingSubjects / data.mangeoires : 0;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Matériel</h3>
            
            <div className="grid grid-cols-2 gap-4">
                <div className={`p-3 rounded-lg border ${
                    abreuvoirRatio > 80 ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
                }`}>
                    <div className="flex justify-between items-start mb-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">
                            💧 Abreuvoirs *
                        </label>
                        {data.abreuvoirs > 0 && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                abreuvoirRatio > 80 ? "bg-red-200 text-red-800" : "bg-white text-blue-800"
                            }`}>
                                1/{abreuvoirRatio.toFixed(0)}
                            </span>
                        )}
                    </div>
                    <input
                        type="number"
                        className={`w-full bg-transparent text-xl font-black focus:outline-none ${
                            errors.abreuvoirs ? "text-red-600" : "text-gray-800"
                        }`}
                        placeholder="0"
                        value={data.abreuvoirs}
                        onChange={(e) => updateData("abreuvoirs", parseInt(e.target.value) || 0)}
                        onFocus={(e)=> e.target.select()}
                    />
                    {errors.abreuvoirs && (
                        <span className="text-xs text-red-600">{errors.abreuvoirs}</span>
                    )}
                </div>

                <div className={`p-3 rounded-lg border ${
                    mangeoireRatio > 55 ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200"
                }`}>
                    <div className="flex justify-between items-start mb-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">
                            🍽️ Mangeoires *
                        </label>
                        {data.mangeoires > 0 && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                mangeoireRatio > 55 ? "bg-red-200 text-red-800" : "bg-white text-orange-800"
                            }`}>
                                1/{mangeoireRatio.toFixed(0)}
                            </span>
                        )}
                    </div>
                    <input
                        type="number"
                        className={`w-full bg-transparent text-xl font-black focus:outline-none ${
                            errors.mangeoires ? "text-red-600" : "text-gray-800"
                        }`}
                        placeholder="0"
                        value={data.mangeoires}
                        onChange={(e) => updateData("mangeoires", parseInt(e.target.value) || 0)}
                        onFocus={(e)=> e.target.select()}
                    />
                    {errors.mangeoires && (
                        <span className="text-xs text-red-600">{errors.mangeoires}</span>
                    )}
                </div>
            </div>
        </div>
    );
};