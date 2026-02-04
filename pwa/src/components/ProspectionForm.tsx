"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSync } from "@/providers/SyncProvider";
import { compressImage } from "@/utils/imageCompressor";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProspectionForm() {
    const router = useRouter();
    const { addToQueue } = useSync();
    
    // --- ÉTATS ---
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeolocating, setIsGeolocating] = useState(false);

    // Données principales
    const [formData, setFormData] = useState({
        prospectName: "",
        phoneNumber: "",
        locationLabel: "",
        gpsCoordinates: "",
        concerns: "",
        expectations: "",
        interventionDone: false,
        interventionComments: "",
        appointmentTaken: false,
        appointmentDate: "",
        appointmentReason: "VISITE_FERME",
    });

    // Activités dynamiques
    const [activities, setActivities] = useState<{spec: string, bat: number, eff: number}[]>([]);
    const [tempAct, setTempAct] = useState({ spec: "Poulet de Chair", bat: 1, eff: 1000 });

    // Photos
    const [photos, setPhotos] = useState<{ content: string; filename: string }[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);

    // --- LOGIQUE DE VALIDATION ---
    const isStepValid = (currentStep: number) => {
        switch (currentStep) {
            case 1: // Contact
                return (
                    formData.prospectName.trim() !== "" &&
                    formData.phoneNumber.trim() !== "" &&
                    formData.locationLabel.trim() !== ""
                );
            case 2: // Activités
                return activities.length > 0;
            case 3: // Diagnostic
                const basicDiagnostic = formData.concerns.trim() !== "" && formData.expectations.trim() !== "";
                if (formData.interventionDone) {
                    return basicDiagnostic && formData.interventionComments.trim() !== "";
                }
                return basicDiagnostic;
            case 4: // Conclusion
                if (formData.appointmentTaken) {
                    return formData.appointmentDate.trim() !== "";
                }
                return true;
            default:
                return false;
        }
    };

    // --- HANDLERS ---
    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Géolocalisation
    const handleGeolocate = () => {
        setIsGeolocating(true);
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    updateField("gpsCoordinates", `${pos.coords.latitude}, ${pos.coords.longitude}`);
                    setIsGeolocating(false);
                    toast.success("Position GPS trouvée !");
                },
                (err) => {
                    toast.error("Erreur GPS: " + err.message);
                    setIsGeolocating(false);
                },
                { enableHighAccuracy: true }
            );
        } else {
            toast.error("GPS non supporté");
            setIsGeolocating(false);
        }
    };

    // Gestion Activités
    const addActivity = () => {
        setActivities([...activities, tempAct]);
        setTempAct({ spec: "Poulet de Chair", bat: 1, eff: 1000 });
        toast.success("Activité ajoutée");
    };
    const removeActivity = (idx: number) => {
        setActivities(activities.filter((_, i) => i !== idx));
    };

    // Gestion Photos
    const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsCompressing(true);
            try {
                const file = e.target.files[0];
                const compressed = await compressImage(file);
                setPhotos(prev => [...prev, { content: compressed, filename: file.name }]);
                toast.success("Photo ajoutée");
            } catch (e) {
                toast.error("Erreur photo");
            } finally {
                setIsCompressing(false);
            }
        }
    };

    // --- SOUMISSION ROBUSTE ---
    const handleSubmit = async () => {
        if (!isStepValid(4)) {
            return toast.error("Veuillez remplir les informations de rendez-vous ou décocher l'option.");
        }
        
        setIsSubmitting(true);
        const token = localStorage.getItem("sav_token");

        const formattedAppointmentDate = (formData.appointmentTaken && formData.appointmentDate)
            ? new Date(formData.appointmentDate).toISOString() // Convertit l'input datetime-local en ISO complet
            : null;

        const payload = {
            ...formData,
            date: new Date().toISOString(),
            farmDetails: activities,
            newPhotos: photos,
            technician: undefined,
            appointmentDate: formattedAppointmentDate
        };

        const url = "/prospections";
        const method = "POST";

        // 1. VÉRIFICATION PRÉALABLE HORS LIGNE
        if (!navigator.onLine) {
            addToQueue({ url, method, body: payload });
            toast("🌐 Mode Hors Ligne : Sauvegardé en attente !", {
                icon: "💾",
                style: { background: "#F59E0B", color: "#fff" }
            });
            router.push("/dashboard");
            return;
        }

        try {
            const res = await fetch(`${API_URL}${url}`, {
                method,
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            // 2. GESTION DES ERREURS API (4xx, 5xx)
            // Si le serveur répond (même avec une erreur), ce n'est PAS un problème réseau.
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                // On récupère le message d'erreur précis envoyé par l'API (ex: "Nom obligatoire")
                const errorMessage = errorData['hydra:description'] || errorData['description'] || errorData.message || `Erreur serveur (${res.status})`;
                throw new Error(errorMessage); 
            }

            toast.success("Prospection enregistrée avec succès ! 🚀");
            router.push("/dashboard");

        } catch (e: any) {
            console.error("Erreur soumission :", e);

            // 3. DISTINCTION CRITIQUE : RÉSEAU vs API
            // Un TypeError sur fetch indique généralement un échec de connexion (DNS, Timeout, Coupure)
            const isNetworkError = 
                e instanceof TypeError || 
                e.message === "Failed to fetch" || 
                e.message.includes("NetworkError");

            if (isNetworkError) {
                // -> C'est une vraie coupure : ON SAUVEGARDE EN LOCAL
                addToQueue({ url, method, body: payload });
                toast("⚠️ Connexion perdue pendant l'envoi. Sauvegardé en local.", {
                    icon: "📡",
                    duration: 5000
                });
                router.push("/dashboard");
            } else {
                // -> C'est une erreur de l'API (Validation, Doublon, etc.) : ON AFFICHE L'ERREUR
                // On ne redirige pas, pour laisser l'utilisateur corriger.
                toast.error(`❌ Échec : ${e.message}`, { duration: 5000 });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER ---
    return (
        <div className="max-w-md mx-auto bg-white min-h-screen sm:min-h-0 sm:rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Header Steps */}
            <div className="bg-indigo-900 p-4 text-white flex justify-between items-center">
                <h1 className="font-bold text-lg">Nouvelle Prospection</h1>
                <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className={`h-2 w-2 rounded-full ${step >= s ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6">
                
                {/* ÉTAPE 1: CONTACT */}
                {step === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">👤 Infos Contact</h2>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nom du Prospect *</label>
                            <input 
                                type="text" className="w-full border p-3 rounded-lg text-base mt-1" 
                                placeholder="Ex: M. Kouamé"
                                value={formData.prospectName}
                                onChange={e => updateField("prospectName", e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Téléphone *</label>
                            <input 
                                type="tel" className="w-full border p-3 rounded-lg text-base mt-1" 
                                placeholder="6..."
                                value={formData.phoneNumber}
                                onChange={e => updateField("phoneNumber", e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Localisation (Quartier/Village) *</label>
                            <input 
                                type="text" className="w-full border p-3 rounded-lg text-base mt-1" 
                                placeholder="Ex: Village Ndogbong"
                                value={formData.locationLabel}
                                onChange={e => updateField("locationLabel", e.target.value)}
                                required
                            />
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">GPS Exact</label>
                                <button 
                                    onClick={handleGeolocate} disabled={isGeolocating}
                                    className="bg-indigo-100 text-indigo-700 text-xs px-3 py-1 rounded-full font-bold"
                                >
                                    {isGeolocating ? '...' : '📍 Localiser'}
                                </button>
                            </div>
                            <input 
                                type="text" readOnly className="w-full bg-white border p-2 rounded text-xs text-gray-600"
                                value={formData.gpsCoordinates || "Non défini"}
                            />
                        </div>
                    </div>
                )}

                {/* ÉTAPE 2: ACTIVITÉS */}
                {step === 2 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">🚜 Ferme & Activités</h2>
                        
                        {/* Liste */}
                        {activities.length > 0 ? (
                            <div className="space-y-2">
                                {activities.map((act, i) => (
                                    <div key={i} className="flex justify-between items-center bg-green-50 p-3 rounded border border-green-100">
                                        <div>
                                            <p className="font-bold text-green-900 text-sm">{act.spec}</p>
                                            <p className="text-xs text-green-700">{act.bat} Bâtiment(s) • {act.eff} Sujets</p>
                                        </div>
                                        <button onClick={() => removeActivity(i)} className="text-red-400 font-bold px-2">×</button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-red-500 bg-red-50 p-3 rounded border border-red-100 italic text-center">
                                Veuillez ajouter au moins une activité pour continuer.
                            </div>
                        )}

                        {/* Ajout */}
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase">Ajouter une activité</h4>
                            <select 
                                className="w-full p-2 border rounded text-sm bg-white h-[44px]"
                                value={tempAct.spec}
                                onChange={e => setTempAct({...tempAct, spec: e.target.value})}
                            >
                                <option value="Poulet de Chair">🐔 Poulet de Chair</option>
                                <option value="Pondeuse">🥚 Pondeuse</option>
                                <option value="Porc">🐷 Porc</option>
                                <option value="Pisciculture">🐟 Pisciculture</option>
                                <option value="Autre">🌱 Autre</option>
                            </select>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-400 uppercase">Nb Bât.</label>
                                    <input 
                                        type="number" className="w-full p-2 border rounded text-sm h-[44px]"
                                        value={tempAct.bat || 1}
                                        onChange={e => setTempAct({...tempAct, bat: parseInt(e.target.value) || 0})}
                                        min={1}
                                        max={1}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-400 uppercase">Effectif</label>
                                    <input 
                                        type="number" className="w-full p-2 border rounded text-sm h-[44px]"
                                        value={tempAct.eff}
                                        onChange={e => setTempAct({...tempAct, eff: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={addActivity}
                                className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg text-sm shadow-sm active:scale-95 transition"
                            >
                                + Ajouter
                            </button>
                        </div>
                    </div>
                )}

                {/* ÉTAPE 3: DIAGNOSTIC */}
                {step === 3 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">📋 Diagnostic</h2>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Préoccupations / Problèmes *</label>
                            <textarea 
                                className="w-full border p-3 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-indigo-200"
                                rows={3}
                                placeholder="De quoi se plaint le prospect ?"
                                value={formData.concerns}
                                onChange={e => updateField("concerns", e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Attentes *</label>
                            <textarea 
                                className="w-full border p-3 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-indigo-200"
                                rows={2}
                                placeholder="Que veut-il ?"
                                value={formData.expectations}
                                onChange={e => updateField("expectations", e.target.value)}
                                required
                            />
                        </div>

                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                            <label className="flex items-center gap-3">
                                <input 
                                    type="checkbox" className="w-5 h-5 text-orange-600 rounded"
                                    checked={formData.interventionDone}
                                    onChange={e => updateField("interventionDone", e.target.checked)}
                                />
                                <span className="text-sm font-bold text-orange-900">Une intervention a été faite ?</span>
                            </label>
                            
                            {formData.interventionDone && (
                                <textarea 
                                    className="w-full border border-orange-200 p-2 rounded text-sm mt-3 bg-white"
                                    rows={2}
                                    placeholder="Détails de l'intervention technique... *"
                                    value={formData.interventionComments}
                                    onChange={e => updateField("interventionComments", e.target.value)}
                                    required={formData.interventionDone}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* ÉTAPE 4: CONCLUSION */}
                {step === 4 && (
                    <div className="space-y-6 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">🏁 Conclusion</h2>

                        {/* Rendez-vous */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <label className="flex items-center gap-3 mb-3">
                                <input 
                                    type="checkbox" className="w-5 h-5 text-blue-600 rounded"
                                    checked={formData.appointmentTaken}
                                    onChange={e => updateField("appointmentTaken", e.target.checked)}
                                />
                                <span className="text-sm font-bold text-blue-900">Rendez-vous pris ?</span>
                            </label>
                            
                            {formData.appointmentTaken && (
                                <div className="space-y-3 pl-1">
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-400 uppercase">Date & Heure *</label>
                                        <input 
                                            type="datetime-local" 
                                            className="w-full p-2 border border-blue-200 rounded text-sm bg-white"
                                            value={formData.appointmentDate}
                                            onChange={e => updateField("appointmentDate", e.target.value)}
                                            required={formData.appointmentTaken}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-400 uppercase">Motif</label>
                                        <select 
                                            className="w-full p-2 border border-blue-200 rounded text-sm bg-white h-[44px]"
                                            value={formData.appointmentReason}
                                            onChange={e => updateField("appointmentReason", e.target.value)}
                                            required={formData.appointmentTaken}
                                        >
                                            <option value="VISITE_FERME">Visite Ferme Complète</option>
                                            <option value="NOUVELLE_CONSULTATION">Nouvelle Consultation</option>
                                            <option value="LIVRAISON">Livraison</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Photos */}
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                📸 Photos ({photos.length})
                            </h4>
                            <div className="grid grid-cols-3 gap-2">
                                {photos.map((p, i) => (
                                    <div key={i} className="relative aspect-square rounded overflow-hidden">
                                        <img src={p.content} className="w-full h-full object-cover" alt="preview" />
                                    </div>
                                ))}
                                <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded cursor-pointer hover:bg-white transition">
                                    <span className="text-2xl">📷</span>
                                    <input 
                                        type="file" accept="image/*" capture="environment" 
                                        className="hidden" onChange={handlePhotoAdd} disabled={isCompressing}
                                    />
                                </label>
                            </div>
                        </div>

                        <button 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || !isStepValid(4)}
                            className={`w-full font-black py-4 rounded-xl shadow-lg transition active:scale-95
                                ${!isStepValid(4) || isSubmitting 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'}
                            `}
                        >
                            {isSubmitting ? 'Enregistrement...' : 'VALIDER LA PROSPECTION'}
                        </button>
                    </div>
                )}
            </div>

            {/* Navigation Steps */}
            <div className="p-4 border-t bg-gray-50 flex gap-3">
                {step > 1 && (
                    <button 
                        onClick={() => setStep(step - 1)}
                        className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-lg shadow-sm"
                    >
                        Retour
                    </button>
                )}
                {step < 4 && (
                    <button 
                        onClick={() => setStep(step + 1)}
                        disabled={!isStepValid(step)}
                        className={`flex-1 py-3 font-bold rounded-lg shadow-sm text-white transition-colors
                            ${!isStepValid(step) 
                                ? 'bg-gray-300 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700'}
                        `}
                    >
                        Suivant
                    </button>
                )}
                <button onClick={()=> router.push('/dashboard/prospections')}
                    className="flex-1 py-3 bg-gray-50 border border-gray-100 text-gray-800 font-bold rounded-lg shadow-sm">Fermer</button>
            </div>
        </div>
    );
}