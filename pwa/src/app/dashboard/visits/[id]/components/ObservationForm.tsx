"use client";
import { useState, useEffect, useMemo } from "react";
import { useSync } from "@/providers/SyncProvider";
import toast from "react-hot-toast";
import {
    API_URL,
    calculateAgeInDays,
    getPreviousWeight,
    ProphylaxisTask,
    Problem,
} from "../shared";

// Types & Validation
import { ObservationData, CommonData, SupplyData } from "./types";
import {
    validateStepVital,
    validateStepEnvironment,
    validateStepEquipment,
    validateStepFeeding,
    validateStepSupply,
    ValidationErrors,
    validateStepProblems,
} from "./validation";

// Steps
import { StepVitalParameters } from "./steps/StepVitalParameters";
import { StepEnvironment } from "./steps/StepEnvironment";
import { StepEquipment } from "./steps/StepEquipment";
import { StepSupply } from "./steps/StepSupply";
import { StepFeeding } from "./steps/StepFeeding";
import { StepProblems } from "./steps/StepProblems";
import { StepPhotos } from "./steps/StepPhotos";
import { StepSummary } from "./steps/StepSummary";
import { HistoryModal } from "./HistoryModal";

interface ObservationFormProps {
    visitIri: string;
    flock: any;
    building: any;
    visit: any;
    initialData?: any;
    onSuccess: () => void;
    onCancel: () => void;
}

// ✅ Fonction utilitaire pour récupérer la supply initiale
const getInitialSupply = (
    initialData: any,
    lastObservation: any,
    flock: any,
): SupplyData => {
    // 1. Priorité aux données d'édition
    if (initialData?.data?.supply) {
        return initialData.data.supply;
    }

    // 2. Sinon dernière observation du même lot
    if (lastObservation?.data?.supply) {
        const lastSupply = lastObservation.data.supply;
        return {
            ...lastSupply,
            // Réinitialiser la précommande car c'est une nouvelle visite
            hasPreOrder: false,
            preOrderItems: [],
            plannedPurchaseDate: undefined,
            // Garder les agences si c'était une agence
            agency:
                lastSupply.source === "AGENCE" ? lastSupply.agency : undefined,
        };
    }

    // 3. Sinon valeur par défaut basée sur le flock
    return {
        source: "AGENCE",
        agency: { agencies: [] },
        hasPreOrder: false,
        preOrderItems: [],
    };
};

