'use client';

import { useState, useEffect } from 'react';

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

    useEffect(() => {
        let isMounted = true;

        const loadCustomers = async () => {
            const token = localStorage.getItem('sav_token');
            
            // 1. CHARGEMENT CACHE (Immédiat)
            const cachedData = localStorage.getItem('sav_customers_cache');
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    if (isMounted) setOptions(parsed);
                } catch (e) {
                    console.error("Erreur cache", e);
                }
            }

            if (!navigator.onLine) {
                if (isMounted) setLoading(false);
                return;
            }

            // 2. APPEL API
            try {
                // On tente de charger sans pagination pour avoir toute la liste
                const url = `${API_BASE}/customers?pagination=false`;
                
                const res = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/ld+json'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    
                    // ⚠️ CORRECTION ICI : On cherche 'hydra:member' OU 'member'
                    const rawMembers = data['hydra:member'] || data['member'] || [];

                    //console.log(`✅ ${rawMembers.length} clients chargés.`);

                    const formattedOptions: CustomerOption[] = rawMembers.map((c: any) => ({
                        // Utilise @id ou construit l'IRI manuellement si absent
                        value: c['@id'] || `/api/customers/${c.id}`, 
                        label: c.zone ? `${c.name} (${c.zone})` : c.name
                    }));

                    if (isMounted) {
                        setOptions(formattedOptions);
                        localStorage.setItem('sav_customers_cache', JSON.stringify(formattedOptions));
                    }
                } else {
                    console.error("Erreur API Customers:", res.status);
                    if (!cachedData && isMounted) setError("Impossible de charger les clients.");
                }
            } catch (err: any) {
                console.error("Erreur Fetch Customers:", err);
                if (!cachedData && isMounted) setError("Erreur de connexion.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadCustomers();

        return () => { isMounted = false; };
    }, []);

    return { options, loading, error };
}