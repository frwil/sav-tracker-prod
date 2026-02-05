"use client";

import { useSync } from "@/providers/SyncProvider";
import { useState } from "react";

export default function SettingsPage() {
    const { refreshAllData, isOnline, isSyncing } = useSync();
    const [isLoading, setIsLoading] = useState(false);

    const handleForceRefresh = async () => {
        setIsLoading(true);
        await refreshAllData();
        setIsLoading(false);
    };

    return (
        <div className="max-w-lg mx-auto p-4">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Réglages</h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                
                {/* Section Synchronisation */}
                <div>
                    <h2 className="text-lg font-bold text-gray-700 mb-2 flex items-center gap-2">
                        ☁️ Synchronisation des données
                    </h2>
                    <p className="text-sm text-gray-500 mb-4">
                        L'application met en cache les données pour fonctionner hors ligne. 
                        Si vous ne voyez pas les dernières modifications (nouveaux clients, prospections...), 
                        forcez la mise à jour ici.
                    </p>

                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold uppercase text-gray-400">État connexion</span>
                            <span className={`font-bold ${isOnline ? "text-green-600" : "text-red-500"}`}>
                                {isOnline ? "🟢 Connecté Internet" : "🔴 Hors ligne"}
                            </span>
                        </div>

                        <button
                            onClick={handleForceRefresh}
                            disabled={!isOnline || isLoading || isSyncing}
                            className={`
                                px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center gap-2
                                ${!isOnline || isLoading 
                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                                    : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
                                }
                            `}
                        >
                            {isLoading ? (
                                <>
                                    <span className="animate-spin">🔄</span> Chargement...
                                </>
                            ) : (
                                <>
                                    🔄 Forcer la mise à jour
                                </>
                            )}
                        </button>
                    </div>
                    {!isOnline && (
                        <p className="text-xs text-red-400 mt-2 text-center">
                            * Connexion requise pour mettre à jour les données.
                        </p>
                    )}
                </div>

                {/* Autres réglages (Exemple) */}
                <div className="pt-6 border-t border-gray-100">
                    <h2 className="text-lg font-bold text-gray-700 mb-2">📦 Cache Local</h2>
                    <button 
                        onClick={() => {
                            localStorage.clear();
                            window.location.reload();
                        }}
                        className="text-red-600 text-sm font-bold hover:underline"
                    >
                        Vider tout le cache et recharger l'app
                    </button>
                    <p className="text-xs text-gray-400 mt-1">À utiliser uniquement en cas de bug majeur.</p>
                </div>

            </div>
        </div>
    );
}