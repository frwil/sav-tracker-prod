// pwa/src/components/visit/ProphylaxisList.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSync } from '@/providers/SyncProvider';
import { fetchApiClient } from '@/services/api'; // Notre service créé en Partie 2
import { ProphylaxisTask } from '@/types/visit'; // Nos types de la Partie 1

interface ProphylaxisListProps {
    visitId: number;
    tasks: ProphylaxisTask[];
}

export default function ProphylaxisList({ visitId, tasks }: ProphylaxisListProps) {
    const { addToQueue } = useSync();
    const queryClient = useQueryClient();
    
    // État local pour l'Optimistic UI (réactivité immédiate)
    const [localTasks, setLocalTasks] = useState<ProphylaxisTask[]>(tasks);

    // Synchroniser l'état local si les props changent (ex: retour du réseau qui met à jour la liste réelle)
    useEffect(() => {
        setLocalTasks(tasks);
    }, [tasks]);

    const handleToggle = async (task: ProphylaxisTask) => {
        const newStatus = !task.done;
        
        // 1. OPTIMISTIC UPDATE : On met à jour l'affichage tout de suite
        setLocalTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, done: newStatus } : t
        ));

        const url = `/prophylaxis_tasks/${task.id}`;
        const method = 'PATCH';
        
        // API Platform attend souvent ce format pour les PATCHs partiels
        // Si ton API n'utilise pas "application/merge-patch+json", remplace par "application/json"
        const contentType = 'application/merge-patch+json'; 
        const body = { done: newStatus };

        // 2. CAS HORS LIGNE
        if (!navigator.onLine) {
            addToQueue({ 
                url, 
                method, 
                body 
            });
            // Pas d'alerte ici pour ne pas spammer l'utilisateur à chaque clic
            return;
        }

        // 3. CAS EN LIGNE
        try {
            await fetchApiClient(url, {
                method,
                headers: { 'Content-Type': contentType },
                body: JSON.stringify(body)
            });

            // On invalide le cache de la visite pour être sûr d'avoir les données fraîches
            // (Note: on ne bloque pas l'UI en attendant la réponse)
            queryClient.invalidateQueries({ queryKey: ['visit', String(visitId)] });

        } catch (error) {
            console.error("Erreur sync tâche", error);
            
            // Si ça échoue, on remet dans la file d'attente (filet de sécurité)
            // Ou on pourrait annuler le changement visuel (rollback), 
            // mais ici on privilégie l'ajout à la queue.
            addToQueue({ url, method, body });
        }
    };

    if (localTasks.length === 0) {
        return (
            <div className="bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300 text-center">
                <p className="text-gray-500 italic">Aucune tâche sanitaire prévue.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center justify-between">
                <span>💉 Tâches Prophylaxie</span>
                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">
                    {localTasks.filter(t => t.done).length}/{localTasks.length} fait
                </span>
            </h3>
            
            <div className="space-y-3">
                {localTasks.map(task => (
                    <div 
                        key={task.id} 
                        className={`
                            flex items-center justify-between p-3 rounded-lg border transition-all duration-200
                            ${task.done 
                                ? 'bg-green-50 border-green-200 opacity-75' 
                                : 'bg-white border-gray-200 hover:border-indigo-300'
                            }
                        `}
                    >
                        <label className="flex items-center gap-3 cursor-pointer w-full">
                            <div className="relative flex items-center">
                                <input 
                                    type="checkbox" 
                                    checked={task.done} 
                                    onChange={() => handleToggle(task)}
                                    className="peer h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            
                            <div className="flex-1">
                                <p className={`font-bold text-sm transition-all ${task.done ? 'text-green-800 line-through' : 'text-gray-800'}`}>
                                    {task.name}
                                </p>
                                <div className="flex gap-2 mt-0.5">
                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 rounded">
                                        J{task.targetDay}
                                    </span>
                                    {task.type && (
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">
                                            {task.type}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );
}