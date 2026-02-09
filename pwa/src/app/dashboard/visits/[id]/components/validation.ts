// app/dashboard/visits/[id]/components/validation.ts
import { ObservationData, CommonData } from "./types";

export interface ValidationErrors {
    [key: string]: string;
}

export const validateStepVital = (data: ObservationData): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    if (data.mortalite < 0) {
        errors.mortalite = "La mortalité ne peut pas être négative";
    }
    
    if (data.poidsMoyen <= 0) {
        errors.poidsMoyen = "Le poids moyen est obligatoire";
    }
    
    if (data.consoTete <= 0) {
        errors.consoTete = "La consommation est obligatoire";
    }
    
    return errors;
};

export const validateStepEnvironment = (data: ObservationData): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    /* if (!data.phValue) {
        errors.phValue = "Le pH est obligatoire";
    } */
    
    if (!data.litiere) {
        errors.litiere = "L'état de la litière est obligatoire";
    }
    
    if (!data.uniformite) {
        errors.uniformite = "L'uniformité est obligatoire";
    }
    
    /* if (!data.cv) {
        errors.cv = "Le coefficient de variation est obligatoire";
    } */
    
    return errors;
};

export const validateStepEquipment = (data: ObservationData, isFish: boolean): ValidationErrors => {
    if (isFish) return {};
    
    const errors: ValidationErrors = {};
    
    if (data.abreuvoirs <= 0) {
        errors.abreuvoirs = "Le nombre d'abreuvoirs est obligatoire";
    }
    
    if (data.mangeoires <= 0) {
        errors.mangeoires = "Le nombre de mangeoires est obligatoire";
    }
    
    return errors;
};

export const validateStepFeeding = (data: ObservationData): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    if (!data.feedBrand || data.feedBrand.trim() === "") {
        errors.feedBrand = "La marque/formule d'aliment est obligatoire";
    }
    
    return errors;
};

export const validateStepProblems = (common: CommonData): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    // Si vous voulez rendre les recommandations obligatoires :
    if (!common.recommendations || common.recommendations.trim() === "") {
        errors.recommendations = "Les recommandations sont obligatoires";
    }
    
    /* // Si vous voulez rendre les observations obligatoires :
    if (!common.observation || common.observation.trim() === "") {
        errors.observation = "Les observations sont obligatoires";
    }
     */
    return errors;
};

export const validateStepSupply = (data: ObservationData): ValidationErrors => {
    const errors: ValidationErrors = {};
    const supply = data.supply;
    
    if (!supply?.source) {
        errors.supplySource = "Le lieu d'approvisionnement est obligatoire";
        return errors;
    }
    
    // Validation selon le type de source
    if (supply.source === "AGENCE") {
        if (!supply.agency?.agencies || supply.agency.agencies.length === 0) {
            errors.supplyAgency = "Veuillez sélectionner au moins une agence";
        }
    }
    
    if (supply.source === "PROVENDERIE") {
        if (!supply.provenderie?.name?.trim()) {
            errors.provenderieName = "Le nom de la provenderie est obligatoire";
        }
        if (!supply.provenderie?.location?.trim()) {
            errors.provenderieLocation = "La localisation est obligatoire";
        }
    }
    
    if (supply.source === "CONCURRENCE" && !supply.competitor?.name?.trim()) {
        errors.competitorName = "Le nom du concurrent est obligatoire";
    }
    
    // Validation précommande
    if (supply.hasPreOrder) {
        if (!supply.plannedPurchaseDate) {
            errors.plannedPurchaseDate = "La date d'achat programmée est obligatoire";
        }
        
        if (supply.preOrderItems.length === 0) {
            errors.preOrderItems = "Ajoutez au moins un produit à précommander";
        } else {
            const invalidItem = supply.preOrderItems.find(
                item => !item.product || item.quantity <= 0
            );
            if (invalidItem) {
                errors.preOrderItems = "Tous les produits doivent avoir un nom et une quantité valide";
            }
        }
    }
    
    return errors;
};