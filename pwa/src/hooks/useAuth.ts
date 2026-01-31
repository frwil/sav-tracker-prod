import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserPayload {
    username: string;
    roles: string[];
    id: number;
    exp: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function useAuth() {
    const router = useRouter();
    const [user, setUser] = useState<UserPayload | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('sav_token');

            if (!token) {
                router.push('/');
                return;
            }

            try {
                // 1. Décodage local (Toujours possible)
                const payload = JSON.parse(atob(token.split('.')[1]));
                const now = Math.floor(Date.now() / 1000);

                if (payload.exp < now) {
                    throw new Error("Token expiré");
                }

                if (!payload.id) {
                    throw new Error("Token invalide : ID manquant");
                }

                // 2. Vérification API (SEULEMENT SI EN LIGNE)
                // En mode offline, on fait confiance au token local non expiré
                if (navigator.onLine) {
                    const res = await fetch(`${API_URL}/users/${payload.id}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                    });

                    if (!res.ok) {
                        throw new Error(`Erreur validation utilisateur (${res.status})`);
                    }

                    const userData = await res.json();
                    if (userData.activated === false) {
                        throw new Error("Compte archivé");
                    }
                } else {
                    console.log("🌐 Mode Hors Ligne : Validation API ignorée, connexion locale maintenue.");
                }

                // 3. Session Validée
                setUser({
                    username: payload.username,
                    roles: payload.roles,
                    id: payload.id,
                    exp: payload.exp
                });
                setLoading(false);

            } catch (e) {
                console.warn("Session invalide :", e);
                localStorage.removeItem('sav_token');
                router.push('/');
            }
        };

        checkAuth();
    }, [router]);

    return { user, loading };
}