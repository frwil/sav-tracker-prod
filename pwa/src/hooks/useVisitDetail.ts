// hooks/useVisitDetail.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24h

export interface VisitDetail {
    id: number | string;
    visitedAt?: string | null;
    plannedAt?: string | null;
    completedAt?: string | null;
    status: string;
    technician: { id: number; fullname: string; email?: string; phone?: string };
    customer: { id: number; name: string; zone: string; address?: string; phone?: string; buildings?: any[] };
    gpsCoordinates?: string;
    closed: boolean;
    activated: boolean;
    objective: string;
    conclusion?: string;
    observations: any[];
    [key: string]: any;
}

interface CachedDetail {
    data: VisitDetail;
    timestamp: number;
    source: 'api' | 'fallback';
}

export const useVisitDetail = (id: string | number | null) => {
    const [visit, setVisit] = useState<VisitDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isPartial, setIsPartial] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const getCacheKey = useCallback(() => `visit_detail_v2_${id}`, [id]);

    const loadFromCache = useCallback((): CachedDetail | null => {
        const cacheKey = getCacheKey();
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            const parsed: CachedDetail = JSON.parse(cached);
            setCacheAge(Date.now() - parsed.timestamp);
            return parsed;
        }

        // Fallback : chercher dans les caches de liste
        const listCacheKeys = Object.keys(localStorage).filter(k => 
            k.startsWith('visits_v3_') && k.includes(`_${id}_`)
        );

        for (const key of listCacheKeys) {
            const listCached = localStorage.getItem(key);
            if (listCached) {
                const parsed = JSON.parse(listCached);
                const visitFromList = parsed.visits?.find((v: any) => v.id == id);
                if (visitFromList) {
                    return {
                        data: { ...visitFromList, observations: [], customer: { ...visitFromList.customer, buildings: [] } },
                        timestamp: parsed.timestamp,
                        source: 'fallback'
                    };
                }
            }
        }

        return null;
    }, [id, getCacheKey]);

    const saveToCache = useCallback((data: VisitDetail) => {
        const cacheKey = getCacheKey();
        const cacheData: CachedDetail = {
            data,
            timestamp: Date.now(),
            source: 'api'
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        setCacheAge(0);
        setIsPartial(false);
    }, [getCacheKey]);

    const refresh = useCallback(async () => {
        if (!id) return;
        
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('sav_token');
        if (!token) {
            setError('Non authentifié');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/visits/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/ld+json',
                },
            });

            if (res.status === 401) {
                localStorage.removeItem('sav_token');
                setError('Session expirée');
                setLoading(false);
                return;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            setVisit(data);
            setIsOffline(false);
            saveToCache(data);
        } catch (err) {
            console.error('Erreur fetch détail:', err);
            
            const cached = loadFromCache();
            if (cached) {
                setVisit(cached.data);
                setIsOffline(true);
                setIsPartial(cached.source === 'fallback');
                if (cached.source === 'fallback') {
                    toast('Données partielles (depuis la liste)', { id: 'partial-data' });
                }
            } else {
                setError('Visite non disponible');
            }
        } finally {
            setLoading(false);
        }
    }, [id, loadFromCache, saveToCache]);

    useEffect(() => {
        if (!id) {
            setVisit(null);
            setLoading(false);
            return;
        }

        // Charger cache immédiatement
        const cached = loadFromCache();
        if (cached) {
            setVisit(cached.data);
            setIsPartial(cached.source === 'fallback');
            setLoading(false);
        }

        // Rafraîchir si online
        if (navigator.onLine) {
            refresh();
        } else {
            setIsOffline(true);
            if (!cached) {
                setError('Aucune donnée en cache');
                setLoading(false);
            }
        }

        // Écouteur retour online
        const handleOnline = () => {
            setIsOffline(false);
            refresh();
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [id, loadFromCache, refresh]);

    const isStale = cacheAge && cacheAge > CACHE_MAX_AGE;

    return {
        visit,
        loading,
        isOffline,
        isPartial,
        cacheAge,
        isStale,
        error,
        refresh,
    };
};