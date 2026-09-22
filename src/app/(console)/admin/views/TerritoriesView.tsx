"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode,
  FileSpreadsheet,
  Inbox,
  Landmark,
  Layers,
  MapPin,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import {
  DEFAULT_JURISDICTION,
  JURISDICTION_TYPES,
  shortJurisdiction,
  type AreaItem,
  type CityItem,
  type JurisdictionType,
  type ProvinceItem,
} from "@/types/civic";
import ProvinceCustomizerModal from "@/components/admin/ProvinceCustomizerModal";
import ProvinceManager, {
  type ProvinceGridEntry,
} from "@/components/admin/ProvinceManager";
import type { TerritoryTelemetry } from "@/components/admin/TerritoryKPIs";
import TerritoryTree from "@/components/admin/TerritoryTree";
import { sectorIcon } from "@/components/admin/sectorIcons";
import {
  departmentsWithDesks,
  districtServiceDepartments,
  squadsOnGround,
} from "@/data/departmentRegistry";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import type { ProvinceCardData } from "@/components/admin/ProvinceCard";
import { useLiveReports } from "@/lib/liveReports";
import {
  areaTypeLabel,
  buildTerritoryTree,
  buildZoneVms,
  deepLinkZoneName,
  resolveInitialExpanded,
  type TerritoryNode,
  type ZoneVm,
} from "@/lib/territoryTree";
import {
  TERRITORY_ROUTES,
  provinceUrl,
  resolveTerritoryFocus,
  territoryNodeUrl,
  type TerritoryRouteLevel,
} from "@/lib/territoryUrl";
import { formatInt } from "@/utils/format";
import {
  buildTerritoryCsv,
  buildTerritoryJson,
  countNewLocalities,
  downloadFile,
  exportFileName,
  parseTerritoryCsv,
  parseTerritoryJson,
  slugify,
} from "@/utils/territoryExport";

/* ------------------------------ Helpers ----------------------------------- */

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-700";

const zonePillClass = (j: JurisdictionType) =>
  j === "Cantonment Board"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : j === DEFAULT_JURISDICTION
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-slate-200 bg-slate-100 text-slate-600";

/** Reserved dashboard ids — the level manager rendered when no specific
    territory is focused in the URL. */
type DashboardId = "province" | "cities" | "zones";

/** Route level ("provinces" | "cities" | "zones") → dashboard id. */
const LEVEL_DASHBOARD: Record<TerritoryRouteLevel, DashboardId> = {
  provinces: "province",
  cities: "cities",
  zones: "zones",
};

const DASHBOARD_ROUTES: Record<DashboardId, string> = {
  province: TERRITORY_ROUTES.provinces,
  cities: TERRITORY_ROUTES.cities,
  zones: TERRITORY_ROUTES.zones,
};

/** Standard 4-tier civic terminology (Tier 1–3 dashboards; Tier 4 lives
    inside each zone deck). */
const DASHBOARD_CRUMBS: Record<
  DashboardId,
  { id: DashboardId; label: string }[]
> = {
  province: [{ id: "province", label: "Province" }],
  cities: [
    { id: "province", label: "Province" },
    { id: "cities", label: "Districts & Cities" },
  ],
  zones: [
    { id: "province", label: "Province" },
    { id: "cities", label: "Districts & Cities" },
    { id: "zones", label: "Tehsils & Zones" },
  ],
};

const DASHBOARD_META: Record<
  DashboardId,
  { title: string; urdu: string; blurb: string }
> = {
  province: {
    title: "Province Manager",
    urdu: "صوبہ",
    blurb:
      "Tier 1 · Province (صوبہ) — top-level regions; every District & City nests under one of these.",
  },
  cities: {
    title: "Districts & Cities Manager",
    urdu: "ضلع / شہر",
    blurb:
      "Tier 2 · District & City (ضلع / شہر) across all provinces — open one to govern its Tehsils & Zones.",
  },
  zones: {
    title: "Tehsils & Zones Manager",
    urdu: "تحصیل / زون",
    blurb:
      "Tier 3 · Tehsil & Zone (تحصیل / زون) per district — Ward, Mohallah & Village (Tier 4 · وارڈ / محلہ / دیہات) are managed inside each zone deck.",
  },
};

/** Public-facing governing desk label for a zone when none is stored. */
const deriveZoneAuthority = (zone: ZoneVm, city: CityItem): string => {
  const roster = city.agencies ?? [];
  if (zone.jurisdiction === "Cantonment Board")
    return roster.find((a) => /cantt/i.test(a)) ?? "Cantonment Board";
  if (zone.jurisdiction === "Municipal Corporation")
    return (
      roster.find((a) => /municipal|mcs/i.test(a)) ?? "Municipal Corporation"
    );
  if (zone.jurisdiction === "Development Authority")
    return (
      roster.find((a) => /development|authority/i.test(a)) ??
      "Development Authority"
    );
  return "Private Housing";
};

/** Governing-body dropdown options: the district roster plus generic desks. */
const governingBodyOptions = (city: CityItem): string[] => {
  const options = [...(city.agencies ?? [])];
  for (const j of JURISDICTION_TYPES) {
    const generic =
      j === "Cantonment Board"
        ? `${city.name_en} Cantt Board`
        : j === DEFAULT_JURISDICTION
          ? `Municipal Corporation ${city.name_en}`
          : shortJurisdiction(j);
    if (!options.includes(generic)) options.push(generic);
  }
  return options;
};

/** Governance deck routing form seeds (authority card + locality profile). */
interface RoutingForm {
  authority: string;
  supervisor: string;
  contact: string;
  office: string;
  jurisdiction: JurisdictionType;
  uc: string;
  desk: string;
}

/** Display/edit values for the selected node — stored routing wins, then the
    parent territory's, then blank. */
function deriveRoutingForm(node: TerritoryNode | undefined): RoutingForm {
  const empty: RoutingForm = {
    authority: "",
    supervisor: "",
    contact: "",
    office: "",
    jurisdiction: DEFAULT_JURISDICTION,
    uc: "",
    desk: "",
  };
  if (!node || !node.city) return empty;
  if (node.level === "city") {
    return {
      authority: "",
      supervisor: node.city.supervisor ?? "",
      contact: node.city.contact ?? "",
      office: node.city.office ?? "",
      jurisdiction: DEFAULT_JURISDICTION,
      uc: "",
      desk: "",
    };
  }
  if (node.level === "zone" && node.zone) {
    return {
      authority:
        node.zone.authority ?? deriveZoneAuthority(node.zone, node.city),
      supervisor: node.zone.supervisor ?? "",
      contact: node.zone.contact ?? "",
      office: node.zone.office ?? "",
      jurisdiction: node.zone.jurisdiction,
      uc: "",
      desk: "",
    };
  }
  const area = node.area;
  if (!area) return empty;
  return {
    authority: "",
    supervisor: area.supervisor ?? node.zone?.supervisor ?? "",
    contact: area.contact ?? "",
    office: area.office ?? node.zone?.office ?? "",
    jurisdiction:
      area.jurisdiction ?? node.zone?.jurisdiction ?? DEFAULT_JURISDICTION,
    uc: area.uc_number ?? "",
    desk: area.sub_division ?? "",
  };
}

/* --------------------------------- View ----------------------------------- */

