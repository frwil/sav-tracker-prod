'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CacheWarmer from '@/components/CacheWarmer'; 

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        localStorage.removeItem('sav_token');
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-indigo-600 font-bold animate-pulse">Vérification des accès...</div>
            </div>
        );
    }

    // ✅ Construction du nom complet
    const displayName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user?.username;

    return (
        <div className="min-h-screen bg-gray-50">
            <CacheWarmer />

            <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        {/* Côté Gauche : Retour Tableau de bord + Nom utilisateur */}
                        <div className="flex items-center gap-4">
                            <Link 
                                href="/dashboard" 
                                className="flex items-center text-gray-700 hover:text-indigo-600 font-bold transition-colors gap-2"
                            >
                                <span className="text-xl">🏠</span> 
                                <span className="hidden sm:inline">Tableau de bord</span>
                                <span className="sm:hidden">Accueil</span>
                            </Link>
                            
                            {/* Affichage du nom de l'utilisateur */}
                            {user && (
                                <div className="hidden md:flex items-center gap-2 pl-4 border-l border-gray-200">
                                    <span className="text-2xl">👤</span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-900">
                                            {displayName}
                                        </span>
                                        {user.email && (
                                            <span className="text-xs text-gray-500">{user.email}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Côté Droit : Déconnexion */}
                        <div className="flex items-center">
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                                title="Se déconnecter"
                            >
                                <span className="hidden sm:inline">Déconnexion</span>
                                <span className="text-lg">🚪</span>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="p-4 sm:p-6 max-w-7xl mx-auto">
                {children}
            </main>
        </div>
    );
}