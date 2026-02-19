import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';


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

            // 1. Décodage local (Toujours possible)
            let payload;
            try {
                payload = JSON.parse(atob(token.split('.')[1]));
                const now = Math.floor(Date.now() / 1000);

                if (payload.exp < now) {
                    toast.error("Votre session a expiré. Veuillez vous reconnecter.");
                    throw new Error("Token expiré");
                }
                if (!payload.id) {
                    toast.error("Token invalide : ID manquant");
                    throw new Error("Token invalide : ID manquant");
                }
            } catch (e) {
                console.warn("Token invalide ou expiré :", e);
                toast.error("Token invalide ou expiré. Veuillez vous reconnecter.");
                localStorage.removeItem('sav_token');
                router.push('/');
                return;
            }

            // Helper pour mettre à jour l'état utilisateur (Mode hors ligne ou fallback)
            const setOfflineUser = () => {
                console.log("🌐 Mode Hors Ligne / Fallback : Validation API ignorée, connexion locale maintenue.");
                toast("Vous êtes en mode hors ligne. Certaines fonctionnalités peuvent être limitées.", { icon: '⚠️' });
                setUser({
                    id: payload.id,
                    username: payload.username,
                    roles: payload.roles,
                    exp: payload.exp
                });
            };

            // 2. Vérification API si en ligne
            if (navigator.onLine) {
                try {
                    const res = await fetch(`${API_URL}/users/${payload.id}`, {
                        headers: { 
                            'Authorization': `Bearer ${token}`, 
                            'Accept': 'application/json' 
                        }
                    });

                    if (res.ok) {
                        const userData = await res.json();
                        
                        if (userData.activated === false) {
                            console.warn("Compte archivé");
                            toast.error("Votre compte a été archivé. Contactez l'administrateur.");
                            localStorage.removeItem('sav_token');
                            router.push('/');
                            return;
                        }

                        // ✅ Fusion des données du token + données API
                        setUser({
                            id: payload.id,
                            username: payload.username,
                            roles: payload.roles,
                            exp: payload.exp,
                            firstName: userData.firstName,
                            lastName: userData.lastName,
                            email: userData.email,
                            phone: userData.phone,
                            activated: userData.activated
                        });
                    } else if (res.status === 401) {
                        // Vrai rejet d'auth (Token révoqué ou invalide côté serveur)
                        console.warn("Token rejeté par le serveur (401)");
                        toast.error("Session invalide. Veuillez vous reconnecter.");
                        localStorage.removeItem('sav_token');
                        router.push('/');
                        return;
                    } else {
                        // Erreur serveur (500, etc.) -> On garde la session locale par sécurité
                        console.warn(`Erreur serveur (${res.status}), bascule en mode hors ligne.`);
                        toast("Erreur serveur. Mode hors ligne activé.", { icon: '⚠️' });
                        setOfflineUser();
                    }

                } catch (e) {
                    // Erreur réseau (fetch failed) alors qu'on pensait être en ligne
                    console.warn("Erreur réseau lors de la vérification auth, bascule en mode hors ligne :", e);
                    toast("Problème de connexion. Mode hors ligne activé.", { icon: '⚠️' });
                    setOfflineUser();
                }
            } else {
                // Déjà hors ligne
                setOfflineUser();
            }

            setLoading(false);
        };

        checkAuth();
    }, [router]);

    return { user, loading };
}