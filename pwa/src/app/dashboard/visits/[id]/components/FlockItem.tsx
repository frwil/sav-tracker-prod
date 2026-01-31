'use client';
import { useState } from 'react';
import { ObservationForm } from './ObservationForm';
import { ObservationDetails } from './ObservationDetails';

export const FlockItem = ({ flock, building, visit, visitObservations, visitIri, isVisitClosed, onRefresh }: any) => {
    const [mode, setMode] = useState<'LIST' | 'FORM' | 'DETAILS'>('LIST');
    const [selectedObs, setSelectedObs] = useState<any>(null);
    
    // Trouve l'observation liée à CE lot pour CETTE visite
    const currentObs = visitObservations?.find((obs: any) => 
        (typeof obs.flock === 'string' ? obs.flock : obs.flock['@id']) === flock['@id']
    );

    return (
        <div className={`mb-3 border rounded-xl overflow-hidden shadow-sm ${flock.closed ? 'bg-gray-50' : 'bg-white border-indigo-100'}`}>
            <div className="p-3 flex justify-between items-center bg-gray-50/50">
                <div>
                    <h4 className="font-bold text-gray-800">{flock.name}</h4>
                    <p className="text-xs text-gray-500">{flock.subjectCount} sujets • {flock.speculation?.name}</p>
                </div>
                {!isVisitClosed && !flock.closed && !currentObs && mode === 'LIST' && (
                    <button onClick={() => setMode('FORM')} className="text-xs bg-white border border-indigo-200 text-indigo-700 px-3 py-1 rounded-lg font-bold hover:bg-indigo-50 transition">
                        + Observer
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
                        onEdit={() => { if (!isVisitClosed) { setSelectedObs(currentObs); setMode('FORM'); } }} 
                        onClose={() => setMode('LIST')} 
                    />
                )}
                
                {mode === 'LIST' && currentObs && (
                    <div onClick={() => setMode('DETAILS')} className="cursor-pointer bg-white border-l-4 border-indigo-500 p-3 rounded shadow-sm text-sm hover:bg-indigo-50 transition">
                        <p className="font-bold text-indigo-900">✅ Observation J{currentObs.data.age}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Poids: {currentObs.data.poidsMoyen}g • Morts: {currentObs.data.mortalite} • Conso: {currentObs.data.consoTete}g
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};