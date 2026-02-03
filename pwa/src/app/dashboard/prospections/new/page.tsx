'use client';

import { useRouter } from 'next/navigation';
import ProspectionForm from '@/components/ProspectionForm'; // Assurez-vous que le chemin est bon

export default function NewProspectionPage() {
    const router = useRouter();

    return (
        <div className="pb-20">
            {/* Le formulaire gère son propre header et sa logique */}
            <ProspectionForm />
        </div>
    );
}