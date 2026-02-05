"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Select from "react-select";
import { useSync } from "@/providers/SyncProvider"; // ✅ Import du Hook de Synchro

// --- TYPES ---
interface StatsData {
    technicianName: string;
    visitsCount: number;
    activeFlocks: number; // Cheptel Actif
    portfolioSize: number;
    visitRate: number; // Taux de couverture
    visitFrequency: string; // Intensité (Nouvelle stat)
    uniqueVisited: number;
    lateReports: number;
    healthAlerts: number; // Santé du parc (Nouvelle stat)
    estimatedFeedTonnage: number;
    loading: boolean;
    // ✅ Champs pour l'UI Optimiste (Optionnels)
    pendingVisits?: number;
    pendingActive?: number;
    pendingHealthAlerts?: number;
}

interface UserOption {
    value: number;
    label: string;
}

// --- CONSTANTES ---
const ESTIMATED_TONS_PER_FLOCK = 8;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

// --- COMPOSANTS UI ---
const MenuCard = ({ title, icon, href, color, description }: any) => (
    <Link
        href={href}
        className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-300"
    >
        <div
            className={`absolute top-0 right-0 w-24 h-24 bg-${color}-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110 opacity-50`}
        ></div>
        <div className="relative z-10">
            <div
                className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-300`}
            >
                {icon}
            </div>
            <h3 className="font-bold text-lg text-gray-800 mb-1 group-hover:text-indigo-700 transition-colors">
                {title}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
                {description}
            </p>
        </div>
    </Link>
);

// ✅ StatCard mise à jour pour afficher les données "En attente"
const StatCard = ({
    label,
    value,
    subValue,
    icon,
    color,
    loading,
    isPercent,
    alert,
    pending,
}: any) => (
    <div
        className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between h-full transition-all ${alert ? "bg-red-50 border-red-200" : "bg-white border-gray-100"} break-inside-avoid print:border-gray-300 print:shadow-none`}
    >
        <div className="flex justify-between items-start mb-2">
            <p
                className={`text-xs font-bold uppercase tracking-wider ${alert ? "text-red-600" : "text-gray-500 print:text-black"}`}
            >
                {label}
            </p>
            {icon && (
                <span
                    className={`text-lg p-1.5 rounded-lg bg-${color || "gray"}-50 text-${color || "gray"}-600 print:hidden`}
                >
                    {icon}
                </span>
            )}
        </div>
        <div>
            <div className="flex items-end gap-2 mb-1">
                {loading ? (
                    <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                    <div className="flex items-center gap-2">
                        <h4
                            className={`text-2xl font-extrabold ${alert ? "text-red-700" : "text-gray-900 print:text-black"}`}
                        >
                            {value}
                        </h4>
                        {/* ⏳ INDICATEUR VISUEL OPTIMISTE */}
                        {pending > 0 && (
                            <span
                                className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-bold border border-yellow-200 animate-pulse print:hidden"
                                title="Données en attente de synchronisation"
                            >
                                +{pending} ⏳
                            </span>
                        )}
                    </div>
                )}
                {alert && !loading && (
                    <span className="text-lg print:hidden">⚠️</span>
                )}
            </div>
            {subValue && (
                <p
                    className={`text-[10px] ${alert ? "text-red-500" : "text-gray-400 print:text-gray-600"}`}
                >
                    {subValue}
                </p>
            )}
        </div>
        {isPercent && !loading && (
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3 overflow-hidden print:border print:border-gray-200">
                <div
                    className={`h-full rounded-full ${parseFloat(value) >= 80 ? "bg-green-500" : parseFloat(value) >= 50 ? "bg-orange-400" : "bg-red-500"} print:bg-black`}
                    style={{ width: parseFloat(value) > 100 ? "100%" : value }}
                ></div>
            </div>
        )}
    </div>
);

// --- COMPOSANT PAGE ---

