// pwa/src/hooks/useVisit.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApiClient } from '@/services/api';
import { Visit } from '@/types/visit'; // Import de la Partie 1

// --- READ (Lecture) ---

export function useVisit(id: string | number) {
    return useQuery<Visit>({
        queryKey: ['visit', String(id)], // Clé unique pour le cache
        queryFn: async () => {
            if (!id) throw new Error("ID manquant");
            // On utilise notre nouvel utilitaire
            return await fetchApiClient<Visit>(`/visits/${id}`);
        },
        enabled: !!id, // Ne lance la requête que si l'ID est présent
        staleTime: 1000 * 60 * 5, // Cache valide 5 minutes
    });
}

// --- WRITE (Écriture - Optionnel pour l'instant) ---
// Nous ajouterons les mutations (clôture, ajout observation)
// directement dans les composants avec useSync pour le support Offline.