export default function TerritoriesView({
  level,
  onNodeNavigate,
}: {
  /** Which level manager this route renders — drives which URL params are
      honoured and which dashboard shows when no territory is focused. */
  level: TerritoryRouteLevel;
  /** Live highlight feed for the sidebar level tabs (fires on every resolved
      selection so the nav mirrors the deck without a navigation). */
  onNodeNavigate?: (nodeId: string) => void;
}) {
  const {
    cities,
    provinces,
    hydrated: coverageLoaded,
    addProvince,
    updateProvince,
    deleteProvince,
    addCity,
    toggleCityStatus,
    deleteCity,
    updateCity,
    addArea,
    removeArea,
    updateArea,
    addZone,
    updateZone,
    deleteZone,
    importZones,
  } = useCoverage();
  const { raw: liveReports } = useLiveReports();
  const { sectors: registrySectors } = useDepartmentRegistry();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /* ------------------- Territory tree (recursive VM) -------------------- */

  const { provinceRoots, nodeIndex } = useMemo(
    () => buildTerritoryTree(cities, liveReports, provinces),
    [cities, liveReports, provinces]
  );

  /* ------------------ URL-driven selection engine -----------------------
     The URL is the single source of truth binding the left tree to the right
     canvas: ?province=&district=&zone=&locality= resolve to a deck node, and
     no focus at all renders the level dashboard (scoped by the params that
     ARE present). A legacy ?nodeId= bookmark still resolves through the
     node index. Clicks route with router.push, so back/forward restores the
     exact dual-pane state without local mirrors. */
  const resolved = useMemo(
    () => resolveTerritoryFocus(searchParams, cities),
    [searchParams, cities]
  );

  const focusNodeId = useMemo(() => {
    if (resolved.nodeId && nodeIndex.has(resolved.nodeId))
      return resolved.nodeId;
    const legacy = searchParams.get("nodeId");
    if (legacy && nodeIndex.has(legacy)) return legacy;
    // A bare ?province= slug focuses the province deck on its own route only.
    if (level === "provinces" && resolved.provinceParam) {
      const pid = `province-${resolved.provinceParam}`;
      if (nodeIndex.has(pid)) return pid;
    }
    return null;
  }, [resolved, nodeIndex, searchParams, level]);

  const selectedNode = focusNodeId ? nodeIndex.get(focusNodeId) : undefined;
  const activeDashboard: DashboardId = LEVEL_DASHBOARD[level];

  /** Nearest enclosing district node (itself for city level). */
  const selectedCityNode = useMemo(() => {
    if (!selectedNode) return undefined;
    return selectedNode.path
      .map((id) => nodeIndex.get(id))
      .find((n) => n?.level === "city");
  }, [selectedNode, nodeIndex]);
  const selectedCity = selectedCityNode?.city;
  const selectedCityZones = useMemo(
    () =>
      (selectedCityNode?.children ?? [])
        .map((n) => n.zone)
        .filter((z): z is ZoneVm => Boolean(z)),
    [selectedCityNode]
  );

  /** Departments servicing the selected district + their deployed squads —
      the registry roll-up behind the district governance deck's operations
      containers (empty on non-district decks). Reads the live registry store
      so desks assigned in /admin/departments show up here. */
  const districtService = useMemo(
    () =>
      selectedNode?.level === "city"
        ? districtServiceDepartments(selectedNode.name, registrySectors)
        : [],
    [selectedNode, registrySectors]
  );
  const districtSectorGroups = useMemo(() => {
    const groups: {
      sector: string;
      sectorIcon: string;
      departments: typeof districtService;
    }[] = [];
    for (const dept of districtService) {
      const group = groups.find((g) => g.sector === dept.sector);
      if (group) group.departments.push(dept);
      else
        groups.push({
          sector: dept.sector,
          sectorIcon: dept.sectorIcon,
          departments: [dept],
        });
    }
    return groups;
  }, [districtService]);
  const districtSquadTotal = useMemo(
    () => districtService.reduce((sum, dept) => sum + dept.squads.length, 0),
    [districtService]
  );

  /* ----------------------- Tree expansion state ------------------------- */

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    resolveInitialExpanded(cities, focusNodeId ?? "")
  );
  // Deep links reveal their branch: track the focus we last expanded for and
  // adjust during render (React's "adjust state when a key changes" pattern),
  // so a URL-driven selection — including scoped dashboards like
  // cities?province=punjab — never renders with its branch collapsed.
  const [expandedForFocus, setExpandedForFocus] = useState<string>(
    focusNodeId ?? ""
  );
  const autoExpandPath = useMemo(() => {
    if (selectedNode) return selectedNode.path;
    const ids: string[] = [];
    if (resolved.scopeProvinceName) {
      const pid = `province-${slugify(resolved.scopeProvinceName)}`;
      if (nodeIndex.has(pid)) ids.push(pid);
    }
    if (resolved.scopeCityId && nodeIndex.has(resolved.scopeCityId)) {
      ids.push(
        ...(nodeIndex.get(resolved.scopeCityId)?.path ?? [resolved.scopeCityId])
      );
    }
    return ids;
  }, [selectedNode, resolved.scopeProvinceName, resolved.scopeCityId, nodeIndex]);
  const autoExpandKey = selectedNode
    ? `node:${selectedNode.id}`
    : `scope:${autoExpandPath.join(">")}`;
  if (autoExpandKey !== expandedForFocus) {
    setExpandedForFocus(autoExpandKey);
    if (autoExpandPath.length > 0) {
      setExpanded((prev) => new Set([...prev, ...autoExpandPath]));
    }
  }

  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // District modal (add / edit).
  const [districtModal, setDistrictModal] = useState<
    { mode: "add" } | { mode: "edit"; cityId: string } | null
  >(null);
  const [districtProvince, setDistrictProvince] = useState("Punjab");
  const [districtName, setDistrictName] = useState("");
  const [districtUrdu, setDistrictUrdu] = useState("");
  const [districtActive, setDistrictActive] = useState(true);
  const [districtUseNewProvince, setDistrictUseNewProvince] = useState(false);
  const [districtNewProvince, setDistrictNewProvince] = useState("");
  const [districtSupervisor, setDistrictSupervisor] = useState("");
  const [districtContact, setDistrictContact] = useState("");
  const [districtOffice, setDistrictOffice] = useState("");
  const [districtError, setDistrictError] = useState("");

  // Province creator/editor modal — undefined = closed, null = create mode,
  // item = edit mode prefilled from the stored record. Plus type-to-confirm
  // delete (cascades districts).
  const [provinceEditorTarget, setProvinceEditorTarget] = useState<
    ProvinceItem | null | undefined
  >(undefined);
  const [deleteProvinceName, setDeleteProvinceName] = useState<string | null>(
    null
  );
  const [deleteProvinceConfirm, setDeleteProvinceConfirm] = useState("");

  // Main-zone modal (add / edit — always scoped to a district) + delete target.
  const defaultCityId =
    cities.find((c) => c.status === "active")?.id ?? cities[0]?.id ?? "";
  const [zoneModal, setZoneModal] = useState<
    | { mode: "add"; cityId: string }
    | { mode: "edit"; cityId: string; zoneName: string }
    | null
  >(null);
  const [zoneForm, setZoneForm] = useState<{
    nameEn: string;
    nameUr: string;
    jurisdiction: JurisdictionType;
    cityId: string;
    authority: string;
    supervisor: string;
    contact: string;
    office: string;
  }>(() => ({
    nameEn: "",
    nameUr: "",
    jurisdiction: DEFAULT_JURISDICTION,
    cityId: defaultCityId,
    authority: "",
    supervisor: "",
    contact: "",
    office: "",
  }));
  const [zoneFormError, setZoneFormError] = useState("");
  const [deleteZoneTarget, setDeleteZoneTarget] = useState<{
    cityId: string;
    zoneName: string;
  } | null>(null);

  // Locality modal (add into a zone / edit an existing row) + quick-add row.
  // A deep link with add=locality opens it pre-scoped to the linked zone so
  // new mohallahs land under the right parent. The parent city rides on the
  // modal so it works regardless of tree selection.
  const [localityModal, setLocalityModal] = useState<
    | { mode: "add"; cityId: string; zoneName: string }
    | { mode: "edit"; cityId: string; zoneName: string; areaId: string }
    | null
  >(null);
  const [localityForm, setLocalityForm] = useState<{
    nameEn: string;
    nameUr: string;
    inherit: boolean;
    jurisdiction: JurisdictionType;
    supervisor: string;
    contact: string;
    office: string;
  }>({
    nameEn: "",
    nameUr: "",
    inherit: true,
    jurisdiction: DEFAULT_JURISDICTION,
    supervisor: "",
    contact: "",
    office: "",
  });
  const [localityFormError, setLocalityFormError] = useState("");
  const [quickAddName, setQuickAddName] = useState("");
  const [moveTarget, setMoveTarget] = useState<{
    area: AreaItem;
    fromZone: string;
    cityId: string;
  } | null>(null);
  const [moveZone, setMoveZone] = useState("");
  const [moveInherit, setMoveInherit] = useState(false);

  // Type-to-confirm district deletion
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  /* ---------------------- Dashboard view models ------------------------- */

  /** Province roster: stored provinces first, then city-only regions — each
      bound to its tree node for live counts and to its stored studio config. */
  const allProvinces = useMemo(() => {
    const seen = new Set<string>();
    const out: {
      name: string;
      nameUr?: string;
      node?: TerritoryNode;
      item?: ProvinceItem;
    }[] = [];
    for (const p of provinces) {
      if (!p?.name_en || seen.has(p.name_en.toLowerCase())) continue;
      seen.add(p.name_en.toLowerCase());
      out.push({
        name: p.name_en,
        nameUr: p.name_ur,
        node: nodeIndex.get(`province-${slugify(p.name_en)}`),
        item: p,
      });
    }
    for (const c of cities) {
      if (seen.has(c.province.toLowerCase())) continue;
      seen.add(c.province.toLowerCase());
      out.push({
        name: c.province,
        node: nodeIndex.get(`province-${slugify(c.province)}`),
      });
    }
    return out;
  }, [provinces, cities, nodeIndex]);

  const allProvinceNames = useMemo(
    () => allProvinces.map((p) => p.name),
    [allProvinces]
  );

  /** Province-card grid entries: roster item + tree node fused into the
      ProvinceCardData payload (wards, teams, caseload, lifecycle). */
  const provinceEntries: ProvinceGridEntry[] = useMemo(
    () =>
      allProvinces.map((p) => {
        const children = p.node?.children ?? [];
        const card: ProvinceCardData = {
          name: p.name,
          nameUr: p.nameUr,
          code:
            p.item?.code ??
            `PROV-${
              p.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() ||
              "XXX"
            }`,
          slug: p.item?.slug,
          capital: p.item?.capital,
          lifecycle:
            p.item?.lifecycle ??
            (children.some((c) => c.city?.status === "active")
              ? "phase1_pilot"
              : "infrastructure"),
          isDraft: p.item?.status === "draft",
          districts: children.length,
          activeDistricts: children.filter(
            (c) => c.city?.status === "active"
          ).length,
          // Registry truth: only agencies with an assigned operational desk in
          // one of this province's districts, and squads actually deployed on
          // ground — never the launcher seed's static agency roster.
          departments: departmentsWithDesks(
            children.map((c) => c.name),
            registrySectors
          ).length,
          wards: p.node?.areaCount ?? 0,
          teams: squadsOnGround(
            children.map((c) => c.name),
            registrySectors
          ).length,
          open: p.node?.open ?? 0,
          completed: p.node?.resolved ?? 0,
          total: p.node?.total ?? 0,
        };
        return {
          name: p.name,
          nameUr: p.nameUr,
          item: p.item,
          node: p.node,
          card,
        };
      }),
    [allProvinces, registrySectors]
  );

  const cityNodes = useMemo(
    () =>
      cities
        .map((c) => nodeIndex.get(c.id))
        .filter((n): n is TerritoryNode => Boolean(n)),
    [cities, nodeIndex]
  );

  const zoneRows = useMemo(
    () =>
      cities.flatMap((city) =>
        buildZoneVms(city).map((vm) => ({
          cityId: city.id,
          cityName: city.name_en,
          vm,
          node: nodeIndex.get(`zone-${city.id}-${slugify(vm.name)}`),
        }))
      ),
    [cities, nodeIndex]
  );

  /* -------------------- Dual-pane navigation helpers -------------------- */

  const toggleNode = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Tree / table / breadcrumb click — route to the node's manager level and
      reveal its branch in the left tree. */
  const navigateToNode = (node: TerritoryNode) => {
    setExpanded((prev) => new Set([...prev, ...node.path]));
    router.push(territoryNodeUrl(node), { scroll: false });
  };

  const navigateToUrl = (url: string) =>
    router.push(url, { scroll: false });

  const goToDashboard = (id: DashboardId) =>
    router.push(DASHBOARD_ROUTES[id], { scroll: false });

  /** Card CTA — lands on the PROVINCES route focus view (same unified
      Districts & Cities manager layout, with the province breadcrumb and its
      tree branch pre-expanded). The province rides in the URL solely for tree
      context; it never filters the manager. */
  const openProvinceDistricts = (provinceName: string) =>
    navigateToUrl(provinceUrl(provinceName));

  /* ------------------------------ Effects -------------------------------- */

  /* Sidebar level-tab highlight mirrors the resolved selection — the deck
     reports its node (or the level dashboard id) on every resolution. */
  useEffect(() => {
    onNodeNavigate?.(selectedNode?.id ?? activeDashboard);
  }, [selectedNode, activeDashboard, onNodeNavigate]);

  /* Strip a consumed ?add= quick-action from the URL (an external-system
     update) so refreshes don't reopen the modal. The modal itself opens in
     the render-time adjust block below, after the open* handlers exist. */
  const addSignature = `${resolved.addParam ?? ""}|${resolved.provinceParam ?? ""}|${resolved.districtParam ?? ""}|${resolved.zoneParam ?? ""}|${resolved.localityParam ?? ""}`;
  useEffect(() => {
    if (!resolved.addParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("add");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [resolved.addParam, searchParams, router, pathname]);

  /* Canonicalize province-scoped cities links — the card CTA and the tree
     deep-link province management to /provinces?province=<slug>; an old
     /cities?province=<slug> URL (no district) is the same target under a
     second address, so replace it with the canonical provinces focus.
     District and zone decks keep the cities/zones routes untouched. */
  useEffect(() => {
    if (
      level === "cities" &&
      resolved.provinceParam &&
      !resolved.districtParam &&
      !resolved.zoneParam
    ) {
      router.replace(
        provinceUrl(resolved.scopeProvinceName ?? resolved.provinceParam),
        { scroll: false }
      );
    }
  }, [level, resolved.provinceParam, resolved.districtParam, resolved.zoneParam, resolved.scopeProvinceName, router]);

  /* Export menu: close on outside click or Escape. */
  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string) => setToast({ tone: "success", message });
  const showError = (message: string) => setToast({ tone: "error", message });

  /* -------------------- Governance deck routing form -------------------- */

  /* Governance deck routing form — reseeded only when the selected territory
     node changes, via React's render-time "adjust state when a key changes"
     pattern (never setState inside an effect body). */
  const [routingNodeId, setRoutingNodeId] = useState<string | null>(
    selectedNode?.id ?? null
  );
  const [routingForm, setRoutingForm] = useState(() =>
    deriveRoutingForm(selectedNode)
  );
  if ((selectedNode?.id ?? null) !== routingNodeId) {
    setRoutingNodeId(selectedNode?.id ?? null);
    setRoutingForm(() => deriveRoutingForm(selectedNode));
  }

  /* -------------------- Governance deck dirty check -------------------- */

  const routingDirty = useMemo(() => {
    const node = selectedNode;
    if (!node) return false;
    if (node.level === "city" && node.city) {
      const c = node.city;
      return (
        routingForm.supervisor !== (c.supervisor ?? "") ||
        routingForm.contact !== (c.contact ?? "") ||
        routingForm.office !== (c.office ?? "")
      );
    }
    if (node.level === "zone" && node.zone && node.city) {
      const z = node.zone;
      return (
        routingForm.authority !==
          (z.authority ?? deriveZoneAuthority(z, node.city)) ||
        routingForm.supervisor !== (z.supervisor ?? "") ||
        routingForm.contact !== (z.contact ?? "") ||
        routingForm.office !== (z.office ?? "")
      );
    }
    if (node.area) {
      const a = node.area;
      return (
        routingForm.jurisdiction !==
          (a.jurisdiction ?? node.zone?.jurisdiction ?? DEFAULT_JURISDICTION) ||
        routingForm.supervisor !== (a.supervisor ?? "") ||
        routingForm.contact !== (a.contact ?? "") ||
        routingForm.office !== (a.office ?? "") ||
        routingForm.uc !== (a.uc_number ?? "") ||
        routingForm.desk !== (a.sub_division ?? "")
      );
    }
    return false;
  }, [selectedNode, routingForm]);

  const saveRouting = () => {
    const node = selectedNode;
    if (!node || !routingDirty) return;
    if (node.level === "city" && node.city) {
      updateCity(node.city.id, {
        supervisor: routingForm.supervisor,
        contact: routingForm.contact,
        office: routingForm.office,
      });
    } else if (node.level === "zone" && node.zone && node.city) {
      updateZone(node.city.id, node.zone.name, {
        authority: routingForm.authority,
        supervisor: routingForm.supervisor,
        contact: routingForm.contact,
        office: routingForm.office,
      });
    } else if (node.area && node.city) {
      updateArea(node.city.id, node.area.id, {
        jurisdiction: routingForm.jurisdiction,
        supervisor: routingForm.supervisor,
        contact: routingForm.contact,
        office: routingForm.office,
        uc_number: routingForm.uc,
        sub_division: routingForm.desk,
      });
    } else {
      return;
    }
    showToast(`Office routing updated for “${node.name}”`);
  };

  /* ------------------------- District handlers -------------------------- */

  const provinceNames = useMemo(
    () => [
      ...new Set([...provinces.map((p) => p.name_en), ...cities.map((c) => c.province)]),
    ],
    [provinces, cities]
  );

  const openAddDistrict = (province?: string) => {
    setDistrictProvince(
      province && province.trim() ? province : provinceNames[0] ?? "Punjab"
    );
    setDistrictName("");
    setDistrictUrdu("");
    setDistrictActive(true);
    setDistrictUseNewProvince(false);
    setDistrictNewProvince("");
    setDistrictSupervisor("");
    setDistrictContact("");
    setDistrictOffice("");
    setDistrictError("");
    setDistrictModal({ mode: "add" });
  };

  const openEditDistrict = (city: CityItem) => {
    setDistrictProvince(city.province);
    setDistrictName(city.name_en);
    setDistrictUrdu(city.name_ur === "—" ? "" : city.name_ur);
    setDistrictActive(city.status === "active");
    setDistrictUseNewProvince(false);
    setDistrictNewProvince("");
    setDistrictSupervisor(city.supervisor ?? "");
    setDistrictContact(city.contact ?? "");
    setDistrictOffice(city.office ?? "");
    setDistrictError("");
    setDistrictModal({ mode: "edit", cityId: city.id });
  };

  const saveDistrict = () => {
    const name = districtName.trim();
    const province = (
      districtUseNewProvince ? districtNewProvince : districtProvince
    ).trim();
    if (!name || !province) return;
    const duplicate = cities.some(
      (c) =>
        c.name_en.toLowerCase() === name.toLowerCase() &&
        !(districtModal?.mode === "edit" && c.id === districtModal.cityId)
    );
    if (duplicate) {
      setDistrictError(`A district named “${name}” already exists.`);
      return;
    }
    const roster = {
      supervisor: districtSupervisor.trim() || undefined,
      contact: districtContact.trim() || undefined,
      office: districtOffice.trim() || undefined,
    };
    if (districtModal?.mode === "edit") {
      updateCity(districtModal.cityId, {
        name_en: name,
        name_ur: districtUrdu.trim() || "—",
        province,
        status: districtActive ? "active" : "disabled",
        ...roster,
      });
      showToast(`District “${name}” updated`);
    } else {
      addCity({
        name_en: name,
        name_ur: districtUrdu.trim() || "—",
        province,
        status: districtActive ? "active" : "disabled",
        areas: [],
        ...roster,
      });
      showToast(`“${name}” added under ${province} — add its zones next`);
    }
    setDistrictModal(null);
  };

  const deleteTarget = cities.find((c) => c.id === deleteTargetId) ?? null;

  /* ------------------------- Province handlers -------------------------- */

  const openAddProvince = () => {
    setProvinceEditorTarget(null);
  };

  const openEditProvince = (item: ProvinceItem) => {
    setProvinceEditorTarget(item);
  };

  /** Creator/editor hand-off: create (then open district setup) or update. */
  const handleProvinceEditorSave = (province: ProvinceItem) => {
    const isEdit = provinceEditorTarget !== null;
    if (isEdit && provinceEditorTarget) {
      const renamed = provinceEditorTarget.name_en !== province.name_en;
      updateProvince(provinceEditorTarget.name_en, province);
      setProvinceEditorTarget(undefined);
      showToast(
        renamed
          ? `Province renamed to “${province.name_en}”`
          : `Province “${province.name_en}” updated`
      );
      return;
    }
    addProvince(province);
    setProvinceEditorTarget(undefined);
    openAddDistrict(province.name_en);
    showToast(
      `Province “${province.name_en}” saved — add its first district`
    );
  };

  const activateProvince = (name: string) => {
    updateProvince(name, { status: "active" });
    showToast(`Province “${name}” activated for the public roster`);
  };

  const deleteProvinceTarget =
    deleteProvinceName !== null
      ? (allProvinces.find((p) => p.name === deleteProvinceName) ?? null)
      : null;

  const confirmDeleteProvince = () => {
    if (!deleteProvinceName) return;
    deleteProvince(deleteProvinceName);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(`province-${slugify(deleteProvinceName)}`);
      return next;
    });
    showToast(
      `Province “${deleteProvinceName}” deleted along with its districts`
    );
    setDeleteProvinceName(null);
    setDeleteProvinceConfirm("");
  };

  /* ------------------------- Main zone handlers ------------------------- */

  const openAddZone = (cityId?: string) => {
    const target = cityId ?? selectedCity?.id ?? defaultCityId;
    setZoneForm({
      nameEn: "",
      nameUr: "",
      jurisdiction: DEFAULT_JURISDICTION,
      cityId: target,
      authority: "",
      supervisor: "",
      contact: "",
      office: "",
    });
    setZoneFormError("");
    setZoneModal({ mode: "add", cityId: target });
  };

  const openEditZone = (cityId: string, vm: ZoneVm) => {
    setZoneForm({
      nameEn: vm.name,
      nameUr: vm.nameUr ?? "",
      jurisdiction: vm.jurisdiction,
      cityId,
      authority: vm.authority ?? "",
      supervisor: vm.supervisor ?? "",
      contact: vm.contact ?? "",
      office: vm.office ?? "",
    });
    setZoneFormError("");
    setZoneModal({ mode: "edit", cityId, zoneName: vm.name });
  };

  const saveZone = () => {
    if (!zoneModal) return;
    const targetCityId =
      zoneModal.mode === "add" ? zoneForm.cityId : zoneModal.cityId;
    const targetCity = cities.find((c) => c.id === targetCityId);
    if (!targetCity) return;
    const name = zoneForm.nameEn.trim();
    if (!name) {
      setZoneFormError("Zone name is required.");
      return;
    }
    const zonesOfTarget = buildZoneVms(targetCity);
    const oldName = zoneModal.mode === "edit" ? zoneModal.zoneName : "";
    const duplicate = zonesOfTarget.some(
      (vm) =>
        vm.name.toLowerCase() === name.toLowerCase() && vm.name !== oldName
    );
    if (duplicate) {
      setZoneFormError("A zone with that name already exists in this district.");
      return;
    }
    const routing = {
      authority: zoneForm.authority.trim() || undefined,
      supervisor: zoneForm.supervisor.trim() || undefined,
      contact: zoneForm.contact.trim() || undefined,
      office: zoneForm.office.trim() || undefined,
    };
    if (zoneModal.mode === "edit") {
      updateZone(targetCityId, oldName, {
        name_en: name,
        name_ur: zoneForm.nameUr.trim() || undefined,
        jurisdiction: zoneForm.jurisdiction,
        ...routing,
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.delete(`zone-${targetCityId}-${slugify(oldName)}`)) {
          next.add(`zone-${targetCityId}-${slugify(name)}`);
        }
        return next;
      });
      showToast(`Zone “${name}” updated`);
    } else {
      addZone(targetCityId, {
        name_en: name,
        name_ur: zoneForm.nameUr.trim() || undefined,
        jurisdiction: zoneForm.jurisdiction,
      });
      // addZone takes the narrow zone shape — persist the routing roster
      // through a follow-up patch so new zones carry it too.
      if (Object.values(routing).some(Boolean)) {
        updateZone(targetCityId, name, routing);
      }
      setExpanded(
        (prev) => new Set(prev).add(`zone-${targetCityId}-${slugify(name)}`)
      );
      showToast(`Zone “${name}” created in ${targetCity.name_en}`);
    }
    setZoneModal(null);
  };

  const zoneModalCity =
    zoneModal && zoneModal.mode === "edit"
      ? cities.find((c) => c.id === zoneModal.cityId)
      : null;

  const deleteZoneVm = useMemo(() => {
    if (!deleteZoneTarget) return null;
    const city = cities.find((c) => c.id === deleteZoneTarget.cityId);
    if (!city) return null;
    return (
      buildZoneVms(city).find((vm) => vm.name === deleteZoneTarget.zoneName) ??
      null
    );
  }, [deleteZoneTarget, cities]);

  const confirmDeleteZone = () => {
    if (!deleteZoneTarget) return;
    deleteZone(deleteZoneTarget.cityId, deleteZoneTarget.zoneName);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(
        `zone-${deleteZoneTarget.cityId}-${slugify(deleteZoneTarget.zoneName)}`
      );
      return next;
    });
    showToast(`Zone “${deleteZoneTarget.zoneName}” deleted`);
    setDeleteZoneTarget(null);
  };

  /* ------------------------- Locality handlers -------------------------- */

  const openAddLocality = (cityId: string, zoneName: string) => {
    const city = cities.find((c) => c.id === cityId);
    const zone = city
      ? buildZoneVms(city).find((vm) => vm.name === zoneName)
      : undefined;
    setLocalityForm({
      nameEn: "",
      nameUr: "",
      inherit: true,
      jurisdiction: zone?.jurisdiction ?? DEFAULT_JURISDICTION,
      supervisor: "",
      contact: "",
      office: "",
    });
    setLocalityFormError("");
    setLocalityModal({ mode: "add", cityId, zoneName });
  };

  const openEditLocality = (
    cityId: string,
    zoneName: string,
    area: AreaItem
  ) => {
    const city = cities.find((c) => c.id === cityId);
    const zone = city
      ? buildZoneVms(city).find((vm) => vm.name === zoneName)
      : undefined;
    const areaJurisdiction =
      area.jurisdiction ?? zone?.jurisdiction ?? DEFAULT_JURISDICTION;
    setLocalityForm({
      nameEn: area.name_en,
      nameUr: !area.name_ur || area.name_ur === "—" ? "" : area.name_ur,
      inherit: areaJurisdiction === (zone?.jurisdiction ?? DEFAULT_JURISDICTION),
      jurisdiction: areaJurisdiction,
      supervisor: area.supervisor ?? "",
      contact: area.contact ?? "",
      office: area.office ?? "",
    });
    setLocalityFormError("");
    setLocalityModal({ mode: "edit", cityId, zoneName, areaId: area.id });
  };

  /** The locality modal carries its own parent city — independent of tree
      selection — so quick-adds from the sidebar always land correctly. */
  const localityCity =
    localityModal && "cityId" in localityModal
      ? cities.find((c) => c.id === localityModal.cityId) ?? null
      : null;
  const localityCityZones = useMemo(
    () => (localityCity ? buildZoneVms(localityCity) : []),
    [localityCity]
  );

  const saveLocality = () => {
    if (!localityCity || !localityModal) return;
    const zone = localityCityZones.find((vm) => vm.name === localityModal.zoneName);
    if (!zone) return;
    const name = localityForm.nameEn.trim();
    if (!name) {
      setLocalityFormError("Locality / mohallah name is required.");
      return;
    }
    const duplicate = localityCity.areas.some(
      (a) =>
        a.name_en.toLowerCase() === name.toLowerCase() &&
        !(localityModal.mode === "edit" && a.id === localityModal.areaId)
    );
    if (duplicate) {
      setLocalityFormError("That locality already exists in this district.");
      return;
    }
    const nameUr = localityForm.nameUr.trim() || undefined;
    const routing = {
      supervisor: localityForm.supervisor.trim() || undefined,
      contact: localityForm.contact.trim() || undefined,
      office: localityForm.office.trim() || undefined,
    };
    const jurisdiction = localityForm.inherit
      ? zone.jurisdiction
      : localityForm.jurisdiction;
    if (localityModal.mode === "edit") {
      updateArea(localityCity.id, localityModal.areaId, {
        name_en: name,
        name_ur: nameUr,
        jurisdiction,
        ...routing,
      });
      showToast(`Locality “${name}” updated`);
    } else {
      addArea(localityCity.id, {
        name_en: name,
        name_ur: nameUr,
        town: zone.name,
        jurisdiction,
        ...routing,
      });
      showToast(`“${name}” added to ${zone.name}`);
    }
    setLocalityModal(null);
  };

  /* ------------------ ?add= quick-action consumption --------------------- */
  /* A fresh ?add= signature opens its modal pre-scoped to the linked
     territory (render-time adjust — not an effect — so the URL is still the
     single trigger); the accompanying strip effect above removes the param
     so a refresh doesn't reopen it. */
  const [handledAdd, setHandledAdd] = useState<string | null>(null);
  if (resolved.addParam && handledAdd !== addSignature) {
    setHandledAdd(addSignature);
    switch (resolved.addParam) {
      case "province":
        setProvinceEditorTarget(null);
        break;
      case "district":
        openAddDistrict(resolved.scopeProvinceName);
        break;
      case "zone":
        openAddZone(resolved.scopeCityId ?? defaultCityId);
        break;
      case "locality": {
        // Legacy ?nodeId=zone-…&add=locality deep links resolve the zone
        // through the node-id helper instead of the slug params.
        const legacyZoneName = deepLinkZoneName(
          cities,
          searchParams.get("nodeId")
        );
        const zoneName = resolved.scopeZoneName ?? legacyZoneName;
        const cityId =
          resolved.scopeCityId ??
          (zoneName
            ? cities.find(
                (c) =>
                  (c.zones ?? []).some((z) => z.name_en === zoneName) ||
                  c.areas.some((a) => a.town === zoneName)
              )?.id
            : undefined);
        if (cityId && zoneName) openAddLocality(cityId, zoneName);
        break;
      }
    }
  }

  const quickAddLocality = () => {
    if (!selectedNode || selectedNode.level !== "zone" || !selectedCity) return;
    const zone = selectedNode.zone;
    if (!zone) return;
    const name = quickAddName.trim();
    if (!name) return;
    if (
      selectedCity.areas.some(
        (a) => a.name_en.toLowerCase() === name.toLowerCase()
      )
    ) {
      showError(`“${name}” already exists in ${selectedCity.name_en}`);
      return;
    }
    addArea(selectedCity.id, {
      name_en: name,
      town: zone.name,
      jurisdiction: zone.jurisdiction,
    });
    setQuickAddName("");
    showToast(`“${name}” added to ${zone.name}`);
  };

  const openMove = (area: AreaItem, fromZone: string, cityId: string) => {
    setMoveTarget({ area, fromZone, cityId });
    setMoveZone(fromZone);
    setMoveInherit(false);
  };

  const moveTargetCity = moveTarget
    ? cities.find((c) => c.id === moveTarget.cityId)
    : null;
  const moveTargetZones = moveTargetCity ? buildZoneVms(moveTargetCity) : [];

  const saveMove = () => {
    if (!moveTarget || !moveZone) return;
    const targetVm = moveTargetZones.find((vm) => vm.name === moveZone);
    updateArea(moveTarget.cityId, moveTarget.area.id, {
      town: moveZone,
      ...(moveInherit && targetVm ? { jurisdiction: targetVm.jurisdiction } : {}),
    });
    showToast(
      `“${moveTarget.area.name_en}” moved to ${moveZone}${
        moveInherit ? " (jurisdiction inherited)" : ""
      }`
    );
    setMoveTarget(null);
  };

  const toggleAreaStatus = (area: AreaItem) => {
    if (!selectedCity) return;
    const paused = area.status === "paused";
    updateArea(selectedCity.id, area.id, {
      status: paused ? "active" : "paused",
    });
    showToast(
      `“${area.name_en}” ${paused ? "resumed" : "paused"} for citizen reporting`
    );
  };

  /* ---------------------- Export / import data engine -------------------- */

  const exportSourceZones = () =>
    selectedCityZones.map((vm) => ({
      name_en: vm.name,
      name_ur: vm.nameUr,
      jurisdiction: vm.jurisdiction,
      areas: vm.areas,
    }));

  const handleExportCsv = () => {
    if (!selectedCity) return;
    setExportOpen(false);
    downloadFile(
      buildTerritoryCsv(selectedCity.name_en, exportSourceZones()),
      exportFileName(selectedCity.name_en, "csv"),
      "text/csv;charset=utf-8"
    );
    showToast(`Exported ${selectedCity.areas.length} localities in CSV format.`);
  };

  const handleExportJson = () => {
    if (!selectedCity) return;
    setExportOpen(false);
    downloadFile(
      buildTerritoryJson(
        {
          id: selectedCity.id,
          name_en: selectedCity.name_en,
          name_ur: selectedCity.name_ur,
        },
        exportSourceZones()
      ),
      exportFileName(selectedCity.name_en, "json"),
      "application/json"
    );
    showToast(
      `Exported ${selectedCity.areas.length} localities in JSON format.`
    );
  };

  const handleImportFile = async (file: File) => {
    if (!selectedCity) return;
    const text = await file.text();
    const result = file.name.toLowerCase().endsWith(".json")
      ? parseTerritoryJson(text)
      : parseTerritoryCsv(text);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    const { added, incoming } = countNewLocalities(selectedCity.areas, result.zones);
    // Sheets without a Jurisdiction column (legacy format) inherit the merged
    // zone tree's current jurisdiction — including implicit town-derived zones.
    const zonesToImport = result.zones.map((zone) => {
      if (zone.jurisdiction) return zone;
      const vm = selectedCityZones.find(
        (candidate) =>
          candidate.name.toLowerCase() === zone.name_en.trim().toLowerCase()
      );
      return vm ? { ...zone, jurisdiction: vm.jurisdiction } : zone;
    });
    importZones(selectedCity.id, zonesToImport);
    setExpanded(
      (prev) =>
        new Set([
          ...prev,
          ...result.zones
            .filter((z) => z.name_en)
            .map((z) => `zone-${selectedCity.id}-${slugify(z.name_en)}`),
        ])
    );
    const skipped = incoming - added;
    if (incoming === 0) {
      showToast(
        `Zone structure imported (${result.zones.length} zone${
          result.zones.length === 1 ? "" : "s"
        }, no localities in file)`
      );
    } else if (added === 0) {
      showToast(
        `Nothing new to import — all ${skipped} localities already exist in ${selectedCity.name_en}`
      );
    } else {
      showToast(
        `Imported ${added} ${added === 1 ? "locality" : "localities"} into ${
          selectedCity.name_en
        }${skipped > 0 ? ` — ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}`
      );
    }
  };

  /* ------------------------------ Switch --------------------------------- */

  const renderSwitch = (
    checked: boolean,
    onToggle: () => void,
    label: string
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 ${
        checked ? "bg-emerald-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-150 ${
          checked ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );

  /* ------------------------- Deck fragments ------------------------------ */

  const breadcrumb =
    selectedNode &&
    selectedNode.path
      .map((id) => nodeIndex.get(id))
      .filter((n): n is TerritoryNode => Boolean(n));

  /** Open a node deck or dashboard from within the view. */
  const goTo = goToDashboard;

  const exportImportButtons =
    selectedCity && selectedNode && selectedNode.level !== "province" ? (
      <>
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          >
            <Download className="h-3.5 w-3.5" />
            Export Data
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                exportOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {exportOpen && (
            <div
              role="menu"
              aria-label="Export territory data"
              className="animate-in absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleExportCsv}
                className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-800">
                    Export as CSV (.csv)
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                    Flat sheet for Excel, Google Sheets, or GIS
                  </span>
                </span>
              </button>
              <div aria-hidden className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={handleExportJson}
                className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <FileCode className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-800">
                    Export as JSON (.json)
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                    Full relational tree backup with metadata
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-700"
        >
          <Upload className="h-3.5 w-3.5" />
          Import (.CSV/.JSON)
        </button>
      </>
    ) : null;

  const statusPill = (() => {
    if (!selectedNode) return null;
    if (selectedNode.level === "province") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
          <ShieldCheck className="h-3 w-3" />
          Provincial Oversight
        </span>
      );
    }
    if (selectedNode.level === "city" && selectedNode.city) {
      const status = selectedNode.city.status;
      if (status === "active") {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
            />
            Operational Pilot
          </span>
        );
      }
      if (status === "coming_soon") {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200/70">
            Phase 2 Soon
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
          Reporting Disabled
        </span>
      );
    }
    if (selectedNode.level === "zone") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
          <span
            aria-hidden
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
          />
          Operational Zone
        </span>
      );
    }
    return selectedNode.area?.status === "paused" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200/70">
        Reporting Paused
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
        <span
          aria-hidden
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
        />
        Operational
      </span>
    );
  })();

  /** Region-level executive telemetry (KPI strip). Citizens come straight
      from the live ledger: distinct phone-identified reporters, deduplicated
      across provinces so nobody is double-counted platform-wide. */
  const regionTelemetry: TerritoryTelemetry = useMemo(() => {
    const sum = (pick: (p: TerritoryNode) => number) =>
      provinceRoots.reduce((s, p) => s + pick(p), 0);
    const reporterPhones = new Set<string>();
    let anonymousReports = 0;
    for (const report of liveReports) {
      const phone = report.citizen_phone.trim();
      if (phone) reporterPhones.add(phone);
      else anonymousReports += 1;
    }
    // Active = piloting or fully operational; setup/planned regions
    // (infrastructure + planned lifecycle) count as Setup / Planned.
    const activeRegions = allProvinces.filter((p) => {
      const lifecycle =
        p.item?.lifecycle ??
        ((p.node?.children ?? []).some((c) => c.city?.status === "active")
          ? "phase1_pilot"
          : "infrastructure");
      return lifecycle === "phase1_pilot" || lifecycle === "full_rollout";
    }).length;
    return {
      open: sum((p) => p.open),
      resolved: sum((p) => p.resolved),
      total: sum((p) => p.total),
      totalRegions: allProvinces.length,
      activeRegions,
      citizens: reporterPhones.size,
      anonymousReports,
    };
  }, [provinceRoots, allProvinces, liveReports]);

  // The territory tree is the Neon coverage document — hold a skeleton until
  // it lands instead of flashing an empty hierarchy.
  if (!coverageLoaded) {
    return (
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 lg:flex-row lg:overflow-hidden">
        <div className="h-full min-h-[400px] w-full animate-pulse bg-white lg:w-[360px] lg:border-r" />
        <div className="flex-1 p-6">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 lg:flex-row lg:overflow-hidden">
      {/* =================== Left pane: nested tree navigator =================== */}
      <aside
        aria-label="Administrative hierarchy navigator"
        className="flex w-full shrink-0 flex-col border-b border-slate-200/90 bg-white lg:h-full lg:min-h-0 lg:w-[360px] lg:border-b-0 lg:border-r"
      >
        {/* Search, jurisdiction filter pills, column legend and telemetry
            pills live inside the tree; the selection itself is URL-driven. */}
        <TerritoryTree
          roots={provinceRoots}
          selectedId={selectedNode?.id ?? ""}
          expanded={expanded}
          onToggle={toggleNode}
          onSelect={navigateToNode}
          onOpenAllProvinces={() =>
            router.push(TERRITORY_ROUTES.provinces, { scroll: false })
          }
          allProvincesActive={level === "provinces" && !selectedNode}
          onQuickAdd={(target) => {
            if (target.level === "province") openAddDistrict(target.name);
            else if (target.level === "city") openAddZone(target.city!.id);
            else if (target.zone && target.city)
              openAddLocality(target.city.id, target.zone.name);
          }}
        />
      </aside>

      {/* ================ Right pane: territory governance deck ================ */}
      <section
        aria-label="Territory governance deck"
        className="min-w-0 flex-1 space-y-6 p-6 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:p-8"
      >
        {/* -------- Level dashboards & the focused-province deck --------
             The route decides the manager; the URL params decide whether a
             specific territory is focused (deck) or the level dashboard
             renders (scoped by whatever params are present). */}
        {!selectedNode && activeDashboard === "province" && (
          <ProvinceManager
            mode="dashboard"
            entries={provinceEntries}
            telemetry={regionTelemetry}
            onOpenAddProvince={openAddProvince}
            onOpenProvince={openProvinceDistricts}
            onEditProvince={openEditProvince}
            onActivateProvince={activateProvince}
            onAddDistrict={openAddDistrict}
            onOpenDistrict={navigateToNode}
            onEditDistrict={openEditDistrict}
            onToggleDistrictStatus={toggleCityStatus}
            onDeleteDistrict={(city) => {
              setDeleteTargetId(city.id);
              setDeleteConfirmText("");
            }}
            onGoToDashboard={() => goToDashboard("province")}
          />
        )}

        {selectedNode?.level === "province" && (
          <ProvinceManager
            mode="focus"
            entries={provinceEntries}
            telemetry={regionTelemetry}
            focus={{
              node: selectedNode,
              item: provinceEntries.find(
                (e) => e.node?.id === selectedNode.id
              )?.item,
            }}
            onOpenAddProvince={openAddProvince}
            onOpenProvince={openProvinceDistricts}
            onEditProvince={openEditProvince}
            onActivateProvince={activateProvince}
            onAddDistrict={openAddDistrict}
            onOpenDistrict={navigateToNode}
            onEditDistrict={openEditDistrict}
            onToggleDistrictStatus={toggleCityStatus}
            onDeleteDistrict={(city) => {
              setDeleteTargetId(city.id);
              setDeleteConfirmText("");
            }}
            onGoToDashboard={() => goToDashboard("province")}
          />
        )}

        {!selectedNode && activeDashboard === "cities" && (
          <>
            {/* Header: level breadcrumb + title + primary action */}
            <div className="space-y-3">
              <nav
                aria-label="Territory breadcrumb"
                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
              >
                {DASHBOARD_CRUMBS[activeDashboard].map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden className="text-slate-300">
                        &gt;
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => goTo(crumb.id)}
                      className={`transition-colors duration-150 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                        i === DASHBOARD_CRUMBS[activeDashboard].length - 1
                          ? "font-bold text-emerald-800"
                          : ""
                      }`}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                      {DASHBOARD_META[activeDashboard].title}
                    </h2>
                    <span className="urdu text-lg font-medium text-slate-500">
                      {DASHBOARD_META[activeDashboard].urdu}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                      <ShieldCheck className="h-3 w-3" />
                      {`${cityNodes.length} District${cityNodes.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    {DASHBOARD_META[activeDashboard].blurb}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAddDistrict(resolved.scopeProvinceName)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add District &amp; City
                </button>
              </div>
            </div>

            {/* Districts dashboard telemetry trio */}
            <section
              aria-label="Dashboard telemetry"
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Districts &amp; Cities
                  </p>
                  <Building2 className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {cityNodes.length}
                </p>
                <p className="mt-2 text-[11px] font-medium text-emerald-700">
                  {cityNodes.filter((c) => c.city?.status === "active").length} active pilot
                  {cityNodes.filter((c) => c.city?.status === "active").length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Mapped Wards &amp; Localities
                  </p>
                  <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {formatInt(
                    cityNodes.reduce((s, n) => s + n.areaCount, 0)
                  )}
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  across{" "}
                  {cityNodes.reduce((s, n) => s + n.zoneCount, 0)} tehsil
                  {cityNodes.reduce((s, n) => s + n.zoneCount, 0) === 1 ? "" : "s"} &amp; zone
                  {cityNodes.reduce((s, n) => s + n.zoneCount, 0) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Active Reports
                  </p>
                  <Inbox className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {formatInt(cityNodes.reduce((s, n) => s + n.open, 0))}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    Open Tickets
                  </span>
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  live incident ledger only
                </p>
              </div>
            </section>

            {/* Districts & cities table */}
            <section
              aria-label="Cities and districts"
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
            >
              {cityNodes.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-slate-400">
                  No districts yet — use{" "}
                  <span className="font-semibold text-emerald-800">
                    Add District &amp; City
                  </span>{" "}
                  to create the first one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-2.5 font-semibold">
                          District &amp; City
                        </th>
                        <th className="px-3 py-2.5 font-semibold">Province</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                        <th className="px-3 py-2.5 font-semibold">Zones</th>
                        <th className="px-3 py-2.5 font-semibold">Wards</th>
                        <th className="px-3 py-2.5 font-semibold">Open</th>
                        <th className="px-5 py-2.5 text-right font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cityNodes.map((cityNode) => (
                        <tr
                          key={cityNode.id}
                          onClick={() => navigateToNode(cityNode)}
                          className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80"
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-800">
                              {cityNode.name}
                            </p>
                            {cityNode.nameUr && (
                              <p className="urdu text-[11px] text-slate-400">
                                {cityNode.nameUr}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {cityNode.city?.province}
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2">
                              {renderSwitch(
                                cityNode.city?.status === "active",
                                () => toggleCityStatus(cityNode.id),
                                `Public reporting for ${cityNode.name}`
                              )}
                              <span
                                className={`whitespace-nowrap text-[10px] font-bold ${
                                  cityNode.city?.status === "active"
                                    ? "text-emerald-700"
                                    : "text-slate-400"
                                }`}
                              >
                                {cityNode.city?.status === "active"
                                  ? "Active"
                                  : "Staged"}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {cityNode.zoneCount}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {cityNode.areaCount}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {cityNode.open > 0 ? formatInt(cityNode.open) : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              aria-label={`Configure district ${cityNode.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToNode(cityNode);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit district ${cityNode.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDistrict(cityNode.city!);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete district ${cityNode.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetId(cityNode.id);
                                setDeleteConfirmText("");
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {!selectedNode && activeDashboard === "zones" && (
          <>
            {/* Header: level breadcrumb + title + primary action */}
            <div className="space-y-3">
              <nav
                aria-label="Territory breadcrumb"
                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
              >
                {DASHBOARD_CRUMBS[activeDashboard].map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden className="text-slate-300">
                        &gt;
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => goTo(crumb.id)}
                      className={`transition-colors duration-150 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                        i === DASHBOARD_CRUMBS[activeDashboard].length - 1
                          ? "font-bold text-emerald-800"
                          : ""
                      }`}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                      {DASHBOARD_META[activeDashboard].title}
                    </h2>
                    <span className="urdu text-lg font-medium text-slate-500">
                      {DASHBOARD_META[activeDashboard].urdu}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                      <ShieldCheck className="h-3 w-3" />
                      {`${zoneRows.length} Zone${zoneRows.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    {DASHBOARD_META[activeDashboard].blurb}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAddZone(resolved.scopeCityId)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Tehsil / Zone
                </button>
              </div>
            </div>

            {/* Zones dashboard telemetry trio */}
            <section
              aria-label="Dashboard telemetry"
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Tehsils &amp; Zones
                  </p>
                  <Layers className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {zoneRows.length}
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  in {new Set(zoneRows.map((r) => r.cityName)).size} district
                  {new Set(zoneRows.map((r) => r.cityName)).size === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Wards &amp; Localities Covered
                  </p>
                  <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {formatInt(
                    zoneRows.reduce((s, r) => s + (r.node?.areaCount ?? 0), 0)
                  )}
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  mohallahs, wards &amp; villages
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Open Tickets
                  </p>
                  <Inbox className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {formatInt(
                    zoneRows.reduce((s, r) => s + (r.node?.open ?? 0), 0)
                  )}
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  routed to zone desks
                </p>
              </div>
            </section>

            {/* Tehsils & zones table */}
            <section
              aria-label="Zones across districts"
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
            >
              {zoneRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-slate-400">
                  No zones yet — use{" "}
                  <span className="font-semibold text-emerald-800">
                    Add Tehsil / Zone
                  </span>{" "}
                  to create the first one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-2.5 font-semibold">
                          Tehsil / Zone
                        </th>
                        <th className="px-3 py-2.5 font-semibold">District</th>
                        <th className="px-3 py-2.5 font-semibold">
                          Jurisdiction
                        </th>
                        <th className="px-3 py-2.5 font-semibold">Wards</th>
                        <th className="px-3 py-2.5 font-semibold">Open</th>
                        <th className="px-3 py-2.5 font-semibold">Officer</th>
                        <th className="px-5 py-2.5 text-right font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {zoneRows.map((row) => (
                        <tr
                          key={`${row.cityId}:${row.vm.name}`}
                          onClick={() =>
                            row.node && navigateToNode(row.node)
                          }
                          className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80"
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-800">
                              {row.vm.name}
                            </p>
                            {row.vm.nameUr && (
                              <p className="urdu text-[11px] text-slate-400">
                                {row.vm.nameUr}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {row.cityName}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${zonePillClass(
                                row.vm.jurisdiction
                              )}`}
                            >
                              {shortJurisdiction(row.vm.jurisdiction)}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {row.node?.areaCount ?? row.vm.areas.length}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {(row.node?.open ?? 0) > 0
                              ? formatInt(row.node!.open)
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {row.vm.supervisor ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              aria-label={`Configure zone ${row.vm.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (row.node) navigateToNode(row.node);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit zone ${row.vm.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditZone(row.cityId, row.vm);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete zone ${row.vm.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteZoneTarget({
                                  cityId: row.cityId,
                                  zoneName: row.vm.name,
                                });
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* --------------------- Node governance deck ---------------------
            Focused District & City (Tier 2), Tehsil & Zone (Tier 3) and
            Ward/Mohallah/Village (Tier 4) decks. The focused Province (Tier 1)
            deck renders through ProvinceManager above. */}
        {selectedNode && selectedNode.level !== "province" && (
          <>
            {/* ------------------------- A. Header ------------------------- */}
            <div className="space-y-3">
              {breadcrumb && breadcrumb.length > 0 && (
                <nav
                  aria-label="Territory breadcrumb"
                  className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
                >
                  {breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <span aria-hidden className="text-slate-300">
                          &gt;
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => navigateToNode(crumb)}
                        className={`transition-colors duration-150 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                          i === breadcrumb.length - 1
                            ? "font-bold text-emerald-800"
                            : ""
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )}

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                      {selectedNode.name}
                    </h2>
                    {selectedNode.nameUr && (
                      <span className="urdu text-lg font-medium text-slate-500">
                        {selectedNode.nameUr}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                      {selectedNode.code}
                    </span>
                    {statusPill}
                    {selectedNode.level === "city" && selectedNode.city && (
                      <span className="ml-1 flex items-center gap-1.5">
                        {renderSwitch(
                          selectedNode.city.status === "active",
                          () => toggleCityStatus(selectedNode.city!.id),
                          `Public reporting for ${selectedNode.city!.name_en}`
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    {selectedNode.level === "city" &&
                      `Tier 2 · District & City (ضلع / شہر) — ${selectedNode.zoneCount} tehsil${selectedNode.zoneCount === 1 ? "" : "s"} & zone${selectedNode.zoneCount === 1 ? "" : "s"} • ${selectedNode.areaCount} mapped wards`}
                    {selectedNode.level === "zone" &&
                      `Tier 3 · Tehsil & Zone (تحصیل / زون) — ${selectedNode.areaCount} ward${selectedNode.areaCount === 1 ? "" : "s"} · ${selectedNode.zone?.jurisdiction ?? ""}`}
                    {selectedNode.level === "mohallah" &&
                      `Tier 4 · Ward, Mohallah & Village (وارڈ / محلہ / دیہات) — ${selectedNode.zone?.name ?? ""} • ${shortJurisdiction(
                        selectedNode.area?.jurisdiction ??
                          selectedNode.zone?.jurisdiction ??
                          DEFAULT_JURISDICTION
                      )}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selectedNode.level === "city" && (
                    <>
                      <button
                        type="button"
                        onClick={() => openAddZone(selectedCity!.id)}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Main Zone
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditDistrict(selectedNode.city!)}
                        className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        Edit Boundary
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete district ${selectedNode.name}`}
                        onClick={() => {
                          setDeleteTargetId(selectedNode.city!.id);
                          setDeleteConfirmText("");
                        }}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-2xs transition-colors duration-150 hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {selectedNode.level === "zone" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                      openAddLocality(selectedNode.city!.id, selectedNode.zone!.name
                      )}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Sub-Locality
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openEditZone(selectedCity!.id, selectedNode.zone!)
                        }
                        className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        Edit Boundary
                      </button>
                    </>
                  )}
                  {selectedNode.level === "mohallah" && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleAreaStatus(selectedNode.area!)}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        {selectedNode.area?.status === "paused" ? (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Resume Reporting
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            Pause Reporting
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openEditLocality(
                            selectedNode.city!.id,
                            selectedNode.zone!.name,
                            selectedNode.area!
                          )
                        }
                        className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        Edit Boundary
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openMove(
                            selectedNode.area!,
                            selectedNode.zone!.name,
                            selectedCity!.id
                          )
                        }
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        Move
                      </button>
                    </>
                  )}
                  {exportImportButtons}
                  <button
                    type="button"
                    onClick={saveRouting}
                    disabled={!routingDirty}
                    className="whitespace-nowrap rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            {/* --------------- B. Authority & office routing --------------- */}
            <section
              aria-label="Administrative authority and office routing"
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <Landmark className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-slate-900">
                      Administrative Authority &amp; Office Routing
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Binds this territory to its responsible municipal desk for
                      automated public routing.
                    </p>
                  </div>
                </div>
                {selectedNode.level === "zone" && selectedNode.zone && (
                  <span
                    className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${zonePillClass(
                      selectedNode.zone.jurisdiction
                    )}`}
                  >
                    {shortJurisdiction(selectedNode.zone.jurisdiction)}
                  </span>
                )}
              </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {selectedNode.level === "city" && selectedNode.city && (
                    <div className="sm:col-span-2">
                      <p className={labelClass}>Governing Bodies (District Roster)</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(selectedNode.city.agencies ?? [
                          `Municipal Corporation ${selectedNode.city.name_en}`,
                          `${selectedNode.city.name_en} Cantt Board`,
                        ]).map((agency) => (
                          <span
                            key={agency}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            {agency}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedNode.level === "zone" && selectedNode.city && (
                    <div>
                      <label
                        htmlFor="routing-authority"
                        className={`${labelClass} mb-1.5 flex items-center gap-1.5`}
                      >
                        <Landmark className="h-3.5 w-3.5 text-slate-400" />
                        Governing Body
                      </label>
                      <select
                        id="routing-authority"
                        value={routingForm.authority}
                        onChange={(e) =>
                          setRoutingForm((f) => ({
                            ...f,
                            authority: e.target.value,
                          }))
                        }
                        className={`${inputClass} cursor-pointer`}
                      >
                        {[
                          ...new Set([
                            routingForm.authority,
                            ...governingBodyOptions(selectedNode.city),
                          ]),
                        ]
                          .filter(Boolean)
                          .map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {selectedNode.level === "mohallah" && (
                    <div>
                      <label
                        htmlFor="routing-authority"
                        className={`${labelClass} mb-1.5 flex items-center gap-1.5`}
                      >
                        <Landmark className="h-3.5 w-3.5 text-slate-400" />
                        Governing Jurisdiction
                      </label>
                      <select
                        id="routing-authority"
                        value={routingForm.jurisdiction}
                        onChange={(e) =>
                          setRoutingForm((f) => ({
                            ...f,
                            jurisdiction: e.target.value as JurisdictionType,
                          }))
                        }
                        className={`${inputClass} cursor-pointer`}
                      >
                        {JURISDICTION_TYPES.map((j) => (
                          <option key={j} value={j}>
                            {shortJurisdiction(j)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Drives the citizen category cascade for this locality.
                      </p>
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="routing-supervisor"
                      className={`${labelClass} mb-1.5 flex items-center gap-1.5`}
                    >
                      <UserRound className="h-3.5 w-3.5 text-slate-400" />
                      {selectedNode.level === "city"
                        ? "Desk Supervisor (DCO)"
                        : "Desk Supervisor (SDO / AC)"}
                    </label>
                    <input
                      id="routing-supervisor"
                      type="text"
                      value={routingForm.supervisor}
                      onChange={(e) =>
                        setRoutingForm((f) => ({
                          ...f,
                          supervisor: e.target.value,
                        }))
                      }
                      placeholder="e.g. Asadullah Khan (Grade 18)"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="routing-contact"
                      className={`${labelClass} mb-1.5 flex items-center gap-1.5`}
                    >
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      Official Emergency Contact
                    </label>
                    <input
                      id="routing-contact"
                      type="text"
                      value={routingForm.contact}
                      onChange={(e) =>
                        setRoutingForm((f) => ({ ...f, contact: e.target.value }))
                      }
                      placeholder="e.g. 052-111-923-923"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="routing-office"
                      className={`${labelClass} mb-1.5 flex items-center gap-1.5`}
                    >
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      Desk Address
                    </label>
                    <input
                      id="routing-office"
                      type="text"
                      value={routingForm.office}
                      onChange={(e) =>
                        setRoutingForm((f) => ({ ...f, office: e.target.value }))
                      }
                      placeholder="e.g. Municipal Complex, Library Road"
                      className={inputClass}
                    />
                  </div>
                  {selectedNode.level === "mohallah" && (
                    <>
                      <div>
                        <label
                          htmlFor="routing-uc"
                          className={`${labelClass} mb-1.5 block`}
                        >
                          Union Council #
                        </label>
                        <input
                          id="routing-uc"
                          type="text"
                          value={routingForm.uc}
                          onChange={(e) =>
                            setRoutingForm((f) => ({ ...f, uc: e.target.value }))
                          }
                          placeholder="e.g. 12"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="routing-desk"
                          className={`${labelClass} mb-1.5 block`}
                        >
                          Dispatch Desk Label
                        </label>
                        <input
                          id="routing-desk"
                          type="text"
                          value={routingForm.desk}
                          onChange={(e) =>
                            setRoutingForm((f) => ({ ...f, desk: e.target.value }))
                          }
                          placeholder="e.g. General Municipal Services"
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  {selectedNode.level === "zone" && (
                    <p className="text-[11px] text-slate-500 sm:col-span-2">
                      The citizen-visible jurisdiction cascade is managed via{" "}
                      <span className="font-semibold text-emerald-800">
                        Edit Boundary
                      </span>
                      ; localities without overrides inherit this desk&apos;s
                      supervisor and contact.
                    </p>
                  )}
                </div>
            </section>
            {/* ----------------- C. Territorial telemetry ------------------ */}
            <section
              aria-label="Territorial telemetry"
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Active Reports in Territory
                  </p>
                  <Inbox className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {selectedNode.open.toLocaleString()}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    Open {selectedNode.open === 1 ? "Ticket" : "Tickets"}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700 ring-1 ring-rose-100">
                    P1 {selectedNode.p1}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                    P2 {selectedNode.p2}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                    P3 {selectedNode.p3}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Registered Citizens
                  </p>
                  <UserRound className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {selectedNode.citizens.toLocaleString()}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    Distinct Reporters
                  </span>
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  Phone-identified users in the live incident ledger
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {selectedNode.level === "city"
                      ? "Zones & Wards"
                      : "Wards & Mohallahs"}
                  </p>
                  {selectedNode.level === "city" ? (
                    <Layers className="h-4 w-4 shrink-0 text-slate-300" />
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                </div>
                <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                  {selectedNode.level === "city"
                    ? selectedNode.zoneCount
                    : selectedNode.level === "zone"
                      ? selectedNode.children.length
                      : 1}{" "}
                  <span className="text-xs font-semibold text-slate-400">
                    {selectedNode.level === "city"
                      ? "Tehsils & Zones"
                      : "Wards & Mohallahs"}
                  </span>
                </p>
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  {selectedNode.level === "city"
                    ? `${selectedNode.areaCount.toLocaleString()} wards & mohallahs mapped`
                    : selectedNode.level === "zone"
                      ? "grouped under this zone desk"
                      : "single reporting locality"}
                </p>
              </div>
            </section>

            {/* ------- C2. Departments servicing this district + squads ------- */}
            {selectedNode.level === "city" && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <section
                  aria-label={`Departments servicing ${selectedNode.name}`}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs lg:col-span-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Departments Servicing {selectedNode.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 tabular-nums">
                      {districtService.length}
                    </span>
                  </div>
                  {districtService.length === 0 ? (
                    <p className="mt-3 text-[11px] font-medium text-slate-400">
                      No departments registered for this district yet.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                      {districtSectorGroups.map((group) => {
                        const GroupIcon = sectorIcon(group.sectorIcon);
                        return (
                          <div key={group.sector}>
                            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              <GroupIcon className="h-3 w-3 shrink-0" />
                              {group.sector}
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                              {group.departments.map((dept) => (
                                <li
                                  key={dept.code}
                                  title={`${dept.fullName} — ${dept.divisionName}`}
                                  className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  {dept.code}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section
                  aria-label={`Field squads by department in ${selectedNode.name}`}
                  className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Squads by Department
                    </p>
                    <Users className="h-4 w-4 shrink-0 text-slate-300" />
                  </div>
                  <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                    {districtSquadTotal}{" "}
                    <span className="text-xs font-semibold text-slate-400">
                      Deployed Squad{districtSquadTotal === 1 ? "" : "s"}
                    </span>
                  </p>
                  {districtService.length === 0 ? (
                    <p className="mt-2 text-[11px] font-medium text-slate-400">
                      No departments registered for this district yet.
                    </p>
                  ) : (
                    <ul
                      className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pb-1"
                      style={{ maxHeight: 224 }}
                    >
                      {districtService.map((dept) => {
                        const onDuty = dept.squads.filter(
                          (sq) => sq.status !== "off_duty"
                        ).length;
                        return (
                          <li
                            key={dept.code}
                            title={`${dept.fullName} — ${dept.divisionName}`}
                            className="flex items-center gap-1.5 text-[11px]"
                          >
                            <span className="min-w-0 truncate font-semibold text-slate-700">
                              {dept.code}
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {dept.squads.map((sq) => (
                                <span
                                  key={sq.id}
                                  aria-hidden
                                  title={`${sq.name} — ${sq.status.replace("_", " ")}`}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    sq.status === "active"
                                      ? "bg-emerald-500"
                                      : sq.status === "on_call"
                                        ? "bg-amber-500"
                                        : "bg-slate-300"
                                  }`}
                                />
                              ))}
                            </span>
                            <span className="flex-1" />
                            <span
                              className={`shrink-0 tabular-nums ${
                                onDuty > 0
                                  ? "text-emerald-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {onDuty}/{dept.squads.length} on duty
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}


            {selectedNode.level === "city" && (
              <section
                aria-label="Zones in district"
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-slate-900">
                      Tehsils &amp; Zones in {selectedNode.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tier 3 · تحصیل / زون — clusters grouping the wards;
                      click a row to configure.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddZone(selectedCity!.id)}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-100/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 hover:text-emerald-950"
                  >
                    <Plus className="h-3 w-3" />
                    Add Tehsil / Zone
                  </button>
                </div>
                {selectedNode.children.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-slate-400">
                    No zones yet — use{" "}
                    <span className="font-semibold text-emerald-800">
                      Add Main Zone
                    </span>{" "}
                    to create the first one.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-2.5 font-semibold">Tehsil / Zone</th>
                          <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
                          <th className="px-3 py-2.5 font-semibold">Wards</th>
                          <th className="px-3 py-2.5 font-semibold">Open</th>
                          <th className="px-3 py-2.5 font-semibold">Officer</th>
                          <th className="px-5 py-2.5 text-right font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedNode.children.map((zoneEntry) => (
                          <tr
                            key={zoneEntry.id}
                            onClick={() => navigateToNode(zoneEntry)}
                            className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80"
                          >
                            <td className="px-5 py-3">
                              <p className="font-semibold text-slate-800">
                                {zoneEntry.name}
                              </p>
                              {zoneEntry.nameUr && (
                                <p className="urdu text-[11px] text-slate-400">
                                  {zoneEntry.nameUr}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${zonePillClass(
                                  zoneEntry.zone!.jurisdiction
                                )}`}
                              >
                                {shortJurisdiction(zoneEntry.zone!.jurisdiction)}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono text-slate-600">
                              {zoneEntry.areaCount}
                            </td>
                            <td className="px-3 py-3 font-mono text-slate-600">
                              {zoneEntry.open > 0 ? zoneEntry.open : "—"}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {zoneEntry.zone?.supervisor ?? "—"}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                aria-label={`Edit zone ${zoneEntry.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditZone(selectedCity!.id, zoneEntry.zone!);
                                }}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete zone ${zoneEntry.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteZoneTarget({
                                    cityId: selectedCity!.id,
                                    zoneName: zoneEntry.name,
                                  });
                                }}
                                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {selectedNode.level === "zone" && (
              <section
                aria-label="Localities in zone"
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-slate-900">
                      Wards, Mohallahs &amp; Villages in {selectedNode.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tier 4 · وارڈ / محلہ / دیہات — leaf territories inside
                      this zone.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openAddLocality(selectedNode.city!.id, selectedNode.zone!.name
                      )}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-100/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 hover:text-emerald-950"
                  >
                    <Plus className="h-3 w-3" />
                    Add Sub-Locality
                  </button>
                </div>
                {selectedNode.children.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-slate-400">
                    No wards in this zone yet — quick-add the first one
                    below.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-2.5 font-semibold">
                            Ward / Mohallah / Village
                          </th>
                          <th className="px-3 py-2.5 font-semibold">Type</th>
                          <th className="px-3 py-2.5 font-semibold">
                            Assigned Officer
                          </th>
                          <th className="px-3 py-2.5 font-semibold">
                            Active Reports
                          </th>
                          <th className="px-3 py-2.5 font-semibold">Status</th>
                          <th className="px-5 py-2.5 text-right font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedNode.children.map((locality) => {
                          const area = locality.area!;
                          const paused = area.status === "paused";
                          return (
                            <tr
                              key={locality.id}
                              onClick={() => navigateToNode(locality)}
                              className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80"
                            >
                              <td className="px-5 py-3">
                                <p className="font-semibold text-slate-800">
                                  {locality.name}
                                </p>
                                {locality.nameUr && (
                                  <p className="urdu text-[11px] text-slate-400">
                                    {locality.nameUr}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  {areaTypeLabel(selectedNode.zone!.name)}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-slate-600">
                                {area.supervisor ??
                                  selectedNode.zone?.supervisor ??
                                  "—"}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                                    locality.open > 0
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {locality.open}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  aria-label={
                                    paused
                                      ? `Resume reporting for ${area.name_en}`
                                      : `Pause reporting for ${area.name_en}`
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAreaStatus(area);
                                  }}
                                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 transition-colors duration-150 ${
                                    paused
                                      ? "bg-amber-50 text-amber-700 ring-amber-200/70 hover:bg-amber-100"
                                      : "bg-emerald-50 text-emerald-700 ring-emerald-200/70 hover:bg-emerald-100"
                                  }`}
                                >
                                  {paused ? "Paused" : "Active"}
                                </button>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  type="button"
                                  aria-label={`Edit ${area.name_en}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditLocality(
                                      selectedNode.city!.id,
                                      selectedNode.zone!.name,
                                      area
                                    );
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Move ${area.name_en} to another zone`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMove(
                                      area,
                                      selectedNode.zone!.name,
                                      selectedCity!.id
                                    );
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                                >
                                  <ArrowLeftRight className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Remove ${area.name_en}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeArea(selectedCity!.id, area.id);
                                    showToast(
                                      `Locality “${area.name_en}” removed`
                                    );
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Quick inline addition row */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input
                    type="text"
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        quickAddLocality();
                      }
                    }}
                    placeholder="Quick-add a ward / mohallah / village into this zone…"
                    aria-label="Quick-add a locality"
                    className="min-w-[160px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                  />
                  <button
                    type="button"
                    onClick={quickAddLocality}
                    disabled={!quickAddName.trim()}
                    className="whitespace-nowrap rounded-lg bg-[#0F5132] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Add
                  </button>
                </div>
              </section>
            )}

            {selectedNode.level === "mohallah" && (
              <section
                aria-label="Locality profile"
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                    <MapPin className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-slate-900">
                      Locality Profile
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Leaf territories carry no children — routing and cascade
                      rules live above.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
                  {[
                    ["Parent Zone", selectedNode.zone?.name ?? "—"],
                    [
                      "Dispatch Desk",
                      selectedNode.area?.sub_division || "General Municipal Services",
                    ],
                    [
                      "Union Council",
                      selectedNode.area?.uc_number || "—",
                    ],
                    [
                      "Assigned Officer",
                      selectedNode.area?.supervisor ??
                        selectedNode.zone?.supervisor ??
                        "Unassigned",
                    ],
                    ["Open Reports", String(selectedNode.open)],
                    ["Registry Code", selectedNode.code],
                  ].map(([term, value]) => (
                    <div key={term}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {term}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-700">
                        {value}
                      </p>
                    </div>
                  ))}
                  <p className="text-[11px] italic text-slate-400 sm:col-span-2">
                    UC number, dispatch desk, supervisor and contact edits land
                    via{" "}
                    <span className="font-semibold text-emerald-800">
                      Save Changes
                    </span>{" "}
                    in the routing card above.
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </section>

      {/* Hidden file input for the import engine */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = "";
        }}
      />

      {/* ------------------ Province Customizer Studio ------------------ */}
      {provinceEditorTarget !== undefined && (
        <ProvinceCustomizerModal
          province={provinceEditorTarget ?? undefined}
          existingNames={allProvinceNames.filter(
            (n) =>
              n.toLowerCase() !==
              (provinceEditorTarget?.name_en ?? "").toLowerCase()
          )}
          existingCodes={allProvinces
            .map((p) => p.item?.code ?? "")
            .filter(
              (c) =>
                Boolean(c) &&
                c.toUpperCase() !==
                  (provinceEditorTarget?.code ?? "").toUpperCase()
            )}
          onCancel={() => setProvinceEditorTarget(undefined)}
          onDelete={
            provinceEditorTarget
              ? () => {
                  // Close the editor first so the confirm dialog stands alone.
                  setDeleteProvinceName(provinceEditorTarget.name_en);
                  setDeleteProvinceConfirm("");
                  setProvinceEditorTarget(undefined);
                }
              : undefined
          }
          onSave={handleProvinceEditorSave}
        />
      )}

      {/* ---------------- Type-to-confirm province deletion modal ---------------- */}
      {deleteProvinceTarget && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close province delete dialog"
            onClick={() => setDeleteProvinceName(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Delete {deleteProvinceTarget.name}?
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {deleteProvinceTarget.node && deleteProvinceTarget.node.zoneCount > 0 ? (
                    <>
                      This region contains{" "}
                      <span className="font-bold text-slate-900">
                        {deleteProvinceTarget.node.zoneCount} district
                        {deleteProvinceTarget.node.zoneCount === 1 ? "" : "s"}
                      </span>{" "}
                      and{" "}
                      <span className="font-bold text-slate-900">
                        {deleteProvinceTarget.node.areaCount} localities
                      </span>
                      . Deleting it halts citizen reporting for all of them.
                      This cannot be undone.
                    </>
                  ) : (
                    "This region has no districts — it will be removed from the roster."
                  )}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <label
                htmlFor="delete-province-confirm"
                className={`${labelClass} mb-1.5 block`}
              >
                To confirm, type &quot;{deleteProvinceTarget.name}&quot; below:
              </label>
              <input
                id="delete-province-confirm"
                type="text"
                value={deleteProvinceConfirm}
                onChange={(e) => setDeleteProvinceConfirm(e.target.value)}
                placeholder={deleteProvinceTarget.name}
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteProvinceName(null)}
                className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteProvinceConfirm !== deleteProvinceTarget.name}
                onClick={confirmDeleteProvince}
                className="whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Permanently Delete Province
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Type-to-confirm district deletion modal ---------------- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close delete dialog"
            onClick={() => setDeleteTargetId(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Delete {deleteTarget.name_en} from Municipal Coverage?
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  This action will remove all{" "}
                  <span className="font-bold text-slate-900">
                    {deleteTarget.areas.length}
                  </span>{" "}
                  associated areas and halt citizen reporting for this
                  district. Active work orders will be frozen.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <label htmlFor="delete-confirm" className={`${labelClass} mb-1.5 block`}>
                To confirm, type &quot;{deleteTarget.name_en}&quot; below:
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget.name_en}
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== deleteTarget.name_en}
                onClick={() => {
                  deleteCity(deleteTarget.id);
                  goToDashboard(activeDashboard);
                  setDeleteTargetId(null);
                  setDeleteConfirmText("");
                  showToast(`District “${deleteTarget.name_en}” deleted`);
                }}
                className="whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Permanently Delete District
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- Add / edit district modal ---------------------- */}
      {districtModal && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close district dialog"
            onClick={() => setDistrictModal(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-lg -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold text-slate-900">
                  {districtModal.mode === "edit"
                    ? `Edit District & City — ${districtName || "District"}`
                    : "Add District & City"}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {districtModal.mode === "edit"
                    ? "Rename, re-file under another province, or update its operations roster."
                    : "Tier 2 · files a new District & City (ضلع / شہر) under a province — add its tehsils next."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDistrictModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveDistrict();
              }}
            >
              <div>
                <label htmlFor="nd-prov" className={`${labelClass} mb-1.5 block`}>
                  Province / Region <span className="text-rose-500">*</span>
                </label>
                {districtUseNewProvince ? (
                  <div className="flex items-center gap-2">
                    <input
                      id="nd-prov-new"
                      type="text"
                      value={districtNewProvince}
                      onChange={(e) => {
                        setDistrictNewProvince(e.target.value);
                        setDistrictError("");
                      }}
                      placeholder="e.g. Gujranwala Division"
                      autoFocus
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setDistrictUseNewProvince(false);
                        setDistrictError("");
                      }}
                      className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50"
                    >
                      Choose existing
                    </button>
                  </div>
                ) : (
                  <select
                    id="nd-prov"
                    value={districtProvince}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setDistrictUseNewProvince(true);
                        setDistrictNewProvince("");
                      } else {
                        setDistrictProvince(e.target.value);
                      }
                      setDistrictError("");
                    }}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {[...new Set([...provinceNames, districtProvince])]
                      .filter(Boolean)
                      .map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    <option value="__new__">➕ Add new province…</option>
                  </select>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  {districtUseNewProvince
                    ? "A new name creates its own top-level group in the hierarchy tree."
                    : "The district nests under the selected province in the tree."}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="nd-name" className={`${labelClass} mb-1.5 block`}>
                    District &amp; City Name (English){" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="nd-name"
                    type="text"
                    value={districtName}
                    onChange={(e) => {
                      setDistrictName(e.target.value);
                      setDistrictError("");
                    }}
                    placeholder="e.g. Sargodha"
                    className={inputClass}
                    autoFocus={!districtUseNewProvince}
                  />
                </div>
                <div>
                  <label htmlFor="nd-urdu" className={`${labelClass} mb-1.5 block`}>
                    District &amp; City Name (Urdu)
                  </label>
                  <input
                    id="nd-urdu"
                    type="text"
                    value={districtUrdu}
                    onChange={(e) => setDistrictUrdu(e.target.value)}
                    placeholder="سرگودھا"
                    dir="rtl"
                    className={`${inputClass} urdu`}
                  />
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Operations Settings
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="nd-sup" className={`${labelClass} mb-1.5 block`}>
                      District Supervisor
                    </label>
                    <input
                      id="nd-sup"
                      type="text"
                      value={districtSupervisor}
                      onChange={(e) => setDistrictSupervisor(e.target.value)}
                      placeholder="e.g. Ahmed Raza"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="nd-con" className={`${labelClass} mb-1.5 block`}>
                      Contact Number
                    </label>
                    <input
                      id="nd-con"
                      type="text"
                      value={districtContact}
                      onChange={(e) => setDistrictContact(e.target.value)}
                      placeholder="e.g. 052-111-2233"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="nd-off" className={`${labelClass} mb-1.5 block`}>
                    Office
                  </label>
                  <input
                    id="nd-off"
                    type="text"
                    value={districtOffice}
                    onChange={(e) => setDistrictOffice(e.target.value)}
                    placeholder="e.g. District Secretariat, Room 4"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Active for Citizen Reporting
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Disabled districts stay in staging until launched.
                  </p>
                </div>
                {renderSwitch(
                  districtActive,
                  () => setDistrictActive((v) => !v),
                  "Active for citizen reporting"
                )}
              </div>
              {districtError && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  {districtError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDistrictModal(null)}
                  className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !districtName.trim() ||
                    (districtUseNewProvince && !districtNewProvince.trim())
                  }
                  className="whitespace-nowrap rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {districtModal.mode === "edit" ? "Save Changes" : "Create District"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------- Add / edit main zone modal --------------------- */}
      {zoneModal && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close zone dialog"
            onClick={() => setZoneModal(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-lg -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold text-slate-900">
                  {zoneModal.mode === "edit"
                    ? `Edit Tehsil / Zone — ${zoneModal.zoneName}`
                    : "Add Tehsil / Zone"}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {zoneModal.mode === "edit"
                    ? "Rename, re-govern, or update the zone's routing roster."
                    : "Tier 3 · clusters wards under a district — new wards inherit its routing."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoneModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveZone();
              }}
            >
              <div>
                <label
                  htmlFor="zone-city"
                  className={`${labelClass} mb-1.5 block`}
                >
                  District
                </label>
                {zoneModal.mode === "add" ? (
                  <select
                    id="zone-city"
                    value={zoneForm.cityId}
                    onChange={(e) =>
                      setZoneForm((f) => ({ ...f, cityId: e.target.value }))
                    }
                    className={`${inputClass} cursor-pointer`}
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_en} ({c.province})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-600">
                    {zoneModalCity?.name_en ?? "—"}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="zone-name" className={`${labelClass} mb-1.5 block`}>
                  Tehsil / Zone Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="zone-name"
                  type="text"
                  value={zoneForm.nameEn}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                  placeholder='e.g., "Sialkot Cantonment" or "Bijli Mohallah"'
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="zone-urdu" className={`${labelClass} mb-1.5 block`}>
                  Zone Name (Urdu){" "}
                  <span className="font-normal normal-case tracking-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <input
                  id="zone-urdu"
                  type="text"
                  value={zoneForm.nameUr}
                  onChange={(e) =>
                    setZoneForm((f) => ({ ...f, nameUr: e.target.value }))
                  }
                  placeholder="سیالکوٹ کینٹ"
                  dir="rtl"
                  className={`${inputClass} urdu`}
                />
              </div>
              <div>
                <label
                  htmlFor="zone-jurisdiction"
                  className={`${labelClass} mb-1.5 block`}
                >
                  Governing Jurisdiction
                </label>
                <select
                  id="zone-jurisdiction"
                  value={zoneForm.jurisdiction}
                  onChange={(e) =>
                    setZoneForm((f) => ({
                      ...f,
                      jurisdiction: e.target.value as JurisdictionType,
                    }))
                  }
                  className={`${inputClass} cursor-pointer`}
                >
                  {JURISDICTION_TYPES.map((j) => (
                    <option key={j} value={j}>
                      {shortJurisdiction(j)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {zoneModal.mode === "edit" ? (
                    <>
                      Renaming re-points all localities; changing the
                      jurisdiction applies it to every locality in this zone.
                    </>
                  ) : (
                    "New localities inherit this jurisdiction by default."
                  )}
                </p>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Operations Routing
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="zone-authority"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Governing Authority
                    </label>
                    <input
                      id="zone-authority"
                      type="text"
                      value={zoneForm.authority}
                      onChange={(e) =>
                        setZoneForm((f) => ({
                          ...f,
                          authority: e.target.value,
                        }))
                      }
                      placeholder="Auto from jurisdiction"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="zone-supervisor"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Zone Supervisor
                    </label>
                    <input
                      id="zone-supervisor"
                      type="text"
                      value={zoneForm.supervisor}
                      onChange={(e) =>
                        setZoneForm((f) => ({
                          ...f,
                          supervisor: e.target.value,
                        }))
                      }
                      placeholder="e.g. Inspector Ahmad Ali"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="zone-contact"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Contact Number
                    </label>
                    <input
                      id="zone-contact"
                      type="text"
                      value={zoneForm.contact}
                      onChange={(e) =>
                        setZoneForm((f) => ({ ...f, contact: e.target.value }))
                      }
                      placeholder="e.g. 052-426-0000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="zone-office"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Office
                    </label>
                    <input
                      id="zone-office"
                      type="text"
                      value={zoneForm.office}
                      onChange={(e) =>
                        setZoneForm((f) => ({ ...f, office: e.target.value }))
                      }
                      placeholder="e.g. Cantonment Board Office"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  New localities inherit this routing unless they set their own.
                </p>
              </div>
              {zoneFormError && (
                <p className="flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  {zoneFormError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setZoneModal(null)}
                  className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!zoneForm.nameEn.trim()}
                  className="whitespace-nowrap rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {zoneModal.mode === "edit" ? "Save Zone" : "Create Zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- Zone deletion warning modal -------------------- */}
      {deleteZoneVm && deleteZoneTarget && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close zone delete dialog"
            onClick={() => setDeleteZoneTarget(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Delete Tehsil / Zone “{deleteZoneVm.name}”?
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {deleteZoneVm.areas.length > 0 ? (
                    <>
                      This zone contains{" "}
                      <span className="font-bold text-slate-900">
                        {deleteZoneVm.areas.length}{" "}
                        {deleteZoneVm.areas.length === 1
                          ? "locality"
                          : "localities"}
                      </span>
                      . Deleting it removes the zone and every ward inside
                      it from citizen reporting. This cannot be undone.
                    </>
                  ) : (
                    "This zone has no wards — it will be removed from the coverage list."
                  )}
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteZoneTarget(null)}
                className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteZone}
                className="whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-700"
              >
                {deleteZoneVm.areas.length > 0
                  ? `Delete Zone & ${deleteZoneVm.areas.length} Wards`
                  : "Delete Zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------- Add / edit locality modal --------------------- */}
      {localityModal && localityCity && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close locality dialog"
            onClick={() => setLocalityModal(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-lg -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold text-slate-900">
                  {localityModal.mode === "edit"
                    ? `Edit Locality — ${localityForm.nameEn || "Locality"}`
                    : `Add New Locality to ${localityModal.zoneName}`}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {localityModal.mode === "edit"
                    ? "Rename, re-govern, or update this locality's routing."
                    : `Files a mohallah under ${localityModal.zoneName} — routing falls back to the zone when unset.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocalityModal(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveLocality();
              }}
            >
              <div>
                <label htmlFor="loc-name" className={`${labelClass} mb-1.5 block`}>
                  Locality / Mohallah Name (English){" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  id="loc-name"
                  type="text"
                  value={localityForm.nameEn}
                  onChange={(e) =>
                    setLocalityForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                  placeholder='e.g., "Askari-II" or "Lane 7"'
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="loc-urdu" className={`${labelClass} mb-1.5 block`}>
                  Locality Name (Urdu){" "}
                  <span className="font-normal normal-case tracking-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <input
                  id="loc-urdu"
                  type="text"
                  value={localityForm.nameUr}
                  onChange={(e) =>
                    setLocalityForm((f) => ({ ...f, nameUr: e.target.value }))
                  }
                  placeholder="عسکری ۲"
                  dir="rtl"
                  className={`${inputClass} urdu`}
                />
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Office Routing
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="loc-supervisor"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Assigned Officer{" "}
                      <span className="font-normal normal-case tracking-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="loc-supervisor"
                      type="text"
                      value={localityForm.supervisor}
                      onChange={(e) =>
                        setLocalityForm((f) => ({
                          ...f,
                          supervisor: e.target.value,
                        }))
                      }
                      placeholder="e.g. Inspector Mohammad Bilal"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="loc-contact"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Contact Number{" "}
                      <span className="font-normal normal-case tracking-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="loc-contact"
                      type="text"
                      value={localityForm.contact}
                      onChange={(e) =>
                        setLocalityForm((f) => ({
                          ...f,
                          contact: e.target.value,
                        }))
                      }
                      placeholder="e.g. 052-426-1122"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="loc-office" className={`${labelClass} mb-1.5 block`}>
                    Office{" "}
                    <span className="font-normal normal-case tracking-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="loc-office"
                    type="text"
                    value={localityForm.office}
                    onChange={(e) =>
                      setLocalityForm((f) => ({ ...f, office: e.target.value }))
                    }
                    placeholder="Defaults to the parent zone's office"
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                <span>
                  <span className="block text-xs font-bold text-slate-900">
                    Inherit Parent Jurisdiction
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Uses the zone&apos;s governing desk (
                    {shortJurisdiction(
                      localityCityZones.find(
                        (vm) => vm.name === localityModal.zoneName
                      )?.jurisdiction ?? DEFAULT_JURISDICTION
                    )}
                    ).
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={localityForm.inherit}
                  onChange={(e) =>
                    setLocalityForm((f) => ({
                      ...f,
                      inherit: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#0F5132]"
                />
              </label>
              {!localityForm.inherit && (
                <div>
                  <label
                    htmlFor="loc-jurisdiction"
                    className={`${labelClass} mb-1.5 block`}
                  >
                    Locality Jurisdiction
                  </label>
                  <select
                    id="loc-jurisdiction"
                    value={localityForm.jurisdiction}
                    onChange={(e) =>
                      setLocalityForm((f) => ({
                        ...f,
                        jurisdiction: e.target.value as JurisdictionType,
                      }))
                    }
                    className={`${inputClass} cursor-pointer`}
                  >
                    {JURISDICTION_TYPES.map((j) => (
                      <option key={j} value={j}>
                        {shortJurisdiction(j)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {localityFormError && (
                <p className="flex items-center gap-1 text-xs font-medium text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  {localityFormError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLocalityModal(null)}
                  className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!localityForm.nameEn.trim()}
                  className="whitespace-nowrap rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localityModal.mode === "edit" ? "Save Changes" : "Add Locality"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------- Move locality modal --------------------------- */}
      {moveTarget && moveTargetCity && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close move dialog"
            onClick={() => setMoveTarget(null)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Move “{moveTarget.area.name_en}”
              </h2>
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveMove();
              }}
            >
              <div>
                <label htmlFor="move-zone" className={`${labelClass} mb-1.5 block`}>
                  Target Zone
                </label>
                <select
                  id="move-zone"
                  value={moveZone}
                  onChange={(e) => setMoveZone(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  {moveTargetZones.map((vm) => (
                    <option key={vm.name} value={vm.name}>
                      {vm.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Currently filed under{" "}
                  <span className="font-semibold text-slate-700">
                    {moveTarget.fromZone}
                  </span>
                  .
                </p>
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                <span>
                  <span className="block text-xs font-bold text-slate-900">
                    Apply Target Zone&apos;s Jurisdiction
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Otherwise the locality keeps its current governing desk.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={moveInherit}
                  onChange={(e) => setMoveInherit(e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#0F5132]"
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMoveTarget(null)}
                  className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!moveZone || moveZone === moveTarget.fromZone}
                  className="whitespace-nowrap rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move Locality
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------ Toast ------------------------------ */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100vw-2.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-semibold shadow-lg sm:whitespace-nowrap ${
            toast.tone === "error"
              ? "border-rose-200 text-rose-700"
              : "border-emerald-200 text-emerald-800"
          }`}
        >
          {toast.tone === "error" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
