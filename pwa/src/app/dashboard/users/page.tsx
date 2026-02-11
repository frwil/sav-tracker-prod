'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface User {
    id: number;
    username: string;
    email: string;
    roles: string[];
    activated: boolean;
    // On suppose que l'API renvoie le taux actuel via le getter virtuel que nous avons créé précédemment
    dailyVisitObjective?: number; 
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const ROLE_LABELS: Record<string, string> = {
    'ROLE_SUPER_ADMIN': 'Super Admin',
    'ROLE_ADMIN': 'Administrateur',
    'ROLE_TECHNICIAN': 'Technicien',
    'ROLE_OPERATOR': 'Opérateur Support'
};

const BASE_ROLE_OPTIONS = [
    { value: 'ROLE_TECHNICIAN', label: 'Technicien' },
    { value: 'ROLE_OPERATOR', label: 'Opérateur Support' },
    { value: 'ROLE_ADMIN', label: 'Administrateur' },
];

export default function UsersPage() {
    const { user: currentUser } = useAuth();
    const isCurrentUserSuperAdmin = currentUser?.roles.includes('ROLE_SUPER_ADMIN') || false;

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    // États pour le formulaire User (Création/Edition)
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'ROLE_TECHNICIAN' });
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // États pour le formulaire Objectifs
    const [showObjModal, setShowObjModal] = useState(false);
    const [isMassUpdate, setIsMassUpdate] = useState(false);
    const [targetUser, setTargetUser] = useState<User | null>(null);
    const [objData, setObjData] = useState({ 
        dailyRate: 5, 
        startDate: new Date().toISOString().split('T')[0] // Aujourd'hui par défaut
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const token = localStorage.getItem('sav_token');
        try {
            const res = await fetch(`${API_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (res.ok) setUsers(await res.json());
        } catch (error) {
            console.error(error);
            toast.error("Erreur chargement utilisateurs");
        } finally {
            setLoading(false);
        }
    };

    // --- GESTION DES OBJECTIFS ---

    const openObjectiveModal = (user?: User) => {
        if (user) {
            setIsMassUpdate(false);
            setTargetUser(user);
            setObjData({ ...objData, dailyRate: user.dailyVisitObjective || 5 });
        } else {
            setIsMassUpdate(true);
            setTargetUser(null);
        }
        setShowObjModal(true);
    };

    const handleSaveObjective = async () => {
        const token = localStorage.getItem('sav_token');
        const url = isMassUpdate 
            ? `${API_URL}/users/bulk/define-objectives`
            : `${API_URL}/users/${targetUser?.id}/define-objective`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    dailyRate: Number(objData.dailyRate),
                    startDate: objData.startDate
                })
            });

            if (res.ok) {
                toast.success(isMassUpdate ? "Objectifs de masse mis à jour" : "Objectif utilisateur mis à jour");
                setShowObjModal(false);
                fetchUsers(); // Rafraîchir pour voir les nouvelles valeurs actuelles
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur lors de la mise à jour");
            }
        } catch (e) {
            toast.error("Erreur technique");
        }
    };

    // --- GESTION UTILISATEURS (Code existant simplifié) ---

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({ 
            username: user.username, 
            email: user.email, 
            password: '', 
            role: user.roles.find(r => r !== 'ROLE_USER') || 'ROLE_TECHNICIAN' 
        });
        setShowForm(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Supprimer cet utilisateur ?')) return;
        const token = localStorage.getItem('sav_token');
        await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        setUsers(users.filter(u => u.id !== id));
        toast.success("Utilisateur supprimé");
    };

    const handleArchive = async (user: User) => {
        const token = localStorage.getItem('sav_token');
        await fetch(`${API_URL}/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/merge-patch+json' },
            body: JSON.stringify({ activated: !user.activated })
        });
        fetchUsers();
    };

    const handleSubmitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('sav_token');
        const method = editingUser ? 'PATCH' : 'POST';
        const url = editingUser ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;
        
        // On filtre le mot de passe s'il est vide en édition
        const payload: any = { ...formData, roles: [formData.role] };
        if (editingUser && !payload.password) delete payload.password;

        const res = await fetch(url, {
            method,
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': editingUser ? 'application/merge-patch+json' : 'application/json' 
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            setShowForm(false);
            fetchUsers();
            toast.success(editingUser ? "Modifié" : "Créé");
        } else {
            toast.error("Erreur lors de l'enregistrement");
        }
    };

    // Filtrage
    const filteredUsers = users.filter(user => {
        const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole ? user.roles.includes(filterRole) : true;
        return matchesSearch && matchesRole;
    });

    return (
        <div className="max-w-7xl mx-auto p-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">👥 Gestion des Utilisateurs</h1>
                    <p className="text-gray-500">Administrez les accès et les objectifs de l'équipe.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => openObjectiveModal()}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition"
                    >
                        🎯 Objectifs en Masse
                    </button>
                    <button 
                        onClick={() => { setEditingUser(null); setFormData({username:'', email:'', password:'', role:'ROLE_TECHNICIAN'}); setShowForm(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition shadow-lg shadow-gray-200"
                    >
                        + Nouvel Utilisateur
                    </button>
                </div>
            </div>

            {/* Filtres */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex gap-4">
                <input 
                    type="text" 
                    placeholder="Rechercher un utilisateur..." 
                    className="flex-1 border-gray-200 rounded-lg"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <select 
                    className="border-gray-200 rounded-lg"
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                >
                    <option value="">Tous les rôles</option>
                    {BASE_ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>

            {/* Tableau */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="p-4">Utilisateur</th>
                            <th className="p-4">Rôle</th>
                            <th className="p-4 text-center">Objectif Actuel</th>
                            <th className="p-4">Statut</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50/50 transition">
                                <td className="p-4 font-bold text-gray-900">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                            {user.username.substring(0,2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div>{user.username}</div>
                                            <div className="text-xs text-gray-400 font-normal">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">
                                        {ROLE_LABELS[user.roles.find(r => r !== 'ROLE_USER') || ''] || 'Utilisateur'}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    {user.roles.includes('ROLE_TECHNICIAN') ? (
                                        <span className="font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold">
                                            {user.dailyVisitObjective || 0} / jour
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className={`w-2 h-2 rounded-full inline-block mr-2 ${user.activated ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    {user.activated ? 'Actif' : 'Inactif'}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        {user.roles.includes('ROLE_TECHNICIAN') && (
                                            <button 
                                                onClick={() => openObjectiveModal(user)}
                                                title="Définir Objectif"
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            >
                                                🎯
                                            </button>
                                        )}
                                        <button onClick={() => handleEdit(user)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                                        {!isCurrentUserSuperAdmin && (
                                            <button onClick={() => handleArchive(user)} className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg">
                                                {user.activated ? '🔒' : '🔓'}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODAL UTILISATEUR (CREATE/EDIT) */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold mb-4">{editingUser ? 'Modifier Utilisateur' : 'Nouvel Utilisateur'}</h2>
                        <form onSubmit={handleSubmitUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nom d'utilisateur</label>
                                <input required type="text" className="w-full border rounded-lg p-2" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                                <input required type="email" className="w-full border rounded-lg p-2" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Rôle</label>
                                <select className="w-full border rounded-lg p-2" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                    {BASE_ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Mot de passe {editingUser && '(Laisser vide pour ne pas changer)'}</label>
                                <input type="password" required={!editingUser} className="w-full border rounded-lg p-2" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Annuler</button>
                                <button type="submit" className="px-4 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800">Enregistrer</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL OBJECTIFS */}
            {showObjModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border-t-4 border-indigo-500">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl">🎯</div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Définir Objectifs</h2>
                                <p className="text-xs text-gray-500">
                                    {isMassUpdate ? "Pour TOUS les techniciens" : `Pour ${targetUser?.username}`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 leading-relaxed">
                                ℹ️ Cette action clôturera automatiquement l'objectif précédent à la date de la veille du démarrage choisi.
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nouvel Objectif (Visites / Jour)</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    className="w-full border-gray-300 border rounded-lg p-3 text-lg font-bold text-center text-indigo-600 focus:ring-indigo-500" 
                                    value={objData.dailyRate} 
                                    onChange={e => setObjData({...objData, dailyRate: Number(e.target.value)})} 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Date de début d'application</label>
                                <input 
                                    type="date" 
                                    required 
                                    className="w-full border-gray-300 border rounded-lg p-2" 
                                    value={objData.startDate} 
                                    onChange={e => setObjData({...objData, startDate: e.target.value})} 
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowObjModal(false)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Annuler</button>
                            <button onClick={handleSaveObjective} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md">
                                Valider {isMassUpdate && 'pour tous'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}