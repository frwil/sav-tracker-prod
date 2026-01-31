// pwa/src/providers/QueryProvider.tsx
"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { queryStorage } from "../services/storage"; // ✅ Import de notre stockage

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    
    // 1. Création du QueryClient avec configuration "Offline First"
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // 🚀 CRITIQUE : Utilise le cache si pas de réseau, ne jette pas d'erreur
                        networkMode: 'offlineFirst', 
                        
                        // Temps de garbage collection : 7 jours (Garde les données en mémoire/disque)
                        gcTime: 1000 * 60 * 60 * 24 * 7, 
                        
                        // Temps avant de considérer la donnée comme "périmée" (5 min)
                        staleTime: 1000 * 60 * 5, 
                        
                        retry: (failureCount, error: any) => {
                            // Ne pas réessayer si on est explicitement hors ligne
                            if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
                            return failureCount < 2;
                        },
                    },
                    mutations: {
                        networkMode: 'offlineFirst',
                    }
                },
            })
    );

    // 2. Création du Persister (Pont entre React Query et IndexedDB)
    const [persister] = useState(() =>
        createAsyncStoragePersister({
            storage: queryStorage, 
            throttleTime: 1000, // Sauvegarde au max toutes les 1s
        })
    );

    return (
        <PersistQueryClientProvider 
            client={queryClient} 
            persistOptions={{ 
                persister, 
                maxAge: 1000 * 60 * 60 * 24 * 7, // Les données persistent 7 jours
                dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                        // On ne sauvegarde que les requêtes en succès
                        return query.state.status === 'success';
                    }
                }
            }}
        >
            {children}
            {/* Outils de dev (masqués par défaut) */}
            <ReactQueryDevtools initialIsOpen={false} />
        </PersistQueryClientProvider>
    );
}