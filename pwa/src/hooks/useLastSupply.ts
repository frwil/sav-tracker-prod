// hooks/useLastSupply.ts
import { useState, useEffect } from "react";
import { API_URL } from "@/app/dashboard/visits/[id]/shared";
import { SupplyData } from "@/app/dashboard/visits/[id]/components/types";

export const useLastSupply = (flockId: string | number) => {
    const [lastSupply, setLastSupply] = useState<SupplyData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLastSupply = async () => {
            if (!navigator.onLine || !flockId) {
                setLoading(false);
                return;
            }

            const token = localStorage.getItem("sav_token");
            try {
                const res = await fetch(
                    `${API_URL}/observations?flock=${flockId}&order[observedAt]=desc&itemsPerPage=1`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/ld+json",
                        },
                    },
                );

                if (res.ok) {
                    const data = await res.json();
                    const observations = data["hydra:member"] || [];
                    if (observations.length > 0 && observations[0].data?.supply) {
                        setLastSupply(observations[0].data.supply);
                    }
                }
            } catch (e) {
                console.error("Erreur récupération dernière supply:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchLastSupply();
    }, [flockId]);

    return { lastSupply, loading };
};