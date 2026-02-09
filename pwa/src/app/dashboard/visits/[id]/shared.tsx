// src/app/dashboard/visits/[id]/shared.tsx

export const API_URL = process.env.NEXT_PUBLIC_API_URL;

// --- TYPES ---
export interface ProphylaxisTask { id: number; targetDay: number; name: string; type: string; speculation?: string | { '@id'?: string; id?: number };}
export interface Speculation { '@id': string; id: number; name: string; }

export interface Problem {
    '@id': string;
    id?: number;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'resolved';
    detectedIn?: string; // IRI
    resolvedIn?: string; // IRI
}

export interface Standard { 
    '@id': string; 
    name: string; 
    curveData?: { 
        day: number; 
        weight: number; 
        feed_daily?: number; 
    }[]; 
}

export interface Observation { 
    '@id'?: string;
    id: number; 
    visitedAt?: string; 
    observedAt?: string; 
    data: any; 
    concerns?: string; 
    observation?: string; 
    recommendations?: string; 
    
    detectedProblems?: Problem[]; // OneToMany
    resolvedProblems?: Problem[]; // OneToMany

    // Rétrocompatibilité
    problems?: string; 

    visit: string | { '@id': string }; 
    flock: string | { '@id': string }; 
}

export interface Flock { 
    '@id': string; 
    id: number; 
    name: string; 
    speculation: Speculation; 
    standard?: Standard; 
    startDate: string; 
    subjectCount: number; 
    feedStrategy?: 'INDUSTRIAL' | 'SELF_MIX' | 'THIRD_PARTY'; 
    feedFormula?: string; 
    closed: boolean; 
    activated: boolean; 
    observations: Observation[]; 
}

export interface Building { '@id': string; id: number; name: string; activated: boolean; surface?: number; flocks: Flock[]; }
export interface Technician { id: number; username: string; fullname: string; email?: string; }

export interface Visit { 
    '@id': string; 
    id: number; 
    visitedAt: string; 
    customer: { 
        '@id': string; 
        id: number; 
        name: string; 
        zone: string; 
        phoneNumber?: string; 
        buildings: Building[]; 
    }; 
    technician: Technician; 
    closed: boolean; 
    observations: Observation[]; 
}

// --- HELPERS DE CALCUL ---

export const calculateAgeInDays = (startDateStr: string, observationDateStr: string): number => {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr);
    const obs = new Date(observationDateStr);
    const diffTime = Math.abs(obs.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
};

export const calculateBenchmark = (ageInput: any, weightInput: any, feedInput: any, curve: any[]) => {
    const age = parseInt(ageInput);
    const currentWeight = parseFloat(weightInput);
    const currentFeed = parseFloat(feedInput);
    
    if (!curve || curve.length === 0 || isNaN(age)) return null;
    
    const target = curve.reduce((prev, curr) => 
        Math.abs(curr.day - age) < Math.abs(prev.day - age) ? curr : prev
    );
    
    if (!target) return null;

    const weightGap = !isNaN(currentWeight) ? currentWeight - target.weight : 0;
    const weightRatio = !isNaN(currentWeight) ? currentWeight / target.weight : 0;
    let weightStatus: 'success' | 'warning' | 'danger' = 'danger';
    if (weightRatio >= 0.95) weightStatus = 'success';
    else if (weightRatio >= 0.85) weightStatus = 'warning';

    let feedStatus: 'success' | 'warning' | 'danger' | 'unknown' = 'unknown';
    let feedGap = 0;
    let targetFeed = target.feed_daily || 0;

    if (!isNaN(currentFeed) && targetFeed > 0) {
        feedGap = currentFeed - targetFeed;
        const feedRatio = currentFeed / targetFeed;
        if (feedRatio >= 0.90 && feedRatio <= 1.10) feedStatus = 'success';
        else if (feedRatio > 0.80 && feedRatio < 1.20) feedStatus = 'warning';
        else feedStatus = 'danger';
    }

    return { targetDay: target.day, targetWeight: target.weight, weightGap, weightStatus, targetFeed, feedGap, feedStatus };
};

