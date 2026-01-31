"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Liste des pages critiques à rendre disponibles hors ligne
const CRITICAL_ROUTES = [
    "/dashboard",
    "/dashboard/customers",
    "/dashboard/visits",
    "/dashboard/visits/new",
    "/dashboard/buildings",
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
            
            console.log(`✅ ${CRITICAL_ROUTES.length} vues pré-chargées en cache.`);
        }, 3000); // 3 secondes après le montage

        return () => clearTimeout(timer);
    }, [router]);

    return null; // Ce composant ne rend rien visuellement
}