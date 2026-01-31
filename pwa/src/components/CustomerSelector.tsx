'use client';

import { useEffect, useState } from 'react';
import Select from 'react-select'; // 👇 Nouveau composant

interface Customer {
    '@id': string;
    id: number;
    name: string;
    zone: string;
}

interface Option {
    value: string;
    label: string;
    customer: Customer;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CustomerSelector({ onSelect }: { onSelect: (customer: Customer | null) => void }) {
    const [options, setOptions] = useState<Option[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('sav_token');
        console.log("Token présent:", !!token); // Debug

        fetch(`${API_URL}/customers`, {
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Accept': 'application/ld+json' // Important pour API Platform
            }
        })
        .then(async (res) => {
            if (!res.ok) {
                console.error("Erreur API:", res.status, res.statusText);
                throw new Error("Erreur chargement clients");
            }
            const data = await res.json();
            console.log("Données brutes reçues:", data); // Debug : Regardez ici dans la console F12

            // Gestion robuste : hydra:member ou tableau direct
            const list = data['hydra:member'] || data || [];
            
            if (list.length === 0) {
                console.warn("L'API a renvoyé une liste vide. Vérifiez les permissions ou si la table 'customer' est vide.");
            }

            // Transformation pour React-Select
            const formattedOptions = list.map((c: Customer) => ({
                value: c['@id'],
                label: `${c.name} (${c.zone})`,
                customer: c
            }));

            setOptions(formattedOptions);
            setIsLoading(false);
        })
        .catch(err => {
            console.error("Erreur fetch:", err);
            setIsLoading(false);
        });
    }, []);

    const handleChange = (selectedOption: Option | null) => {
        onSelect(selectedOption ? selectedOption.customer : null);
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 animate-fade-in">
            <label className="block text-sm font-bold text-gray-700 mb-2">📂 Sélectionner un Client</label>
            <Select
                instanceId="customer-select" // Pour éviter les erreurs d'hydratation
                options={options}
                onChange={handleChange}
                isLoading={isLoading}
                placeholder="Rechercher un client..."
                noOptionsMessage={() => "Aucun client trouvé"}
                isClearable
                classNames={{
                    control: (state) => 
                        state.isFocused ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-300',
                }}
            />
        </div>
    );
}