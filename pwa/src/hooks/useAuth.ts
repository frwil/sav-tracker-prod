import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserPayload {
    id: number;
    username: string;
    roles: string[];
    exp: number;
    // ✅ Données enrichies depuis l'API
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    activated?: boolean;
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

                // 2. Vérification API et récupération des données utilisateur
                if (navigator.onLine) {
                    const res = await fetch(`${API_URL}/users/${payload.id}`, {
                        headers: { 
                            'Authorization': `Bearer ${token}`, 
                            'Accept': 'application/json' 
                        }
                    });

                    if (!res.ok) {
                        throw new Error(`Erreur validation utilisateur (${res.status})`);
                    }

                    const userData = await res.json();
                    
                    if (userData.activated === false) {
                        throw new Error("Compte archivé");
                    }

                    // ✅ 3. Fusion des données du token + données API
                    setUser({
                        id: payload.id,
                        username: payload.username,
                        roles: payload.roles,
                        exp: payload.exp,
                        // Données enrichies depuis l'API
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        email: userData.email,
                        phone: userData.phone,
                        activated: userData.activated
                    });

                } else {
                    // Mode hors ligne : on utilise seulement les données du token
                    console.log("🌐 Mode Hors Ligne : Validation API ignorée, connexion locale maintenue.");
                    setUser({
                        id: payload.id,
                        username: payload.username,
                        roles: payload.roles,
                        exp: payload.exp
                    });
                }

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