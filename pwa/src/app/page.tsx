'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Pour éviter le flash du formulaire
  const router = useRouter();
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  console.log("API_URL utilisée:", API_URL); // Debug

  // ✅ 1. Vérification au chargement : A-t-on déjà un token ?
  useEffect(() => {
    const token = localStorage.getItem('sav_token');
    
    if (token) {
      // Si on a un token, on suppose qu'il est bon (Offline First)
      // Si le token est invalide, les appels API futurs renverront 401 et redirigeront ici
      console.log("Token trouvé, redirection auto...");
      router.push('/dashboard');
    } else {
      // Pas de token, on affiche le formulaire
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ✅ 2. Vérification connexion avant l'appel
    if (!navigator.onLine) {
      setError("Vous êtes hors ligne. Une connexion internet est requise pour s'identifier la première fois.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/login_check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        // Gestion plus fine des erreurs
        if (res.status === 401) {
          throw new Error('Identifiants incorrects');
        } else {
          throw new Error('Erreur serveur ou connexion');
        }
      }

      const data = await res.json();
      const token = data.token;

      // Stockage du token
      localStorage.setItem('sav_token', token);

      router.push('/dashboard'); 
      
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Pendant qu'on vérifie le token, on affiche un écran vide ou un loader
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            SAV Tracker
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Connectez-vous pour gérer vos visites
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className={`rounded p-3 text-sm ${error.includes('hors ligne') ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-700'}`}>
              {error}
            </div>
          )}
          
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <input
                type="text"
                required
                className="relative block w-full rounded-t-md border-0 p-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 p-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Se connecter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}