export const ObservationForm = ({
    visitIri,
    flock,
    building,
    visit,
    initialData,
    onSuccess,
    onCancel,
}: ObservationFormProps) => {
    const { addToQueue } = useSync();
    const [loading, setLoading] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const isEditMode = !!initialData?.id;

    // Navigation
    const [currentStep, setCurrentStep] = useState(0);
    const [stepErrors, setStepErrors] = useState<ValidationErrors>({});

    // Contexte
    const specName = flock.speculation?.name?.toLowerCase() || "";
    const isFish =
        specName.includes("pisciculture") || specName.includes("poisson");

    // ✅ État pour stocker la dernière observation
    const [lastObservation, setLastObservation] = useState<any>(null);

    // ✅ État pour le modal d'historique
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Données
    const [data, setData] = useState<ObservationData>({
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
        vaccinesDone:
            initialData?.data?.vaccinesDone ||
            lastObservation?.data?.vaccinesDone ||
            [],
        feedStrategy:
            initialData?.data?.feedStrategy ||
            flock.feedStrategy ||
            "INDUSTRIAL",
        feedBrand: initialData?.data?.feedBrand || flock.feedFormula || "",
        inventory: initialData?.data?.inventory || {
            complete: { current: 0, added: 0 },
            mais: { current: 0, added: 0 },
            soja: { current: 0, added: 0 },
            concentre: { current: 0, added: 0 },
        },
        // ✅ Supply sera initialisée après récupération des données
        supply: {
            source: "AGENCE",
            agency: { agencies: [] },
            hasPreOrder: false,
            preOrderItems: [],
        },
    });

    useEffect(() => {
        if (!isLoadingData && lastObservation && !initialData) {
            const previousVaccinesDone =
                lastObservation.data?.vaccinesDone || [];
            console.log(
                "Vaccins déjà faits (obs précédente):",
                previousVaccinesDone,
            );

            setData((prev) => ({
                ...prev,
                vaccinesDone: previousVaccinesDone,
            }));
        }
    }, [isLoadingData, lastObservation, initialData]);

    const [common, setCommon] = useState<CommonData>({
        concerns: initialData?.concerns || "",
        observation: initialData?.observation || "",
        recommendations: initialData?.recommendations || "",
    });

    // Problèmes
    const [existingOpenProblems, setExistingOpenProblems] = useState<Problem[]>(
        [],
    );
    const [newProblems, setNewProblems] = useState<Partial<Problem>[]>(
        initialData?.detectedProblems || [],
    );
    const [resolvedProblemIds, setResolvedProblemIds] = useState<string[]>(
        initialData?.resolvedProblems?.map((p: any) => p["@id"]) || [],
    );

    // Photos
    const [photos, setPhotos] = useState<
        { content: string; filename: string }[]
    >([]);
    const [isCompressing, setIsCompressing] = useState(false);

    // Vaccins & Historique
    const [vaccines, setVaccines] = useState<ProphylaxisTask[]>([]);
    const [dueVaccines, setDueVaccines] = useState<ProphylaxisTask[]>([]);
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(
        null,
    );
    const [showHistory, setShowHistory] = useState(false);

    const isFirstObservation = historyList.length === 0;

    // Calculs
    const displayedHistory = useMemo(
        () => historyList.find((h) => h.id == selectedHistoryId),
        [historyList, selectedHistoryId],
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
            return { bags: 0, dailyKg: "0", days: 0 };

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

    // ✅ Chargement des données avec récupération de la dernière supply
    useEffect(() => {
        const fetchData = async () => {
            setIsLoadingData(true);
            if (!navigator.onLine) {
                setIsLoadingData(false);
                return;
            }

            const token = localStorage.getItem("sav_token");

            // 1. Récupérer l'historique ET la dernière observation
            try {
                const flockIri = flock["@id"] || `/api/flocks/${flock.id}`;
                const res = await fetch(
                    `${API_URL}/observations?flock=${encodeURIComponent(flockIri)}&order[observedAt]=desc`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/ld+json",
                        },
                    },
                );
                if (res.ok) {
                    const d = await res.json();
                    // ✅ Filtrer l'observation en cours si on est en mode édition
                    const list = (d["hydra:member"] || d["member"] || []).filter(
                        (obs: any) => obs.id !== initialData?.id
                    );
                    setHistoryList(list);
                    console.log("Historique chargé:", list.length, list);

                    if (list.length > 0) {
                        setSelectedHistoryId(list[0].id);
                        setLastObservation(list[0]);
                    }
                }
            } catch (e) {
                console.error("Erreur historique", e);
            }

            // 2. Problèmes
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
                    let problems = d["hydra:member"] || d["member"] || [];
                    if (isEditMode && initialData?.resolvedProblems) {
                        const resolvedIds = initialData.resolvedProblems.map(
                            (p: any) => p["@id"],
                        );
                        problems = problems.filter(
                            (p: any) => !resolvedIds.includes(p["@id"]),
                        );
                        problems = [
                            ...problems,
                            ...initialData.resolvedProblems,
                        ];
                    }
                    setExistingOpenProblems(problems);
                }
            } catch (e) {
                console.error("Erreur problèmes", e);
            }

            // 3. Vaccins
            if (flock.speculation?.["@id"] || flock.speculation?.id) {
                try {
                    const speculationIri = flock.speculation["@id"]; // "/api/speculations/2"

                    const res = await fetch(
                        `${API_URL}/prophylaxis_tasks?speculation=${speculationIri}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: "application/ld+json",
                            },
                        },
                    );

                    if (res.ok) {
                        const d = await res.json();
                        const loadedVaccines =
                            d["hydra:member"] || d["member"] || [];

                        // ✅ FILTRAGE CÔTÉ CLIENT NÉCESSAIRE car l'API ne filtre pas bien
                        const filteredVaccines = loadedVaccines.filter(
                            (v: ProphylaxisTask) => {
                                return v.speculation === speculationIri;
                            },
                        );
                        setVaccines(filteredVaccines);
                    }
                } catch (e) {
                    console.error("Erreur vaccins", e);
                }
            }
            setIsLoadingData(false);
        };

        fetchData();
    }, [flock, isEditMode, initialData]);

    // ✅ Initialiser la supply une fois les données chargées
    useEffect(() => {
        if (!isLoadingData) {
            const initialSupply = getInitialSupply(
                initialData,
                lastObservation,
                flock,
            );
            setData((prev) => ({
                ...prev,
                supply: initialSupply,
            }));
        }
    }, [isLoadingData, initialData, lastObservation, flock]);

    // Helpers
    const updateData = (key: string, value: any) => {
        setData((prev) => ({ ...prev, [key]: value }));
        if (stepErrors[key]) {
            setStepErrors((prev) => {
                const n = { ...prev };
                delete n[key];
                return n;
            });
        }
    };

    const updateInventory = (
        type: string,
        field: "current" | "added",
        value: number,
    ) => {
        setData((prev) => ({
            ...prev,
            inventory: {
                ...prev.inventory,
                [type]: { ...prev.inventory[type], [field]: value },
            },
        }));
    };

    const updateSupply = (supplyUpdates: Partial<SupplyData>) => {
        setData((prev) => ({
            ...prev,
            supply: { ...prev.supply, ...supplyUpdates },
        }));
    };

    const toggleProblemResolution = (id: string) => {
        setResolvedProblemIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    // Validation
    const validateCurrentStep = (): boolean => {
        let errors: ValidationErrors = {};

        switch (currentStep) {
            case 0:
                errors = validateStepVital(data);
                break;
            case 1:
                errors = validateStepEnvironment(data);
                break;
            case 2:
                if (!isFish) errors = validateStepEquipment(data, isFish);
                break;
            case 3:
                errors = validateStepSupply(data);
                break;
            case 4:
                errors = validateStepFeeding(data);
                break;
            case 5:
                errors = validateStepProblems(common);
                break;
            default:
                return true;
        }

        setStepErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const density = useMemo(() => {
        if (!building?.surface || building.surface <= 0) return 0;
        const remaining = flock.subjectCount - data.mortalite;
        return remaining / building.surface;
    }, [building?.surface, flock.subjectCount, data.mortalite]);

    // Navigation
    const handleNext = () => {
        if (validateCurrentStep()) {
            if (currentStep === 1 && isFish) {
                setCurrentStep(3);
            } else {
                setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
            }
        } else {
            toast.error("Veuillez corriger les erreurs avant de continuer");
        }
    };

    const handlePrev = () => {
        if (currentStep === 3 && isFish) {
            setCurrentStep(1);
        } else {
            setCurrentStep((prev) => Math.max(prev - 1, 0));
        }
    };

    // Fonction pour éditer une étape spécifique depuis le summary
    const handleEditStep = (stepIndex: number) => {
        // Ajuster l'index si poisson (saut de l'étape equipment)
        if (isFish && stepIndex >= 2) {
            setCurrentStep(stepIndex + 1);
        } else {
            setCurrentStep(stepIndex);
        }
    };

    // Sauvegarde
    const [showCorrectionModal, setShowCorrectionModal] = useState(false);
    const [correctionReason, setCorrectionReason] = useState("");
    const [previousWeight, setPreviousWeight] = useState(0);

    useEffect(() => {
        setPreviousWeight(getPreviousWeight(flock, initialData?.id));
    }, [flock, initialData]);

    const saveObservation = async () => {
        const token = localStorage.getItem("sav_token");
        if (!token && navigator.onLine) {
            toast.error("⚠️ Session expirée");
            return;
        }

        const finalData = {
            ...data,
            weightCorrection: correctionReason
                ? {
                      ticketId: `TKT-${Date.now()}`,
                      reason: correctionReason,
                      previous: previousWeight,
                      declared: data.poidsMoyen,
                  }
                : null,
        };

        const observationIri = isEditMode
            ? `/api/observations/${initialData.id}`
            : null;

        const problemsForApi = newProblems.map((p: any) => {
            // Si c'est un problème existant (a un @id)
            if (p["@id"]) {
                // ✅ On ne renvoie que l'IRI pour les problèmes existants
                // Pas besoin de les mettre à jour, ils sont déjà liés
                return p["@id"];
            }
            // Si c'est un nouveau problème
            return {
                description: p.description,
                severity: p.severity,
                status: "open",
                detectedIn: observationIri, // Requis pour PATCH
            };
        });

        const body = {
            visit: visitIri,
            flock: flock["@id"],
            observedAt: initialData?.observedAt || new Date().toISOString(),
            ...common,
            detectedProblems: problemsForApi,
            resolvedProblems: resolvedProblemIds,
            data: finalData,
            newPhotos: photos,
        };

        const url = isEditMode
            ? `/observations/${initialData!.id}`
            : `/observations`;
        const method = isEditMode ? "PATCH" : "POST";

        if (!navigator.onLine) {
            addToQueue({ url, method, body });
            toast("🌐 Hors ligne : Mis en file d'attente", { icon: "🌐" });
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
                const errorData = await res.json().catch(() => ({}));
                console.error("Erreur API:", errorData);
                throw new Error(errorData.detail || "Erreur serveur");
            }

            toast.success("Observation enregistrée !");
            onSuccess();
        } catch (e: any) {
            if (!navigator.onLine) {
                addToQueue({ url, method, body });
                onSuccess();
            } else {
                toast.error(`Échec : ${e.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (data.poidsMoyen <= 0) {
            toast.error("⛔ Poids invalide");
            return;
        }
        if (previousWeight > 0 && data.poidsMoyen < previousWeight) {
            const drop =
                ((previousWeight - data.poidsMoyen) / previousWeight) * 100;
            if (drop > 10) {
                setShowCorrectionModal(true);
                return;
            }
        }
        await saveObservation();
    };

    // Configuration étapes
    const steps = [
        { id: "vital", title: "Paramètres vitaux" },
        { id: "environment", title: "Environnement" },
        { id: "equipment", title: "Matériel" },
        { id: "supply", title: "Approvisionnement" },
        { id: "feeding", title: "Alimentation" },
        { id: "problems", title: "Problèmes" },
        { id: "photos", title: "Photos" },
        { id: "summary", title: "Sommaire" },
    ];

    // ✅ Affichage d'un loader pendant le chargement initial
    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // Render
    return (
        <div className="relative space-y-4 max-w-2xl mx-auto">
            {/* Header */}
            <div className="bg-indigo-900 p-4 rounded-xl text-white">
                <div className="flex justify-between items-center mb-3">
                    <div>
                        <h2 className="text-xl font-bold">{flock.name}</h2>
                        <p className="text-sm opacity-80">
                            {specName} • J{data.age}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black">
                            {currentStep + 1}
                        </span>
                        <span className="text-sm opacity-60">
                            /{steps.length}
                        </span>
                    </div>
                </div>

                <div className="flex gap-1">
                    {steps.map((step, idx) => (
                        <div
                            key={step.id}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                                idx < currentStep
                                    ? "bg-green-400"
                                    : idx === currentStep
                                      ? "bg-white"
                                      : "bg-white/20"
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* Modal correction */}
            {showCorrectionModal && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white p-6 rounded-xl border-4 border-red-500 shadow-2xl">
                        <p className="text-red-700 font-black text-xl mb-4 text-center">
                            🚨 ANOMALIE POIDS (-10%)
                        </p>
                        <textarea
                            className="w-full border-2 border-red-300 p-3 rounded mb-4"
                            rows={3}
                            placeholder="Justification requise..."
                            value={correctionReason}
                            onChange={(e) =>
                                setCorrectionReason(e.target.value)
                            }
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCorrectionModal(false)}
                                className="flex-1 py-3 bg-gray-200 rounded font-bold"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() =>
                                    correctionReason && saveObservation()
                                }
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded"
                            >
                                VALIDER
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal d'historique */}
            {showHistoryModal && selectedHistoryItem && (
                <HistoryModal
                    history={selectedHistoryItem}
                    onClose={() => {
                        setShowHistoryModal(false);
                        setSelectedHistoryItem(null);
                    }}
                />
            )}

            {/* Contenu étape */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                {currentStep === 0 && (
                    <StepVitalParameters
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                        vaccines={vaccines}
                        dueVaccines={dueVaccines}
                        setDueVaccines={setDueVaccines}
                        historyList={historyList}
                        selectedHistoryId={selectedHistoryId}
                        setSelectedHistoryId={setSelectedHistoryId}
                        showHistory={showHistory}
                        setShowHistory={setShowHistory}
                        displayedHistory={displayedHistory}
                        onViewHistoryDetail={(history) => {
                            setSelectedHistoryItem(history);
                            setShowHistoryModal(true);
                        }}
                    />
                )}

                {currentStep === 1 && (
                    <StepEnvironment
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                    />
                )}

                {currentStep === 2 && !isFish && (
                    <StepEquipment
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        building={building}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                    />
                )}

                {currentStep === 3 && (
                    <StepSupply
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                        supply={data.supply}
                        updateSupply={updateSupply}
                        // ✅ Indiquer si on utilise une supply précédente
                        isFromLastObservation={
                            !!lastObservation?.data?.supply &&
                            !initialData?.data?.supply
                        }
                    />
                )}

                {currentStep === 4 && (
                    <StepFeeding
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                        feedStrategy={data.feedStrategy}
                        setFeedStrategy={(s) => updateData("feedStrategy", s)}
                        feedBrand={data.feedBrand}
                        setFeedBrand={(b) => updateData("feedBrand", b)}
                        inventory={data.inventory}
                        updateInventory={updateInventory}
                        bagForecast={bagForecast}
                        supply={data.supply}
                    />
                )}

                {currentStep === 5 && (
                    <StepProblems
                        common={common}
                        setCommon={setCommon}
                        existingOpenProblems={existingOpenProblems}
                        newProblems={newProblems}
                        setNewProblems={setNewProblems}
                        resolvedProblemIds={resolvedProblemIds}
                        toggleProblemResolution={toggleProblemResolution}
                        isEditMode={isEditMode}
                        errors={stepErrors}
                        isValid={Object.keys(stepErrors).length === 0}
                    />
                )}

                {currentStep === 6 && (
                    <StepPhotos
                        photos={photos}
                        setPhotos={setPhotos}
                        isCompressing={isCompressing}
                        setIsCompressing={setIsCompressing}
                    />
                )}

                {currentStep === 7 && (
                    <StepSummary
                        data={data}
                        updateData={updateData}
                        flock={flock}
                        isFirstObservation={isFirstObservation}
                        isValid={Object.keys(stepErrors).length === 0}
                        errors={stepErrors}
                        common={common}
                        newProblems={newProblems}
                        existingOpenProblems={existingOpenProblems}
                        resolvedProblemIds={resolvedProblemIds}
                        photos={photos}
                        dueVaccines={dueVaccines}
                        totalMortalite={data.mortalite}
                        density={density}
                        onConfirm={handleSubmit}
                        onEditStep={handleEditStep}
                    />
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-3">
                <button
                    type="button"
                    onClick={currentStep === 0 ? onCancel : handlePrev}
                    className="px-6 py-3 text-gray-600 font-bold rounded-lg hover:bg-gray-100 transition"
                >
                    {currentStep === 0 ? "Annuler" : "← Précédent"}
                </button>

                {currentStep < steps.length - 1 ? (
                    <button
                        type="button"
                        onClick={handleNext}
                        className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition"
                    >
                        {currentStep === steps.length - 2
                            ? "Voir le récapitulatif →"
                            : "Suivant →"}
                    </button>
                ) : (
                    // Plus de bouton ici, la confirmation est dans StepSummary
                    <div />
                )}
            </div>
        </div>
    );
};