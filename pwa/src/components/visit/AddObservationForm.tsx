// pwa/src/components/visit/AddObservationForm.tsx
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSync } from '@/providers/SyncProvider';
import { fetchApiClient } from '@/services/api';

interface AddObservationFormProps {
    visitId: number;
    onSuccess?: () => void;
}

export default function AddObservationForm({ visitId, onSuccess }: AddObservationFormProps) {
    const { addToQueue } = useSync();
    const queryClient = useQueryClient();

    // États du formulaire
    const [problems, setProblems] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation basique
        if (!problems && !recommendations) {
            alert("Veuillez remplir au moins un champ.");
            return;
        }

        setIsSubmitting(true);

        // Construction de l'objet à envoyer
        const payload = {
            visit: `/api/visits/${visitId}`, // Format IRI requis par API Platform
            problems: problems || null,
            recommendations: recommendations || null,
            observedAt: new Date().toISOString()
        };

        const url = '/observations';
        const method = 'POST';

        // 1. CAS HORS LIGNE
        if (!navigator.onLine) {
            addToQueue({ 
                url, 
                method, 
                body: payload 
            });
            
            // Feedback immédiat pour l'utilisateur
            alert("Connexion absente : Observation sauvegardée localement !");
            resetForm();
            return;
        }

        // 2. CAS EN LIGNE
        try {
            await fetchApiClient(url, {
                method,
                body: JSON.stringify(payload)
            });

            // On rafraîchit les données de la visite pour afficher la nouvelle observation
            queryClient.invalidateQueries({ queryKey: ['visit', String(visitId)] });
            
            resetForm();

        } catch (error) {
            console.error("Erreur envoi observation", error);
            
            // Filet de sécurité : Si l'envoi échoue (ex: micro-coupure), on sauvegarde en local
            const saveLocal = confirm("L'envoi a échoué. Sauvegarder en mode hors ligne ?");
            if (saveLocal) {
                addToQueue({ url, method, body: payload });
                resetForm();
            } else {
                setIsSubmitting(false);
            }
        }
    };

    const resetForm = () => {
        setProblems('');
        setRecommendations('');
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
    };

    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                📝 Nouvelle Observation
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Champ Problèmes */}
                <div>
                    <label className="block text-xs font-bold text-red-500 uppercase mb-1">
                        Problèmes / Symptômes
                    </label>
                    <textarea 
                        className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-400 text-sm transition-all" 
                        rows={3}
                        value={problems}
                        onChange={e => setProblems(e.target.value)}
                        placeholder="Ex: Taux de mortalité anormal, respiration difficile..."
                    />
                </div>

                {/* Champ Recommandations */}
                <div>
                    <label className="block text-xs font-bold text-blue-500 uppercase mb-1">
                        Recommandations / Actions
                    </label>
                    <textarea 
                        className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-400 text-sm transition-all" 
                        rows={3} 
                        value={recommendations}
                        onChange={e => setRecommendations(e.target.value)}
                        placeholder="Ex: Augmenter la ventilation, administrer traitement X..."
                    />
                </div>

                {/* Bouton d'envoi */}
                <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={`
                        w-full font-bold py-3 rounded-lg transition-all transform active:scale-95
                        ${isSubmitting 
                            ? 'bg-gray-100 text-gray-400 cursor-wait' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                        }
                    `}
                >
                    {isSubmitting ? 'Enregistrement...' : 'Ajouter au rapport'}
                </button>
            </form>
        </div>
    );
}