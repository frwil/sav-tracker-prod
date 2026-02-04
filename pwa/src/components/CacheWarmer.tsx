"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// Liste des pages critiques à rendre disponibles hors ligne
const CRITICAL_ROUTES = [
    "/dashboard",
    "/dashboard/customers",
    "/dashboard/visits",
    "/dashboard/visits/new",
    "/dashboard/buildings",
    "/dashboard/prospections",
    "/dashboard/prospections/new",
    "/dashboard/reports",
    "/dashboard/settings",
    "/dashboard/reports/performance",
    "/dashboard/reports/visites",
    "/dashboard/reports/commercial",
    "/dashboard/reports/forecast",
    "/dashboard/reports/aliment",
    // Ajoutez d'autres routes si nécessaire
];

export default function CacheWarmer() {
    const router = useRouter();

    useEffect(() => {
        // On attend un peu que l'app principale soit chargée pour ne pas ralentir le démarrage
        const timer = setTimeout(() => {
            console.log("🔥 Démarrage du pré-chargement des vues...");
            
            CRITICAL_ROUTES.forEach((route) => {
                router.prefetch(route);
            });
            toast.success("✅ Pré-chargement des vues critiques terminé.");
            console.log(`✅ ${CRITICAL_ROUTES.length} vues pré-chargées en cache.`);
        }, 3000); // 3 secondes après le montage

        return () => clearTimeout(timer);
    }, [router]);

    return null; // Ce composant ne rend rien visuellement
}