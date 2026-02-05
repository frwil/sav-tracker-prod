'use client';

import { useState, useEffect } from 'react';
import Select from 'react-select';
import { useSync } from '@/providers/SyncProvider';
import { useCustomers } from '@/hooks/useCustomers';
import { API_URL } from '../shared';
import toast from "react-hot-toast";

// --- FORMULAIRE BÂTIMENT ---
export const NewBuildingForm = ({ customerIri, existingBuildings, onSuccess, onCancel }: any) => {
    const { addToQueue } = useSync();
    // On garde le hook pour d'autres usages potentiels, mais on ne s'en sert plus pour bloquer le formulaire
    const { options: customerOptions } = useCustomers(); 
    const [loading, setLoading] = useState(false);

    // Initialisation immédiate avec le customerIri fourni par la page parente
    const [formData, setFormData] = useState<{
        name: string;
        surface: string;
        maxCapacity: string;
        customer: string
    }>({
        name: `Bâtiment ${(existingBuildings?.length || 0) + 1}`,
        surface: '',
        maxCapacity: '',
        customer: customerIri || '' // ✅ Assignation directe
    });

    // Sécurité : Mise à jour si l'IRI change après le montage
    useEffect(() => {
        if (customerIri) {
            setFormData(prev => ({ ...prev, customer: customerIri }));
        }
    }, [customerIri]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation
        if (!formData.customer) {
            toast.error("Erreur technique : Client non identifié.");
            return;
        }
        if (!formData.name || !formData.surface) {
            toast.error("Merci de remplir le nom et la surface.");
            return;
        }

        setLoading(true);
        const url = '/buildings';
        const body = { 
            name: formData.name, 
            surface: parseFloat(formData.surface),
            maxCapacity: parseInt(formData.maxCapacity) || 0,
            customer: formData.customer,
            activated: true 
        };

        // 1. Détection Offline -> Sauvegarde Auto
        if (!navigator.onLine) {
            addToQueue({ url, method: 'POST', body });
            toast("🌐 Hors ligne : Bâtiment sauvegardé.", {
                icon: "🌐",
                style: { background: "#3b82f6", color: "#fff" },
                duration: 4000,
            });
            onSuccess();
            return;
        }

        // 2. Mode Online
        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                body: JSON.stringify(body) 
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData['hydra:description'] || 'Erreur API');
            }
            onSuccess();

        } catch (e: any) {
            // Fallback offline si erreur réseau
            const isNetworkError = e.message && (e.message.includes('fetch') || e.message.includes('Network'));
            if (isNetworkError) {
                addToQueue({ url, method: 'POST', body });
                toast("⚠️ Connexion instable. Sauvegardé hors-ligne.", { icon: "⚠️" });
                onSuccess();
            } else {
                toast.error(`⛔ Erreur: ${e.message}`);
            }
        } finally { 
            setLoading(false); 
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500 mb-4 animate-in slide-in-from-top-2">
            <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">🏗️ Nouveau Bâtiment</h4>
            
            <div className="space-y-3">
                {/* ✅ Champ caché pour le client : plus besoin de le sélectionner manuellement */}
                <input type="hidden" value={formData.customer} />

                {/* Nom */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nom *</label>
                    <input 
                        className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-200 outline-none" 
                        placeholder="Ex: Bâtiment A" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        readOnly={!!formData.name} // Le nom est généré automatiquement et devient en lecture seule pour éviter les doublons
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {/* Surface */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Surface (m²) *</label>
                        <input 
                            type="number" step="0.1" 
                            className="w-full border p-2 rounded text-sm" 
                            placeholder="Ex: 500" 
                            required 
                            value={formData.surface} 
                            onChange={e => setFormData({...formData, surface: e.target.value})} 
                            min={1}
                        />
                    </div>
                    {/* Capacité Max */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Capacité Max</label>
                        <input 
                            type="number" 
                            className="w-full border p-2 rounded text-sm" 
                            placeholder="Sujets" 
                            value={formData.maxCapacity} 
                            onChange={e => setFormData({...formData, maxCapacity: e.target.value})} 
                            min={1}
                        />
                    </div>
                </div>
            </div>

            <div className="flex gap-2 mt-4 justify-end border-t pt-3">
                <button type="button" onClick={onCancel} className="px-3 py-2 text-gray-500 text-sm font-bold hover:bg-gray-100 rounded">Annuler</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 transition">
                    {loading ? '...' : 'Créer'}
                </button>
            </div>
        </form>
    );
};

// --- FORMULAIRE BANDE ---
export const NewFlockForm = ({ 
    buildingIri, 
    customerIri, 
    speculations = [], 
    standards = [],    
    onSuccess, 
    onCancel 
}: any) => {
    const { addToQueue } = useSync();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        subjectCount: '',
        startDate: new Date().toISOString().split('T')[0],
        speculation: '',
        standard: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.speculation || !formData.subjectCount) {
            toast.error("Veuillez remplir les champs obligatoires (Effectif, Spéculation).");
            return;
        }

        setLoading(true);
        const url = '/flocks';
        const body = {
            name: formData.name,
            subjectCount: parseInt(formData.subjectCount),
            startDate: formData.startDate,
            speculation: formData.speculation,
            standard: formData.standard || null,
            building: buildingIri,
            customer: customerIri,
            activated: true
        };

        if (!navigator.onLine) {
            addToQueue({ url, method: 'POST', body });
            toast("🌐 Hors ligne : Bande sauvegardée.", {
                icon: "🌐",
                style: { background: "#3b82f6", color: "#fff" },
                duration: 4000,
            });
            onSuccess();
            return;
        }

        try {
            const token = localStorage.getItem('sav_token');
            const res = await fetch(`${API_URL}${url}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                body: JSON.stringify(body) 
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData['hydra:description'] || 'Erreur API');
            }
            onSuccess();

        } catch (e: any) {
            if (e.message && (e.message.includes('fetch') || e.message.includes('Network'))) {
                addToQueue({ url, method: 'POST', body });
                toast("⚠️ Connexion perdue. Bande sauvegardée.", { icon: "⚠️" });
                onSuccess();
            } else {
                toast.error(`⛔ Erreur: ${e.message}`);
            }
        } finally { 
            setLoading(false); 
        }
    };

    const safeStandards = Array.isArray(standards) ? standards : [];
    
    const filteredStandards = safeStandards.filter((s: any) => {
        if (!formData.speculation) return false;
        const standardSpecRef = typeof s.speculation === 'object' && s.speculation !== null
            ? (s.speculation['@id'] || s.speculation.id) 
            : s.speculation;
        return String(standardSpecRef) === String(formData.speculation);
    });

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-indigo-500 mb-4 animate-in slide-in-from-top-2">
            <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">🐣 Nouvelle Bande</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div style={{display:'none'}}>
                    <input 
                        type='hidden'
                        value={formData.name} 
                        onChange={e => setFormData(prev => ({...prev, name: e.target.value}))} 
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Effectif départ</label>
                    <input 
                        type="number" 
                        className="w-full border p-2 rounded text-sm" 
                        placeholder="Nb sujets" 
                        value={formData.subjectCount || '1'} 
                        onChange={e => setFormData(prev => ({...prev, subjectCount: e.target.value}))} 
                        min={1}
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date mise en place</label>
                    <input 
                        type="date" 
                        className="w-full border p-2 rounded text-sm" 
                        value={formData.startDate} 
                        onChange={e => setFormData(prev => ({...prev, startDate: e.target.value}))} 
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Spéculation</label>
                    <select 
                        className="w-full border p-2 rounded text-sm bg-white" 
                        value={formData.speculation} 
                        onChange={e => setFormData(prev => ({
                            ...prev, 
                            speculation: e.target.value, 
                            standard: '' 
                        }))}
                    >
                        <option value="">-- Choisir --</option>
                        {Array.isArray(speculations) && speculations.map((s:any) => (
                            <option key={s['@id']} value={s['@id']}>{s.name}</option>
                        ))}
                    </select>
                </div>
                
                {formData.speculation && filteredStandards.length > 0 && (
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Souche / Standard (Optionnel)</label>
                        <select 
                            className="w-full border p-2 rounded text-sm bg-white" 
                            value={formData.standard} 
                            onChange={e => setFormData(prev => ({...prev, standard: e.target.value}))}
                        >
                            <option value="">-- Aucun --</option>
                            {filteredStandards.map((s:any) => (
                                <option key={s['@id']} value={s['@id']}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="flex gap-2 mt-4 justify-end border-t pt-3">
                <button type="button" onClick={onCancel} className="px-3 py-2 text-gray-500 text-sm font-bold hover:bg-gray-100 rounded">Annuler</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 transition">
                    {loading ? '...' : 'Créer'}
                </button>
            </div>
        </form>
    );
};