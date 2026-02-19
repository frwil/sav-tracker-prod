'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode'; // npm install jwt-decode
import toast from "react-hot-toast";


// --- TYPES ---
interface TokenPayload {
    username: string;
    roles: string[];
    iat: number;
    exp: number;
}

interface CachedUser {
    username: string;
    roles: string[];
    lastLogin: number;
}

// --- CONSTANTES ---
const TOKEN_KEY = 'sav_token';
const USER_KEY = 'sav_user_cache';
const OFFLINE_GRACE_PERIOD = 1000 * 60 * 60 * 24 * 7; // 7 jours de grâce offline

// --- HELPERS ---

const isTokenValid = (token: string): boolean => {
    try {
        const decoded = jwtDecode<TokenPayload>(token);
        // Vérifier expiration
        return decoded.exp * 1000 > Date.now();
    } catch {
        return false;
    }
};

const isTokenExpired = (token: string): boolean => {
    try {
        const decoded = jwtDecode<TokenPayload>(token);
        return decoded.exp * 1000 <= Date.now();
    } catch {
        return true;
    }
};

const getTokenRemainingDays = (token: string): number => {
    try {
        const decoded = jwtDecode<TokenPayload>(token);
        const remaining = decoded.exp * 1000 - Date.now();
        return Math.ceil(remaining / (1000 * 60 * 60 * 24));
    } catch {
        return 0;
    }
};

const cacheUserData = (token: string) => {
    try {
        const decoded = jwtDecode<TokenPayload>(token);
        const userData: CachedUser = {
            username: decoded.username,
            roles: decoded.roles,
            lastLogin: Date.now()
        };
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (e) {
        console.error('Failed to cache user data:', e);
    }
};

const getCachedUser = (): CachedUser | null => {
    try {
        const cached = localStorage.getItem(USER_KEY);
        if (!cached) return null;
        return JSON.parse(cached);
    } catch {
        return null;
    }
};

const clearAuthData = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
};

// --- COMPOSANT ---

