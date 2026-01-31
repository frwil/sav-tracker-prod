// pwa/src/hooks/useStandardBenchmark.ts

import { useMemo } from 'react';

interface CurvePoint {
    day: number;
    weight: number;      // Poids cible (g)
    feed_daily?: number; // Conso jour cible (g)
}

interface BenchmarkResult {
    age: number;
    targetWeight: number | null;
    weightGap: number | null;      // Écart Poids
    weightStatus: 'good' | 'warning' | 'critical' | 'unknown';
    targetFeed: number | null;
    feedGap: number | null;        // Écart Conso
}

export const useStandardBenchmark = (
    flockStartDate: string | undefined,
    observationDate: string,
    currentWeight: number | string, // Peut venir d'un input string
    currentFeed?: number | string,
    standardData?: CurvePoint[]     // Le JSON stocké dans Standard
): BenchmarkResult => {

    return useMemo(() => {
        // 1. Calcul de l'âge
        if (!flockStartDate || !observationDate) {
            return { age: 0, targetWeight: null, weightGap: null, weightStatus: 'unknown', targetFeed: null, feedGap: null };
        }

        const start = new Date(flockStartDate);
        const current = new Date(observationDate);
        const diffTime = Math.abs(current.getTime() - start.getTime());
        const age = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        // 2. Si pas de standard, on s'arrête là
        if (!standardData || standardData.length === 0) {
            return { age, targetWeight: null, weightGap: null, weightStatus: 'unknown', targetFeed: null, feedGap: null };
        }

        // 3. Trouver le point de référence (Le jour le plus proche ou interpolation)
        // Pour faire simple ici : on prend le jour exact ou le plus proche inférieur
        const sortedCurve = [...standardData].sort((a, b) => a.day - b.day);
        const targetPoint = sortedCurve.reduce((prev, curr) => {
            return (curr.day <= age && curr.day > prev.day) ? curr : prev;
        }, sortedCurve[0]);

        // Si on est bien au-delà du standard (ex: J+60 alors que courbe finit à J+49), on garde le dernier point connu.

        // 4. Calculs des écarts
        const weightVal = typeof currentWeight === 'string' ? parseFloat(currentWeight) : currentWeight;
        const feedVal = typeof currentFeed === 'string' ? parseFloat(currentFeed) : currentFeed;

        let weightGap = null;
        let weightStatus: 'good' | 'warning' | 'critical' | 'unknown' = 'unknown';

        if (!isNaN(weightVal) && targetPoint.weight > 0) {
            weightGap = weightVal - targetPoint.weight;
            
            // Logique de statut (Seuils arbitraires à ajuster)
            const ratio = weightVal / targetPoint.weight;
            if (ratio >= 0.95) weightStatus = 'good';       // > 95% de l'objectif
            else if (ratio >= 0.85) weightStatus = 'warning'; // Entre 85% et 95%
            else weightStatus = 'critical';                 // < 85%
        }

        let feedGap = null;
        if (feedVal && !isNaN(feedVal) && targetPoint.feed_daily) {
            feedGap = feedVal - targetPoint.feed_daily;
        }

        return {
            age,
            targetWeight: targetPoint.weight,
            weightGap,
            weightStatus,
            targetFeed: targetPoint.feed_daily || null,
            feedGap
        };

    }, [flockStartDate, observationDate, currentWeight, currentFeed, standardData]);
};