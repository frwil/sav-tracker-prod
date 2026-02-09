// app/dashboard/visits/[id]/components/types.ts
import { ProphylaxisTask, Problem } from "@/app/dashboard/visits/[id]/shared";

export type SupplySource = "AGENCE" | "PROVENDERIE" | "CONCURRENCE";

export interface Agency {
    id: string;
    company: "BELGOCAM" | "SPC" | "PDC";
    name: string;
    location?: string;
}

export interface SupplyAgency {
    agencies: Agency[]; // Plusieurs agences possibles
}

export interface SupplyProvenderie {
    name: string;
    location: string;
}

export interface SupplyCompetitor {
    name: string;
}

export interface PreOrderItem {
    id: string; // pour éviter les doublons dans la liste
    product: string;
    quantity: number;
}

export interface SupplyData {
    source: SupplySource;
    agency?: SupplyAgency;
    provenderie?: SupplyProvenderie;
    competitor?: SupplyCompetitor;
    hasPreOrder: boolean;
    preOrderItems: PreOrderItem[];
    plannedPurchaseDate?: string; // ISO date
}

export interface ObservationData {
    age: number;
    mortalite: number;
    poidsMoyen: number;
    consoTete: number;
    phValue: string;
    litiere: string;
    uniformite: string;
    cv: string;
    waterConsumptionIncrease: "yes" | "no" | "stable";
    biosecurite: string;
    abreuvoirs: number;
    mangeoires: number;
    vaccinesDone: number[];
    feedStrategy: "INDUSTRIAL" | "SELF_MIX" | "THIRD_PARTY";
    feedBrand: string;
    inventory: {
        complete: { current: number; added: number };
        mais: { current: number; added: number };
        soja: { current: number; added: number };
        concentre: { current: number; added: number };
        [key: string]: { current: number; added: number };
    };
    supply: SupplyData; // Nouveau champ
    [key: string]: any;
}


export interface CommonData {
    concerns: string;
    observation: string;
    recommendations: string;
}

export interface StepProps {
    data: ObservationData;
    updateData: (key: string, value: any) => void;
    flock: any;
    isFirstObservation: boolean;
    isValid: boolean;
    errors: Record<string, string>;
}

// Pour les steps qui ont besoin de building
export interface StepWithBuildingProps extends StepProps {
    building: any;
}

export interface ObservationFormProps {
    visitIri: string;
    flock: any;
    building: any;
    visit: any;
    initialData?: any;
    onSuccess: () => void;
    onCancel: () => void;
}

export interface StepConfig {
    id: string;
    title: string;
    component: React.ComponentType<any>;
    requiredFields: string[];
    isOptional?: boolean;
    shouldSkip?: (context: { isFish: boolean }) => boolean;
}