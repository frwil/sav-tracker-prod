// pwa/src/services/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Wrapper générique pour fetch avec gestion automatique du Token et du JSON.
 */
export async function fetchApiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // 1. Récupération du token
    const token = typeof window !== 'undefined' ? localStorage.getItem('sav_token') : null;

    // 2. Configuration des headers par défaut
    const headers = {
        'Accept': 'application/ld+json', // Standard API Platform
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    // 3. Appel réseau
    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    // 4. Gestion des erreurs globales
    if (res.status === 401) {
        // Optionnel : Redirection vers login si token expiré
        // window.location.href = '/'; 
        throw new Error("Session expirée, veuillez vous reconnecter.");
    }

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData['hydra:description'] || `Erreur API (${res.status})`);
    }

    // 5. Retour des données
    // Si c'est une suppression (204 No Content), on retourne null
    if (res.status === 204) return null as T;

    return res.json();
}