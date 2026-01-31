'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { loading } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        // Suppression du token
        localStorage.removeItem('sav_token');
        // Redirection vers la page de connexion
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-indigo-600 font-bold animate-pulse">Vérification des accès...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* --- BARRE DE NAVIGATION GLOBALE --- */}
            <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        {/* Côté Gauche : Retour Accueil */}
                        <div className="flex items-center">
                            <Link 
                                href="/dashboard" 
                                className="flex items-center text-gray-700 hover:text-indigo-600 font-bold transition-colors"
                            >
                                <span className="text-xl mr-2">🏠</span> 
                                <span className="hidden sm:inline">Tableau de bord</span>
                                <span className="sm:hidden">Accueil</span>
                            </Link>
                        </div>

                        {/* Côté Droit : Déconnexion */}
                        <div className="flex items-center">
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                                title="Se déconnecter"
                            >
                                <span>Déconnexion</span>
                                <span className="text-lg">🚪</span>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* --- CONTENU DE LA PAGE --- */}
            <main>
                {children}
            </main>
        </div>
    );
}