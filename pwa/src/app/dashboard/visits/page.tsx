"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Select from "react-select";
import { useCustomers, CustomerOption } from "@/hooks/useCustomers";
import { useSync } from "@/providers/SyncProvider";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";

type ViewMode = "planning" | "in_progress" | "completed";
type VisitStatus =
    | "planned"
    | "in_progress"
    | "completed"
    | "archived"
    | "draft";

interface Visit {
    id: number | string;
    visitedAt?: string | null;
    plannedAt?: string | null;
    completedAt?: string | null;
    status: VisitStatus;
    technician: { id: number; fullname: string };
    customer: { id: number; name: string; zone: string };
    gpsCoordinates?: string;
    closed: boolean;
    activated: boolean;
    objective: string;
    conclusion?: string;
    observations: any[];
    planningDeviation?: number;
    duration?: number;
    __isPending?: boolean;
}

interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalItems: number;
}

interface CachedData {
    visits: Visit[];
    pagination: PaginationInfo;
    timestamp: number;
}

interface PerformanceStats {
    visitsPlanned: number;
    visitsRealized: number;
    visitsObjective: number;
    realizationScore: number;
    objectiveCompletionScore: number;
}

interface FilterState {
    viewMode: ViewMode;
    filterType: string;
    datePrimary: string;
    dateSecondary: string;
    selectedCustomer: CustomerOption | null;
    showArchived: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ITEMS_PER_PAGE = 20;
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24;

// ✅ CORRECTION : Fonction pour normaliser une date à minuit UTC
const normalizeDate = (date: Date): Date => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

// ✅ CORRECTION : Fonction pour obtenir la fin de journée UTC
const endOfDay = (date: Date): Date => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
};

const getDateRange = (
    type: string,
    dateRef: string,
    dateEndRef?: string,
): { after: string; before: string } | null => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (type) {
        case "today":
            // ✅ CORRECTION : Utiliser les fonctions de normalisation
            start = normalizeDate(now);
            end = endOfDay(now);
            break;
        case "date":
            if (!dateRef) return null;
            const selectedDate = new Date(dateRef);
            start = normalizeDate(selectedDate);
            end = endOfDay(selectedDate);
            break;
        case "week": {
            if (!dateRef) return null;
            const weekStart = new Date(dateRef);
            const day = weekStart.getDay() || 7; // 1 = lundi, 7 = dimanche
            // Reculer jusqu'au lundi
            weekStart.setDate(weekStart.getDate() - (day - 1));
            start = normalizeDate(weekStart);
            end = new Date(start);
            end.setDate(end.getDate() + 6);
            end = endOfDay(end);
            break;
        }
        case "month": {
            if (!dateRef) return null;
            const monthStart = new Date(dateRef);
            monthStart.setDate(1);
            start = normalizeDate(monthStart);
            end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0); // Dernier jour du mois
            end = endOfDay(end);
            break;
        }
        case "interval": {
            if (!dateRef || !dateEndRef) return null;
            const intervalStart = new Date(dateRef);
            const intervalEnd = new Date(dateEndRef);
            start = normalizeDate(intervalStart);
            end = endOfDay(intervalEnd);
            break;
        }
        case "all":
        default:
            return null;
    }
    const formatDate = (d: Date) =>
        d.toISOString().replace("T", " ").split(".")[0];
    // ✅ CORRECTION : Retourner au format ISO complet pour être précis
    return {
        after: formatDate(start),
        before: formatDate(end),
    };
};