export const estimateTotalFeedConsumption = (flock: Flock): number => {
    if (!flock.observations || flock.observations.length === 0) return 0;

    const sortedObs = [...flock.observations].sort((a, b) => 
        new Date(a.observedAt || '').getTime() - new Date(b.observedAt || '').getTime()
    );

    let totalKg = 0;
    let prevAge = 0;
    let prevConso = 0; 
    let prevSubjects = flock.subjectCount;

    for (const obs of sortedObs) {
        const currentAge = obs.data.age || calculateAgeInDays(flock.startDate, obs.observedAt || '');
        const currentConso = parseFloat(obs.data.consoTete || 0);
        const currentMortality = parseFloat(obs.data.mortalite || 0);
        const daysDuration = currentAge - prevAge;
        
        if (daysDuration > 0 && currentConso > 0) {
            const avgConsoG = (prevConso + currentConso) / 2;
            const avgSubjects = prevSubjects - (currentMortality / 2); 
            const periodConsumptionKg = (avgConsoG * avgSubjects * daysDuration) / 1000;
            totalKg += periodConsumptionKg;
        }
        prevAge = currentAge;
        prevConso = currentConso;
        prevSubjects -= currentMortality;
    }
    return parseFloat(totalKg.toFixed(0));
};

export const getFieldFeedback = (field: string, val: string) => {
    if (!val) return { style: 'border-gray-300', message: null };
    
    if (field === 'litiere') {
        if (val.includes('Détrempée') || val.includes('Collante') || val.includes('Croûteuse')) 
            return { style: 'border-red-500 bg-red-50 text-red-900 font-bold', message: '🚨 Risque Coccidiose' };
        if (val.includes('Humide')) 
            return { style: 'border-orange-500 bg-orange-50 text-orange-900 font-bold', message: '⚠️ Fermentation' };
        if (val.includes('Sèche') || val.includes('Friable')) 
            return { style: 'border-green-500 bg-green-50 text-green-900 font-bold', message: '✅ Saine' };
    }

    if (field === 'phValue') {
        if (val.includes('Danger') || val.includes('< 6') || val.includes('> 8')) 
            return { style: 'border-red-500 bg-red-50 text-red-900 font-bold', message: '🚨 Danger : Traitement eau requis.' };
        if (val.includes('Acceptable')) 
            return { style: 'border-orange-500 bg-orange-50 text-orange-900 font-bold', message: '⚠️ À surveiller.' };
        if (val.includes('Optimal') || val.includes('Bon')) 
            return { style: 'border-green-500 bg-green-50 text-green-900 font-bold', message: '✅ Eau OK.' };
    }

    if (field === 'uniformite') {
        if (val.includes('Mauvais') || val.includes('< 60')) 
            return { style: 'border-red-500 bg-red-50 text-red-900 font-bold', message: '🚨 Hétérogénéité critique.' };
        if (val.includes('Moyen') || val.includes('60%')) 
            return { style: 'border-orange-500 bg-orange-50 text-orange-900 font-bold', message: '⚠️ Tri nécessaire.' };
        if (val.includes('Bon') || val.includes('Excellent'))
            return { style: 'border-green-500 bg-green-50 text-green-900 font-bold', message: '✅ Lot homogène.' };
    }

    if (field === 'cv') {
        if (val.includes('> 12')) 
            return { style: 'border-red-500 bg-red-50 text-red-900 font-bold', message: '🚨 Lot très hétérogène.' };
        if (val.includes('10 - 12')) 
            return { style: 'border-orange-500 bg-orange-50 text-orange-900 font-bold', message: '⚠️ À surveiller.' };
        if (val.includes('< 8') || val.includes('8 - 10'))
            return { style: 'border-green-500 bg-green-50 text-green-900 font-bold', message: '✅ Lot homogène.' };
    }
    
    return { style: 'border-gray-300', message: null };
};

