// pwa/src/types/visit.ts

/**
 * Représente une tâche sanitaire (Vaccin ou Traitement) liée au calendrier.
 */
export interface ProphylaxisTask {
    id: number;
    targetDay: number; // Jour cible (ex: J14)
    name: string;      // Nom du vaccin/traitement
    type: string;      // ex: 'VACCIN', 'VITAMINE'
    done: boolean;     // Statut : fait ou non
    notes?: string;    // Commentaire optionnel
}

/**
 * Données de référence pour l'espèce (ex: Poulet de chair - Cobb 500).
 */
export interface Speculation {
    '@id': string;
    id: number;
    name: string;
}

export interface Standard {
    '@id': string;
    id: number;
    name: string;
    // On pourrait ajouter ici les courbes de référence (poids cible, etc.)
}

/**
 * Une observation (Rapport) faite par le technicien durant la visite.
 */
export interface Observation {
    id?: number;       // Optionnel car undefined lors de la création
    '@id'?: string;    // IRI API Platform
    observedAt: string; // Date ISO
    
    // Champs textuels
    problems?: string;
    recommendations?: string;
    
    // Métriques (optionnel selon le type de visite)
    data?: {
        averageWeight?: number;    // Poids moyen mesuré
        mortality?: number;        // Nombre de morts du jour
        temperature?: number;      // Température bâtiment
        humidity?: number;         // Hygrométrie
        waterConsumption?: number; // Consommation eau
    };
    
    // Photos (URLs ou Base64)
    photos?: string[];
}

/**
 * Représente un Lot (Flock) d'animaux.
 */
export interface Flock {
    '@id': string;
    id: number;
    name: string;
    startDate: string;     // Date de mise en place
    subjectCount: number;  // Effectif de départ
    currentCount?: number; // Effectif actuel (calculé)
    
    speculation: Speculation;
    standard?: Standard;
    building?: { 
        id: number; 
        name: string; 
    };
    
    closed: boolean;
    activated: boolean;
}

/**
 * L'objet principal : La Visite.
 */
export interface Visit {
    '@id': string;
    id: number;
    startDate: string;  // Date de début de visite
    closed: boolean;    // Est-ce que la visite est terminée ?
    
    // Relations
    customer: {
        '@id': string;
        id: number;
        name: string;
        zone: string;
        phoneNumber?: string;
    };
    
    flock?: Flock; // La visite peut être liée à un lot spécifique
    
    // Listes associées
    prophylaxisTasks: ProphylaxisTask[]; // Calendrier prophylactique du lot
    observations: Observation[];         // Historique des observations de cette visite
}