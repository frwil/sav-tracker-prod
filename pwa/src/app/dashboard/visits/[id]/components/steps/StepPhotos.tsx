"use client";
import { compressImage } from "@/utils/imageCompressor";
import toast from "react-hot-toast";

interface StepPhotosProps {
    photos: { content: string; filename: string }[];
    setPhotos: React.Dispatch<React.SetStateAction<{ content: string; filename: string }[]>>;
    isCompressing: boolean;
    setIsCompressing: (v: boolean) => void;
}

export const StepPhotos = ({ photos, setPhotos, isCompressing, setIsCompressing }: StepPhotosProps) => {
    
    const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsCompressing(true);
            try {
                const file = e.target.files[0];
                const compressedBase64 = await compressImage(file);
                
                setPhotos(prev => [
                    ...prev, 
                    { content: compressedBase64, filename: file.name }
                ]);
                toast.success("Photo ajoutée");
            } catch (err) {
                toast.error("Erreur lors du traitement de l'image");
                console.error(err);
            } finally {
                setIsCompressing(false);
            }
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Photos</h3>
            
            <div className="grid grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-300">
                        <img src={photo.content} alt="Preview" className="w-full h-full object-cover" />
                        <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                        >
                            ×
                        </button>
                    </div>
                ))}
                
                <label className={`flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-gray-300 cursor-pointer hover:bg-gray-50 ${
                    isCompressing ? 'opacity-50' : ''
                }`}>
                    <span className="text-3xl">📷</span>
                    <span className="text-xs font-bold text-gray-500 mt-1">
                        {isCompressing ? '...' : 'Ajouter'}
                    </span>
                    <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="hidden" 
                        onChange={handlePhotoAdd}
                        disabled={isCompressing}
                    />
                </label>
            </div>
            
            <p className="text-xs text-gray-400">
                Les photos sont compressées automatiquement pour économiser la bande passante.
            </p>
        </div>
    );
};