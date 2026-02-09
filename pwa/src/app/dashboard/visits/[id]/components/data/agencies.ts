// app/dashboard/visits/[id]/components/data/agencies.ts
export interface AgencyOption {
    id: string;
    company: "BELGOCAM" | "SPC" | "PDC";
    name: string;
    location: string;
}

export const AGENCIES: AgencyOption[] = [
    // BELGOCAM
    { id: "bgc_yaounde", company: "BELGOCAM", name: "Agence Yaoundé", location: "Yaoundé" },
    { id: "bgc_douala", company: "BELGOCAM", name: "Agence Douala", location: "Douala" },
    { id: "bgc_bafoussam", company: "BELGOCAM", name: "Agence Bafoussam", location: "Bafoussam" },
    { id: "bgc_bamenda", company: "BELGOCAM", name: "Agence Bamenda", location: "Bamenda" },
    { id: "bgc_bertoua", company: "BELGOCAM", name: "Agence Bertoua", location: "Bertoua" },
    { id: "bgc_ebolowa", company: "BELGOCAM", name: "Agence Ebolowa", location: "Ebolowa" },
    { id: "bgc_garoua", company: "BELGOCAM", name: "Agence Garoua", location: "Garoua" },
    { id: "bgc_maroua", company: "BELGOCAM", name: "Agence Maroua", location: "Maroua" },
    { id: "bgc_ngaoundere", company: "BELGOCAM", name: "Agence Ngaoundéré", location: "Ngaoundéré" },
    
    // SPC
    { id: "spc_yaounde", company: "SPC", name: "SPC Yaoundé", location: "Yaoundé" },
    { id: "spc_douala", company: "SPC", name: "SPC Douala", location: "Douala" },
    { id: "spc_bafoussam", company: "SPC", name: "SPC Bafoussam", location: "Bafoussam" },
    { id: "spc_bamenda", company: "SPC", name: "SPC Bamenda", location: "Bamenda" },
    { id: "spc_bertoua", company: "SPC", name: "SPC Bertoua", location: "Bertoua" },
    { id: "spc_garoua", company: "SPC", name: "SPC Garoua", location: "Garoua" },
    
    // PDC
    { id: "pdc_yaounde", company: "PDC", name: "PDC Yaoundé", location: "Yaoundé" },
    { id: "pdc_douala", company: "PDC", name: "PDC Douala", location: "Douala" },
    { id: "pdc_bafoussam", company: "PDC", name: "PDC Bafoussam", location: "Bafoussam" },
    { id: "pdc_bamenda", company: "PDC", name: "PDC Bamenda", location: "Bamenda" },
    { id: "pdc_bertoua", company: "PDC", name: "PDC Bertoua", location: "Bertoua" },
];

export const COMPANIES = [
    { value: "BELGOCAM", label: "Belgocam", color: "#e11d48" },
    { value: "SPC", label: "SPC", color: "#059669" },
    { value: "PDC", label: "PDC", color: "#2563eb" },
] as const;