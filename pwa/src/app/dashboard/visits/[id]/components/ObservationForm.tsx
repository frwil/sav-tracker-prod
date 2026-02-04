"use client";
import { useState, useEffect, useMemo } from "react";
import { useSync } from "@/providers/SyncProvider";
import { compressImage } from "@/utils/imageCompressor";
import toast from "react-hot-toast";
import {
    API_URL,
    ProphylaxisTask,
    calculateAgeInDays,
    calculateBenchmark,
    getWaterOptions,
    getFieldFeedback,
    getPreviousWeight,
    getHistoricalObservations,
    generateExpertInsights,
    BenchmarkCard,
    Problem,
    getFeedingStage,
} from "../shared";

export const ObservationForm = ({
    visitIri,
    flock,
    building,
    visit,
    initialData,
    onSuccess,
    onCancel,
}: any) => {
    const { addToQueue } = useSync();
    const [loading, setLoading] = useState(false);
    const isEditMode = !!initialData?.id;
    const [vaccines, setVaccines] = useState<ProphylaxisTask[]>([]);
    const [dueVaccines, setDueVaccines] = useState<ProphylaxisTask[]>([]);
    const [photos, setPhotos] = useState<{ content: string; filename: string }[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);

    // --- 1. DÉTECTION DU CONTEXTE ---
    const specName = flock.speculation?.name?.toLowerCase() || "";
    const isFish =
        specName.includes("pisciculture") ||
        specName.includes("poisson") ||
        specName.includes("clarias") ||
        specName.includes("tilapia");
    const isPig = specName.includes("porc") || specName.includes("suidé");

    // --- 2. GESTION DE L'HISTORIQUE ---
    const historyList = useMemo(
        () => getHistoricalObservations(flock, initialData?.id),
        [flock, initialData],
    );

    const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(
        null,
    );
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        if (historyList.length > 0 && !selectedHistoryId) {
            setSelectedHistoryId(historyList[0].id);
        }
    }, [historyList]);

    const displayedHistory = useMemo(
        () => historyList.find((h) => h.id == selectedHistoryId),
        [historyList, selectedHistoryId],
    );

    // --- 3. STATE PRINCIPAL ---
    const [data, setData] = useState<any>({
        age: initialData?.data?.age || 0,
        mortalite: initialData?.data?.mortalite || 0,
        poidsMoyen: initialData?.data?.poidsMoyen || 0,
        consoTete: initialData?.data?.consoTete || 0,
        phValue: initialData?.data?.phValue || "",
        litiere: initialData?.data?.litiere || "",
        uniformite: initialData?.data?.uniformite || "",
        cv: initialData?.data?.cv || "",
        waterConsumptionIncrease:
            initialData?.data?.waterConsumptionIncrease || "yes",
        biosecurite: initialData?.data?.biosecurite || "ok",
        abreuvoirs: initialData?.data?.abreuvoirs || 0,
        mangeoires: initialData?.data?.mangeoires || 0,
        vaccinesDone: initialData?.data?.vaccinesDone || [],
        ...initialData?.data,
    });

    const isFirstObservation = historyList.length === 0;

    useEffect(() => {
        if (isFirstObservation && data.waterConsumptionIncrease !== "stable") {
            updateData("waterConsumptionIncrease", "stable");
        }
    }, [isFirstObservation, data.waterConsumptionIncrease]);

    // --- 4. LOGIQUE MÉTIER AVANCÉE ---
    const currentStage = useMemo(
        () => getFeedingStage(flock.speculation.name, data.age),
        [flock.speculation.name, data.age],
    );

    const bagForecast = useMemo(() => {
        const remaining = flock.subjectCount - data.mortalite;
        const dailyKg = (remaining * (data.consoTete || 100)) / 1000;

        let daysToNextPhase = 0;
        if (specName.includes("chair")) {
            if (data.age <= 10) daysToNextPhase = 10 - data.age;
            else if (data.age <= 21) daysToNextPhase = 21 - data.age;
            else if (data.age <= 35) daysToNextPhase = 35 - data.age;
        }

        if (daysToNextPhase <= 0 || dailyKg <= 0)
            return { bags: 0, dailyKg: 0, days: 0 };

        const totalNeededKg = dailyKg * daysToNextPhase;
        return {
            bags: Math.ceil(totalNeededKg / 50),
            dailyKg: dailyKg.toFixed(1),
            days: daysToNextPhase,
        };
    }, [
        flock.subjectCount,
        data.mortalite,
        data.consoTete,
        data.age,
        specName,
    ]);

    // --- 5. CHARGEMENT DONNÉES ---
    const [existingOpenProblems, setExistingOpenProblems] = useState<Problem[]>(
        [],
    );

    useEffect(() => {
        const fetchProblems = async () => {
            if (!navigator.onLine) return;
            const token = localStorage.getItem("sav_token");
            try {
                const res = await fetch(
                    `${API_URL}/problems?detectedIn.flock=${flock["@id"] || flock.id}&status=open`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/ld+json",
                        },
                    },
                );
                if (res.ok) {
                    const d = await res.json();
                    let problems = d["hydra:member"] || [];
                    if (isEditMode && initialData?.resolvedProblems) {
                        const currentResolvedIds =
                            initialData.resolvedProblems.map(
                                (p: any) => p["@id"],
                            );
                        problems = problems.filter(
                            (p: any) => !currentResolvedIds.includes(p["@id"]),
                        );
                        problems = [
                            ...problems,
                            ...initialData.resolvedProblems,
                        ];
                    }
                    setExistingOpenProblems(problems);
                }
            } catch (e) {
                console.error("Erreur chargement problèmes", e);
            }
        };
        fetchProblems();
    }, [flock, isEditMode, initialData]);

    useEffect(() => {
        const fetchProphy = async () => {
            if (!navigator.onLine) return;
            const token = localStorage.getItem("sav_token");
            if (!flock.speculation.id) return;
            try {
                const res = await fetch(
                    `${API_URL}/prophylaxis_tasks?speculation.id=${flock.speculation.id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/ld+json",
                        },
                    },
                );
                if (res.ok) {
                    const d = await res.json();
                    setVaccines(d["hydra:member"] || []);
                }
            } catch (e) {
                console.error("Erreur vaccin", e);
            }
        };
        fetchProphy();
    }, [flock.speculation]);

    // --- 6. GESTION DE L'ALIMENTATION ---
    const [feedStrategy, setFeedStrategy] = useState<
        "INDUSTRIAL" | "SELF_MIX" | "THIRD_PARTY"
    >(initialData?.data?.feedStrategy || flock.feedStrategy || "INDUSTRIAL");
    const [feedBrand, setFeedBrand] = useState(
        initialData?.data?.feedBrand || flock.feedFormula || "",
    );
    const [inventory, setInventory] = useState(
        initialData?.data?.inventory || {
            complete: { current: 0, added: 0 },
            mais: { current: 0, added: 0 },
            soja: { current: 0, added: 0 },
            concentre: { current: 0, added: 0 },
        },
    );

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

    const updateInventory = (
        type: string,
        field: "current" | "added",
        value: number,
    ) =>
        setInventory((prev: any) => ({
            ...prev,
            [type]: { ...prev[type], [field]: value },
        }));

    // --- 7. LOGIQUE DES PROBLÈMES ---
    const [common, setCommon] = useState({
        concerns: initialData?.concerns || "",
        observation: initialData?.observation || "",
        recommendations: initialData?.recommendations || "",
    });
    const [newProblems, setNewProblems] = useState<Partial<Problem>[]>(
        initialData?.detectedProblems || [],
    );
    const [tempProblem, setTempProblem] = useState({
        description: "",
        severity: "medium" as any,
    });
    const [resolvedProblemIds, setResolvedProblemIds] = useState<string[]>(
        initialData?.resolvedProblems?.map((p: any) => p["@id"]) || [],
    );

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

    const handleRemoveProblem = (index: number) =>
        setNewProblems(newProblems.filter((_, i) => i !== index));
    const toggleProblemResolution = (id: string) => {
        setResolvedProblemIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    // --- 8. HELPERS & UPDATERS ---
    const updateData = (key: string, value: any) =>
        setData((prev: any) => ({ ...prev, [key]: value }));

    useEffect(() => {
        if (initialData?.data?.age) return;
        if (flock.startDate) {
            const today = new Date().toISOString();
            const calcAge = calculateAgeInDays(flock.startDate, today);
            if (data.age !== calcAge) {
                setData((p: any) => ({ ...p, age: calcAge }));
                const due = vaccines.filter(
                    (v) =>
                        v.targetDay >= calcAge - 2 &&
                        v.targetDay <= calcAge + 2,
                );
                setDueVaccines(due);
            }
        }
    }, [flock.startDate, initialData, vaccines]);

    const benchmark = calculateBenchmark(
        data.age,
        data.poidsMoyen,
        data.consoTete,
        flock.standard?.curveData || [],
    );
    const waterOptions = getWaterOptions(flock.speculation.name);
    const phFeedback = getFieldFeedback("phValue", data.phValue);
    const litiereFeedback = getFieldFeedback("litiere", data.litiere);
    const unifFeedback = getFieldFeedback("uniformite", data.uniformite);
    const cvFeedback = getFieldFeedback("cv", data.cv);

    const liveInsights = useMemo(() => {
        const surface = building.surface || 1;
        const density = (flock.subjectCount - data.mortalite) / surface;
        const tempObs = {
            data: { ...data, feedStrategy, inventory, feedBrand },
        };
        return generateExpertInsights(
            tempObs,
            flock,
            benchmark,
            parseFloat(density.toFixed(1)),
            data.mortalite,
            dueVaccines,
        );
    }, [
        data,
        feedStrategy,
        inventory,
        feedBrand,
        flock,
        benchmark,
        building.surface,
        dueVaccines,
    ]);

    // --- 9. SAUVEGARDE ---
    const [showCorrectionModal, setShowCorrectionModal] = useState(false);
    const [correctionReason, setCorrectionReason] = useState("");
    const [previousWeight, setPreviousWeight] = useState(0);
    useEffect(() => {
        setPreviousWeight(getPreviousWeight(flock, initialData?.id));
    }, [flock, initialData]);

    const saveObservation = async () => {
        const token = localStorage.getItem("sav_token");

        if (!token && navigator.onLine) {
            toast.error("⚠️ Session expirée. Veuillez vous reconnecter.");
            return;
        }
        if (!feedBrand || feedBrand.trim() === "") {
            toast.error("⚠️ Précisez le type ou la marque d'aliment utilisé.");
            return;
        }

        const finalData = {
            ...data,
            feedStrategy,
            feedBrand,
            inventory,
            weightCorrection: correctionReason
                ? {
                      ticketId: `TKT-${Date.now()}`,
                      reason: correctionReason,
                      previous: previousWeight,
                      declared: data.poidsMoyen,
                  }
                : null,
        };

        const body = {
            visit: visitIri,
            flock: flock["@id"],
            observedAt: initialData?.observedAt || new Date().toISOString(),
            ...common,
            detectedProblems: newProblems,
            resolvedProblems: resolvedProblemIds,
            data: finalData,
            newPhotos: photos 
        };

        const url = isEditMode
            ? `/observations/${initialData!.id}`
            : `/observations`;
        const method = isEditMode ? "PATCH" : "POST";

        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            toast("🌐 Hors ligne : Mis en file d'attente.",{
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6",
                    color: "#fff",
                },
                duration: 4000,
            });
            onSuccess();
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: {
                    "Content-Type": isEditMode
                        ? "application/merge-patch+json"
                        : "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                const errorMessage =
                    errorData?.["hydra:description"] ||
                    errorData?.detail ||
                    errorData?.message ||
                    `Erreur serveur (${res.status})`;
                throw new Error(errorMessage);
            }

            const savedObservation = await res.json();

            const hasChanged =
                !flock.feedStrategy ||
                !flock.feedFormula ||
                feedStrategy !== flock.feedStrategy ||
                (feedStrategy === "THIRD_PARTY" &&
                    feedBrand !== flock.feedFormula);

            if (hasChanged) {
                try {
                    await fetch(`${API_URL}/flock_feed_histories`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            flock: flock["@id"],
                            observation: savedObservation["@id"],
                            previousStrategy:
                                flock.feedStrategy || feedStrategy,
                            newStrategy: feedStrategy,
                            previousFormula: flock.feedFormula,
                            newFormula: feedBrand,
                        }),
                    });
                } catch (historyError) {
                    console.error("Erreur historique non-bloquante", historyError);
                }
            }

            onSuccess();
        } catch (e: any) {
            console.error("Erreur Sauvegarde :", e);
            const isNetworkError =
                !navigator.onLine ||
                e instanceof TypeError ||
                e.message === "Failed to fetch" ||
                e.message.includes("NetworkError");

            if (isNetworkError) {
                addToQueue({ url, method, body });
                toast("🌐 Réseau indisponible. Sauvegardé en local.", {
                    icon: "🌐",
                    style: { borderRadius: "10px", background: "#3b82f6", color: "#fff" },
                    duration: 4000,
                });
                onSuccess();
            } else {
                toast.error(`⚠️ Échec : ${e.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (data.poidsMoyen <= 0) {
            toast.error("⛔ Poids invalide");
            return;
        }
        if (previousWeight > 0 && data.poidsMoyen < previousWeight) {
            const drop = ((previousWeight - data.poidsMoyen) / previousWeight) * 100;
            if (drop > 10) {
                setShowCorrectionModal(true);
                return;
            }
        }
        setLoading(true);
        await saveObservation();
    };

    const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsCompressing(true);
            try {
                const file = e.target.files[0];
                const compressedBase64 = await compressImage(file);
                
                setPhotos(prev => [
                    ...prev, 
                    { content: compressedBase64, filename: file.name }
                ]);
            } catch (err) {
                toast.error("Erreur lors du traitement de l'image");
                console.error(err);
            } finally {
                setIsCompressing(false);
            }
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    // --- RENDER OPTIMISÉ MOBILE ---
    return (
        <div className="relative space-y-3 sm:space-y-4">
            {/* --- HEADER ÉTAPE & INFO --- */}
            <div className="bg-indigo-900 p-3 sm:p-4 rounded-xl text-white flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-lg gap-2 sm:gap-0">
                <div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter">
                        {currentStage}
                    </h2>
                    <p className="text-xs opacity-70 flex gap-2">
                        <span>🏷️ {flock.name}</span>
                        <span>•</span>
                        <span>{specName}</span>
                    </p>
                </div>
                <div className="text-right bg-white/10 p-2 rounded-lg backdrop-blur-sm self-end sm:self-auto">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                        Âge du lot
                    </p>
                    <p className="text-xl sm:text-2xl font-black">
                        {data.age}{" "}
                        <span className="text-sm font-normal">Jours</span>
                    </p>
                </div>
            </div>

            {/* MODAL CORRECTION POIDS */}
            {showCorrectionModal && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-4 border-red-500 rounded-none sm:rounded-lg shadow-2xl animate-fade-in">
                    <p className="text-red-700 font-black text-xl mb-4 text-center">
                        🚨 ANOMALIE POIDS (-10%)
                    </p>
                    <textarea
                        className="w-full border-2 border-red-300 p-3 rounded mb-4 text-base"
                        rows={3}
                        placeholder="Justification requise..."
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                    />
                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                        <button
                            onClick={() => setShowCorrectionModal(false)}
                            className="flex-1 py-3 bg-gray-200 rounded font-bold min-h-[44px]"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={() => {
                                if (correctionReason) saveObservation();
                            }}
                            className="flex-1 py-3 bg-red-600 text-white font-bold rounded min-h-[44px]"
                        >
                            VALIDER
                        </button>
                    </div>
                </div>
            )}

            {/* BARRE HISTORIQUE */}
            {historyList.length > 0 && (
                <div className="mb-4">
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex items-center justify-between px-4 py-3 sm:py-2 bg-yellow-50 text-yellow-800 rounded-lg font-bold text-xs border border-yellow-200 hover:bg-yellow-100 transition min-h-[44px]"
                    >
                        <span>
                            📚 Historique ({historyList.length} visites)
                        </span>
                        <span>{showHistory ? "▲" : "▼"}</span>
                    </button>
                    {showHistory && (
                        <div className="mt-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200 animate-in slide-in-from-top-2">
                            <select
                                className="w-full text-base sm:text-xs p-2 rounded border border-yellow-300 bg-white mb-3 min-h-[44px]"
                                value={selectedHistoryId || ""}
                                onChange={(e) =>
                                    setSelectedHistoryId(Number(e.target.value))
                                }
                            >
                                {historyList.map((h: any) => (
                                    <option key={h.id} value={h.id}>
                                        J{h.data.age} -{" "}
                                        {new Date(
                                            h.observedAt,
                                        ).toLocaleDateString()}
                                    </option>
                                ))}
                            </select>
                            {displayedHistory && (
                                <div className="text-xs text-gray-700 grid grid-cols-2 gap-2">
                                    <span className="font-bold">
                                        ⚖️ {displayedHistory.data.poidsMoyen}g
                                    </span>
                                    <span className="font-bold">
                                        ☠️ {displayedHistory.data.mortalite}{" "}
                                        Morts
                                    </span>
                                    <div className="col-span-2 mt-1 pt-1 border-t border-yellow-200">
                                        {displayedHistory.detectedProblems &&
                                        displayedHistory.detectedProblems
                                            ?.length > 0 ? (
                                            <ul className="list-disc pl-4 text-red-600">
                                                {displayedHistory.detectedProblems.map(
                                                    (p: any, i: number) => (
                                                        <li key={i}>
                                                            {p.description}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        ) : (
                                            <span className="text-green-600 italic">
                                                Aucun problème signalé.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-100 animate-fade-in"
            >
                {/* ALERTES VACCINS */}
                {dueVaccines.length > 0 && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 mb-6 rounded-r-lg">
                        <h4 className="font-black text-blue-900 text-xs uppercase mb-2">
                            💉 Vaccination Requise (J{data.age})
                        </h4>
                        <div className="space-y-2">
                            {dueVaccines.map((task) => (
                                <div
                                    key={task.id}
                                    className="flex items-center justify-between bg-white p-2 rounded border border-blue-100 shadow-sm min-h-[44px]"
                                >
                                    <span className="font-bold text-sm text-gray-700">
                                        {task.name}{" "}
                                        <span className="text-xs text-gray-500 font-normal block sm:inline">
                                            ({task.type})
                                        </span>
                                    </span>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-2">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
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
                                                                  id !==
                                                                  task.id,
                                                          ),
                                                );
                                            }}
                                        />
                                        <span className="font-medium text-gray-900">
                                            Fait
                                        </span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* GRILLE PARAMÈTRES VITAUX - Optimisé Mobile (2 cols max) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <div
                        className={`p-3 bg-${data.mortalite > 100 ? "red" : data.mortalite > 0 ? "orange" : "green"}-50 rounded-lg border border-${data.mortalite > 100 ? "red" : data.mortalite > 0 ? "orange" : "green"}-100`}
                    >
                        <label
                            className={`text-[10px] font-bold text-${data.mortalite > 100 ? "red" : data.mortalite > 0 ? "orange" : "green"}-400 uppercase block mb-1`}
                        >
                            Mortalité
                        </label>
                        <input
                            type="number"
                            className={`w-full bg-transparent text-xl font-black text-${data.mortalite > 100 ? "red-700" : data.mortalite > 0 ? "orange-700" : "green-700"} focus:outline-none placeholder-red-200 text-base`}
                            placeholder="0"
                            value={data.mortalite}
                            onChange={(e) =>
                                updateData(
                                    "mortalite",
                                    parseInt(e.target.value) || 0,
                                )
                            }
                        />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            Poids (g)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            className="w-full bg-transparent text-xl font-black text-gray-800 focus:outline-none text-base"
                            placeholder="0"
                            value={data.poidsMoyen}
                            onChange={(e) =>
                                updateData(
                                    "poidsMoyen",
                                    parseFloat(e.target.value) || 0,
                                )
                            }
                        />
                        <BenchmarkCard benchmark={benchmark} type="weight" />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            Conso (g/tête)
                        </label>
                        <input
                            type="number"
                            className="w-full bg-transparent text-xl font-black text-gray-800 focus:outline-none text-base"
                            placeholder="0"
                            value={data.consoTete}
                            onChange={(e) =>
                                updateData(
                                    "consoTete",
                                    parseFloat(e.target.value) || 0,
                                )
                            }
                        />
                        <BenchmarkCard benchmark={benchmark} type="feed" />
                    </div>
                    <div
                        className={`p-3 rounded-lg border flex flex-col justify-between transition-colors ${
                            isFirstObservation
                                ? "bg-gray-50 border-gray-200"
                                : "bg-blue-50 border-blue-100"
                        }`}
                    >
                        <div className="flex justify-between items-center mb-2 sm:mb-0">
                            <label
                                className={`text-[10px] font-bold uppercase block ${
                                    isFirstObservation
                                        ? "text-gray-400"
                                        : "text-blue-400"
                                }`}
                            >
                                Eau {isFirstObservation && "(Réf.)"}
                            </label>

                            <span
                                className={`text-[10px] font-black uppercase ${
                                    isFirstObservation
                                        ? "text-gray-500"
                                        : data.waterConsumptionIncrease === "no"
                                          ? "text-red-500"
                                          : "text-blue-700"
                                }`}
                            >
                                {isFirstObservation
                                    ? "🔒 Stable"
                                    : data.waterConsumptionIncrease === "yes"
                                      ? "En Hausse"
                                      : data.waterConsumptionIncrease === "stable"
                                        ? "Stable"
                                        : "En Baisse"}
                            </span>
                        </div>

                        <div className="flex gap-1 mt-1 h-8 sm:h-auto">
                            <button
                                type="button"
                                disabled={isFirstObservation}
                                onClick={() =>
                                    updateData(
                                        "waterConsumptionIncrease",
                                        "yes",
                                    )
                                }
                                className={`flex-1 rounded text-xs font-bold transition-colors flex items-center justify-center ${
                                    isFirstObservation
                                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                                        : data.waterConsumptionIncrease ===
                                            "yes"
                                          ? "bg-blue-600 text-white shadow-sm"
                                          : "bg-white text-blue-800 hover:bg-blue-100"
                                }`}
                            >
                                ↗️
                            </button>
                            <button
                                type="button"
                                disabled={isFirstObservation}
                                onClick={() =>
                                    updateData(
                                        "waterConsumptionIncrease",
                                        "stable",
                                    )
                                }
                                className={`flex-1 rounded text-xs font-bold transition-colors flex items-center justify-center ${
                                    isFirstObservation
                                        ? "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300"
                                        : data.waterConsumptionIncrease ===
                                            "stable"
                                          ? "bg-blue-600 text-white shadow-sm"
                                          : "bg-white text-blue-800 hover:bg-blue-100"
                                }`}
                            >
                                ➡️
                            </button>
                            <button
                                type="button"
                                disabled={isFirstObservation}
                                onClick={() =>
                                    updateData("waterConsumptionIncrease", "no")
                                }
                                className={`flex-1 rounded text-xs font-bold transition-colors flex items-center justify-center ${
                                    isFirstObservation
                                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                                        : data.waterConsumptionIncrease === "no"
                                          ? "bg-red-500 text-white shadow-sm"
                                          : "bg-white text-blue-800 hover:bg-red-50"
                                }`}
                            >
                                ↘️
                            </button>
                        </div>
                    </div>
                </div>

                {/* QUALITÉ & ENVIRONNEMENT - Optimisé 2 cols mobile */}
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 border-b pb-1">
                    Environnement
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            pH Eau
                        </label>
                        <select
                            className={`w-full p-2 border border-gray-200 rounded text-base sm:text-sm h-[40px] ${phFeedback.style}`}
                            value={data.phValue}
                            onChange={(e) =>
                                updateData("phValue", e.target.value)
                            }
                        >
                            <option value="">-- Mesure --</option>
                            {waterOptions.map((opt, idx) => (
                                <option key={idx} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                        <span
                            className={`text-[10px] text-gray-400 italic ${phFeedback.style}`}
                        >
                            {phFeedback.message || ""}
                        </span>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            Litière
                        </label>
                        <select
                            className={`w-full p-2 border border-gray-200 rounded text-base sm:text-sm h-[40px] ${litiereFeedback.style}`}
                            value={data.litiere}
                            onChange={(e) =>
                                updateData("litiere", e.target.value)
                            }
                        >
                            <option value="">-- État --</option>
                            <option value="Sèche / Friable">
                                ✅ Sèche
                            </option>
                            <option value="Légèrement Humide">
                                ⚠️ Humide
                            </option>
                            <option value="Collante / Détrempée">
                                🚨 Détrempée
                            </option>
                            <option value="Croûteuse">🚨 Croûteuse</option>
                        </select>
                        <span
                            className={`text-[10px] text-gray-400 italic ${litiereFeedback.style}`}
                        >
                            {litiereFeedback.message || ""}
                        </span>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            Uniformité
                        </label>
                        <select
                            className={`w-full p-2 border border-gray-200 rounded text-base sm:text-sm h-[40px] ${unifFeedback.style}`}
                            value={data.uniformite}
                            onChange={(e) =>
                                updateData("uniformite", e.target.value)
                            }
                        >
                            <option value="">-- % --</option>
                            <option value="> 90% (Excellent)">
                                🏆 &gt; 90%
                            </option>
                            <option value="80% - 90% (Bon)">
                                ✅ 80-90%
                            </option>
                            <option value="60% - 80% (Moyen)">
                                ⚠️ 60-80%
                            </option>
                            <option value="< 60% (Mauvais)">🚨 &lt; 60%</option>
                        </select>
                        <span
                            className={`text-[10px] text-gray-400 italic ${unifFeedback.style}`}
                        >
                            {unifFeedback.message || ""}
                        </span>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            CV (%)
                        </label>
                        <select
                            className={`w-full p-2 border border-gray-200 rounded text-base sm:text-sm h-[40px] ${cvFeedback.style}`}
                            value={data.cv}
                            onChange={(e) => updateData("cv", e.target.value)}
                        >
                            <option value="">-- Coeff --</option>
                            <option value="< 8 (Excellent)">🏆 &lt; 8</option>
                            <option value="8 - 10 (Bon)">✅ 8 - 10</option>
                            <option value="10 - 12 (Moyen)">⚠️ 10 - 12</option>
                            <option value="> 12 (Mauvais)">🚨 &gt; 12</option>
                        </select>
                        <span
                            className={`text-[10px] text-gray-400 italic ${cvFeedback.style}`}
                        >
                            {cvFeedback.message || ""}
                        </span>
                    </div>
                </div>

                {/* SECTION MATÉRIEL */}
                {!isFish && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* ABREUVOIRS */}
                        <div
                            className={`p-3 rounded-lg border transition-colors ${
                                data.abreuvoirs > 0 &&
                                (flock.subjectCount - data.mortalite) /
                                    data.abreuvoirs >
                                    80
                                    ? "bg-red-50 border-red-200"
                                    : "bg-blue-50 border-blue-200"
                            }`}
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start mb-1 gap-1 sm:gap-0">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">
                                    💧 Abreuvoirs
                                </label>
                                {data.abreuvoirs > 0 && (
                                    <span
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            (flock.subjectCount -
                                                data.mortalite) /
                                                data.abreuvoirs >
                                            80
                                                ? "bg-red-200 text-red-800"
                                                : "bg-white text-blue-800 border border-blue-100"
                                        }`}
                                    >
                                        1/{" "}
                                        {(
                                            (flock.subjectCount -
                                                data.mortalite) /
                                            data.abreuvoirs
                                        ).toFixed(0)}
                                    </span>
                                )}
                            </div>
                            <input
                                type="number"
                                className="w-full bg-transparent text-xl font-black text-gray-800 focus:outline-none placeholder-gray-300 text-base"
                                placeholder="0"
                                value={data.abreuvoirs}
                                onChange={(e) =>
                                    updateData(
                                        "abreuvoirs",
                                        parseInt(e.target.value) || 0,
                                    )
                                }
                            />
                        </div>

                        {/* MANGEOIRES */}
                        <div
                            className={`p-3 rounded-lg border transition-colors ${
                                data.mangeoires > 0 &&
                                (flock.subjectCount - data.mortalite) /
                                    data.mangeoires >
                                    55
                                    ? "bg-red-50 border-red-200"
                                    : "bg-orange-50 border-orange-200"
                            }`}
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start mb-1 gap-1 sm:gap-0">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">
                                    🍽️ Mangeoires
                                </label>
                                {data.mangeoires > 0 && (
                                    <span
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            (flock.subjectCount -
                                                data.mortalite) /
                                                data.mangeoires >
                                            55
                                                ? "bg-red-200 text-red-800"
                                                : "bg-white text-orange-800 border border-orange-100"
                                        }`}
                                    >
                                        1/{" "}
                                        {(
                                            (flock.subjectCount -
                                                data.mortalite) /
                                            data.mangeoires
                                        ).toFixed(0)}
                                    </span>
                                )}
                            </div>
                            <input
                                type="number"
                                className="w-full bg-transparent text-xl font-black text-gray-800 focus:outline-none placeholder-gray-300 text-base"
                                placeholder="0"
                                value={data.mangeoires}
                                onChange={(e) =>
                                    updateData(
                                        "mangeoires",
                                        parseInt(e.target.value) || 0,
                                    )
                                }
                            />
                        </div>
                    </div>
                )}

                {/* SECTION ALIMENTATION & LOGISTIQUE */}
                <div className="bg-orange-50 p-3 sm:p-4 rounded-xl border border-orange-200 mb-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <span className="text-6xl">🥣</span>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 relative z-10 gap-2 sm:gap-0">
                        <h4 className="text-sm font-black text-orange-900 uppercase">
                            Pilotage Alimentaire
                        </h4>
                        <span className="text-[10px] font-bold bg-white/50 px-2 py-1 rounded text-orange-800 border border-orange-100 self-start">
                            {feedStrategy === "INDUSTRIAL"
                                ? "Industriel"
                                : feedStrategy === "SELF_MIX"
                                  ? "Fabriqué"
                                  : "Vrac"}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 relative z-10">
                        <div>
                            <label className="block text-[10px] font-bold text-orange-800/60 uppercase mb-1">
                                Stratégie
                            </label>
                            <select
                                className="w-full border-gray-200 p-2 rounded text-base sm:text-sm bg-white focus:ring-2 focus:ring-orange-500 outline-none h-[44px]"
                                value={feedStrategy}
                                onChange={(e) =>
                                    handleStrategyChange(e.target.value as any)
                                }
                            >
                                <option value="INDUSTRIAL">
                                    🏭 Industriel (Aliment Complet)
                                </option>
                                {!isFish && (
                                    <option value="SELF_MIX">
                                        🏗️ Fabrication Ferme (Concentré/Soja)
                                    </option>
                                )}
                                <option value="THIRD_PARTY">
                                    🛒 Achat Vrac (Autres)
                                </option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-orange-800/60 uppercase mb-1">
                                {feedStrategy === "THIRD_PARTY"
                                    ? "Marque / Provenance"
                                    : "Formule Recommandée"}
                            </label>
                            {feedStrategy === "THIRD_PARTY" ? (
                                <input
                                    type="text"
                                    className="w-full border-orange-200 p-2 rounded text-base sm:text-sm bg-white h-[44px]"
                                    placeholder="Ex: Provenderie..."
                                    value={feedBrand}
                                    onChange={(e) =>
                                        setFeedBrand(e.target.value)
                                    }
                                />
                            ) : (
                                <select
                                    className={`w-full border p-2 rounded text-base sm:text-sm bg-white outline-none focus:ring-2 h-[44px] ${!feedBrand || (feedBrand && !feedBrand.includes(currentStage.split(" ")[0])) ? "border-orange-500 ring-orange-200 text-orange-900 font-bold" : "border-orange-200"}`}
                                    value={feedBrand}
                                    onChange={(e) =>
                                        setFeedBrand(e.target.value)
                                    }
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
                        </div>
                    </div>

                    {/* WIDGET CALCULATEUR DE SACS - Optimisé Mobile (Column) */}
                    {bagForecast.days > 0 && (
                        <div className="bg-white/80 p-3 rounded-lg border border-orange-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-100 p-2 rounded-full text-xl shrink-0">
                                    📅
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-orange-800 uppercase">
                                        Fin de phase {currentStage}
                                    </p>
                                    <p className="text-xs font-medium text-orange-900">
                                        Dans{" "}
                                        <strong>
                                            {bagForecast.days} jours
                                        </strong>{" "}
                                        (Besoin: {bagForecast.dailyKg} kg/j)
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-orange-50 px-4 py-2 rounded-lg border border-orange-100 w-full sm:w-auto justify-between sm:justify-start">
                                <p className="text-[10px] font-bold text-orange-400 uppercase sm:hidden">
                                    Prévision Commande
                                </p>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase hidden sm:block">
                                        Prévision Commande
                                    </p>
                                    <p className="text-lg font-black text-orange-600 leading-none">
                                        {bagForecast.bags}{" "}
                                        <span className="text-xs font-bold text-orange-400">
                                            Sacs
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* GESTION DES STOCKS (INVENTAIRE) */}
                    <div className="mt-4 pt-4 border-t border-orange-200/50 relative z-10">
                        {feedStrategy === "SELF_MIX" ? (
                            /* --- CAS 1 : FABRICATION À LA FERME --- */
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* MAÏS */}
                                <div className="bg-white p-2 rounded border border-yellow-200 shadow-sm">
                                    <label className="text-[10px] block font-bold text-yellow-600 uppercase mb-1">
                                        🌽 Maïs
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="+ Entrée"
                                                className="w-full text-base sm:text-xs p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-yellow-400 h-[40px] sm:h-auto"
                                                value={inventory.mais?.added || 0}
                                                onChange={(e) => updateInventory("mais", "added", parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="Stock"
                                                className="w-full text-base sm:text-xs font-bold p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-yellow-400 bg-yellow-50 text-yellow-900 h-[40px] sm:h-auto"
                                                value={inventory.mais?.current || 0}
                                                onChange={(e) => updateInventory("mais", "current", parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                                {/* SOJA */}
                                <div className="bg-white p-2 rounded border border-green-200 shadow-sm">
                                    <label className="text-[10px] block font-bold text-green-600 uppercase mb-1">
                                        🌱 Soja
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="+ Entrée"
                                                className="w-full text-base sm:text-xs p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-green-400 h-[40px] sm:h-auto"
                                                value={inventory.soja?.added || 0}
                                                onChange={(e) => updateInventory("soja", "added", parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="Stock"
                                                className="w-full text-base sm:text-xs font-bold p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-green-400 bg-green-50 text-green-900 h-[40px] sm:h-auto"
                                                value={inventory.soja?.current || 0}
                                                onChange={(e) => updateInventory("soja", "current", parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                                {/* CONCENTRÉ */}
                                <div className="bg-white p-2 rounded border border-indigo-200 shadow-sm">
                                    <label className="text-[10px] block font-bold text-indigo-600 uppercase mb-1">
                                        🧪 Concentré
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="+ Entrée"
                                                className="w-full text-base sm:text-xs p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-indigo-400 h-[40px] sm:h-auto"
                                                value={inventory.concentre?.added || 0}
                                                onChange={(e) => updateInventory("concentre", "added", parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                placeholder="Stock"
                                                className="w-full text-base sm:text-xs font-bold p-2 sm:p-1 border border-gray-200 rounded outline-none focus:border-indigo-400 bg-indigo-50 text-indigo-900 h-[40px] sm:h-auto"
                                                value={inventory.concentre?.current || 0}
                                                onChange={(e) => updateInventory("concentre", "current", parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* --- CAS 2 : INDUSTRIEL OU VRAC --- */
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-2 rounded border border-green-200">
                                    <label className="text-[10px] block font-bold text-green-600 uppercase">
                                        ➕ Arrivage (kg)
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full font-bold text-green-800 outline-none text-base"
                                        value={inventory.complete.added}
                                        onChange={(e) => updateInventory("complete", "added", parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="bg-white p-2 rounded border border-blue-200">
                                    <label className="text-[10px] block font-bold text-blue-600 uppercase">
                                        📦 Stock Actuel (kg)
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full font-bold text-blue-800 outline-none text-base"
                                        value={inventory.complete.current}
                                        onChange={(e) => updateInventory("complete", "current", parseFloat(e.target.value))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* INSIGHTS EXPERTS */}
                {liveInsights.length > 0 && (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6 animate-in slide-in-from-bottom-2">
                        <h4 className="text-xs font-black text-red-800 uppercase mb-3 flex items-center gap-2">
                            🚨 Analyse & Alertes
                        </h4>
                        <ul className="space-y-2">
                            {liveInsights.map((insight, idx) => (
                                <li
                                    key={idx}
                                    className={`text-xs p-3 sm:p-2 rounded border-l-4 flex gap-2 ${insight.type === "danger" ? "bg-white border-red-500 text-red-700 font-medium shadow-sm" : "bg-white/50 border-orange-400 text-orange-800"}`}
                                >
                                    <span className="shrink-0">
                                        {insight.type === "danger"
                                            ? "🛑"
                                            : "⚠️"}
                                    </span>
                                    <span>{insight.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* OBSERVATIONS & PROBLÈMES */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Observations Générales
                        </label>
                        <textarea
                            className="w-full border p-3 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            rows={2}
                            placeholder="Comportement, ambiance, notes..."
                            value={common.observation}
                            onChange={(e) =>
                                setCommon({
                                    ...common,
                                    observation: e.target.value,
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-green-600 uppercase mb-1">
                            Recommandations & Actions
                        </label>
                        <textarea
                            className="w-full border p-3 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 outline-none"
                            rows={3}
                            placeholder="Conseils donnés, traitements à appliquer, ajustements..."
                            value={common.recommendations}
                            onChange={(e) =>
                                setCommon({
                                    ...common,
                                    recommendations: e.target.value,
                                })
                            }
                        />
                    </div>

                    <div className="border border-red-100 rounded-lg overflow-hidden">
                        {existingOpenProblems.length > 0 && (
                            <div className="bg-orange-50 p-3 border-b border-orange-100">
                                <h5 className="text-xs font-bold text-orange-900 mb-2 uppercase">
                                    ⏳ Problèmes à résoudre
                                </h5>
                                <div className="space-y-2">
                                    {existingOpenProblems.map((p: any) => (
                                        <label
                                            key={p["@id"]}
                                            className={`flex items-start sm:items-center gap-2 text-xs p-3 sm:p-2 rounded border cursor-pointer hover:bg-white transition ${resolvedProblemIds.includes(p["@id"]) ? "bg-green-100 border-green-300 opacity-60" : "bg-white border-orange-200"}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 sm:w-4 sm:h-4 text-green-600 rounded mt-0.5 sm:mt-0"
                                                checked={resolvedProblemIds.includes(
                                                    p["@id"],
                                                )}
                                                onChange={() =>
                                                    toggleProblemResolution(
                                                        p["@id"],
                                                    )
                                                }
                                            />
                                            <span
                                                className={
                                                    resolvedProblemIds.includes(
                                                        p["@id"],
                                                    )
                                                        ? "line-through text-gray-500"
                                                        : "font-medium text-gray-800"
                                                }
                                            >
                                                {p.description}{" "}
                                                <span className="text-[10px] px-1 bg-gray-100 rounded text-gray-500 ml-1 block sm:inline mt-1 sm:mt-0 w-fit">
                                                    {p.severity}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-red-50 p-3">
                            <h5 className="text-xs font-bold text-red-900 mb-2 uppercase">
                                ⚡ Nouveau Problème ?
                            </h5>
                            {newProblems.length > 0 && (
                                <ul className="mb-3 space-y-2">
                                    {newProblems.map((p, idx) => (
                                        <li
                                            key={idx}
                                            className="flex justify-between items-center text-xs bg-white p-2 rounded border border-red-100 shadow-sm min-h-[40px]"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`w-2 h-2 rounded-full shrink-0 ${p.severity === "critical" ? "bg-red-600" : p.severity === "high" ? "bg-orange-500" : "bg-yellow-400"}`}
                                                />
                                                <span className="font-medium text-gray-700">
                                                    {p.description}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleRemoveProblem(idx)
                                                }
                                                className="text-red-400 hover:text-red-600 font-bold px-3 py-1"
                                            >
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="grid grid-cols-1 sm:flex gap-2">
                                <input
                                    type="text"
                                    className="w-full sm:flex-1 border-gray-200 p-2 rounded text-base sm:text-xs focus:ring-2 focus:ring-red-200 outline-none h-[44px] sm:h-auto"
                                    placeholder="Description du problème..."
                                    value={tempProblem.description}
                                    onChange={(e) =>
                                        setTempProblem({
                                            ...tempProblem,
                                            description: e.target.value,
                                        })
                                    }
                                />
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 sm:flex-none border-red-200 p-2 rounded text-base sm:text-xs bg-white h-[44px] sm:h-auto"
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
                                        className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 rounded shadow-sm h-[44px] sm:h-auto"
                                    >
                                        AJOUTER
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* PHOTOS */}
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        📸 Photos du lot
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-3 mb-3">
                        {photos.map((photo, idx) => (
                            <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-300 shadow-sm">
                                <img src={photo.content} alt="Preview" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => removePhoto(idx)}
                                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        
                        {/* Bouton d'ajout */}
                        <label className={`flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-gray-300 cursor-pointer hover:bg-gray-100 transition active:bg-gray-200 ${isCompressing ? 'opacity-50' : ''}`}>
                            <span className="text-3xl sm:text-2xl">📷</span>
                            <span className="text-xs sm:text-[10px] font-bold text-gray-500 mt-1">
                                {isCompressing ? '...' : 'Ajouter'}
                            </span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment"
                                className="hidden" 
                                onChange={handlePhotoAdd}
                                disabled={isCompressing}
                            />
                        </label>
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                        Les photos sont compressées automatiquement.
                    </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-6 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="w-full sm:w-auto px-6 py-4 sm:py-3 text-gray-500 font-bold text-sm hover:bg-gray-50 rounded-lg transition border border-transparent sm:border-transparent hover:border-gray-200"
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full sm:w-auto px-8 py-4 sm:py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-lg shadow-lg shadow-indigo-200 transition transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <span className="animate-spin">⏳</span>
                        ) : (
                            <span>ENREGISTRER LA VISITE</span>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};