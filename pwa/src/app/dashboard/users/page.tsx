'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface User {
    '@id': string;
    id: number;
    username: string;
    fullname?: string;
    roles: string[];
    activated: boolean;
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
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    
    const [formData, setFormData] = useState({
        username: '',
        fullname: '', 
        password: '',
        role: 'ROLE_TECHNICIAN'
    });

    const roleOptions = isCurrentUserSuperAdmin 
        ? [{ value: 'ROLE_SUPER_ADMIN', label: 'Super Admin' }, ...BASE_ROLE_OPTIONS]
        : BASE_ROLE_OPTIONS;

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        const token = localStorage.getItem('sav_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/ld+json' }
            });
            const data = await res.json();
            setUsers(data['hydra:member'] || data['member'] || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = u.username.toLowerCase().includes(searchLower) || 
                              (u.fullname && u.fullname.toLowerCase().includes(searchLower));
        const matchesRole = filterRole ? u.roles.includes(filterRole) : true;
        return matchesSearch && matchesRole;
    });

    const canInteractWith = (targetUser: User) => {
        if (!isCurrentUserSuperAdmin && targetUser.roles.includes('ROLE_SUPER_ADMIN')) {
            return false;
        }
        return true;
    };

    const handleEdit = (user: User) => {
        if (!canInteractWith(user)) {
            alert("Vous n'avez pas les droits pour modifier cet utilisateur.");
            return;
        }

        setEditingId(user.id);
        
        let mainRole = 'ROLE_TECHNICIAN';
        if (user.roles.includes('ROLE_SUPER_ADMIN')) mainRole = 'ROLE_SUPER_ADMIN';
        else if (user.roles.includes('ROLE_ADMIN')) mainRole = 'ROLE_ADMIN';
        else if (user.roles.includes('ROLE_OPERATOR')) mainRole = 'ROLE_OPERATOR';

        setFormData({
            username: user.username,
            fullname: user.fullname || '',
            password: '', 
            role: mainRole
        });
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('sav_token');
        const isSelf = currentUser?.id === editingId;
        const finalFullname = formData.fullname.trim() === '' ? formData.username : formData.fullname;
        const payload: any = {};

        if (formData.password) {
            payload.password = formData.password;
        } else if (!editingId) {
            alert("Mot de passe obligatoire pour la création.");
            return;
        }

        if (!isSelf) {
            payload.username = formData.username;
            payload.fullname = finalFullname;
            payload.roles = [formData.role];
        } else {
            payload.fullname = finalFullname; 
        }

        try {
            if (editingId) {
                const res = await fetch(`${API_URL}/users/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                if(!res.ok) throw new Error("Erreur modification");
                alert("Modifications enregistrées !");
            } else {
                const res = await fetch(`${API_URL}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ 
                        ...payload, 
                        username: formData.username, 
                        fullname: finalFullname,
                        roles: [formData.role], 
                        activated: true 
                    })
                });
                if(!res.ok) throw new Error("Erreur création");
            }
            loadUsers();
            setShowForm(false);
            setEditingId(null);
            setFormData({ username: '', fullname: '', password: '', role: 'ROLE_TECHNICIAN' });

        } catch (err) { alert("Une erreur est survenue."); }
    };

    const handleArchive = async (user: User) => {
        if (!canInteractWith(user)) return;
        if (currentUser?.id === user.id) { alert("Impossible de se désactiver soi-même."); return; }

        const token = localStorage.getItem('sav_token');
        const newStatus = !user.activated;
        if (!confirm(newStatus ? "Réactiver cet utilisateur ?" : "Archiver cet utilisateur ?")) return;

        try {
            await fetch(`${API_URL}/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ activated: newStatus })
            });
            loadUsers();
        } catch (e) { alert("Erreur lors de l'action"); }
    };

    const handleDelete = async (id: number) => {
        const userToDelete = users.find(u => u.id === id);
        if (userToDelete && !canInteractWith(userToDelete)) { alert("Action non autorisée."); return; }
        if (!confirm("Supprimer définitivement ?")) return;
        
        const token = localStorage.getItem('sav_token');
        try {
            const res = await fetch(`${API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                setUsers(prev => prev.filter(u => u.id !== id));
            } else {
                alert("Impossible de supprimer. Bascule vers l'archivage.");
                await fetch(`${API_URL}/users/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/merge-patch+json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ activated: false })
                });
                loadUsers();
            }
        } catch (e) { alert("Erreur technique."); }
    };

    const isSelfEdit = editingId === currentUser?.id;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            <div className="bg-white shadow px-6 py-4 mb-6">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-800">Gestion des Utilisateurs</h1>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4">
                
                {/* BARRE D'ACTIONS */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-bold text-gray-500 mb-1">🔍 Rechercher</label>
                            <input 
                                type="text" 
                                placeholder="Nom ou identifiant..." 
                                className="w-full border p-2 rounded-lg bg-gray-50 focus:bg-white transition"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-64">
                            <label className="block text-xs font-bold text-gray-500 mb-1">🎭 Rôle</label>
                            <select 
                                className="w-full border p-2 rounded-lg bg-gray-50 focus:bg-white transition"
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                            >
                                <option value="">-- Tous --</option>
                                <option value="ROLE_SUPER_ADMIN">Super Admin</option>
                                <option value="ROLE_ADMIN">Administrateur</option>
                                <option value="ROLE_TECHNICIAN">Technicien</option>
                                <option value="ROLE_OPERATOR">Opérateur Support</option>
                            </select>
                        </div>
                        <button 
                            onClick={() => { 
                                setEditingId(null); 
                                setFormData({ username: '', fullname: '', password: '', role: 'ROLE_TECHNICIAN' });
                                setShowForm(!showForm); 
                            }}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 transition h-10 w-full md:w-auto"
                        >
                            {showForm ? 'Fermer' : '+ Nouveau'}
                        </button>
                    </div>
                </div>

                {/* FORMULAIRE */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-100 mb-8 animate-slide-down">
                        <h3 className="text-lg font-bold mb-4 text-gray-800">
                            {editingId ? (isSelfEdit ? 'Modifier mon profil' : 'Modifier l\'utilisateur') : 'Créer un utilisateur'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Identifiant (Connexion)</label>
                                <input type="text" required className={`w-full border p-2 rounded-lg ${isSelfEdit ? 'bg-gray-100' : ''}`} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} disabled={isSelfEdit} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nom Complet</label>
                                <input type="text" className="w-full border p-2 rounded-lg" value={formData.fullname} onChange={e => setFormData({...formData, fullname: e.target.value})} placeholder={formData.username} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Mot de passe {editingId && '(Vide = inchangé)'}</label>
                                <input type="password" className="w-full border p-2 rounded-lg" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="********" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Rôle</label>
                                <select className={`w-full border p-2 rounded-lg bg-white ${isSelfEdit ? 'bg-gray-100' : ''}`} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} disabled={isSelfEdit}>
                                    {roleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg">Annuler</button>
                            <button type="submit" className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">Enregistrer</button>
                        </div>
                    </form>
                )}

                {/* --- CONTENU RESPONSIVE --- */}
                
                {/* 1. VUE MOBILE (CARTES) - Visible uniquement sur petit écran (md:hidden) */}
                <div className="grid grid-cols-1 gap-4 md:hidden">
                    {filteredUsers.length === 0 && <p className="text-center text-gray-500 italic">Aucun utilisateur trouvé.</p>}
                    {filteredUsers.map(user => {
                        const mainRole = user.roles.find(r => ROLE_LABELS[r]) || 'ROLE_USER';
                        const isTargetSuperAdmin = user.roles.includes('ROLE_SUPER_ADMIN');
                        const isSelf = currentUser?.id === user.id;
                        const isDisabled = !canInteractWith(user);

                        return (
                            <div key={user.id} className={`bg-white p-4 rounded-xl shadow-sm border ${!user.activated ? 'border-gray-200 bg-gray-50 opacity-75' : 'border-gray-200'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 text-lg">
                                                {user.fullname || user.username}
                                            </div>
                                            <div className="text-xs text-gray-500">@{user.username} {isSelf && '(Moi)'}</div>
                                        </div>
                                    </div>
                                    {user.activated 
                                        ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">Actif</span>
                                        : <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full font-bold">Archivé</span>
                                    }
                                </div>

                                <div className="mb-4">
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                        isTargetSuperAdmin ? 'bg-purple-100 text-purple-800' :
                                        mainRole === 'ROLE_ADMIN' ? 'bg-red-100 text-red-800' : 
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {ROLE_LABELS[mainRole] || mainRole}
                                    </span>
                                </div>

                                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                                    {!isDisabled ? (
                                        <>
                                            <button onClick={() => handleEdit(user)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold">
                                                {isSelf ? 'Profil' : 'Modifier'}
                                            </button>
                                            {!isSelf && (
                                                <>
                                                    <button onClick={() => handleArchive(user)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${user.activated ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}>
                                                        {user.activated ? 'Archiver' : 'Activer'}
                                                    </button>
                                                    <button onClick={() => handleDelete(user.id)} className="p-2 bg-red-50 text-red-600 rounded-lg">🗑️</button>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-gray-400 text-xs italic py-2">🔒 Accès restreint</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. VUE DESKTOP (TABLEAU) - Visible uniquement sur écran moyen et + (hidden md:block) */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">Aucun utilisateur trouvé.</td></tr>
                            )}
                            {filteredUsers.map(user => {
                                const mainRole = user.roles.find(r => ROLE_LABELS[r]) || 'ROLE_USER';
                                const isTargetSuperAdmin = user.roles.includes('ROLE_SUPER_ADMIN');
                                const isSelf = currentUser?.id === user.id;
                                const isDisabled = !canInteractWith(user);

                                return (
                                    <tr key={user.id} className={!user.activated ? 'bg-gray-50 opacity-75' : ''}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-3">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900">
                                                        {user.fullname || user.username}
                                                        {isSelf && <span className="text-indigo-600 text-xs ml-2">(Moi)</span>}
                                                    </div>
                                                    {user.fullname && <div className="text-xs text-gray-500">@{user.username}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                isTargetSuperAdmin ? 'bg-purple-100 text-purple-800' :
                                                mainRole === 'ROLE_ADMIN' ? 'bg-red-100 text-red-800' : 
                                                'bg-blue-100 text-blue-800'
                                            }`}>
                                                {ROLE_LABELS[mainRole] || mainRole}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {user.activated ? <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">Actif</span> : <span className="text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded">Archivé</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {!isDisabled && (
                                                <>
                                                    <button onClick={() => handleEdit(user)} className="text-indigo-600 hover:text-indigo-900 mr-3 font-bold">
                                                        {isSelf ? 'Profil' : 'Modifier'}
                                                    </button>
                                                    {!isSelf && (
                                                        <>
                                                            <button onClick={() => handleArchive(user)} className={`mr-3 font-bold ${user.activated ? "text-orange-600 hover:text-orange-900" : "text-green-600 hover:text-green-900"}`}>
                                                                {user.activated ? 'Archiver' : 'Activer'}
                                                            </button>
                                                            <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-900 font-bold">🗑️</button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}