"use client";
import { useState, useMemo } from "react";
import Select, { MultiValue, StylesConfig } from "react-select";
import { StepProps, SupplyData, PreOrderItem, SupplySource, Agency } from "../types";
import { ValidationErrors } from "../validation";
import { AGENCIES, COMPANIES, AgencyOption } from "../data/agencies";

interface StepSupplyProps extends StepProps {
    supply: SupplyData;
    updateSupply: (supply: Partial<SupplyData>) => void;
    isFromLastObservation?: boolean;
}

interface SelectAgencyOption {
    value: string;
    label: string;
    company: "BELGOCAM" | "SPC" | "PDC";
    location: string;
}

export const StepSupply = ({
    supply,
    updateSupply,
    errors,
    isFromLastObservation,
}: StepSupplyProps) => {
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [newItemProduct, setNewItemProduct] = useState<string>("");
    const [newItemQuantity, setNewItemQuantity] = useState<number>(1);

    // Transformer les agences pour react-select
    const agencyOptions: SelectAgencyOption[] = useMemo(() => {
        return AGENCIES.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.location})`,
            company: a.company,
            location: a.location || "",
        }));
    }, []);

    // Filtrer par société si sélectionnée
    const filteredOptions = useMemo(() => {
        if (!selectedCompany) return agencyOptions;
        return agencyOptions.filter((opt) => opt.company === selectedCompany);
    }, [agencyOptions, selectedCompany]);

    // Styles personnalisés pour react-select
    const selectStyles: StylesConfig<SelectAgencyOption, true> = {
        control: (base) => ({
            ...base,
            borderRadius: "0.75rem",
            borderColor: "#e5e7eb",
            minHeight: "48px",
            boxShadow: "none",
            "&:hover": {
                borderColor: "#d1d5db",
            },
        }),
        multiValue: (base, state) => ({
            ...base,
            backgroundColor:
                state.data.company === "BELGOCAM"
                    ? "#fee2e2"
                    : state.data.company === "SPC"
                      ? "#d1fae5"
                      : "#dbeafe",
            borderRadius: "0.5rem",
        }),
        multiValueLabel: (base, state) => ({
            ...base,
            color:
                state.data.company === "BELGOCAM"
                    ? "#991b1b"
                    : state.data.company === "SPC"
                      ? "#065f46"
                      : "#1e40af",
            fontWeight: 600,
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
                ? state.data.company === "BELGOCAM"
                    ? "#fecaca"
                    : state.data.company === "SPC"
                      ? "#a7f3d0"
                      : "#bfdbfe"
                : state.isFocused
                  ? "#f3f4f6"
                  : "white",
            color: "#1f2937",
        }),
    };

    const handleSourceChange = (source: SupplySource) => {
        updateSupply({
            source,
            // Réinitialiser les sous-champs quand on change de source
            agency: source === "AGENCE" ? { agencies: [] } : undefined,
            provenderie: source === "PROVENDERIE" ? { name: "", location: "" } : undefined,
            competitor: source === "CONCURRENCE" ? { name: "" } : undefined,
        });
        setSelectedCompany(null);
    };

    const handleAgenciesChange = (selected: MultiValue<SelectAgencyOption>) => {
        const agencies: Agency[] = selected.map((opt) => ({
            id: opt.value,
            company: opt.company,
            name: opt.label.split(" (")[0], // Enlever la location du label
            location: opt.location,
        }));
        updateSupply({
            agency: { agencies },
        });
    };

    const getSelectedAgencies = (): SelectAgencyOption[] => {
        if (!supply.agency?.agencies) return [];
        return supply.agency.agencies.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.location})`,
            company: a.company,
            location: a.location || "",
        }));
    };

    const removeAgency = (agencyId: string) => {
        const newAgencies = supply.agency?.agencies?.filter((a) => a.id !== agencyId) || [];
        updateSupply({
            agency: { agencies: newAgencies },
        });
    };

    const addPreOrderItem = () => {
        if (!newItemProduct || newItemQuantity <= 0) return;

        const exists = supply.preOrderItems.some((item) => item.product === newItemProduct);
        if (exists) {
            updateSupply({
                preOrderItems: supply.preOrderItems.map((item) =>
                    item.product === newItemProduct
                        ? { ...item, quantity: item.quantity + newItemQuantity }
                        : item,
                ),
            });
        } else {
            updateSupply({
                preOrderItems: [
                    ...supply.preOrderItems,
                    {
                        id: crypto.randomUUID(),
                        product: newItemProduct,
                        quantity: newItemQuantity,
                    },
                ],
            });
        }

        setNewItemProduct("");
        setNewItemQuantity(1);
    };

    const removePreOrderItem = (id: string) => {
        updateSupply({
            preOrderItems: supply.preOrderItems.filter((item) => item.id !== id),
        });
    };

    const updatePreOrderItem = (id: string, updates: Partial<PreOrderItem>) => {
        updateSupply({
            preOrderItems: supply.preOrderItems.map((item) =>
                item.id === id ? { ...item, ...updates } : item,
            ),
        });
    };

    // Grouper les agences par société pour l'affichage
    const groupedAgencies = useMemo(() => {
        if (!supply.agency?.agencies) return {};
        return supply.agency.agencies.reduce((acc, agency) => {
            if (!acc[agency.company]) acc[agency.company] = [];
            acc[agency.company].push(agency);
            return acc;
        }, {} as Record<string, Agency[]>);
    }, [supply.agency?.agencies]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">Approvisionnement</h3>
                {isFromLastObservation && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                        📝 Données de la dernière visite
                    </span>
                )}
            </div>

            {/* A. Lieu d'approvisionnement */}
            <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700 uppercase">
                    Source d'approvisionnement *
                </label>

                <div className="grid grid-cols-3 gap-3">
                    {[
                        { key: "AGENCE", label: "🏢 Agence", desc: "Belgocam, SPC, PDC" },
                        { key: "PROVENDERIE", label: "🏭 Provenderie", desc: "Indépendant" },
                        { key: "CONCURRENCE", label: "🏪 Concurrence", desc: "Autre distributeur" },
                    ].map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleSourceChange(opt.key as SupplySource)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                                supply.source === opt.key
                                    ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                            }`}
                        >
                            <div className="text-2xl mb-1">{opt.label.split(" ")[0]}</div>
                            <div className="font-bold text-sm">{opt.label.split(" ")[1]}</div>
                            <div className="text-xs opacity-70 mt-1">{opt.desc}</div>
                        </button>
                    ))}
                </div>

                {errors.supplySource && (
                    <span className="text-sm text-red-600 font-medium">{errors.supplySource}</span>
                )}

                {/* Sélection des agences */}
                {supply.source === "AGENCE" && (
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-in fade-in slide-in-from-top-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-bold text-indigo-900">
                                Sélection des agences *
                            </label>
                            <span className="text-xs text-indigo-600">
                                Plusieurs agences possibles
                            </span>
                        </div>

                        {/* Filtre par société (optionnel) */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setSelectedCompany(null)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                                    selectedCompany === null
                                        ? "bg-indigo-600 text-white"
                                        : "bg-white text-gray-600 hover:bg-gray-100"
                                }`}
                            >
                                Toutes
                            </button>
                            {COMPANIES.map((comp) => (
                                <button
                                    key={comp.value}
                                    type="button"
                                    onClick={() => setSelectedCompany(comp.value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                                        selectedCompany === comp.value
                                            ? "text-white"
                                            : "bg-white text-gray-600 hover:bg-gray-100"
                                    }`}
                                    style={{
                                        backgroundColor:
                                            selectedCompany === comp.value ? comp.color : undefined,
                                    }}
                                >
                                    {comp.label}
                                </button>
                            ))}
                        </div>

                        {/* Select multi-agences */}
                        <Select<SelectAgencyOption, true>
                            isMulti
                            options={filteredOptions}
                            value={getSelectedAgencies()}
                            onChange={handleAgenciesChange}
                            placeholder="Rechercher et sélectionner des agences..."
                            className="text-sm"
                            classNamePrefix="react-select"
                            styles={selectStyles}
                            closeMenuOnSelect={false}
                            hideSelectedOptions={false}
                        />

                        {errors.supplyAgency && (
                            <span className="text-sm text-red-600">{errors.supplyAgency}</span>
                        )}

                        {/* Récap des agences sélectionnées par société */}
                        {supply.agency?.agencies && supply.agency.agencies.length > 0 && (
                            <div className="space-y-3">
                                {Object.entries(groupedAgencies).map(([company, agencies]) => (
                                    <div
                                        key={company}
                                        className="bg-white p-3 rounded-lg border border-indigo-100"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <span
                                                className="w-3 h-3 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        company === "BELGOCAM"
                                                            ? "#e11d48"
                                                            : company === "SPC"
                                                              ? "#059669"
                                                              : "#2563eb",
                                                }}
                                            />
                                            <span className="font-bold text-sm text-gray-800">
                                                {company}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                ({agencies.length} agence
                                                {agencies.length > 1 ? "s" : ""})
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {agencies.map((agency) => (
                                                <span
                                                    key={agency.id}
                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                                                >
                                                    {agency.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAgency(agency.id)}
                                                        className="text-gray-400 hover:text-red-500 ml-1"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Provenderie */}
                {supply.source === "PROVENDERIE" && (
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 animate-in fade-in slide-in-from-top-2 space-y-3">
                        <label className="block text-sm font-bold text-orange-900">
                            Détails de la provenderie
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <input
                                    type="text"
                                    placeholder="Nom de la provenderie *"
                                    className={`w-full p-3 rounded-lg border ${
                                        errors.provenderieName
                                            ? "border-red-500 bg-red-50"
                                            : "border-orange-200"
                                    }`}
                                    value={supply.provenderie?.name || ""}
                                    onChange={(e) =>
                                        updateSupply({
                                            provenderie: {
                                                name: e.target.value,
                                                location: supply.provenderie?.location || "",
                                            },
                                        })
                                    }
                                />
                                {errors.provenderieName && (
                                    <span className="text-xs text-red-600 mt-1 block">
                                        {errors.provenderieName}
                                    </span>
                                )}
                            </div>
                            <div>
                                <input
                                    type="text"
                                    placeholder="Localisation *"
                                    className={`w-full p-3 rounded-lg border ${
                                        errors.provenderieLocation
                                            ? "border-red-500 bg-red-50"
                                            : "border-orange-200"
                                    }`}
                                    value={supply.provenderie?.location || ""}
                                    onChange={(e) =>
                                        updateSupply({
                                            provenderie: {
                                                name: supply.provenderie?.name || "",
                                                location: e.target.value,
                                            },
                                        })
                                    }
                                />
                                {errors.provenderieLocation && (
                                    <span className="text-xs text-red-600 mt-1 block">
                                        {errors.provenderieLocation}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Concurrence */}
                {supply.source === "CONCURRENCE" && (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2">
                        <label className="block text-sm font-bold text-red-900 mb-3">
                            Nom du concurrent
                        </label>
                        <input
                            type="text"
                            placeholder="Nom du distributeur concurrent *"
                            className={`w-full p-3 rounded-lg border ${
                                errors.competitorName
                                    ? "border-red-500 bg-red-50"
                                    : "border-red-200"
                            }`}
                            value={supply.competitor?.name || ""}
                            onChange={(e) =>
                                updateSupply({ competitor: { name: e.target.value } })
                            }
                        />
                        {errors.competitorName && (
                            <span className="text-sm text-red-600 mt-2 block">
                                {errors.competitorName}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* B. Précommande */}
            <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-bold text-gray-700 uppercase">
                        Précommande
                    </label>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">Non</span>
                        <button
                            type="button"
                            onClick={() => updateSupply({ hasPreOrder: !supply.hasPreOrder })}
                            className={`relative w-14 h-8 rounded-full transition-colors ${
                                supply.hasPreOrder ? "bg-green-500" : "bg-gray-300"
                            }`}
                        >
                            <span
                                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                                    supply.hasPreOrder ? "translate-x-6" : "translate-x-0"
                                }`}
                            />
                        </button>
                        <span className="text-sm font-bold text-green-600">Oui</span>
                    </div>
                </div>

                {supply.hasPreOrder && (
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100 animate-in fade-in slide-in-from-top-2 space-y-4">
                        {/* Date d'achat programmée */}
                        <div>
                            <label className="block text-sm font-bold text-green-900 mb-2">
                                Date d'achat programmée *
                            </label>
                            <input
                                type="date"
                                className={`w-full p-3 rounded-lg border ${
                                    errors.plannedPurchaseDate
                                        ? "border-red-500 bg-red-50"
                                        : "border-green-200"
                                }`}
                                value={supply.plannedPurchaseDate || ""}
                                onChange={(e) =>
                                    updateSupply({ plannedPurchaseDate: e.target.value })
                                }
                                min={new Date().toISOString().split("T")[0]}
                            />
                            {errors.plannedPurchaseDate && (
                                <span className="text-sm text-red-600 mt-1 block">
                                    {errors.plannedPurchaseDate}
                                </span>
                            )}
                        </div>

                        {/* Ajout de produits */}
                        <div>
                            <label className="block text-sm font-bold text-green-900 mb-2">
                                Produits à précommander
                            </label>

                            
                                <div className="mb-2">
                                    <select
                                        className="w-full p-3 rounded-lg border border-green-200 text-sm"
                                        value={newItemProduct}
                                        onChange={(e) => setNewItemProduct(e.target.value)}
                                    >
                                        <option value="">Sélectionner un produit...</option>
                                        <optgroup label="Aliments complets">
                                            <option value="Chick Booster">Chick Booster</option>
                                            <option value="Démarrage">Démarrage</option>
                                            <option value="Croissance">Croissance</option>
                                            <option value="Finition">Finition</option>
                                            <option value="Pondeuse Phase 1">Pondeuse Phase 1</option>
                                            <option value="Pondeuse Phase 2">Pondeuse Phase 2</option>
                                        </optgroup>
                                        <optgroup label="Concentrés">
                                            <option value="BELGOCAM 10%">BELGOCAM 10%</option>
                                            <option value="BELGOCAM 5%">BELGOCAM 5%</option>
                                            <option value="BELGOCAM Fish">BELGOCAM Fish</option>
                                        </optgroup>
                                        <optgroup label="Matières premières">
                                            <option value="Maïs">Maïs</option>
                                            <option value="Soja">Soja</option>
                                            <option value="Tourteau de soja">Tourteau de soja</option>
                                        </optgroup>
                                    </select>
                                </div>
                                <div className="flex gap-2 mb-3">
                                <div className="w-24">
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Qté"
                                        className="w-full p-3 rounded-lg border border-green-200 text-center"
                                        value={newItemQuantity}
                                        onChange={(e) =>
                                            setNewItemQuantity(parseInt(e.target.value) || 1)
                                        }
                                        onFocus={(e)=> e.target.select()}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={addPreOrderItem}
                                    disabled={!newItemProduct}
                                    className="px-4 bg-green-600 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition"
                                >
                                    +
                                </button>
                            </div>

                            {/* Liste des produits précommandés */}
                            {supply.preOrderItems.length > 0 ? (
                                <div className="space-y-2" style={{ margin: "0 -10px 0 -10px" }}>
                                    {supply.preOrderItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between bg-white p-2 rounded-lg border border-green-200 shadow-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="w-2 h-2 bg-green-500 rounded-full" />
                                                <span className="font-medium text-gray-800">
                                                    {item.product}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 bg-green-50 rounded-lg px-2 py-1">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            updatePreOrderItem(item.id, {
                                                                quantity: Math.max(1, item.quantity - 1),
                                                            })
                                                        }
                                                        className="w-6 h-6 flex items-center justify-center text-green-700 hover:bg-green-200 rounded"
                                                    >
                                                        −
                                                    </button>
                                                    <span className="font-bold text-green-900 w-8 text-center">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            updatePreOrderItem(item.id, {
                                                                quantity: item.quantity + 1,
                                                            })
                                                        }
                                                        className="w-6 h-6 flex items-center justify-center text-green-700 hover:bg-green-200 rounded"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removePreOrderItem(item.id)}
                                                    className="text-red-400 hover:text-red-600 p-1"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-400 bg-white/50 rounded-lg border border-dashed border-green-200">
                                    Aucun produit ajouté
                                </div>
                            )}

                            {errors.preOrderItems && (
                                <span className="text-sm text-red-600 block">
                                    {errors.preOrderItems}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};