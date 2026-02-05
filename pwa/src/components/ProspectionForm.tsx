"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Select from "react-select";
import { useSync } from "@/providers/SyncProvider";
import { compressImage } from "@/utils/imageCompressor";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Customer {
    id: string | number;
    '@id': string;
    name: string;
    phoneNumber: string;
    zone: string;
    exactLocation?: string;
    status?: string;
}

export default function ProspectionForm() {
    const router = useRouter();
    const { addToQueue } = useSync();
    
    // --- ÉTATS NAVIGATION & MODE ---
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mode, setMode] = useState<'PROSPECTION' | 'CONSULTATION'>('PROSPECTION');

    // --- ÉTATS CLIENTS ---
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [newClientData, setNewClientData] = useState({ name: '', phone: '', zone: '', gps: '' });
    const [isGeolocating, setIsGeolocating] = useState(false);

    // --- DONNÉES MÉTIER (ÉTAPE 2, 3, 4) ---
    // Note: Les infos nom/tel sont maintenant dans 'selectedCustomer'
    const [formData, setFormData] = useState({
        concerns: "",
        expectations: "",
        interventionDone: false,
        interventionComments: "",
        appointmentTaken: false,
        appointmentDate: "",
        appointmentReason: "VISITE_FERME",
    });

    const [activities, setActivities] = useState<{spec: string, bat: number, eff: number}[]>([]);
    const [tempAct, setTempAct] = useState({ spec: "Poulet de Chair", bat: 1, eff: 1000 });
    const [photos, setPhotos] = useState<{ content: string; filename: string }[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);

    // 1. CHARGEMENT CLIENTS
    useEffect(() => {
        const fetchCustomers = async () => {
            if (!navigator.onLine) return;
            try {
                const token = localStorage.getItem("sav_token");
                const res = await fetch(`${API_URL}/customers?pagination=false`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCustomers(data['hydra:member'] || data['member'] || []);
                }
            } catch (e) { console.error("Erreur chargement clients", e); }
        };
        fetchCustomers();
    }, []);

    // 2. CRÉATION CLIENT / PROSPECT (MODAL)
    const handleCreateClient = async () => {
        if (!newClientData.name || !newClientData.phone || !newClientData.zone) {
            toast.error("Veuillez remplir Nom, Téléphone et Zone.");
            return;
        }

        const duplicate = customers.find(c => c.phoneNumber === newClientData.phone);
        if (duplicate) {
            toast.error(`Numéro déjà utilisé par : ${duplicate.name}`);
            return;
        }

        try {
            const token = localStorage.getItem("sav_token");
            
            // LOGIQUE DE STATUT :
            // Si on est en mode "Prospection", on crée un "PROSPECT".
            // Si on est en "Consultation", on peut aussi créer un "PROSPECT" (consultation avant-vente).
            const status = 'PROSPECT'; 

            const res = await fetch(`${API_URL}/customers`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newClientData.name,
                    phoneNumber: newClientData.phone,
                    zone: newClientData.zone,
                    exactLocation: newClientData.gps,
                    activated: true,
                    status: status
                })
            });

            if (!res.ok) throw new Error("Erreur création fiche");
            
            const createdClient = await res.json();
            
            // Mise à jour locale
            const newObj = {
                id: createdClient.id,
                '@id': createdClient['@id'],
                name: createdClient.name,
                phoneNumber: createdClient.phoneNumber,
                zone: createdClient.zone,
                exactLocation: createdClient.exactLocation,
                status: status
            };

            setCustomers(prev => [...prev, newObj]);
            // Sélection automatique
            setSelectedCustomer({ value: newObj['@id'], label: `${newObj.name} (${newObj.phoneNumber})`, customer: newObj });
            setIsClientModalOpen(false);
            setNewClientData({ name: '', phone: '', zone: '', gps: '' });
            toast.success("Fiche créée et sélectionnée !");

        } catch (e) {
            toast.error("Impossible de créer la fiche (Erreur API)");
        }
    };

    // Géolocalisation (pour la fiche client)
    const handleGeolocate = () => {
        setIsGeolocating(true);
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setNewClientData(prev => ({ ...prev, gps: `${pos.coords.latitude}, ${pos.coords.longitude}` }));
                    setIsGeolocating(false);
                    toast.success("GPS trouvé !");
                },
                () => { toast.error("Erreur GPS"); setIsGeolocating(false); }
            );
        } else {
            setIsGeolocating(false);
        }
    };

    // --- HANDLERS ÉTAPES SUIVANTES ---
    const addActivity = () => {
        setActivities([...activities, tempAct]);
        setTempAct({ spec: "Poulet de Chair", bat: 1, eff: 1000 });
        toast.success("Activité ajoutée");
    };
    const removeActivity = (idx: number) => setActivities(activities.filter((_, i) => i !== idx));

    const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsCompressing(true);
            try {
                const file = e.target.files[0];
                const compressed = await compressImage(file);
                setPhotos(prev => [...prev, { content: compressed, filename: file.name }]);
            } catch (e) { toast.error("Erreur photo"); } 
            finally { setIsCompressing(false); }
        }
    };

    const updateField = (field: string, value: any) => setFormData(p => ({ ...p, [field]: value }));

    // VALIDATION
    const isStepValid = (currentStep: number) => {
        if (currentStep === 1) return !!selectedCustomer; // Client obligatoire
        if (currentStep === 2) return activities.length > 0;
        if (currentStep === 3) {
            const diag = formData.concerns.trim() !== "" && formData.expectations.trim() !== "";
            if (formData.interventionDone) return diag && formData.interventionComments.trim() !== "";
            return diag;
        }
        if (currentStep === 4) {
            if (formData.appointmentTaken) return formData.appointmentDate.trim() !== "";
            return true;
        }
        return false;
    };

    // --- SOUMISSION FINALE ---
    const handleSubmit = async () => {
        if (!isStepValid(4)) return toast.error("Formulaire incomplet.");
        setIsSubmitting(true);
        
        const token = localStorage.getItem("sav_token");
        
        // Aiguillage Endpoint
        const endpoint = mode === 'CONSULTATION' ? '/consultations' : '/prospections';
        
        // Préparation Payload
        const commonPayload = {
            date: new Date().toISOString(),
            farmDetails: activities,
            concerns: formData.concerns,
            expectations: formData.expectations,
            interventionDone: formData.interventionDone,
            interventionComments: formData.interventionComments,
            appointmentTaken: formData.appointmentTaken,
            appointmentDate: formData.appointmentTaken && formData.appointmentDate ? new Date(formData.appointmentDate).toISOString() : null,
            appointmentReason: formData.appointmentReason,
            newPhotos: photos
        };

        // Adaptation selon l'entité cible
        let payload: any;
        if (mode === 'CONSULTATION') {
            payload = {
                ...commonPayload,
                customer: selectedCustomer.value // Relation pour Consultation
            };
        } else {
            payload = {
                ...commonPayload,
                client: selectedCustomer.value, // Relation pour Prospection
                status: 'NEW' // Workflow spécifique Prospection
            };
        }

        if (!navigator.onLine) {
            addToQueue({ url: endpoint, method: "POST", body: payload });
            toast("🌐 Hors ligne : Sauvegardé en attente !", { icon: "💾", style: { background: "#F59E0B", color: "#fff" }});
            router.push("/dashboard");
            return;
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err['hydra:description'] || err.message || `Erreur ${res.status}`);
            }

            toast.success(mode === 'CONSULTATION' ? "Consultation enregistrée !" : "Prospection créée !");
            router.push("/dashboard");

        } catch (e: any) {
            const isNetwork = e instanceof TypeError || e.message.includes("NetworkError");
            if (isNetwork) {
                addToQueue({ url: endpoint, method: "POST", body: payload });
                toast("⚠️ Connexion perdue. Sauvegardé.", { icon: "📡" });
                router.push("/dashboard");
            } else {
                toast.error(`❌ Erreur : ${e.message}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-md mx-auto bg-white min-h-screen sm:min-h-0 sm:rounded-xl shadow-sm overflow-hidden flex flex-col relative" style={{ minHeight:'500px',animation: 'fadeIn 0.3s' }}>
            
            {/* --- MODAL CRÉATION CLIENT --- */}
            {isClientModalOpen && (
                <div className="absolute inset-0 z-50 bg-white p-4 flex flex-col animate-in slide-in-from-bottom" style={{ minHeight:'500px' }}>
                    <h3 className="font-bold text-lg mb-4 text-indigo-900">
                        Nouveau Contact
                    </h3>
                    <div className="space-y-3 flex-1 overflow-y-auto">
                        <input className="w-full border p-3 rounded" placeholder="Nom complet *" value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})} />
                        <input className="w-full border p-3 rounded" placeholder="Téléphone *" type="tel" value={newClientData.phone} onChange={e => setNewClientData({...newClientData, phone: e.target.value})} />
                        <input className="w-full border p-3 rounded" placeholder="Zone / Quartier *" value={newClientData.zone} onChange={e => setNewClientData({...newClientData, zone: e.target.value})} />
                        <div className="flex gap-2">
                            <input className="flex-1 border p-3 rounded bg-gray-50" placeholder="GPS" readOnly value={newClientData.gps} />
                            <button onClick={handleGeolocate} className="bg-gray-200 px-3 rounded text-xl">📍</button>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={() => setIsClientModalOpen(false)} className="flex-1 py-3 bg-gray-100 font-bold text-gray-600 rounded">Annuler</button>
                        <button onClick={handleCreateClient} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded">Créer</button>
                    </div>
                </div>
            )}

            {/* --- HEADER --- */}
            <div className="bg-indigo-900 p-4 text-white flex justify-between items-center">
                <h1 className="font-bold text-lg">{mode === 'PROSPECTION' ? 'Nouvelle Prospection' : 'Nouvelle Consultation'}</h1>
                <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => <div key={s} className={`h-2 w-2 rounded-full ${step >= s ? 'bg-white' : 'bg-white/30'}`} />)}
                </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6">
                
                {/* --- ÉTAPE 1 : IDENTIFICATION --- */}
                {step === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        
                        {/* SÉLECTEUR DE MODE */}
                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => { setMode('PROSPECTION'); setSelectedCustomer(null); }} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${mode === 'PROSPECTION' ? 'bg-white text-indigo-900 shadow-sm' : 'text-gray-500'}`}>🔭 PROSPECTION</button>
                            <button onClick={() => { setMode('CONSULTATION'); setSelectedCustomer(null); }} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${mode === 'CONSULTATION' ? 'bg-white text-indigo-900 shadow-sm' : 'text-gray-500'}`}>🩺 CONSULTATION</button>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                            <label className="text-xs font-bold text-blue-800 uppercase block">
                                {mode === 'PROSPECTION' ? 'Qui prospectez-vous ?' : 'Quel client consultez-vous ?'}
                            </label>
                            
                            <Select 
                                options={customers.map(c => ({ value: c['@id'], label: `${c.name} (${c.phoneNumber})`, customer: c }))}
                                value={selectedCustomer}
                                onChange={setSelectedCustomer}
                                placeholder="Rechercher nom ou numéro..."
                                className={`text-sm ${mode === 'PROSPECTION' ? 'hidden' : 'block'}`} // En prospection, on cache le select pour forcer la création d'un prospect
                                isClearable
                            />

                            {mode !== 'PROSPECTION' && <div className="text-center text-xs text-blue-400 font-bold">- OU -</div>}

                            <button 
                                onClick={() => { setIsClientModalOpen(true); handleGeolocate(); }}
                                className="w-full py-3 bg-white border-2 border-dashed border-blue-300 text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition flex items-center justify-center gap-2"
                            >
                                <span>+</span> Créer une fiche Contact
                            </button>
                        </div>

                        {selectedCustomer && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm animate-in zoom-in-95">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">Sélectionné :</div>
                                <div className="font-bold text-gray-800 text-lg">{selectedCustomer.customer.name}</div>
                                <div className="text-sm text-gray-600">📞 {selectedCustomer.customer.phoneNumber}</div>
                                <div className="text-sm text-gray-600">📍 {selectedCustomer.customer.zone}</div>
                                <div className={`mt-2 inline-block px-2 py-1 text-[10px] rounded font-bold ${selectedCustomer.customer.status === 'CLIENT' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {selectedCustomer.customer.status || 'PROSPECT'}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- ÉTAPE 2 : ACTIVITÉS --- */}
                {step === 2 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">🚜 Ferme & Activités</h2>
                        {activities.map((act, i) => (
                            <div key={i} className="flex justify-between items-center bg-green-50 p-3 rounded border border-green-100">
                                <div><p className="font-bold text-green-900 text-sm">{act.spec}</p><p className="text-xs text-green-700">{act.bat} Bat • {act.eff} Sujets</p></div>
                                <button onClick={() => removeActivity(i)} className="text-red-400 font-bold px-2">×</button>
                            </div>
                        ))}
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase">Ajouter</h4>
                            <select className="w-full p-2 border rounded text-sm bg-white" value={tempAct.spec} onChange={e => setTempAct({...tempAct, spec: e.target.value})}>
                                <option value="Poulet de Chair">🐔 Poulet de Chair</option>
                                <option value="Pondeuse">🥚 Pondeuse</option>
                                <option value="Porc">🐷 Porc</option>
                                <option value="Pisciculture">🐟 Pisciculture</option>
                            </select>
                            <div className="flex gap-2">
                                <input type="number" className="flex-1 p-2 border rounded text-sm" value={tempAct.bat} onChange={e => setTempAct({...tempAct, bat: parseInt(e.target.value) || 0})} placeholder="Nb Bat" />
                                <input type="number" className="flex-1 p-2 border rounded text-sm" value={tempAct.eff} onChange={e => setTempAct({...tempAct, eff: parseInt(e.target.value) || 0})} placeholder="Effectif" />
                            </div>
                            <button onClick={addActivity} className="w-full bg-indigo-600 text-white font-bold py-2 rounded text-sm">+ Ajouter</button>
                        </div>
                    </div>
                )}

                {/* --- ÉTAPE 3 : DIAGNOSTIC --- */}
                {step === 3 && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">📋 Diagnostic</h2>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Problèmes *</label>
                            <textarea className="w-full border p-3 rounded text-sm" rows={3} value={formData.concerns} onChange={e => updateField("concerns", e.target.value)} required />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Attentes *</label>
                            <textarea className="w-full border p-3 rounded text-sm" rows={2} value={formData.expectations} onChange={e => updateField("expectations", e.target.value)} required />
                        </div>
                        <div className="bg-orange-50 p-3 rounded border border-orange-100">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={formData.interventionDone} onChange={e => updateField("interventionDone", e.target.checked)} /> <span className="text-sm font-bold text-orange-900">Intervention faite ?</span></label>
                            {formData.interventionDone && <textarea className="w-full border p-2 rounded text-sm mt-2 bg-white" rows={2} placeholder="Détails..." value={formData.interventionComments} onChange={e => updateField("interventionComments", e.target.value)} />}
                        </div>
                    </div>
                )}

                {/* --- ÉTAPE 4 : CONCLUSION --- */}
                {step === 4 && (
                    <div className="space-y-6 animate-in slide-in-from-right">
                        <h2 className="text-indigo-900 font-bold uppercase text-sm border-b pb-2">🏁 Conclusion</h2>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={formData.appointmentTaken} onChange={e => updateField("appointmentTaken", e.target.checked)} /> <span className="text-sm font-bold text-blue-900">Rendez-vous pris ?</span></label>
                            {formData.appointmentTaken && (
                                <div className="space-y-3">
                                    <input type="datetime-local" className="w-full p-2 border rounded text-sm" value={formData.appointmentDate} onChange={e => updateField("appointmentDate", e.target.value)} />
                                    <select className="w-full p-2 border rounded text-sm" value={formData.appointmentReason} onChange={e => updateField("appointmentReason", e.target.value)}>
                                        <option value="VISITE_FERME">Visite Ferme</option>
                                        <option value="CONSULTATION">Consultation</option>
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-50 p-3 rounded border border-gray-200">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Photos</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {photos.map((p, i) => <div key={i} className="aspect-square rounded overflow-hidden bg-gray-200"><img src={p.content} className="w-full h-full object-cover" /></div>)}
                                <label className="flex items-center justify-center aspect-square border-2 border-dashed rounded cursor-pointer">📷<input type="file" accept="image/*" className="hidden" onChange={handlePhotoAdd} /></label>
                            </div>
                        </div>
                        <button onClick={handleSubmit} disabled={isSubmitting || !isStepValid(4)} className="w-full font-black py-4 bg-indigo-600 text-white rounded-xl shadow-lg disabled:bg-gray-300">{isSubmitting ? '...' : 'VALIDER'}</button>
                    </div>
                )}
            </div>

            {/* Navigation Steps */}
            <div className="p-4 border-t bg-gray-50 flex gap-3">
                {step > 1 && <button onClick={() => setStep(step - 1)} className="flex-1 py-3 bg-white border font-bold text-gray-600 rounded-lg">&larr;</button>}
                {step < 4 && <button onClick={() => setStep(step + 1)} disabled={!isStepValid(step)} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-lg disabled:bg-gray-300">Suivant</button>}
                <button onClick={()=> router.push('/dashboard/prospections')} className="flex-1 py-3 bg-gray-50 border font-bold text-gray-800 rounded-lg" title="Fermer">X</button>
            </div>
            <style>{`
                select.hidden{ display: none;}
                `}
            </style>
        </div>
        
    );
}