export const getWaterOptions = (speculationName: string) => {
    const isFish = speculationName?.toLowerCase().includes('pisciculture') || speculationName?.toLowerCase().includes('poisson');
    if (isFish) return ["6.5 - 7.5 (Optimal)", "6.0 - 6.5 (Acceptable)", "7.5 - 8.5 (Acceptable)", "< 6.0 (Acide - Danger)", "> 8.5 (Basique - Danger)"];
    return ["6.0 - 6.8 (Optimal)", "6.8 - 7.5 (Acceptable)", "< 6.0 (Trop Acide)", "> 7.5 (Trop Alcalin)"];
};

export const getPreviousWeight = (flock: Flock, currentObsId?: number): number => {
    if (!flock.observations || flock.observations.length === 0) return 0;
    const history = flock.observations.filter(o => o.id !== currentObsId && o.data?.poidsMoyen > 0);
    if (history.length === 0) return 0;
    history.sort((a, b) => new Date(b.observedAt || '').getTime() - new Date(a.observedAt || '').getTime());
    return history[0].data.poidsMoyen;
};

export const getHistoricalObservations = (flock: Flock, currentObsId?: number): Observation[] => {
    if (!flock.observations || flock.observations.length === 0) return [];
    const history = flock.observations.filter(o => o.id !== currentObsId);
    return history.sort((a, b) => new Date(b.observedAt || '').getTime() - new Date(a.observedAt || '').getTime());
};

// --- LOGIQUE MÉTIER AVANCÉE (Stages & Uniformité) ---

/**
 * Définit l'étape alimentaire en fonction de l'espèce et de l'âge
 */
export const getFeedingStage = (speculationName: string, age: number): string => {
    const name = speculationName.toLowerCase();
    
    if (name.includes('chair')) { // Poulet de chair
        if (age <= 10) return "Pré-démarrage";
        if (age <= 21) return "Démarrage";
        if (age <= 35) return "Croissance";
        return "Finition";
    }
    
    if (name.includes('ponte') || name.includes('pondeuse')) {
        if (age <= 35) return "Démarrage";
        if (age <= 70) return "Croissance 1";
        if (age <= 126) return "Croissance 2 (Pré-ponte)";
        return "Ponte";
    }

    if (name.includes('porc') || name.includes('suidé')) {
        if (age <= 42) return "Premier Âge (Booster)";
        if (age <= 70) return "Démarrage";
        if (age <= 120) return "Croissance";
        return "Finition";
    }

    if (name.includes('poisson') || name.includes('pisciculture')) {
        if (age <= 30) return "Alevinage";
        if (age <= 90) return "Croissance";
        return "Grossissement";
    }

    return "Standard";
};

/**
 * Générateur d'Insights Experts
 * Intègre: Santé, Benchmark, Uniformité, Cohérence Alimentaire, Ambiance
 */
