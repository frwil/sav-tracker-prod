'use client';

import { useState, useEffect, useCallback } from 'react';

// Nettoyage URL pour éviter les doubles slashs
const cleanUrl = (url: string | undefined) => {
    if (!url) return '';
    return url.endsWith('/') ? url.slice(0, -1) : url;
};

const API_BASE = cleanUrl(process.env.NEXT_PUBLIC_API_URL);

export interface CustomerOption {
    value: string;
    label: string;
}

export function useCustomers() {
    const [options, setOptions] = useState<CustomerOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 1. Définition de la fonction de chargement (Stable avec useCallback)
    const fetchCustomers = useCallback(async () => {
        const token = localStorage.getItem('sav_token');
        setLoading(true);
        setError(null);

        // A. Chargement Cache (Optimiste)
        const cachedData = localStorage.getItem('sav_customers_cache');
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                setOptions(parsed);
            } catch (e) {
                console.error("Erreur cache", e);
            }
        }

        if (!navigator.onLine) {
            setLoading(false);
            return;
        }

        // B. Appel API
        try {
            const url = `${API_BASE}/customers?pagination=false`;
            
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/ld+json'
                }
            });

            if (res.ok) {
                const data = await res.json();
                
                // Gestion compatible Hydra (API Platform) ou tableau simple
                const rawMembers = data['hydra:member'] || data['member'] || [];

                const formattedOptions: CustomerOption[] = rawMembers.map((c: any) => ({
                    value: c['@id'] || `/api/customers/${c.id}`, 
                    label: c.zone ? `${c.name} (${c.zone})` : c.name
                }));
                
                // Tri alphabétique pour plus de confort
                formattedOptions.sort((a, b) => a.label.localeCompare(b.label));

                setOptions(formattedOptions);
                localStorage.setItem('sav_customers_cache', JSON.stringify(formattedOptions));
            } else {
                console.error("Erreur API Customers:", res.status);
                // Si pas de cache, on affiche l'erreur
                if (!cachedData) setError("Impossible de charger les clients.");
            }
        } catch (err: any) {
            console.error("Erreur Fetch Customers:", err);
            if (!cachedData) setError("Erreur de connexion.");
        } finally {
            setLoading(false);
        }
    }, []);

    // 2. Chargement initial
    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    // 3. On retourne 'refetch' pour permettre le rechargement manuel
    return { options, loading, error, refetch: fetchCustomers };
}