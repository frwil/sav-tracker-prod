"use client";

import { useState, useEffect } from "react";
import Select from "react-select";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface FilterProps {
    onFilter: (filters: { start: string; end: string; technicians: any[] }) => void;
    isAdmin?: boolean;
}

export const ReportFilters = ({ onFilter, isAdmin = false }: FilterProps) => {
    const now = new Date();
    // Par défaut : du 1er du mois à la fin du mois
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(defaultEnd);
    const [techs, setTechs] = useState<any[]>([]);
    const [selectedTechs, setSelectedTechs] = useState<any[]>([]);

    useEffect(() => {
        if (isAdmin) {
            const fetchTechs = async () => {
                const token = localStorage.getItem("sav_token");
                try {
                    const res = await fetch(`${API_URL}/users?pagination=false`, {
                        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        
                        // 👇 MODIFICATION ICI : Filtrer par rôle
                        const technicians = data.filter((user: any) => 
                            user.roles && user.roles.includes("ROLE_TECHNICIAN")
                        );

                        setTechs(technicians.map((u: any) => ({ value: u.id, label: u.username })));
                    }
                } catch(e) { console.error(e); }
            };
            fetchTechs();
        }
    }, [isAdmin]);

    const handleApply = () => {
        onFilter({ start, end, technicians: selectedTechs });
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 items-end no-print">
            <div className="w-full md:w-1/4">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Du</label>
                <input type="date" className="w-full border p-2 rounded-lg text-sm" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="w-full md:w-1/4">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Au</label>
                <input type="date" className="w-full border p-2 rounded-lg text-sm" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            
            {isAdmin && (
                <div className="w-full md:w-1/3">
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Techniciens</label>
                    <Select 
                        isMulti 
                        options={techs} 
                        value={selectedTechs} 
                        onChange={(val: any) => setSelectedTechs(val)} 
                        className="text-sm"
                        placeholder="Tous les techniciens..."
                        noOptionsMessage={() => "Aucun technicien trouvé"}
                    />
                </div>
            )}

            <button 
                onClick={handleApply}
                className="w-full md:w-auto px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
            >
                Actualiser
            </button>
        </div>
    );
};