// pwa/src/utils/feedAnalysisEngine.ts

export type FeedStrategy = 'INDUSTRIAL' | 'SELF_MIX' | 'THIRD_PARTY';

interface FeedInputs {
    strategy: FeedStrategy;
    daysElapsed: number; // Depuis la dernière visite
    subjectCount: number;
    
    // Branche A & C (Stock Global)
    stockInitial?: number; // Kg
    stockAdded?: number;   // Kg (Achats)
    stockFinal?: number;   // Kg (Inventaire jour J)
    
    // Branche B (Ingrédients)
    formulaType?: 'CONC_5' | 'CONC_10'; 
    maizeConsumed?: number; // Calculé via (Stock Init + Achat - Stock Final)
    soyaConsumed?: number;
    concConsumed?: number;

    // Croissance (Pour le TCR)
    weightGain?: number; // Kg total gagné par le lot sur la période
}

interface AnalysisResult {
    consumedTotal: number; // En Kg
    consumedPerBird: number; // En g/tête/jour
    fcr?: number; // Taux de conversion (TCR)
    
    alerts: {
        level: 'info' | 'warning' | 'danger';
        message: string;
    }[];
}

export const analyzeFeed = (inputs: FeedInputs): AnalysisResult => {
    const alerts: AnalysisResult['alerts'] = [];
    let consumedTotal = 0;

    // --- 1. CALCUL DE LA CONSOMMATION ---
    
    if (inputs.strategy === 'SELF_MIX') {
        // Branche B : Fabrique à la ferme
        consumedTotal = (inputs.maizeConsumed || 0) + (inputs.soyaConsumed || 0) + (inputs.concConsumed || 0);

        // Analyse de la Recette (Cohérence)
        if (consumedTotal > 0 && inputs.formulaType === 'CONC_5') {
            const maizeRatio = (inputs.maizeConsumed || 0) / consumedTotal;
            const soyaRatio = (inputs.soyaConsumed || 0) / consumedTotal;
            
            // Standard approx pour 5% : Maïs ~60-65%, Soja ~25-30%
            if (maizeRatio < 0.55) alerts.push({ level: 'danger', message: "Déséquilibre: Pas assez de Maïs dans le mélange." });
            if (soyaRatio < 0.20) alerts.push({ level: 'danger', message: "Risque Carence: Taux de Soja trop faible (<20%)." });
        }
    } 
    else {
        // Branche A (Industriel) & C (Tiers)
        // Formule : Stock J-1 + Achats - Stock J
        const calculated = (inputs.stockInitial || 0) + (inputs.stockAdded || 0) - (inputs.stockFinal || 0);
        consumedTotal = Math.max(0, calculated);
        
        if (calculated < 0) {
            alerts.push({ level: 'danger', message: "Incohérence : Le stock final est supérieur au stock disponible (Erreur de saisie ou d'inventaire)." });
        }
    }

    // --- 2. CALCULS DE PERFORMANCE ---

    // Conso par tête (g/jour) pour les graphiques
    // (Kg * 1000) / (Sujets * Jours)
    const safeDays = inputs.daysElapsed > 0 ? inputs.daysElapsed : 1;
    const consumedPerBird = (consumedTotal * 1000) / (inputs.subjectCount * safeDays);

    // TCR (Branche C - Tiers)
    let fcr = undefined;
    if (inputs.strategy === 'THIRD_PARTY' && inputs.weightGain && inputs.weightGain > 0) {
        fcr = consumedTotal / inputs.weightGain;
        if (fcr > 1.8) {
            alerts.push({ level: 'danger', message: `Rentabilité Critique : TCR à ${fcr.toFixed(2)}. L'aliment semble inefficace.` });
        } else if (fcr > 1.6) {
            alerts.push({ level: 'warning', message: `Vigilance : TCR à ${fcr.toFixed(2)}.` });
        }
    }

    // --- 3. ALERTE DE DÉMARRAGE (SNAPSHOT) ---
    if (!inputs.stockInitial && inputs.stockFinal && inputs.stockFinal > 0) {
        alerts.push({ level: 'info', message: "Point Zéro défini. L'analyse de consommation débutera à la prochaine visite." });
    }

    return { consumedTotal, consumedPerBird, fcr, alerts };
};