export default function DashboardHome() {
    const router = useRouter();
    const printRef = useRef<HTMLDivElement>(null);
    const { queue } = useSync(); // ✅ Récupération de la file d'attente

    // Context Utilisateur
    const [activeTab, setActiveTab] = useState<"menu" | "stats">("menu");
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isSupport, setIsSupport] = useState(false);

    // Filtres
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [allTechnicians, setAllTechnicians] = useState<UserOption[]>([]);
    const [selectedTechnicians, setSelectedTechnicians] = useState<
        UserOption[]
    >([]);

    // Données Stats
    const [aggregatedStats, setAggregatedStats] = useState<StatsData | null>(
        null,
    );
    const [technicianStatsList, setTechnicianStatsList] = useState<StatsData[]>(
        [],
    );
    const [loadingStats, setLoadingStats] = useState(false);

    // 1. Initialisation
    useEffect(() => {
        const token = localStorage.getItem("sav_token");
        if (!token) {
            router.push("/");
            return;
        }

        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            setCurrentUser(payload);
            const roles = payload.roles || [];
            const support =
                roles.includes("ROLE_ADMIN") ||
                roles.includes("ROLE_SUPER_ADMIN") ||
                roles.includes("ROLE_OPERATOR");
            setIsSupport(support);

            // Dates par défaut
            const now = new Date();
            setStartDate(
                new Date(now.getFullYear(), now.getMonth(), 1)
                    .toISOString()
                    .slice(0, 10),
            );
            setEndDate(
                new Date(now.getFullYear(), now.getMonth() + 1, 0)
                    .toISOString()
                    .slice(0, 10),
            );

            // Si Support : Charger la liste des techs
            if (support) {
                fetchTechnicians(token);
            }

            // Chargement initial
            const startIso = new Date(
                now.getFullYear(),
                now.getMonth(),
                1,
            ).toISOString();
            const endIso = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
            ).toISOString();

            if (!support) {
                fetchSingleStats(
                    token,
                    payload.id,
                    payload.username || "Moi",
                    startIso,
                    endIso,
                ).then((stats) => setAggregatedStats(stats));
            } else {
                loadGlobalStats(token, startIso, endIso);
            }
        } catch (e) {
            console.error("Erreur init", e);
            router.push("/");
        }
    }, [router]);

    const fetchTechnicians = async (token: string) => {
        if (!navigator.onLine) return; // Sécurité offline
        try {
            const res = await fetch(`${API_URL}/users?pagination=false`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });
            const users = await res.json();
            const techs = users
                .filter((u: any) => u.roles.includes("ROLE_TECHNICIAN"))
                .map((u: any) => ({ value: u.id, label: u.username }));
            setAllTechnicians(techs);
        } catch (e) {
            console.error("Erreur chargement techs", e);
        }
    };

    // 2. Moteur de calcul statistique
    const fetchSingleStats = async (
        token: string,
        uId: number | null,
        name: string,
        startIso: string,
        endIso: string,
    ): Promise<StatsData> => {
        if (!navigator.onLine) {
            // Retourner des stats vides en offline si pas de cache (Simplification)
            return {
                technicianName: name,
                visitsCount: 0,
                activeFlocks: 0,
                portfolioSize: 0,
                visitRate: 0,
                visitFrequency: "0",
                uniqueVisited: 0,
                lateReports: 0,
                healthAlerts: 0,
                estimatedFeedTonnage: 0,
                loading: false,
            };
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
        };
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoIso = twoDaysAgo.toISOString();

        try {
            const requests = [];
            const techFilter = uId ? `&technician=${uId}` : "";
            const techFilterVisit = uId ? `&visit.technician=${uId}` : ""; // Pour les observations
            const techFilterPortfolio = uId ? `&technician=${uId}` : "";

            // 1. Visites (Toutes)
            requests.push(
                fetch(
                    `${API_URL}/visits?visitedAt[after]=${startIso}&visitedAt[before]=${endIso}&pagination=false${techFilter}`,
                    { headers },
                ).then((r) => r.json()),
            );

            // 2. Cheptel Actif (Chantiers en cours)
            requests.push(
                fetch(`${API_URL}/visits?exists[endDate]=false${techFilter}`, {
                    headers,
                }).then((r) => r.json()),
            );

            // 3. Portefeuille
            if (uId) {
                requests.push(
                    fetch(
                        `${API_URL}/portfolio_histories?pagination=false${techFilterPortfolio}`,
                        { headers },
                    ).then((r) => r.json()),
                );
            } else {
                requests.push(
                    fetch(
                        `${API_URL}/customers?activated=true&pagination=false`,
                        { headers },
                    ).then((r) => r.json()),
                );
            }

            // 4. Retards (Dette)
            requests.push(
                fetch(
                    `${API_URL}/visits?closed=false&visitedAt[before]=${twoDaysAgoIso}${techFilter}`,
                    { headers },
                ).then((r) => r.json()),
            );

            // 5. Santé du Parc (Observations sur la période)
            requests.push(
                fetch(
                    `${API_URL}/observations?observedAt[after]=${startIso}&observedAt[before]=${endIso}&pagination=false${techFilterVisit}`,
                    { headers },
                ).then((r) => r.json()),
            );

            const results = await Promise.all(requests);

            // --- Helpers extraction ---
            const getCount = (d: any) =>
                Array.isArray(d) ? d.length : d["hydra:totalItems"] || 0;
            const getArray = (d: any) =>
                Array.isArray(d) ? d : d["hydra:member"] || [];

            // --- Calculs ---
            const visitsArray = getArray(results[0]);
            const visitsCount = visitsArray.length;
            const uniqueVisited = new Set(
                visitsArray
                    .map((v: any) => v.customer?.["@id"] || v.customer?.id)
                    .filter(Boolean),
            ).size;

            let portfolioSize = 0;
            if (!uId) {
                portfolioSize = getCount(results[2]);
            } else {
                const histArray = getArray(results[2]);
                const activeSet = new Set();
                const pStart = new Date(startIso);
                const pEnd = new Date(endIso);
                histArray.forEach((h: any) => {
                    const hStart = new Date(h.startDate);
                    const hEnd = h.endDate ? new Date(h.endDate) : null;
                    if (hStart <= pEnd && (hEnd === null || hEnd >= pStart)) {
                        const cid = h.customer?.["@id"] || h.customer?.id;
                        if (cid) activeSet.add(cid);
                    }
                });
                portfolioSize = activeSet.size;
            }

            const activeFlocks = getCount(results[1]); // Cheptel Actif
            const lateReports = getCount(results[3]);

            const obsArray = getArray(results[4]);
            const healthAlerts = obsArray.filter(
                (o: any) => o.problems && o.problems.trim() !== "",
            ).length;

            const estimatedFeedTonnage =
                activeFlocks * ESTIMATED_TONS_PER_FLOCK;
            const visitRate =
                portfolioSize > 0
                    ? Math.round((uniqueVisited / portfolioSize) * 100)
                    : 0;
            const frequencyVal =
                uniqueVisited > 0
                    ? (visitsCount / uniqueVisited).toFixed(1)
                    : "0";

            return {
                technicianName: name,
                visitsCount,
                activeFlocks,
                portfolioSize,
                visitRate,
                visitFrequency: frequencyVal,
                uniqueVisited,
                lateReports,
                healthAlerts,
                estimatedFeedTonnage,
                loading: false,
            };
        } catch (e) {
            console.error("Erreur fetch single", e);
            return {
                technicianName: name,
                visitsCount: 0,
                activeFlocks: 0,
                portfolioSize: 0,
                visitRate: 0,
                visitFrequency: "0",
                uniqueVisited: 0,
                lateReports: 0,
                healthAlerts: 0,
                estimatedFeedTonnage: 0,
                loading: false,
            };
        }
    };

    // ✅ 4. LOGIQUE DE FUSION OPTIMISTE (CALCULS)
    const displayedStats = useMemo(() => {
        // On part des stats serveur
        if (!aggregatedStats) return null;
        if (loadingStats) return aggregatedStats; // Pas de calcul pendant le chargement

        const s = new Date(startDate);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999); // Fin de journée

        // On clone pour ajouter les pending
        const stats = { ...aggregatedStats };
        let pendingVisitsCount = 0;
        let pendingActive = 0;
        let pendingAlerts = 0;

        // On scanne la file d'attente
        queue.forEach((item: any) => {
            // On ne regarde que les créations (POST)
            if (item.method !== "POST") return;

            // -> VISITES EN ATTENTE
            if (item.url === "/visits") {
                const d = new Date(item.body.visitedAt || new Date());
                // Si la visite est dans la période sélectionnée
                if (d >= s && d <= e) {
                    pendingVisitsCount++;

                    // Si pas de date de fin et pas fermée => Compte comme actif (Chantier en cours)
                    if (!item.body.endDate && !item.body.closed) {
                        pendingActive++;
                    }
                }
            }

            // -> OBSERVATIONS EN ATTENTE (Alertes Santé)
            if (item.url === "/observations") {
                const d = new Date(item.body.observedAt || new Date());
                if (d >= s && d <= e) {
                    // On vérifie s'il y a des problèmes signalés
                    const hasPb =
                        (item.body.detectedProblems &&
                            item.body.detectedProblems.length > 0) ||
                        (item.body.problems &&
                            item.body.problems.trim() !== "");
                    if (hasPb) {
                        pendingAlerts++;
                    }
                }
            }

            // Note: On pourrait aussi scanner '/flocks' pour le cheptel actif,
            // mais généralement un POST /flock s'accompagne d'un POST /visit (création chantier)
        });

        // Application des totaux optimistes
        stats.visitsCount += pendingVisitsCount;
        stats.activeFlocks += pendingActive;
        stats.healthAlerts += pendingAlerts;

        // Estimation tonne (Approximation)
        stats.estimatedFeedTonnage += pendingActive * ESTIMATED_TONS_PER_FLOCK;

        // Injection des compteurs pour l'affichage badge
        stats.pendingVisits = pendingVisitsCount;
        stats.pendingActive = pendingActive;
        stats.pendingHealthAlerts = pendingAlerts;

        return stats;
    }, [aggregatedStats, queue, startDate, endDate, loadingStats]);

    // 3. Gestionnaire de recherche
    const handleSearch = async () => {
        setLoadingStats(true);
        const token = localStorage.getItem("sav_token");
        if (!token) return;

        const s = new Date(startDate);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        const startIso = s.toISOString();
        const endIso = e.toISOString();

        if (!isSupport) {
            const stats = await fetchSingleStats(
                token,
                currentUser.id,
                currentUser.username,
                startIso,
                endIso,
            );
            setAggregatedStats(stats);
            setTechnicianStatsList([]);
        } else {
            if (selectedTechnicians.length === 0) {
                await loadGlobalStats(token, startIso, endIso);
                setTechnicianStatsList([]);
            } else {
                const promises = selectedTechnicians.map((tech) =>
                    fetchSingleStats(
                        token,
                        tech.value,
                        tech.label,
                        startIso,
                        endIso,
                    ),
                );
                const statsList = await Promise.all(promises);
                setTechnicianStatsList(statsList);

                // Cumul manuel
                const cumul: StatsData = statsList.reduce(
                    (acc, curr) => ({
                        technicianName: "CUMUL SÉLECTION",
                        visitsCount: acc.visitsCount + curr.visitsCount,
                        activeFlocks: acc.activeFlocks + curr.activeFlocks,
                        portfolioSize: acc.portfolioSize + curr.portfolioSize,
                        uniqueVisited: acc.uniqueVisited + curr.uniqueVisited,
                        lateReports: acc.lateReports + curr.lateReports,
                        healthAlerts: acc.healthAlerts + curr.healthAlerts,
                        estimatedFeedTonnage:
                            acc.estimatedFeedTonnage +
                            curr.estimatedFeedTonnage,
                        visitRate: 0,
                        visitFrequency: "0",
                        loading: false,
                    }),
                    {
                        technicianName: "",
                        visitsCount: 0,
                        activeFlocks: 0,
                        portfolioSize: 0,
                        uniqueVisited: 0,
                        lateReports: 0,
                        healthAlerts: 0,
                        estimatedFeedTonnage: 0,
                        visitRate: 0,
                        visitFrequency: "0",
                        loading: false,
                    },
                );

                cumul.visitRate =
                    cumul.portfolioSize > 0
                        ? Math.round(
                              (cumul.uniqueVisited / cumul.portfolioSize) * 100,
                          )
                        : 0;
                cumul.visitFrequency =
                    cumul.uniqueVisited > 0
                        ? (cumul.visitsCount / cumul.uniqueVisited).toFixed(1)
                        : "0";

                setAggregatedStats(cumul);
            }
        }
        setLoadingStats(false);
    };

    const loadGlobalStats = async (
        token: string,
        startIso: string,
        endIso: string,
    ) => {
        const stats = await fetchSingleStats(
            token,
            null,
            "Vue d'ensemble (Tous)",
            startIso,
            endIso,
        );
        setAggregatedStats(stats);
    };

    const handlePrint = () => window.print();

    // Rendu d'une section de stats
    const renderStatsSection = (data: StatsData, isMain = false) => (
        <div
            className={`mb-8 break-inside-avoid ${isMain ? "" : "opacity-90 scale-95 origin-left"}`}
        >
            <h3
                className={`font-bold mb-4 flex items-center gap-2 ${isMain ? "text-xl text-indigo-900 border-b pb-2 print:text-black print:border-black" : "text-lg text-gray-700 print:text-gray-900"}`}
            >
                {isMain ? "📊" : "👤"} {data.technicianName}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {/* 1. Couverture */}
                <StatCard
                    label="Taux Couv."
                    value={`${data.visitRate}%`}
                    subValue={`${data.uniqueVisited}/${data.portfolioSize} clients`}
                    isPercent={true}
                    loading={data.loading}
                    icon="🎯"
                    color="blue"
                />

                {/* 2. Intensité */}
                <StatCard
                    label="Intensité"
                    value={data.visitFrequency}
                    subValue="Visites / Client / Période"
                    loading={data.loading}
                    icon="🔄"
                    color="purple"
                />

                {/* 3. Cheptel Actif (Avec Optimisme) */}
                <StatCard
                    label="Cheptel Actif"
                    value={data.activeFlocks.toString()}
                    subValue="Lots en cours"
                    loading={data.loading}
                    icon="🐣"
                    color="indigo"
                    pending={data.pendingActive}
                />

                {/* 4. Santé du Parc (Avec Optimisme) */}
                <StatCard
                    label="Alertes Santé"
                    value={data.healthAlerts.toString()}
                    subValue="Observations avec problèmes"
                    loading={data.loading}
                    alert={data.healthAlerts > 0}
                    icon="❤️‍🩹"
                    color={data.healthAlerts > 0 ? "red" : "green"}
                    pending={data.pendingHealthAlerts}
                />
            </div>

            {/* Seconde ligne */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="Visites Tot."
                    value={data.visitsCount.toString()}
                    loading={data.loading}
                    icon="📝"
                    color="gray"
                    pending={data.pendingVisits}
                />
                <StatCard
                    label="Retards"
                    value={data.lateReports.toString()}
                    loading={data.loading}
                    alert={data.lateReports > 0}
                    icon="⏰"
                    color={data.lateReports > 0 ? "orange" : "green"}
                />
                <div className="col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center print:bg-white print:border-gray-300">
                    <p className="text-blue-800 text-xs font-bold uppercase mb-1 print:text-black">
                        Potentiel Aliment
                    </p>
                    <h4 className="text-xl font-extrabold text-blue-900 print:text-black">
                        {data.loading
                            ? "..."
                            : `~ ${data.estimatedFeedTonnage} T`}
                    </h4>
                    <p className="text-[10px] text-blue-600 mt-1 print:text-gray-600">
                        Estimation sur cheptel actif
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            {/* HEADER (Masqué à l'impression) */}
            <div className="print:hidden bg-gradient-to-r from-indigo-900 to-indigo-800 text-white px-6 pt-8 pb-20 rounded-b-[3rem] shadow-xl mb-8">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div>
                        <p className="text-indigo-200 text-sm font-medium mb-1 uppercase tracking-wide">
                            Tableau de bord
                        </p>
                        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                            {currentUser?.username}
                        </h1>
                    </div>
                </div>
            </div>

            {/* CONTENU PRINCIPAL */}
            <div className="max-w-6xl mx-auto px-4 -mt-16 relative z-10 print:mt-0 print:max-w-full print:px-0">
                {/* MENU ONGLETS (Masqué à l'impression) */}
                <div className="print:hidden flex bg-white p-1.5 rounded-xl shadow-lg border border-gray-100 mb-8 w-fit mx-auto md:mx-0">
                    <button
                        onClick={() => setActiveTab("menu")}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "menu" ? "bg-indigo-100 text-indigo-700" : "text-gray-500"}`}
                    >
                        Applications
                    </button>
                    <button
                        onClick={() => setActiveTab("stats")}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "stats" ? "bg-indigo-100 text-indigo-700" : "text-gray-500"}`}
                    >
                        Performance
                    </button>
                </div>

                {activeTab === "menu" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        <MenuCard
                            title="Clients"
                            icon="👥"
                            href="/dashboard/customers"
                            color="blue"
                            description="Gérer le portefeuille client."
                        />
                        <MenuCard
                            title="Visites"
                            icon="🚜"
                            href="/dashboard/visits"
                            color="indigo"
                            description="Rapports et interventions."
                        />
                        <MenuCard
                            title="Prospections"
                            icon="🔭"
                            href="/dashboard/prospections"
                            color="purple"
                            description="Suivi des prospects et consultations."
                        />
                        <MenuCard
                            title="Bandes"
                            icon="🐣"
                            href="/dashboard/flocks"
                            color="green"
                            description="Suivi des lots en cours."
                        />
                        <MenuCard
                            title="Bâtiments"
                            icon="🏠"
                            href="/dashboard/buildings"
                            color="orange"
                            description="Infrastructures."
                        />
                        <MenuCard
                            title="Rapports"
                            icon="📈"
                            href="/dashboard/reports"
                            color="pink"
                            description="Analyses, graphiques et exports Excel."
                        />
                        {isSupport && (
                            <MenuCard
                                title="Utilisateurs"
                                icon="🔐"
                                href="/dashboard/users"
                                color="red"
                                description="Administration des accès."
                            />
                        )}
                        {isSupport && (
                            <MenuCard
                                title="Config"
                                icon="⚙️"
                                href="/dashboard/settings"
                                color="gray"
                                description="Paramètres globaux."
                            />
                        )}
                    </div>
                ) : (
                    <div
                        ref={printRef}
                        className="space-y-8 animate-fade-in print:w-full print:bg-white"
                    >
                        {/* BARRE DE FILTRES : VISIBLE PAR TOUS */}
                        <div className="print:hidden bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
                                Filtrer les rapports
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="w-full md:w-1/4">
                                    <label className="text-xs text-gray-500 block mb-1">
                                        Du
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) =>
                                            setStartDate(e.target.value)
                                        }
                                        className="w-full border p-2 rounded-lg text-sm"
                                    />
                                </div>
                                <div className="w-full md:w-1/4">
                                    <label className="text-xs text-gray-500 block mb-1">
                                        Au
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) =>
                                            setEndDate(e.target.value)
                                        }
                                        className="w-full border p-2 rounded-lg text-sm"
                                    />
                                </div>

                                {isSupport && (
                                    <div className="w-full md:w-1/3">
                                        <label className="text-xs text-gray-500 block mb-1">
                                            Techniciens (Laisser vide pour
                                            Global)
                                        </label>
                                        <Select
                                            isMulti
                                            options={allTechnicians}
                                            value={selectedTechnicians}
                                            onChange={(val) =>
                                                setSelectedTechnicians(
                                                    val as UserOption[],
                                                )
                                            }
                                            placeholder="Choisir..."
                                            className="text-sm"
                                        />
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSearch}
                                        disabled={loadingStats}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition flex items-center gap-2"
                                    >
                                        {loadingStats ? "..." : "🔍 Filtrer"}
                                    </button>
                                    <button
                                        onClick={handlePrint}
                                        className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition"
                                        title="Imprimer / PDF"
                                    >
                                        🖨️
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ENTÊTE D'IMPRESSION PRO */}
                        <div className="hidden print:flex flex-row justify-between items-end mb-8 border-b-2 border-black pb-4 pt-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-black uppercase tracking-tight">
                                    SAV Tracker
                                </h1>
                                <p className="text-sm text-gray-600 mt-1 font-medium">
                                    Rapport de Performance Technique
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-black">
                                    {new Date(startDate).toLocaleDateString(
                                        "fr-FR",
                                    )}{" "}
                                    <span className="mx-1">au</span>{" "}
                                    {new Date(endDate).toLocaleDateString(
                                        "fr-FR",
                                    )}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Édité par {currentUser?.username} le{" "}
                                    {new Date().toLocaleDateString("fr-FR")}
                                </p>
                            </div>
                        </div>

                        {/* ✅ AFFICHAGE OPTIMISTE POUR LA SECTION PRINCIPALE */}
                        {displayedStats && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 print:shadow-none print:border-none print:p-0">
                                {renderStatsSection(displayedStats, true)}
                            </div>
                        )}

                        {technicianStatsList.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-gray-500 font-bold uppercase text-xs mb-4 border-b pb-2 print:text-black print:border-black">
                                    Détail par Technicien
                                </h3>
                                <div className="grid gap-6">
                                    {technicianStatsList.map((stats, idx) => (
                                        <div
                                            key={idx}
                                            className="bg-gray-50 p-4 rounded-xl border border-gray-100 print:bg-white print:border-gray-300 print:break-inside-avoid"
                                        >
                                            {renderStatsSection(stats, false)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style jsx global>{`
                @media print {
                    @page {
                        margin: 1cm;
                        size: auto;
                    }
                    body {
                        background: white;
                        -webkit-print-color-adjust: exact;
                    }
                    nav,
                    header,
                    footer,
                    button {
                        display: none !important;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                    .print\\:block {
                        display: block !important;
                    }
                    .print\\:flex {
                        display: flex !important;
                    }
                    .print\\:shadow-none {
                        box-shadow: none !important;
                    }
                    .print\\:border-none {
                        border: none !important;
                    }
                    .print\\:mt-0 {
                        margin-top: 0 !important;
                    }
                    .print\\:max-w-full {
                        max-width: 100% !important;
                    }
                    .print\\:px-0 {
                        padding-left: 0 !important;
                        padding-right: 0 !important;
                    }
                    .print\\:text-black {
                        color: black !important;
                    }
                    .print\\:border-black {
                        border-color: black !important;
                    }
                    .break-inside-avoid {
                        break-inside: avoid;
                    }
                }
            `}</style>
        </div>
    );
}