export const generateExpertInsights = (obs: any, flock: any, benchmark: any, density: number, totalMortalite: number, dueVaccines: any[]) => {
    const insights = [];
    const sujetsRestants = flock.subjectCount - totalMortalite;
    const specName = flock.speculation?.name?.toLowerCase() || '';
    const age = obs.data.age || calculateAgeInDays(flock.startDate, obs.observedAt || '');
    const currentStage = getFeedingStage(specName, age);

    // --- 1. IDENTIFICATION DE L'ESPÈCE ---
    const isFish = specName.includes('pisciculture') || specName.includes('poisson');
    const isPig = specName.includes('porc') || specName.includes('suidé');
    const isCattle = specName.includes('bovin') || specName.includes('vache') || specName.includes('veau');
    const isPoultry = !isFish && !isPig && !isCattle;

    // --- 2. ALERTES SANITAIRES & VACCINS ---
    if (dueVaccines && dueVaccines.length > 0) {
        dueVaccines.forEach((v: any) => insights.push({ 
            type: 'warning', 
            text: `💉 RAPPEL : ${v.name} prévu vers J${v.targetDay}.` 
        }));
    }

    // Alerte Mortalité Cumulée
    const mortalitePourcentage = (totalMortalite / flock.subjectCount) * 100;
    if (mortalitePourcentage > 5) {
        insights.push({ type: 'danger', text: `Mortalité cumulée critique : ${mortalitePourcentage.toFixed(1)}% (> 5%).` });
    }

    // --- 3. MATÉRIEL & DENSITÉ (Adapté par espèce) ---
    if (isPoultry) {
        if (obs.data.abreuvoirs > 0) { 
            const ratioAbr = sujetsRestants / obs.data.abreuvoirs; 
            if (ratioAbr > 80) insights.push({ type: 'danger', text: `Manque d'abreuvoirs : 1 pour ${ratioAbr.toFixed(0)} sujets (Max 80).` }); 
        }
        if (obs.data.mangeoires > 0) { 
            const ratioMang = sujetsRestants / obs.data.mangeoires; 
            if (ratioMang > 55) insights.push({ type: 'danger', text: `Manque de mangeoires : 1 pour ${ratioMang.toFixed(0)} sujets (Max 55).` }); 
        }
        if (density > 22) insights.push({ type: 'danger', text: `Surdensité critique : ${density} suj/m² (Risque étouffement/chaleur).` });
        else if (density > 18) insights.push({ type: 'warning', text: `Densité élevée : ${density} suj/m².` });
    } 

    if (isPig) {
        if (density > 1.5) insights.push({ type: 'warning', text: `Densité porcine suspecte : ${density} suj/m². Vérifiez l'espace vital.` });
    }

    // --- 4. ANALYSE DE L'EAU (pH) ---
    const phValue = obs.data.phValue;
    if (phValue) {
        if (phValue.includes('Danger') || phValue.includes('< 6') || phValue.includes('> 8.5')) {
            insights.push({ type: 'danger', text: "Qualité d'eau critique : Risque de diarrhées ou d'inefficacité des traitements." });
        }
    }

    // --- 5. ALIMENTATION & STOCKS ---
    const inv = obs.data.inventory;
    if (inv) {
        if (obs.data.feedStrategy === 'SELF_MIX') {
            if (inv.mais && inv.mais.current < 100) insights.push({ type: 'warning', text: "Stock Maïs faible (< 100kg)." });
            if (inv.concentre && inv.concentre.current < 20) insights.push({ type: 'danger', text: "Rupture de Concentré imminente !" });
        } else if (inv.complete) {
            if (inv.complete.current < 50) insights.push({ type: 'danger', text: "Stock d'aliment critique (< 50kg)." });
            else if (inv.complete.current < 150) insights.push({ type: 'warning', text: "Prévoir commande d'aliment." });
        }
    }

    const feedBrand = obs.data.feedBrand || "";
    // Insight : Cohérence Étape vs Marque
    // On vérifie si la marque contient le mot clé de l'étape (ex: "Démarrage")
    if (feedBrand && !feedBrand.toLowerCase().includes(currentStage.toLowerCase().split(' ')[0])) {
        // Exception : Si le nom de l'aliment est générique, on ignore parfois, mais ici on garde l'alerte
        insights.push({ 
            type: 'warning', 
            text: `⚠️ Incohérence possible : Le lot est en étape "${currentStage}", mais l'aliment déclaré est "${feedBrand}".` 
        });
    }

    // --- 6. PERFORMANCES CROISSANCE (Benchmark) ---
    if (benchmark) {
        // Alerte Poids
        if (benchmark.weightStatus === 'danger') {
            const gapPct = benchmark.targetWeight > 0 ? Math.abs((benchmark.weightGap / benchmark.targetWeight) * 100).toFixed(0) : 0;
            insights.push({ type: 'danger', text: `Retard de croissance important : -${gapPct}% par rapport à l'objectif.` });
        }
        
        // Alerte Consommation Alimentaire
        if (benchmark.feedStatus === 'danger' && benchmark.feedGap < 0) {
            insights.push({ type: 'danger', text: `Sous-consommation d'aliment (${benchmark.feedGap.toFixed(0)}g/j). Vérifiez la santé ou la température.` });
        } else if (benchmark.feedGap > 20) {
             insights.push({ type: 'warning', text: `Gaspillage d'aliment suspect (+${benchmark.feedGap.toFixed(0)}g/j). Vérifiez le réglage des mangeoires.` });
        }

        if (currentStage === "Pré-démarrage" && benchmark.feedGap < -2) {
            insights.push({ type: 'danger', text: "🚨 Sous-consommation critique en pré-démarrage : Risque de retard irréversible." });
        }
    }

    // --- 7. ANALYSE DE L'UNIFORMITÉ & CV (Nouveautés) ---
    const uniformite = obs.data.uniformite; 
    const cvValue = obs.data.cv; 

    if (isPoultry) {
        // Analyse Volaille : Basée sur le % dans ±10% du poids moyen
        if (uniformite) {
            const valNum = parseInt(uniformite.replace(/\D/g, '')) || 0; // Extraction du nombre
            
            if (uniformite.includes('Mauvais') || (valNum > 0 && valNum < 70)) {
                let diagnostic = "Hétérogénéité critique.";
                if (age <= 7) diagnostic += " Problème de démarrage (préchauffage/qualité poussin).";
                else if (age > 21) diagnostic += " Stress thermique ou densité excessive suspectée.";
                else diagnostic += " Vérifiez l'accès égal à l'aliment (nombre/hauteur mangeoires).";
                
                insights.push({ type: 'danger', text: `🚨 ${diagnostic}` });
            } else if (uniformite.includes('Moyen') || (valNum >= 70 && valNum < 80)) {
                insights.push({ type: 'warning', text: "⚠️ Uniformité moyenne : Surveillez la compétition aux mangeoires." });
            }
        }
    }

    if (isPig) {
        // Analyse Porc : Basée sur le Coefficient de Variation (CV)
        if (cvValue) {
            if (cvValue.includes('> 12') || cvValue.includes('> 15') || cvValue.includes('Mauvais')) {
                insights.push({ 
                    type: 'danger', 
                    text: "🚨 CV Élevé : Forte dominance sociale. Action : Regrouper les sujets par classes de poids." 
                });
            } else if (age < 40 && (cvValue.includes('10 - 12'))) {
                insights.push({ 
                    type: 'warning', 
                    text: "⚠️ Variabilité post-sevrage : Prolongez la transition alimentaire ou vérifiez la digestibilité." 
                });
            }
        }
    }

    if (isCattle) {
        // Analyse Ruminant : Basée sur le Score d'État Corporel (BCS Gap)
        const bcsGap = obs.data.bcsGap; 
        if (bcsGap > 1) {
            insights.push({ 
                type: 'danger', 
                text: "🚨 Écart de BCS critique (> 1pt) : Ration mal équilibrée ou compétition à l'auge. Séparez les lots." 
            });
        }
    }

    // --- 8. AMBIANCE & TECHNIQUE ---
    if (obs.data.waterConsumptionIncrease === 'no') {
        insights.push({ type: 'danger', text: "↘️ Chute de consommation d'eau : Premier signe de maladie." });
    }

    if (obs.data.litiere && (obs.data.litiere.includes('Détrempée') || obs.data.litiere.includes('Croûteuse'))) {
        insights.push({ type: 'danger', text: "Litière dégradée : Risque élevé de coccidiose et brûlures de pattes." });
    }

    return insights;
};

export const BenchmarkCard = ({ benchmark, type = 'weight' }: { benchmark: any, type?: 'weight'|'feed' }) => {
    if (!benchmark) return null;
    
    const target = type === 'weight' ? benchmark.targetWeight : benchmark.targetFeed;
    if (type === 'feed' && (!target || target === 0)) return null;

    const status = type === 'weight' ? benchmark.weightStatus : benchmark.feedStatus;
    const gap = type === 'weight' ? benchmark.weightGap : benchmark.feedGap;
    
    const colors = { 
        success: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' }, 
        warning: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '⚠️' }, 
        danger: { bg: 'bg-red-100', text: 'text-red-800', icon: '🚨' },
        unknown: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '❓' }
    };
    
    const s = colors[status as keyof typeof colors] || colors.unknown;
    const sign = gap > 0 ? '+' : '';
    
    return (
        <div className={`mt-1 px-2 py-1 rounded text-[10px] flex justify-between items-center ${s.bg}`}>
            <span className={`font-bold ${s.text}`}>{s.icon} Obj: {target}g</span>
            <span className={`font-black ${s.text}`}>{sign}{gap.toFixed(0)}g</span>
        </div>
    );
};