export default function VisitsListPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { options: customerOptions, loading: customersLoading } =
        useCustomers();
    const { queue, processQueue } = useSync();
    const { user } = useAuth();
    const preloadRef = useRef<Set<string>>(new Set());

    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const [pagination, setPagination] = useState<PaginationInfo>({
        currentPage: parseInt(searchParams.get("page") || "1"),
        totalPages: 1,
        totalItems: 0,
    });

    const [performanceStats, setPerformanceStats] =
        useState<PerformanceStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    const [viewMode, setViewMode] = useState<ViewMode>(
        (searchParams.get("mode") as ViewMode) || "planning",
    );

    const [selectedCustomer, setSelectedCustomer] =
        useState<CustomerOption | null>(null);
    const [filterType, setFilterType] = useState(
        searchParams.get("period") || "today",
    );
    const [datePrimary, setDatePrimary] = useState(
        searchParams.get("date") || new Date().toISOString().slice(0, 10),
    );
    const [dateSecondary, setDateSecondary] = useState(
        searchParams.get("dateEnd") || "",
    );

    const canViewArchived = useMemo(() => {
        return user?.roles?.some((r: string) =>
            ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"].includes(r),
        );
    }, [user]);

    const [showArchived, setShowArchived] = useState(
        canViewArchived && searchParams.get("archived") === "true",
    );

    // ✅ CORRECTION: Créer une ref pour stocker les filtres actuels et éviter les stale closures
    const filtersRef = useRef<FilterState>({
        viewMode,
        filterType,
        datePrimary,
        dateSecondary,
        selectedCustomer,
        showArchived: !!showArchived,
    });

    // ✅ CORRECTION: Mettre à jour la ref quand les filtres changent
    useEffect(() => {
        filtersRef.current = {
            viewMode,
            filterType,
            datePrimary,
            dateSecondary,
            selectedCustomer,
            showArchived: !!showArchived,
        };
    }, [
        viewMode,
        filterType,
        datePrimary,
        dateSecondary,
        selectedCustomer,
        showArchived,
    ]);

    const updateURL = useCallback((params: Record<string, string>) => {
        const url = new URL(window.location.href);
        Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.set(key, value);
            else url.searchParams.delete(key);
        });
        window.history.replaceState({}, "", url);
    }, []);

    const fetchPerformanceScores = useCallback(
        async (overrideFilters?: Partial<FilterState>) => {
            setLoadingStats(true);
            const token = localStorage.getItem("sav_token");
            if (!token) return;

            // Utiliser les filtres actuels ou les overrides
            const filterTypeToUse = overrideFilters?.filterType ?? filterType;
            const datePrimaryToUse =
                overrideFilters?.datePrimary ?? datePrimary;
            const dateSecondaryToUse =
                overrideFilters?.dateSecondary ?? dateSecondary;

            let range: { after: string; before: string } | null = null;

            // Calculer la plage de dates pour les stats (start/end)
            if (filterTypeToUse !== "all") {
                range = getDateRange(
                    filterTypeToUse,
                    datePrimaryToUse,
                    dateSecondaryToUse,
                );
            } else {
                // Si pas de plage (ex: filterType = "all"), on choisit une période par défaut qui est l'année en cours
                const currentYear = new Date().getFullYear();
                range = getDateRange(
                    'interval',
                    `${currentYear}-01-01 00:00:00`,
                    `${currentYear}-12-31 23:59:59`,
                );
            }

            if (!range) {
                setPerformanceStats(null);
                setLoadingStats(false);
                return;
            }

            const params = new URLSearchParams();
            // Votre TechnicianStatsProvider attend 'start' et 'end'
            params.set("start", range.after.split(" ")[0]); // YYYY-MM-DD
            params.set("end", range.before.split(" ")[0]); // YYYY-MM-DD

            // Si l'utilisateur n'est pas admin, il ne voit que ses stats (le Provider s'en occupe via Security)
            // Mais on peut forcer l'ID si nécessaire pour les admins
            if (!canViewArchived && user) {
                params.append("technicians[]", user.id.toString());
            }

            try {
                const res = await fetch(
                    `${API_URL}/stats/adherence?${params.toString()}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/json",
                        },
                    },
                );
                if (res.ok) {
                    const stats = await res.json();
                    setPerformanceStats(stats);
                }
            } catch (err) {
                console.error("Erreur stats:", err);
            } finally {
                setLoadingStats(false);
            }
        },
        [filterType, datePrimary, dateSecondary, user, canViewArchived],
    );

    // ✅ CORRECTION: Fonction qui utilise la ref au lieu des closures
    const buildQueryParams = useCallback(
        (
            page: number,
            mode?: ViewMode,
            overrideFilters?: Partial<FilterState>,
        ): URLSearchParams => {
            // Utiliser les filtres override si fournis, sinon la ref actuelle
            const currentFilters = overrideFilters
                ? { ...filtersRef.current, ...overrideFilters }
                : filtersRef.current;

            const currentMode = mode || currentFilters.viewMode;
            const params = new URLSearchParams();
            params.set("page", page.toString());
            params.set("itemsPerPage", ITEMS_PER_PAGE.toString());
            params.set("mode", currentMode);

            // ✅ CORRECTION : Définir explicitement le champ de date selon le mode
            let dateField: string;

            switch (currentMode) {
                case "planning":
                    dateField = "plannedAt";
                    // ✅ CORRECTION : Visites planifiées = non commencées ET non clôturées
                    params.set("closed", "false");
                    params.set("plannedAt[exists]", "true");
                    params.set("visitedAt[exists]", "false");
                    params.set("order[plannedAt]", "asc");
                    break;

                case "in_progress":
                    dateField = "visitedAt";
                    // ✅ CORRECTION : Visites en cours = démarrées ET non clôturées
                    params.set("closed", "false");
                    params.set("visitedAt[exists]", "true");
                    params.set("completedAt[exists]", "false");
                    params.set("order[visitedAt]", "desc");
                    break;

                case "completed":
                    dateField = "completedAt";
                    // ✅ CORRECTION : Visites terminées = clôturées
                    params.set("closed", "true");
                    params.set("completedAt[exists]", "true");
                    params.set("order[completedAt]", "desc");
                    break;
            }

            // ✅ CORRECTION : Appliquer le filtre de date sur le bon champ
            const currentFilterType =
                overrideFilters?.filterType ?? currentFilters.filterType;
            const currentDatePrimary =
                overrideFilters?.datePrimary ?? currentFilters.datePrimary;
            const currentDateSecondary =
                overrideFilters?.dateSecondary ?? currentFilters.dateSecondary;

            if (currentFilterType !== "all") {
                const range = getDateRange(
                    currentFilterType,
                    currentDatePrimary,
                    currentDateSecondary,
                );
                if (range) {
                    params.set(`${dateField}[after]`, range.after);
                    params.set(`${dateField}[before]`, range.before);
                }
            }

            // ✅ FILTRE CLIENT (commun à tous les onglets)
            const customer =
                overrideFilters?.selectedCustomer ??
                currentFilters.selectedCustomer;
            if (customer) {
                const customerId = customer.value.split("/").pop();
                if (customerId) params.set("customer", customerId);
            }

            // ✅ FILTRE ARCHIVÉ/ACTIF (commun à tous les onglets)
            const archived =
                overrideFilters?.showArchived ?? currentFilters.showArchived;
            if (archived && !!canViewArchived) {
                params.set("activated", "false");
            } else {
                params.set("activated", "true");
            }

            // ✅ FILTRE TECHNICIEN (optionnel - si l'utilisateur n'est pas admin)
            if (
                user &&
                !user.roles?.some((r: string) =>
                    ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"].includes(r),
                )
            ) {
                params.set("technician", user.id.toString());
            }

            // Debug: log des paramètres générés
            console.log(
                `[buildQueryParams] Mode: ${currentMode}, FilterType: ${currentFilterType}, DatePrimary: ${currentDatePrimary}, Params:`,
                params.toString(),
            );

            return params;
        },
        [canViewArchived, user], // Ne dépend plus des états changeants
    );

    const getCacheKey = (page: number, mode: ViewMode = viewMode) => {
        const params = buildQueryParams(page, mode);
        return `visits_v3_${mode}_${page}_${params.toString()}`;
    };

    // ✅ Préchargement des détails des visites visibles
    const preloadVisitDetails = useCallback(async (visits: Visit[]) => {
        if (!navigator.onLine) return;

        const token = localStorage.getItem("sav_token");
        if (!token) return;

        // Précharger les 10 premières visites non-cachées
        const toPreload = visits.slice(0, 10).filter((v) => {
            const cacheKey = `visit_detail_v2_${v.id}`;
            return (
                !localStorage.getItem(cacheKey) &&
                !preloadRef.current.has(cacheKey)
            );
        });

        for (const visit of toPreload) {
            const cacheKey = `visit_detail_v2_${visit.id}`;
            preloadRef.current.add(cacheKey);

            try {
                const res = await fetch(`${API_URL}/visits/${visit.id}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/ld+json",
                    },
                });

                if (res.ok) {
                    const data = await res.json();
                    const visitData = data["hydra:member"]?.[0] || data;
                    localStorage.setItem(
                        cacheKey,
                        JSON.stringify({
                            data: visitData,
                            timestamp: Date.now(),
                            source: "api",
                        }),
                    );
                }
            } catch {
                // Silencieux
            }
        }
    }, []);

    const preloadOtherViews = useCallback(async () => {
        if (!navigator.onLine || filterType !== "today" || selectedCustomer)
            return;

        const otherModes: ViewMode[] = (
            ["planning", "in_progress", "completed"] as ViewMode[]
        ).filter((m) => m !== viewMode);

        for (const mode of otherModes) {
            const cacheKey = getCacheKey(1, mode);
            if (preloadRef.current.has(cacheKey)) continue;

            try {
                const token = localStorage.getItem("sav_token");
                if (!token) continue;

                const params = buildQueryParams(1, mode);
                const url = `${API_URL}/visits?${params.toString()}`;

                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/ld+json",
                    },
                });

                if (!res.ok) continue;

                const data = await res.json();
                const visitsData = data["hydra:member"] || data.member || data;
                const totalItems =
                    data["hydra:totalItems"] ||
                    data.totalItems ||
                    visitsData.length;

                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({
                        visits: visitsData,
                        pagination: {
                            currentPage: 1,
                            totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
                            totalItems,
                        },
                        timestamp: Date.now(),
                    }),
                );

                preloadRef.current.add(cacheKey);

                // Précharger aussi les détails de cette vue
                preloadVisitDetails(visitsData);
            } catch {
                // Silencieux
            }
        }
    }, [
        viewMode,
        filterType,
        selectedCustomer,
        buildQueryParams,
        preloadVisitDetails,
    ]);

    // ✅ CORRECTION: Fonction fetchVisits qui utilise toujours les dernières valeurs via la ref
    const fetchVisits = useCallback(
        async (
            page: number = pagination.currentPage,
            forceRefresh = false,
            overrideFilters?: Partial<FilterState>,
        ) => {
            setLoading(true);
            const token = localStorage.getItem("sav_token");
            if (!token) {
                router.push("/");
                return;
            }

            // ✅ CORRECTION: Utiliser overrideFilters pour générer la clé de cache si fourni
            const effectiveFilters = overrideFilters || {};
            const currentMode =
                effectiveFilters.viewMode || filtersRef.current.viewMode;

            const params = buildQueryParams(
                page,
                currentMode,
                effectiveFilters,
            );
            const cacheKey = `visits_v3_${currentMode}_${page}_${params.toString()}`;
            const cached = localStorage.getItem(cacheKey);

            // ✅ CORRECTION: Ne pas utiliser le cache si forceRefresh est true
            if (!forceRefresh && !navigator.onLine && cached) {
                const parsed: CachedData = JSON.parse(cached);
                setVisits(parsed.visits);
                setPagination(parsed.pagination);
                setCacheAge(Date.now() - parsed.timestamp);
                setIsOfflineMode(true);
                setLoading(false);
                return;
            }

            const url = `${API_URL}/visits?${params.toString()}`;

            // Debug: log de l'URL complète
            console.log(`[fetchVisits] URL: ${url}`);

            try {
                if (navigator.onLine) {
                    const res = await fetch(url, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/ld+json",
                        },
                    });

                    if (res.status === 401) {
                        localStorage.removeItem("sav_token");
                        router.push("/");
                        return;
                    }

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const data = await res.json();
                    const visitsData =
                        data["hydra:member"] || data.member || data;
                    const totalItems =
                        data["hydra:totalItems"] ||
                        data.totalItems ||
                        visitsData.length;

                    // ✅ CORRECTION : Filtrer côté client pour s'assurer de la cohérence
                    // (en cas de problème avec les filtres API)
                    const filteredVisits = visitsData.filter((visit: Visit) => {
                        // Vérifier que la visite correspond au mode demandé
                        switch (currentMode) {
                            case "planning":
                                return (
                                    !visit.closed &&
                                    !visit.visitedAt &&
                                    visit.plannedAt
                                );
                            case "in_progress":
                                return (
                                    !visit.closed &&
                                    visit.visitedAt &&
                                    !visit.completedAt
                                );
                            case "completed":
                                return visit.closed && visit.completedAt;
                            default:
                                return true;
                        }
                    });

                    setVisits(filteredVisits);
                    setPagination({
                        currentPage: page,
                        totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
                        totalItems: filteredVisits.length, // ✅ Utiliser le nombre filtré
                    });
                    setIsOfflineMode(false);
                    setCacheAge(null);

                    const cacheData: CachedData = {
                        visits: filteredVisits,
                        pagination: {
                            currentPage: page,
                            totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
                            totalItems: filteredVisits.length,
                        },
                        timestamp: Date.now(),
                    };

                    localStorage.setItem(cacheKey, JSON.stringify(cacheData));

                    if (
                        page === 1 &&
                        (effectiveFilters.filterType || filterType) ===
                            "today" &&
                        !(effectiveFilters.selectedCustomer || selectedCustomer)
                    ) {
                        localStorage.setItem(
                            "visits_v3_fallback",
                            JSON.stringify(cacheData),
                        );
                    }

                    // ✅ Précharger les détails des visites affichées
                    preloadVisitDetails(filteredVisits);
                    preloadOtherViews();
                } else {
                    throw new Error("Hors ligne");
                }
            } catch (err) {
                console.warn("Mode Hors Ligne :", err);
                setIsOfflineMode(true);

                if (cached) {
                    const parsed: CachedData = JSON.parse(cached);
                    setVisits(parsed.visits);
                    setPagination(parsed.pagination);
                    setCacheAge(Date.now() - parsed.timestamp);
                    toast("Données hors ligne 📡", { id: "offline-mode" });
                } else {
                    const fallback = localStorage.getItem("visits_v3_fallback");
                    if (fallback) {
                        const parsed: CachedData = JSON.parse(fallback);
                        setVisits(parsed.visits.slice(0, ITEMS_PER_PAGE));
                        setPagination({
                            ...parsed.pagination,
                            totalItems: parsed.visits.length,
                        });
                        setCacheAge(Date.now() - parsed.timestamp);
                        toast("Données de secours (partielles) ⚠️", {
                            id: "offline-partial",
                        });
                    } else {
                        setVisits([]);
                    }
                }
            } finally {
                setLoading(false);
            }
        },
        [
            router,
            buildQueryParams,
            pagination.currentPage,
            preloadOtherViews,
            preloadVisitDetails,
            filterType,
            selectedCustomer,
        ],
    );

    // Gestion online/offline
    useEffect(() => {
        const handleOnline = async () => {
            setIsOfflineMode(false);
            toast.success("Connexion rétablie 🌐", { id: "online-back" });

            if (queue.length > 0 && processQueue) {
                setIsSyncing(true);
                toast.loading("Synchronisation...", { id: "syncing" });
                try {
                    await processQueue();
                    toast.success("Synchronisation terminée ✅", {
                        id: "syncing",
                    });
                } catch {
                    toast.error("Erreur de synchronisation", { id: "syncing" });
                } finally {
                    setIsSyncing(false);
                }
            }

            fetchVisits(pagination.currentPage, true);
            fetchPerformanceScores();
        };

        const handleOffline = () => {
            setIsOfflineMode(true);
            toast("Mode hors ligne 📡", { id: "offline" });
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        if (!navigator.onLine) handleOffline();

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [fetchVisits, pagination.currentPage, queue, processQueue, fetchPerformanceScores]);

    useEffect(() => {
        fetchVisits();
        fetchPerformanceScores();
    }, [fetchVisits, fetchPerformanceScores]);

    const goToPage = (newPage: number) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;

        const params = buildQueryParams(newPage);
        const cacheKey = `visits_v3_${viewMode}_${newPage}_${params.toString()}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            const parsed: CachedData = JSON.parse(cached);
            setVisits(parsed.visits);
            setPagination((prev) => ({ ...prev, currentPage: newPage }));
            setCacheAge(Date.now() - parsed.timestamp);
        }

        setPagination((prev) => ({ ...prev, currentPage: newPage }));
        updateURL({ page: newPage.toString() });
        fetchVisits(newPage);
        fetchPerformanceScores();
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // ✅ CORRECTION: handleViewModeChange avec passage explicite des filtres
    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        setPagination((prev) => ({ ...prev, currentPage: 1 }));
        updateURL({ mode, page: "1" });

        // ✅ CORRECTION: Passer explicitement le nouveau mode à fetchVisits
        const newFilters = { viewMode: mode };

        const cacheKey = getCacheKey(1, mode);
        const cached = localStorage.getItem(cacheKey);

        if (!navigator.onLine && cached) {
            const parsed: CachedData = JSON.parse(cached);
            setVisits(parsed.visits);
            setPagination(parsed.pagination);
            setCacheAge(Date.now() - parsed.timestamp);
        }

        // ✅ Réinitialiser les filtres spécifiques quand on change d'onglet
        if (filterType === "today") {
            setDatePrimary(new Date().toISOString().slice(0, 10));
        }

        // ✅ CORRECTION: Passer les nouveaux filtres explicitement
        fetchVisits(1, true, newFilters);
        fetchPerformanceScores(newFilters);

    };

    const displayedVisits = useMemo(() => {
        const pendingVisits: Visit[] = queue
            .filter(
                (item: any) => item.url === "/visits" && item.method === "POST",
            )
            .map(
                (item: any): Visit => ({
                    id: `TEMP_${Date.now()}_${Math.random()}`,
                    plannedAt: item.body.plannedAt || null,
                    visitedAt: item.body.visitedAt || null,
                    completedAt: null,
                    status: item.body.plannedAt ? "planned" : "draft",
                    technician: { id: 0, fullname: "Moi (En attente)" },
                    customer: { id: 0, name: "Client...", zone: "..." },
                    gpsCoordinates: undefined,
                    closed: false,
                    activated: true,
                    objective: item.body.objective || "RAS",
                    observations: [],
                    __isPending: true,
                }),
            );

        return [...pendingVisits, ...visits];
    }, [visits, queue]);

    const getStatusConfig = (visit: Visit) => {
        if (visit.__isPending)
            return {
                label: "Synchronisation...",
                color: "yellow",
                border: "border-yellow-400",
                bg: "bg-yellow-50",
                icon: "⏳",
            };

        if (!visit.activated)
            return {
                label: "ARCHIVÉE",
                color: "gray",
                border: "border-gray-400",
                bg: "bg-gray-100",
                icon: "🗃️",
            };

        if (visit.status === "completed")
            return {
                label: "Terminée",
                color: "green",
                border: "border-green-500",
                bg: "bg-green-50",
                icon: "✅",
            };

        if (visit.status === "in_progress")
            return {
                label: "En cours",
                color: "orange",
                border: "border-orange-500",
                bg: "bg-orange-50",
                icon: "🔧",
            };

        if (visit.status === "planned") {
            const isLate =
                visit.plannedAt && new Date(visit.plannedAt) < new Date();
            return isLate
                ? {
                      label: "En retard",
                      color: "red",
                      border: "border-red-500",
                      bg: "bg-red-50",
                      icon: "⚠️",
                  }
                : {
                      label: "Planifiée",
                      color: "blue",
                      border: "border-blue-500",
                      bg: "bg-blue-50",
                      icon: "📅",
                  };
        }

        return {
            label: "Brouillon",
            color: "gray",
            border: "border-gray-300",
            bg: "bg-white",
            icon: "📝",
        };
    };

    // ✅ Navigation vers détail - autorise offline si cache disponible
    const handleVisitClick = (visit: Visit) => {
        if (visit.__isPending) {
            toast.error("Cette visite est en cours de synchronisation", {
                id: "pending-nav",
            });
            return false;
        }

        // Vérifier si le détail est en cache
        const detailCache = localStorage.getItem(`visit_detail_v2_${visit.id}`);
        const listCacheKeys = Object.keys(localStorage).filter(
            (k) => k.startsWith("visits_v3_") && k.includes(`_${visit.id}_`),
        );

        if (!navigator.onLine && !detailCache && listCacheKeys.length === 0) {
            toast.error("Données non disponibles hors ligne", {
                id: "offline-no-data",
            });
            return false;
        }

        return true;
    };

    const viewLabels: Record<
        ViewMode,
        { title: string; subtitle: string; empty: string }
    > = {
        planning: {
            title: "📅 Visites Planifiées",
            subtitle: "Visites à venir",
            empty: "Aucune visite planifiée",
        },
        in_progress: {
            title: "🔧 Visites en Cours",
            subtitle: "Visites démarrées",
            empty: "Aucune visite en cours",
        },
        completed: {
            title: "✅ Visites Réalisées",
            subtitle: "Visites terminées",
            empty: "Aucune visite réalisée",
        },
    };

    const currentView = viewLabels[viewMode];
    const isStale = cacheAge && cacheAge > CACHE_MAX_AGE;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            {isOfflineMode && (
                <div className="bg-orange-500 text-white text-xs font-bold text-center py-1">
                    📡 Mode Hors Ligne{" "}
                    {isStale && `(${Math.round(cacheAge! / 3600000)}h)`}
                </div>
            )}
            {isStale && !isOfflineMode && (
                <div className="bg-yellow-500 text-white text-xs font-bold text-center py-1">
                    ⚠️ Données potentiellement obsolètes
                </div>
            )}
            {isSyncing && (
                <div className="bg-blue-500 text-white text-xs font-bold text-center py-1 animate-pulse">
                    🔄 Synchronisation...
                </div>
            )}

            <div className="bg-white shadow px-6 py-4 mb-6">
                <div className="max-w-5xl mx-auto">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <Link
                                href="/dashboard"
                                className="text-sm text-gray-500 hover:text-indigo-600"
                            >
                                ← Retour
                            </Link>
                            <h1 className="text-2xl font-bold text-gray-800">
                                {currentView.title}
                            </h1>
                            <p className="text-sm text-gray-500">
                                {currentView.subtitle}
                            </p>
                        </div>
                        <Link
                            href="/dashboard/visits/new"
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-indigo-700 text-sm"
                        >
                            + Nouvelle Visite
                        </Link>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-600 mt-4 pt-4 border-t">
                        <span className="font-medium">
                            {pagination.totalItems} visite
                            {pagination.totalItems > 1 ? "s" : ""}
                        </span>
                        {viewMode === "planning" &&
                            visits.some(
                                (v) =>
                                    v.planningDeviation &&
                                    v.planningDeviation > 0,
                            ) && (
                                <span className="text-red-600">
                                    ⚠️{" "}
                                    {
                                        visits.filter(
                                            (v) =>
                                                v.planningDeviation &&
                                                v.planningDeviation > 0,
                                        ).length
                                    }{" "}
                                    en retard
                                </span>
                            )}
                        {cacheAge && !isOfflineMode && (
                            <span className="text-gray-400">
                                Cache: {Math.round(cacheAge / 60000)}min
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4">
                <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="flex flex-wrap gap-1">
                        {(
                            [
                                "planning",
                                "in_progress",
                                "completed",
                            ] as ViewMode[]
                        ).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => handleViewModeChange(mode)}
                                disabled={isSyncing}
                                className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-50 ${viewMode === mode ? "bg-indigo-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-100"}`}
                            >
                                {mode === "planning" && "📅 Planifiées"}
                                {mode === "in_progress" && "🔧 En cours"}
                                {mode === "completed" && "✅ Réalisées"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Barre de Filtres Améliorée */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                        {/* Groupe 1 : Période et Temps (6 colonnes) */}
                        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                            <div className="sm:col-span-2">
                                <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1.5">
                                    ⏱️ Sélection de la Période
                                </label>
                                <select
                                    className="w-full border-gray-200 border p-2.5 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                    value={filterType}
                                    onChange={(e) => {
                                        const newFilterType = e.target.value;
                                        setFilterType(newFilterType);
                                        updateURL({ period: newFilterType });
                                        fetchVisits(1, true, {
                                            filterType: newFilterType,
                                        });
                                        fetchPerformanceScores({
                                            filterType: newFilterType,
                                        });
                                    }}
                                >
                                    <option value="today">Aujourd'hui</option>
                                    <option value="date">Date précise</option>
                                    <option value="week">Cette semaine</option>
                                    <option value="month">Ce mois</option>
                                    <option value="interval">
                                        Intervalle personnalisé
                                    </option>
                                    <option value="all">
                                        Historique complet
                                    </option>
                                </select>
                            </div>

                            {filterType !== "today" && filterType !== "all" && (
                                <>
                                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">
                                            {filterType === "interval"
                                                ? "Date de début"
                                                : "Choisir la date"}
                                        </label>
                                        <input
                                            type="date"
                                            className="w-full border-gray-200 border p-2 rounded-lg bg-white text-sm"
                                            value={datePrimary}
                                            onChange={(e) => {
                                                const newDate = e.target.value;
                                                setDatePrimary(newDate);
                                                updateURL({ date: newDate });
                                                fetchVisits(1, true, {
                                                    datePrimary: newDate,
                                                });
                                                fetchPerformanceScores({
                                                    datePrimary: newDate,
                                                });
                                            }}
                                        />
                                    </div>
                                    {filterType === "interval" && (
                                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">
                                                Date de fin
                                            </label>
                                            <input
                                                type="date"
                                                className="w-full border-gray-200 border p-2 rounded-lg bg-white text-sm"
                                                value={dateSecondary}
                                                min={datePrimary}
                                                onChange={(e) => {
                                                    const newDate =
                                                        e.target.value;
                                                    setDateSecondary(newDate);
                                                    updateURL({
                                                        dateEnd: newDate,
                                                    });
                                                    fetchVisits(1, true, {
                                                        dateSecondary: newDate,
                                                    });
                                                }}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Groupe 2 : Client (4 colonnes) */}
                        <div className="lg:col-span-4">
                            <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1.5">
                                👤 Filtrer par Client
                            </label>
                            <Select
                                instanceId="customer-filter"
                                options={customerOptions}
                                value={selectedCustomer}
                                onChange={(newValue) => {
                                    setSelectedCustomer(newValue);
                                    fetchVisits(1, true, {
                                        selectedCustomer: newValue,
                                    });
                                    fetchPerformanceScores();
                                }}
                                isLoading={customersLoading}
                                placeholder="Rechercher un client..."
                                isClearable
                                className="text-sm"
                                styles={{
                                    control: (base) => ({
                                        ...base,
                                        borderRadius: "0.5rem",
                                        borderColor: "#e5e7eb",
                                        padding: "1px",
                                    }),
                                }}
                            />
                        </div>

                        {/* Groupe 3 : Archives (2 colonnes) */}
                        {canViewArchived && (
                            <div className="lg:col-span-2">
                                <label className="block text-[10px] uppercase tracking-wider font-black text-gray-400 mb-1.5">
                                    🗄️ État
                                </label>
                                <button
                                    onClick={() => {
                                        const newValue = !showArchived;
                                        setShowArchived(newValue);
                                        updateURL({
                                            archived: newValue ? "true" : "",
                                        });
                                        fetchVisits(1, true, {
                                            showArchived: newValue,
                                        });
                                        fetchPerformanceScores();
                                    }}
                                    className={`w-full flex items-center justify-center gap-2 text-sm font-bold py-2.5 px-4 rounded-lg border transition-all ${
                                        showArchived
                                            ? "bg-gray-800 text-white border-gray-800 shadow-inner"
                                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                                    }`}
                                >
                                    {showArchived ? "Archivées" : "Actives"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Badge d'information contextuelle */}
                    <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-indigo-600 bg-indigo-50/50 w-fit px-3 py-1.5 rounded-full border border-indigo-100">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        {viewMode === "planning" &&
                            "Mode Planning : Tri par date de visite prévue"}
                        {viewMode === "in_progress" &&
                            "Mode En Cours : Tri par date de début de visite"}
                        {viewMode === "completed" &&
                            "Mode Réalisé : Tri par date de clôture"}
                    </div>
                </div>

                {/* 🏆 BADGES DE PERFORMANCE */}
                {!loadingStats && performanceStats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Score 1 : Réalisées vs Planifiées */}
                        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between">
                            <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3">
                                Réalisées / Planifiées
                            </p>
                            <div className="flex items-end justify-between">
                                <div>
                                    <span className="text-3xl font-black text-gray-800">
                                        {performanceStats.visitsRealized}
                                    </span>
                                    <span className="text-sm font-bold text-gray-400 ml-1">
                                        / {performanceStats.visitsPlanned}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-purple-600">
                                        {performanceStats.realizationScore}%
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-400">
                                        PRODUCTIVITÉ
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Score 2 : Réalisées vs Objectif */}
                        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">
                                Réalisées / Objectif
                            </p>
                            <div className="flex items-end justify-between">
                                <div>
                                    <span className="text-3xl font-black text-gray-800">
                                        {performanceStats.visitsRealized}
                                    </span>
                                    <span className="text-sm font-bold text-gray-400 ml-1">
                                        / {performanceStats.visitsObjective}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-emerald-600">
                                        {
                                            performanceStats.objectiveCompletionScore
                                        }
                                        %
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-400">
                                        PERFORMANCE
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Score 3 : Planifiées vs Objectif */}
                        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3">
                                Planifiées / Objectif
                            </p>
                            <div className="flex items-end justify-between">
                                <div>
                                    <span className="text-3xl font-black text-gray-800">
                                        {performanceStats.visitsPlanned}
                                    </span>
                                    <span className="text-sm font-bold text-gray-400 ml-1">
                                        / {performanceStats.visitsObjective}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-blue-600">
                                        {performanceStats.visitsObjective > 0
                                            ? Math.round(
                                                  (performanceStats.visitsPlanned /
                                                      performanceStats.visitsObjective) *
                                                      100,
                                              )
                                            : 0}
                                        %
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-400">
                                        COUVERTURE
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {loading && visits.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 animate-pulse">
                        <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p>Chargement...</p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 mb-6">
                            {displayedVisits.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                    <div className="text-4xl mb-4">
                                        {viewMode === "planning" && "📅"}
                                        {viewMode === "in_progress" && "🔧"}
                                        {viewMode === "completed" && "✅"}
                                    </div>
                                    <p className="text-gray-500 font-medium text-lg">
                                        {currentView.empty}
                                    </p>
                                    {viewMode === "planning" && (
                                        <Link
                                            href="/dashboard/visits/new"
                                            className="inline-block mt-4 text-indigo-600 hover:underline"
                                        >
                                            Créer une nouvelle visite →
                                        </Link>
                                    )}
                                </div>
                            ) : (
                                displayedVisits.map((visit) => {
                                    if (!visit?.customer) return null;
                                    const config = getStatusConfig(visit);
                                    const displayDate =
                                        viewMode === "planning"
                                            ? visit.plannedAt
                                            : viewMode === "in_progress"
                                              ? visit.visitedAt
                                              : visit.completedAt;
                                    const hasDetailCache =
                                        !!localStorage.getItem(
                                            `visit_detail_v2_${visit.id}`,
                                        );

                                    return (
                                        <div
                                            key={visit.id}
                                            onClick={() => {
                                                if (handleVisitClick(visit)) {
                                                    router.push(
                                                        visit.__isPending
                                                            ? "#"
                                                            : `/dashboard/visits/${visit.id}`,
                                                    );
                                                }
                                            }}
                                            className={`block cursor-pointer ${!hasDetailCache && isOfflineMode ? "opacity-60" : ""}`}
                                        >
                                            <div
                                                className={`p-5 rounded-xl border-2 transition-all flex justify-between items-center group shadow-sm hover:shadow-md relative overflow-hidden ${config.bg} ${config.border}`}
                                            >
                                                <div className="absolute top-0 right-0">
                                                    <span
                                                        className={`text-[10px] font-black px-3 py-1.5 rounded-bl-lg uppercase tracking-wider bg-white/80 backdrop-blur ${config.color === "yellow" ? "text-yellow-700" : `text-${config.color}-700`}`}
                                                    >
                                                        {config.icon}{" "}
                                                        {config.label}
                                                        {!hasDetailCache &&
                                                            isOfflineMode &&
                                                            " (lecture seule)"}
                                                    </span>
                                                </div>

                                                <div className="flex-1 pr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h2 className="font-bold text-lg text-gray-800">
                                                            {
                                                                visit.customer
                                                                    .name
                                                            }
                                                        </h2>
                                                        {visit.planningDeviation !==
                                                            undefined &&
                                                            visit.planningDeviation >
                                                                0 && (
                                                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                                                    +
                                                                    {
                                                                        visit.planningDeviation
                                                                    }
                                                                    j
                                                                </span>
                                                            )}
                                                    </div>

                                                    <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                                                        {displayDate && (
                                                            <span className="font-medium">
                                                                {viewMode ===
                                                                    "planning" &&
                                                                    "📅 Prévu le "}
                                                                {viewMode ===
                                                                    "in_progress" &&
                                                                    "🔧 Débuté le "}
                                                                {viewMode ===
                                                                    "completed" &&
                                                                    "✅ Terminé le "}
                                                                {new Date(
                                                                    displayDate,
                                                                ).toLocaleDateString(
                                                                    "fr-FR",
                                                                    {
                                                                        weekday:
                                                                            "short",
                                                                        day: "numeric",
                                                                        month: "short",
                                                                        hour:
                                                                            viewMode !==
                                                                            "planning"
                                                                                ? "2-digit"
                                                                                : undefined,
                                                                        minute:
                                                                            viewMode !==
                                                                            "planning"
                                                                                ? "2-digit"
                                                                                : undefined,
                                                                    },
                                                                )}
                                                            </span>
                                                        )}
                                                        <span>
                                                            📍{" "}
                                                            {
                                                                visit.customer
                                                                    .zone
                                                            }
                                                        </span>
                                                        {visit.duration && (
                                                            <span className="text-green-600 font-medium">
                                                                ⏱️{" "}
                                                                {Math.floor(
                                                                    visit.duration /
                                                                        60,
                                                                )}
                                                                h
                                                                {visit.duration %
                                                                    60}
                                                                min
                                                            </span>
                                                        )}
                                                    </div>

                                                    {visit.objective &&
                                                        visit.objective !==
                                                            "RAS" && (
                                                            <p className="text-xs text-gray-500 mt-2 line-clamp-1">
                                                                📝{" "}
                                                                {
                                                                    visit.objective
                                                                }
                                                            </p>
                                                        )}
                                                    <p className="text-xs text-gray-400 mt-2">
                                                        Tech:{" "}
                                                        {visit.technician
                                                            ?.fullname ||
                                                            "Non assigné"}
                                                    </p>
                                                </div>

                                                <div className="text-2xl text-gray-300 group-hover:text-indigo-500 transition-colors">
                                                    →
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {pagination.totalPages > 1 && (
                            <div className="flex justify-center items-center gap-2 py-6 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    onClick={() =>
                                        goToPage(pagination.currentPage - 1)
                                    }
                                    disabled={
                                        pagination.currentPage === 1 ||
                                        loading ||
                                        isSyncing
                                    }
                                    className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50 font-medium"
                                >
                                    ← Précédent
                                </button>
                                <div className="flex gap-1">
                                    {Array.from(
                                        {
                                            length: Math.min(
                                                5,
                                                pagination.totalPages,
                                            ),
                                        },
                                        (_, i) => {
                                            let pageNum: number;
                                            if (pagination.totalPages <= 5)
                                                pageNum = i + 1;
                                            else if (
                                                pagination.currentPage <= 3
                                            )
                                                pageNum = i + 1;
                                            else if (
                                                pagination.currentPage >=
                                                pagination.totalPages - 2
                                            )
                                                pageNum =
                                                    pagination.totalPages -
                                                    4 +
                                                    i;
                                            else
                                                pageNum =
                                                    pagination.currentPage -
                                                    2 +
                                                    i;
                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() =>
                                                        goToPage(pageNum)
                                                    }
                                                    disabled={
                                                        loading || isSyncing
                                                    }
                                                    className={`w-10 h-10 rounded-lg font-bold transition-all ${pagination.currentPage === pageNum ? "bg-indigo-600 text-white shadow-md scale-110" : "bg-white border hover:bg-gray-50 text-gray-700"}`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        },
                                    )}
                                </div>
                                <button
                                    onClick={() =>
                                        goToPage(pagination.currentPage + 1)
                                    }
                                    disabled={
                                        pagination.currentPage ===
                                            pagination.totalPages ||
                                        loading ||
                                        isSyncing
                                    }
                                    className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50 font-medium"
                                >
                                    Suivant →
                                </button>
                            </div>
                        )}

                        <div className="text-center text-sm text-gray-400 pb-8">
                            Page {pagination.currentPage} sur{" "}
                            {pagination.totalPages} • {pagination.totalItems}{" "}
                            résultats
                            {isOfflineMode && " (mode hors ligne)"}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