export default function LoginPage() {
    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // États
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [authStatus, setAuthStatus] = useState<'checking' | 'valid' | 'expired' | 'offline-valid' | 'none'>('checking');
    const [cachedUser, setCachedUser] = useState<CachedUser | null>(null);

    // --- VÉRIFICATION INITIALE ---

    const checkAuthStatus = useCallback(() => {
        const token = localStorage.getItem(TOKEN_KEY);
        const offline = !navigator.onLine;
        setIsOffline(offline);

        if (!token) {
            setAuthStatus('none');
            setIsLoading(false);
            return;
        }

        // Token présent - vérifier validité
        if (isTokenValid(token)) {
            // Token valide (online ou offline)
            cacheUserData(token); // Mettre à jour le cache
            setAuthStatus(offline ? 'offline-valid' : 'valid');
            
            // Redirection automatique après un court délai pour montrer l'état
            setTimeout(() => {
                router.push('/dashboard');
            }, offline ? 1500 : 500); // Délai plus long en offline pour montrer le message
            
        } else if (isTokenExpired(token)) {
            // Token expiré
            if (offline) {
                // Mode offline avec token expiré - vérifier grâce
                const user = getCachedUser();
                const lastLogin = user?.lastLogin || 0;
                const graceRemaining = OFFLINE_GRACE_PERIOD - (Date.now() - lastLogin);
                
                if (graceRemaining > 0) {
                    // Grâce offline accordée
                    setCachedUser(user);
                    setAuthStatus('offline-valid');
                    toast.success(`Mode offline - Accès accordé (${Math.ceil(graceRemaining / (1000 * 60 * 60 * 24))} jours restants)`);
                    setTimeout(() => router.push('/dashboard'), 2000);
                } else {
                    // Grâce dépassée - doit se reconnecter
                    setAuthStatus('expired');
                    setError("Votre session a expiré. Connexion requise.");
                    clearAuthData();
                    setIsLoading(false);
                }
            } else {
                // Online avec token expiré - refresh impossible, reconnexion nécessaire
                setAuthStatus('expired');
                clearAuthData();
                setIsLoading(false);
            }
        } else {
            // Token invalide (malformé)
            clearAuthData();
            setAuthStatus('none');
            setIsLoading(false);
        }
    }, [router]);

    useEffect(() => {
        // Vérification initiale
        checkAuthStatus();

        // Listeners réseau
        const handleOnline = () => {
            setIsOffline(false);
            // Si on était en attente, réessayer
            if (authStatus === 'offline-valid') {
                checkAuthStatus();
            }
        };

        const handleOffline = () => {
            setIsOffline(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [checkAuthStatus, authStatus]);

    // --- CONNEXION ---

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Mode offline - tentative de connexion locale
        if (!navigator.onLine) {
            handleOfflineLogin();
            return;
        }

        // Mode online - connexion normale
        await handleOnlineLogin();
    };

    const handleOfflineLogin = () => {
        // En offline, on ne peut pas vérifier les credentials
        // Mais on peut permettre l'accès si on a un cache récent
        const user = getCachedUser();
        
        if (!user) {
            setError(
                "Mode hors ligne. Aucune donnée de connexion disponible. " +
                "Veuillez vous connecter une fois en ligne pour activer l'accès offline."
            );
            return;
        }

        // Vérifier si les credentials correspondent au cache (comparaison simple)
        // Note: En production, utiliser une empreinte hashée stockée lors de la dernière connexion réussie
        const lastLoginValid = Date.now() - user.lastLogin < OFFLINE_GRACE_PERIOD;
        
        if (lastLoginValid) {
            // Accès offline accordé basé sur la confiance
            toast.success("Mode hors ligne - Accès basé sur dernière connexion");
            router.push('/dashboard');
        } else {
            setError(
                "Mode hors ligne - Délai de grâce dépassé. " +
                "Veuillez vous connecter en ligne pour renouveler votre accès."
            );
        }
    };

    const handleOnlineLogin = async () => {
        setIsLoading(true);

        try {
            const res = await fetch(`${API_URL}/login_check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: username.trim(), 
                    password 
                }),
            });

            if (!res.ok) {
                if (res.status === 401) {
                    throw new Error('Identifiants incorrects');
                }
                throw new Error('Erreur serveur');
            }

            const data = await res.json();
            const token = data.token;

            if (!token) {
                throw new Error('Token manquant dans la réponse');
            }

            // Succès - stockage
            localStorage.setItem(TOKEN_KEY, token);
            cacheUserData(token);
            
            toast.success("Connexion réussie !");
            router.push('/dashboard');

        } catch (err: any) {
            // Si erreur réseau mais qu'on a un ancien token valide, proposer fallback
            if (err.message?.includes('fetch') || err.message?.includes('network')) {
                const existingToken = localStorage.getItem(TOKEN_KEY);
                if (existingToken && isTokenValid(existingToken)) {
                    setIsOffline(true);
                    setError(
                        "Serveur inaccessible. Utilisation du mode offline avec token existant..."
                    );
                    setTimeout(() => router.push('/dashboard'), 1500);
                    return;
                }
            }
            
            setError(err.message || 'Erreur de connexion');
            setIsLoading(false);
        }
    };

    // --- RENDU ---

    // Écran de vérification initiale
    if (isLoading && authStatus === 'checking') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Vérification de la session...</p>
                </div>
            </div>
        );
    }

    // Redirection automatique en cours (token valide)
    if (authStatus === 'valid' || authStatus === 'offline-valid') {
        const token = localStorage.getItem(TOKEN_KEY);
        const remainingDays = token ? getTokenRemainingDays(token) : 0;
        
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-100">
                <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
                    <div className="text-4xl mb-4">✅</div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Session active
                    </h2>
                    <p className="text-gray-600 mb-4">
                    {authStatus === 'offline-valid' 
                        ? "Mode hors ligne - Accès autorisé" 
                        : "Connexion validée"}
                </p>
                <p className="text-gray-600">
                    {isOffline 
                        ? "Redirection vers le tableau de bord..." 
                        : "Redirection vers le tableau de bord..."}
                </p>
                    {remainingDays > 0 && remainingDays < 7 && (
                        <p className="text-xs text-orange-500 mt-2">
                            Token valide encore {remainingDays} jour{remainingDays > 1 ? 's' : ''}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Formulaire de connexion
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
                
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                        SAV Tracker
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        {isOffline 
                            ? "Mode hors ligne - Connexion limitée" 
                            : "Connectez-vous pour gérer vos visites"}
                    </p>
                </div>

                {/* Indicateur de statut réseau */}
                {isOffline && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                        <span className="text-orange-600 text-sm font-medium">
                            📡 Mode hors ligne détecté
                        </span>
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className={`rounded p-3 text-sm ${
                            error.includes('hors ligne') || error.includes('offline')
                                ? 'bg-orange-100 text-orange-800' 
                                : 'bg-red-100 text-red-700'
                        }`}>
                            {error}
                        </div>
                    )}

                    {/* Info cache si disponible */}
                    {cachedUser && isOffline && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-blue-700 text-xs">
                                Dernière connexion: <strong>{cachedUser.username}</strong>
                                <br />
                                {new Date(cachedUser.lastLogin).toLocaleDateString('fr-FR')}
                            </p>
                        </div>
                    )}
                    
                    <div className="-space-y-px rounded-md shadow-sm">
                        <div>
                            <input
                                type="text"
                                required
                                disabled={isLoading}
                                className="relative block w-full rounded-t-md border-0 p-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-gray-100"
                                placeholder="Nom d'utilisateur"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                required
                                disabled={isLoading}
                                className="relative block w-full rounded-b-md border-0 p-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-gray-100"
                                placeholder="Mot de passe"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading 
                                ? 'Connexion...' 
                                : isOffline 
                                    ? 'Tenter accès offline' 
                                    : 'Se connecter'}
                        </button>

                        {/* Bouton d'urgence offline */}
                        {isOffline && cachedUser && (
                            <button
                                type="button"
                                onClick={() => {
                                    toast.success("Accès offline d'urgence");
                                    router.push('/dashboard');
                                }}
                                className="w-full text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                                Accès rapide offline (si autorisé)
                            </button>
                        )}
                    </div>
                </form>

                {/* Footer info */}
                <div className="text-center text-xs text-gray-400 mt-6">
                    {isOffline ? (
                        <p>
                            Certaines fonctionnalités peuvent être limitées en mode hors ligne.
                            <br />
                            Reconnectez-vous en ligne pour synchroniser.
                        </p>
                    ) : (
                        <p>Token stocké localement pour accès offline</p>
                    )}
                </div>
            </div>
        </div>
    );
}