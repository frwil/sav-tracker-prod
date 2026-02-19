'use client';
import { useState } from 'react';
import { ObservationForm } from './ObservationForm';
import { ObservationDetails } from './ObservationDetails';
import toast from 'react-hot-toast';

interface FlockItemProps {
    flock: any;
    building: any;
    visit: any;
    visitObservations: any[];
    visitIri: string;
    isVisitClosed: boolean;
    onRefresh: () => void;
    isOffline?: boolean;
}

export const FlockItem = ({ 
    flock, 
    building, 
    visit, 
    visitObservations, 
    visitIri, 
    isVisitClosed, 
    onRefresh,
    isOffline = false 
}: FlockItemProps) => {
    const [mode, setMode] = useState<'LIST' | 'FORM' | 'DETAILS'>('LIST');
    const [selectedObs, setSelectedObs] = useState<any>(null);
    
    // Trouve l'observation liée à CE lot pour CETTE visite
    const currentObs = visitObservations?.find((obs: any) => 
        (typeof obs.flock === 'string' ? obs.flock : obs.flock['@id']) === flock['@id']
    );

    const handleNewObservation = () => {
        if (isOffline) {
            toast.error("Création d'observation impossible en mode hors ligne", { 
                id: 'offline-obs',
                style: { background: '#f59e0b', color: '#fff' }
            });
            return;
        }
        setMode('FORM');
    };

    const handleEditObservation = () => {
        if (isOffline) {
            toast.error("Modification impossible en mode hors ligne", { 
                id: 'offline-edit',
                style: { background: '#f59e0b', color: '#fff' }
            });
            return;
        }
        setSelectedObs(currentObs);
        setMode('FORM');
    };

    return (
        <div className={`mb-3 border rounded-xl overflow-hidden shadow-sm ${flock.closed ? 'bg-gray-50' : 'bg-white border-indigo-100'} ${flock.__isPending ? 'opacity-80' : ''}`}>
            <div className="p-3 flex justify-between items-center bg-gray-50/50">
                <div>
                    <h4 className="font-bold text-gray-800">{flock.name}</h4>
                    <p className="text-xs text-gray-500">
                        {flock.subjectCount} sujets • {flock.speculation?.name}
                    </p>
                    {flock.__isPending && (
                        <span className="text-[10px] bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded font-bold animate-pulse">
                            ⏳ SYNCHRONISATION EN ATTENTE
                        </span>
                    )}
                </div>
                
                {!isVisitClosed && !flock.closed && !currentObs && mode === 'LIST' && (
                    <button 
                        onClick={handleNewObservation}
                        disabled={isOffline || flock.__isPending}
                        className={`text-xs px-3 py-1 rounded-lg font-bold transition ${
                            isOffline || flock.__isPending
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                        }`}
                    >
                        {flock.__isPending ? 'En attente...' : '+ Observer'}
                    </button>
                )}
            </div>
            
            <div className="p-3">
                {mode === 'FORM' && (
                    <ObservationForm 
                        visitIri={visitIri} 
                        flock={flock} 
                        building={building} 
                        visit={visit} 
                        initialData={selectedObs} 
                        onSuccess={() => { setMode('LIST'); onRefresh(); }} 
                        onCancel={() => { setMode('LIST'); setSelectedObs(null); }} 
                    />
                )}
                
                {mode === 'DETAILS' && currentObs && (
                    <ObservationDetails 
                        obs={currentObs} 
                        flock={flock} 
                        building={building} 
                        visit={visit} 
                        onEdit={handleEditObservation}
                        onClose={() => setMode('LIST')} 
                        isModal={false}
                    />
                )}
                
                {mode === 'LIST' && currentObs && (
                    <div 
                        onClick={() => setMode('DETAILS')} 
                        className={`cursor-pointer bg-white border-l-4 border-indigo-500 p-3 rounded shadow-sm text-sm hover:bg-indigo-50 transition ${isOffline ? 'opacity-90' : ''}`}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-bold text-indigo-900">✅ Observation J{currentObs.data.age}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Poids: {currentObs.data.poidsMoyen}g • Morts: {currentObs.data.mortalite} • Conso: {currentObs.data.consoTete}g
                                </p>
                            </div>
                            {currentObs.__isPending && (
                                <span className="text-[9px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-bold animate-pulse">
                                    ⏳
                                </span>
                            )}
                        </div>
                        {isOffline && (
                            <p className="text-[10px] text-orange-600 mt-2 bg-orange-50 px-2 py-1 rounded">
                                📡 Mode hors ligne - Lecture seule
                            </p>
                        )}
                    </div>
                )}

                {mode === 'LIST' && !currentObs && !flock.closed && !isVisitClosed && isOffline && (
                    <div className="text-center py-4 bg-orange-50 rounded border border-orange-200">
                        <p className="text-sm text-orange-700 font-medium">
                            📡 Mode hors ligne
                        </p>
                        <p className="text-xs text-orange-600 mt-1">
                            Création d'observation impossible sans connexion
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};