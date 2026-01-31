'use client';

import { useState, useEffect } from 'react';
import Select from 'react-select';
import { useSync } from '@/providers/SyncProvider';
import { useCustomers, CustomerOption } from '@/hooks/useCustomers';
import { API_URL } from '../shared';
import toast from "react-hot-toast";

// --- FORMULAIRE BÂTIMENT (Structure unifiée avec buildings/page.tsx) ---
export const NewBuildingForm = ({ customerIri, existingBuildings, onSuccess, onCancel }: any) => {
    const { addToQueue } = useSync();
    const { options: customerOptions, loading: customersLoading } = useCustomers();
    const [loading, setLoading] = useState(false);

    // État identique à la page principale de gestion des bâtiments
    const [formData, setFormData] = useState<{
        name: string;
        surface: string;
        maxCapacity: string;
        customer: string
    }>({
        name: `Bâtiment ${(existingBuildings?.length || 0) + 1}`,
        surface: '',
        maxCapacity: '',
        customer: ''
    });

    // Pré-remplissage automatique du client (contexte de la visite)
    useEffect(() => {
        if (customerIri && customerOptions.length > 0 && !formData.customer) {
            const found = customerOptions.find(c => c.value === customerIri);
            if (found) setFormData(prev => ({ ...prev, customer: found.value }));
        }
    }, [customerIri, customerOptions]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.surface || !formData.customer) {
            toast.error("Merci de remplir le nom, la surface et le client.");
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

        // 1. Détection Offline Navigateur -> Sauvegarde Auto
        if (!navigator.onLine) {
            addToQueue({ url, method: 'POST', body });
            toast("🌐 Hors ligne : Bâtiment sauvegardé et en attente de synchro.",{
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6", // Bleu pour info
                    color: "#fff",
                },
                duration: 4000,
            });
            onSuccess();
            return;
        }

        // 2. Mode Online
        const token = localStorage.getItem('sav_token');
        try {
            const res = await fetch(`${API_URL}${url}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                body: JSON.stringify(body) 
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const e: any = new Error(errData['hydra:description'] || 'Erreur API');
                e.status = res.status;
                throw e;
            }
            onSuccess();

        } catch (e: any) {
            // ✅ Gestion stricte des erreurs
            if (e.status) {
                // CAS A : Erreur API (400, 422, 500...) -> ON REJETTE (Pas de sauvegarde)
                toast.error(`⛔ Impossible de créer le bâtiment (${e.status}): ${e.message}`);
            } else {
                // CAS B : Erreur Réseau (Fetch failed) -> SAUVEGARDE AUTO
                addToQueue({ url, method: 'POST', body });
                toast("⚠️ Connexion instable. Bâtiment sauvegardé en mode hors-ligne.",{
                    icon: "⚠️",
                    style: {
                        borderRadius: "10px",
                        background: "#f59e0b", // Orange pour avertissement
                        color: "#fff",
                    },
                    duration: 4000,
                });
                onSuccess();
            }
        } finally { 
            setLoading(false); 
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500 mb-4 animate-in slide-in-from-top-2">
            <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">🏗️ Nouveau Bâtiment</h4>
            
            <div className="space-y-3">
                {/* Sélection Client */}
                <div style={{display:'none'}}>
                    <input
                        type='hidden'
                        value={formData.customer || ''}
                        onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                        className="text-sm"
                    />
                </div>

                {/* Nom */}
                <div>
                    <input 
                        className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-blue-200 outline-none" 
                        placeholder="Ex: Bâtiment A" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        readOnly
                        type='hidden'
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {/* Surface */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Surface (m²)</label>
                        <input 
                            type="number" step="0.1" 
                            className="w-full border p-2 rounded text-sm" 
                            placeholder="0.0" 
                            value={formData.surface || '1'} 
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
                            value={formData.maxCapacity || '1'} 
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
    speculations = [], // ✅ 1. Sécurité : tableau vide par défaut
    standards = [],    // ✅ 1. Sécurité : tableau vide par défaut
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

        // 1. Offline Check -> Auto Save
        if (!navigator.onLine) {
            addToQueue({ url, method: 'POST', body });
            toast("🌐 Hors ligne : Bande sauvegardée et en attente de synchro.",{
                icon: "🌐",
                style: {
                    borderRadius: "10px",
                    background: "#3b82f6", // Bleu pour info
                    color: "#fff",
                },
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
                const e: any = new Error(errData['hydra:description'] || 'Erreur API');
                e.status = res.status;
                throw e;
            }
            onSuccess();

        } catch (e: any) {
            // ✅ 2. Gestion stricte des erreurs
            if (e.status) {
                // Erreur serveur/validation -> Rejet (Pas de sauvegarde)
                toast.error(`⛔ Erreur lors de la création (${e.status}): ${e.message}`);
            } else {
                // Erreur Connexion -> Sauvegarde Auto
                addToQueue({ url, method: 'POST', body });
                toast("⚠️ Connexion perdue. Bande sauvegardée localement.",{
                    icon: "⚠️",
                    style: {
                        borderRadius: "10px",
                        background: "#f59e0b", // Orange pour avertissement
                        color: "#fff",
                    },
                    duration: 4000,
                });
                onSuccess();
            }
        } finally { 
            setLoading(false); 
        }
    };

    // ✅ 3. Filtrage sécurisé (Array check + String compare)
    const safeStandards = Array.isArray(standards) ? standards : [];
    
    const filteredStandards = safeStandards.filter((s: any) => {
        if (!formData.speculation) return false;

        // Extraction robuste de l'ID/IRI
        const standardSpecRef = typeof s.speculation === 'object' && s.speculation !== null
            ? (s.speculation['@id'] || s.speculation.id) 
            : s.speculation;

        // Comparaison stricte
        return String(standardSpecRef) === String(formData.speculation);
    });

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-indigo-500 mb-4 animate-in slide-in-from-top-2">
            <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">🐣 Nouvelle Bande</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Nom */}
                <div style={{display:'none'}}>
                    <input 
                        type='hidden'
                        className="w-full border p-2 rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" 
                        placeholder="Ex: Lot Janvier" 
                        value={formData.name} 
                        // ✅ 4. State update sécurisé
                        onChange={e => setFormData(prev => ({...prev, name: e.target.value}))} 
                    />
                </div>

                {/* Effectif */}
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

                {/* Date */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date mise en place</label>
                    <input 
                        type="date" 
                        className="w-full border p-2 rounded text-sm" 
                        value={formData.startDate} 
                        onChange={e => setFormData(prev => ({...prev, startDate: e.target.value}))} 
                    />
                </div>

                {/* Spéculation */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Spéculation</label>
                    <select 
                        className="w-full border p-2 rounded text-sm bg-white" 
                        value={formData.speculation} 
                        onChange={e => setFormData(prev => ({
                            ...prev, 
                            speculation: e.target.value, 
                            standard: '' // Reset standard
                        }))}
                    >
                        <option value="">-- Choisir --</option>
                        {/* ✅ 5. Protection contre .map() sur undefined */}
                        {Array.isArray(speculations) && speculations.map((s:any) => (
                            <option key={s['@id']} value={s['@id']}>{s.name}</option>
                        ))}
                    </select>
                </div>
                
                {/* Standard (Conditionnel) */}
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