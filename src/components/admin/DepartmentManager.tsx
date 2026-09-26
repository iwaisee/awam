"use client";

/* Government Department & Team Manager — /admin/departments.
   Full CRUD workstation over the 3-tier registry:
   Tier 1 core sectors → Tier 2 regional agencies (create / edit / maintenance
   / archive) → Tier 3 district desks (create / edit / ward reassignment /
   delete with cascade checks) → field squads (deploy / edit / reassign /
   decommission with active-ticket guards).
   Mutations are client-side on the seeded registry until the live backend
   replaces src/data/departmentRegistry.ts. */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Archive,
  ArrowRightLeft,
  Building,
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  Landmark,
  Map as MapIcon,
  MapPin,
  Minus,
  Pencil,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  MANAGER_DESIGNATIONS,
  PROVINCE_OPTIONS,
  SECTOR_WORKFORCE,
  SQUAD_SHIFTS,
  agencyCoverageDistricts,
  type CoreSector,
  type DistrictOperation,
  type FieldSquad,
  type RegionalAgency,
  type WorkforceClass,
} from "@/data/departmentRegistry";
import {
  announceRegistryUpdate,
  fetchRegistry,
  pushRegistry,
} from "@/lib/registryClient";
import { useLiveReports } from "@/lib/liveReports";
import type { IncidentReport } from "@/types/civic";
import { SECTOR_ACCENTS, SECTOR_ICONS, SECTOR_ICON_FALLBACK } from "./sectorIcons";
import DepartmentGeoTree from "./DepartmentGeoTree";
import DivisionDesk from "./DivisionDesk";
import SquadPage from "./SquadPage";
import { useCoverage } from "@/context/CoverageContext";

/* Live telemetry — folds real ledger counts into a display copy of the
   registry. A complaint is attributed to the division whose squad holds it
   (assigned_unit), else to the division covering the report's area, else to
   the division whose district matches the report's city (district-wide
   desks). Agency totals include complaints no division has claimed yet. */
function agencyMatchesLive(code: string, assignedAgency: string): boolean {
  const a = code.toLowerCase();
  const b = assignedAgency.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function withLiveTelemetry(
  sectors: CoreSector[],
  reports: IncidentReport[],
): CoreSector[] {
  if (reports.length === 0) return sectors;
  const next: CoreSector[] = structuredClone(sectors);
  const agencies = next.flatMap((sector) => sector.agencies);
  /* assigned_unit is the authoritative link once a crew is tasked — the
     ledger's assigned_agency can lag behind a dispatch (intake routing
     guesses the department before a dispatcher picks the squad). Index
     every squad by name so tasked tickets pin their owning agency. */
  const squadIndex = new Map<
    string,
    { agency: RegionalAgency; division: DistrictOperation; squad: FieldSquad }
  >();
  for (const agency of agencies) {
    for (const division of agency.districtOperations) {
      for (const squad of division.squads) {
        squadIndex.set(squad.name.toLowerCase(), { agency, division, squad });
      }
    }
  }
  for (const report of reports) {
    const open = report.status !== "resolved";
    const owner = report.assigned_unit
      ? squadIndex.get(report.assigned_unit.toLowerCase())
      : undefined;
    const agency =
      owner?.agency ??
      (report.assigned_agency
        ? agencies.find((a) =>
            agencyMatchesLive(a.code, report.assigned_agency),
          )
        : undefined);
    if (!agency) continue;
    if (open) agency.liveOpen = (agency.liveOpen ?? 0) + 1;
    else agency.liveResolved = (agency.liveResolved ?? 0) + 1;
    const division =
      owner?.division ??
      agency.districtOperations.find(
        (op) =>
          op.coverage.includes(report.area_name) ||
          (op.coverage.length === 0 &&
            op.district.toLowerCase() === report.city_name.toLowerCase())
      );
    if (division) {
      if (open) division.openTickets += 1;
      else division.resolvedTickets += 1;
      /* Squad-level open workload — mirrors the division fold so the squad
         card's ticket badge tracks the ledger, not the stale registry seed. */
      if (open && owner) {
        owner.squad.activeTickets = (owner.squad.activeTickets ?? 0) + 1;
      }
    }
  }
  return next;
}

/* ----------------------------- Display helpers ---------------------------- */

/** Tinted pill classes for the workforce strength badge, per sector. */
const SECTOR_WORKFORCE_PILLS: Record<string, string> = {
  power: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  waste: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  water: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  emergency: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  traffic: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  municipal: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

/* Status pills, shift labels and workforce naming live in departmentMeta —
   shared with the division desk surface. */
import {
  AGENCY_STATUS_META,
  SQUAD_STATUS_META,
  shiftLabelOf,
  workforceLabel,
  type AgencyStatus,
  type SquadShift,
  type SquadStatus,
} from "./departmentMeta";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-700";

/** Agency lifecycle — drives the banner pill, the geo-tree dot and the
    report-intake default (standby bodies start paused). Each state carries
    its own tint so the three cards read apart at a glance. */
const AGENCY_STATUS_CHOICES: {
  value: AgencyStatus;
  label: string;
  blurb: string;
  dot: string;
  selected: string;
  labelSelected: string;
}[] = [
  {
    value: "standby",
    label: "Standby",
    blurb: "Registered — complaint intake paused",
    dot: "bg-slate-400",
    selected: "border-slate-400/60 bg-slate-100",
    labelSelected: "text-slate-700",
  },
  {
    value: "pilot",
    label: "Active Pilot",
    blurb: "Live in pilot districts only",
    dot: "bg-amber-500",
    selected: "border-amber-500/60 bg-amber-50",
    labelSelected: "text-amber-900",
  },
  {
    value: "active",
    label: "Active",
    blurb: "Fully live across the jurisdiction",
    dot: "bg-emerald-500",
    selected: "border-emerald-600/60 bg-emerald-50/70",
    labelSelected: "text-emerald-900",
  },
];

/** Territories spells regions out; the agency form's PROVINCE_OPTIONS
    abbreviates Islamabad. Normalize when grouping districts. */
const TERRITORY_PROVINCE_KEYS: Record<string, string> = {
  "islamabad capital territory": "Islamabad ICT",
};

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/* Registry persistence — the departments console mutates its state (agencies,
   desks, squads) and every change is pushed to the shared Neon registry
   (via /api/departments) so all browsers read one copy. There is no local
   seed or cache — an empty store renders empty until an admin adds data. */

const apiSlugOf = (code: string) =>
  code.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-");

/** Deterministic mock credential so the key is stable across re-opens. */
const apiKeyOf = (code: string) => {
  const seed = [...code].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) >>> 0;
  return `sea_live_${seed.toString(36)}${apiSlugOf(code).slice(0, 4)}k4m9x2q7`;
};

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** Generate and download the agency's deployment roster as CSV (opens in
    Excel / Sheets; printable to PDF from there). */
const downloadRosterCsv = (sectorName: string, agency: RegionalAgency) => {
  const header = [
    "Sector",
    "Agency",
    "District",
    "Division",
    "Nodal Manager",
    "Designation",
    "Manager Contact",
    "Control Hotline",
    "Squad",
    "Lead Technician",
    "Lead Contact",
    "Strength",
    "Workforce Role",
    "Vehicle",
    "Shift",
    "Status",
  ];
  const rows: (string | number)[][] = agency.districtOperations.flatMap((op) =>
    op.squads.length
      ? op.squads.map((squad) => [
          sectorName,
          agency.code,
          op.district,
          op.divisionName,
          op.managerName,
          op.managerDesignation,
          op.officialPhone,
          op.controlRoomHotline,
          squad.name,
          squad.leadTechnician,
          squad.phone,
          squad.membersCount,
          SECTOR_WORKFORCE[sectorNameToSlug(sectorName)]?.[
            squad.roleClass ?? "worker"
          ] ?? "Field Workers",
          squad.vehiclePlate ?? "—",
          squad.shift ? shiftLabelOf(squad.shift) : "—",
          SQUAD_STATUS_META[squad.status].label,
        ])
      : [
          [
            sectorName,
            agency.code,
            op.district,
            op.divisionName,
            op.managerName,
            op.managerDesignation,
            op.officialPhone,
            op.controlRoomHotline,
            "(no squads deployed)",
            "—",
            "—",
            0,
            "—",
            "—",
            "—",
            "—",
          ],
        ]
  );
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${apiSlugOf(agency.code)}-deployment-roster.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** CSV rows key off the sector name; map back to the workforce dictionary. */
const sectorNameToSlug = (name: string): string =>
  (
    {
      "Power & Electricity": "power",
      "Solid Waste Management": "waste",
      "Water & Sewerage": "water",
      "Emergency Services": "emergency",
      "Traffic Police": "traffic",
      "Municipal Works": "municipal",
    } as Record<string, string>
  )[name] ?? "power";

/* ------------------------------ Modal shell ------------------------------ */

function ModalShell({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /* Inner controls (comboboxes) preventDefault Escape to dismiss just
         their own suggestion list — honor that and keep the modal open. */
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 animate-overlay-in bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`my-auto w-full ${
            wide ? "max-w-2xl" : "max-w-lg"
          } animate-in rounded-2xl border border-slate-200/90 bg-white shadow-2xl`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="min-w-0">
              <h3 className="font-heading text-base font-black tracking-tight text-slate-900">
                {title}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              autoFocus
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-slate-300 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
    >
      {message}
    </p>
  );
}

function AmberWarning({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-amber-800 ring-1 ring-amber-200">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>{message}</span>
    </p>
  );
}

function ModalFooter({
  onCancel,
  submitLabel,
  danger,
  disabled,
  hint,
}: {
  onCancel: () => void;
  submitLabel: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          title={disabled ? hint : undefined}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${
            danger ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-600/30" : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {submitLabel}
        </button>
      </div>
      {disabled && hint && (
        <p className="mt-2 text-center text-[11px] font-medium text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/* ------------------------------- Form controls ----------------------------- */

/* ------------------------------- Form controls ----------------------------- */

/** Kebab (⋯) dropdown menu — items can navigate, act, or be disabled with a
    reason line. Renders in a portal-free absolute panel with outside-click
    and Escape dismissal. */
type MenuItem = {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  dividerBefore?: boolean;
  disabled?: boolean;
  reason?: string;
  href?: string;
  onSelect?: () => void;
};

function KebabMenu({ menuLabel, items }: { menuLabel: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 ${
          open
            ? "border-slate-300 bg-slate-50 text-slate-800"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
        }`}
      >
        <Ellipsis className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xl"
        >
          {items.map((item, index) => (
            <Fragment key={`${item.label}-${index}`}>
              {item.dividerBefore && (
                <div className="mx-2 my-1 border-t border-slate-100" aria-hidden />
              )}
              {(() => {
                const content = (
                  <>
                    {item.icon && (
                      <item.icon
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          item.danger ? "text-rose-500" : "text-slate-400"
                        }`}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-xs font-semibold ${
                          item.danger ? "text-rose-700" : "text-slate-700"
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.reason && (
                        <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-400">
                          {item.reason}
                        </span>
                      )}
                    </span>
                  </>
                );
                const rowClass =
                  "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 focus:outline-none focus-visible:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
                return item.href ? (
                  <Link
                    href={item.href}
                    role="menuitem"
                    className={`${rowClass} hover:bg-slate-50`}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                    className={`${rowClass} ${
                      item.danger ? "hover:bg-rose-50" : "hover:bg-slate-50"
                    }`}
                  >
                    {content}
                  </button>
                );
              })()}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** Labeled numeric stepper — minus / value / plus, floored at `min`. */
function NumberStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <button
        type="button"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-8 text-center font-mono text-sm font-bold tabular-nums text-slate-900">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Pill-style single-select group used across the modals. */
function RadioPills<T extends string>({
  groupLabel,
  value,
  onChange,
  options,
}: {
  groupLabel: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 ${
              on
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type AgencyFormState = {
  sectorId: string;
  code: string;
  fullName: string;
  headquarters: string;
  /** Street address of the HQ — optional, shown under the city in the deck. */
  hqAddress: string;
  province: string;
  districts: string[];
  status: AgencyStatus;
  controlHotline: string;
  dispatchEmail: string;
  webhookUrl: string;
};

function AgencyModal({
  sectors,
  agency,
  onClose,
  onCreate,
  onUpdate,
}: {
  sectors: CoreSector[];
  /** Present → edit mode (sector + acronym locked). */
  agency: RegionalAgency | null;
  onClose: () => void;
  onCreate: (data: AgencyFormState) => void;
  onUpdate: (agencyId: string, data: AgencyFormState) => void;
}) {
  const [form, setForm] = useState<AgencyFormState>(() => ({
    sectorId: agency
      ? (sectors.find((s) => s.agencies.some((a) => a.id === agency.id))?.id ??
        sectors[0]?.id ??
        "")
      : (sectors[0]?.id ?? ""),
    code: agency?.code ?? "",
    fullName: agency?.fullName ?? "",
    headquarters: agency?.headquarters ?? "",
    hqAddress: agency?.hqAddress ?? "",
    province: agency?.province ?? "",
    districts: agency?.jurisdictionDistricts ?? [],
    status: agency?.status ?? "standby",
    controlHotline: agency?.controlHotline ?? "",
    dispatchEmail: agency?.dispatchEmail ?? "",
    webhookUrl: agency?.webhookUrl ?? "",
  }));
  const [error, setError] = useState("");

  /* Territories is the jurisdiction source of truth — the districts offered
     below come from the CoverageContext roster (the /admin/territories tree),
     grouped under the form's province keys. */
  const { cities } = useCoverage();
  const districtsByProvince = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const city of cities) {
      const key =
        TERRITORY_PROVINCE_KEYS[city.province.toLowerCase()] ?? city.province;
      const list = map.get(key) ?? [];
      if (!list.includes(city.name_en)) list.push(city.name_en);
      map.set(key, list);
    }
    return map;
  }, [cities]);
  /** City → province lookup for the HQ combobox's suggestion labels. */
  const cityProvince = useMemo(() => {
    const map = new Map<string, string>();
    for (const [province, list] of districtsByProvince) {
      for (const city of list) map.set(city, province);
    }
    return map;
  }, [districtsByProvince]);
  const [hqOpen, setHqOpen] = useState(false);
  /** Until a province is picked the location rosters stay locked — the
      department must exist inside a province before it has cities. */
  const provinceLocked = !form.province;
  /* HQ suggestions follow the operating province; with none selected the
     whole Territories roster is searchable. */
  const hqCandidates = form.province
    ? districtsByProvince.get(form.province) ?? []
    : [...cityProvince.keys()];
  const hqQuery = form.headquarters.trim().toLowerCase();
  const hqMatches = hqCandidates
    .filter((city) => city.toLowerCase() !== hqQuery)
    .filter((city) => (hqQuery ? city.toLowerCase().includes(hqQuery) : true))
    .slice(0, 8);
  /* District suggestions mirror the HQ combobox — province-scoped, never
     offering a district the agency already has. */
  const [districtQuery, setDistrictQuery] = useState("");
  const [districtOpen, setDistrictOpen] = useState(false);
  /** Province switch awaiting confirmation — switching clears the district
      picks, so when any are selected we warn before wiping. */
  const [pendingProvince, setPendingProvince] = useState<string | null>(null);
  const districtCandidates = form.province
    ? (districtsByProvince.get(form.province) ?? []).map((name) => ({
        name,
        province: form.province,
      }))
    : [...cityProvince.entries()].map(([name, province]) => ({ name, province }));
  const districtNeedle = districtQuery.trim().toLowerCase();
  const districtMatches = districtCandidates
    .filter((candidate) => !form.districts.includes(candidate.name))
    .filter((candidate) =>
      districtNeedle ? candidate.name.toLowerCase().includes(districtNeedle) : true
    )
    .slice(0, 8);
  const addDistrict = (name: string) => {
    set("districts", [...form.districts, name]);
    setDistrictQuery("");
    setDistrictOpen(false);
  };

  const set = <K extends keyof AgencyFormState>(key: K, value: AgencyFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!form.sectorId) {
      setError("Pick a parent sector for the agency.");
      return;
    }
    if (!form.code.trim() || !form.fullName.trim()) {
      setError("Agency acronym and full official name are required.");
      return;
    }
    if (!form.province) {
      setError("Pick the province this agency operates in.");
      return;
    }
    if (form.districts.length === 0) {
      setError("Add at least one jurisdiction district.");
      return;
    }
    if (form.dispatchEmail && !form.dispatchEmail.includes("@")) {
      setError("Enter a valid dispatch email address.");
      return;
    }
    if (
      form.webhookUrl &&
      !/^https?:\/\/.+/.test(form.webhookUrl.trim())
    ) {
      setError("The API webhook endpoint must be a valid http(s) URL.");
      return;
    }
    const payload: AgencyFormState = {
      ...form,
      code: form.code.trim().toUpperCase(),
      fullName: form.fullName.trim(),
      headquarters: form.headquarters.trim() || form.districts[0],
      hqAddress: form.hqAddress.trim(),
      controlHotline: form.controlHotline.trim(),
      dispatchEmail: form.dispatchEmail.trim(),
      webhookUrl: form.webhookUrl.trim(),
    };
    if (agency) onUpdate(agency.id, payload);
    else onCreate(payload);
  };

  return (
    <ModalShell
      title={agency ? `Edit Agency Details — ${agency.code}` : "Register New Agency"}
      description={
        agency
          ? "Update metadata, jurisdiction and dispatch integration."
          : "Quick onboarding — the agency joins the sector accordion immediately."
      }
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          /* Enter in a text field must never implicitly submit — changes are
             saved explicitly via the modal's Save button. */
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
          }
        }}
      >
        <FormError message={error} />
        {/* Step 1 — the province gates everything below: a department is a
            provincial body operating in exactly ONE province, and the HQ +
            district rosters are drawn from it. */}
        <div className="space-y-1.5">
          <span className={labelClass}>
            Operating Province{" "}
            <span className="font-medium normal-case text-slate-400">
              — everything below follows from this
            </span>
          </span>
          <div role="radiogroup" aria-label="Operating province" className="flex flex-wrap gap-2">
            {PROVINCE_OPTIONS.map((province) => {
              const on = form.province === province;
              return (
                <button
                  key={province}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (on) return;
                    if (form.districts.length > 0) {
                      setPendingProvince(province);
                      return;
                    }
                    set("province", province);
                    set("districts", []);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 ${
                    on
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {province}
                </button>
              );
            })}
          </div>
          {pendingProvince && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-[11px] font-semibold text-amber-800">
                Switch to {pendingProvince}? The{" "}
                {form.districts.length} selected district
                {form.districts.length === 1 ? "" : "s"} will be removed.
              </p>
              <span className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    set("province", pendingProvince);
                    set("districts", []);
                    setPendingProvince(null);
                  }}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors duration-150 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600/30"
                >
                  Switch &amp; clear districts
                </button>
                <button
                  type="button"
                  onClick={() => setPendingProvince(null)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 transition-colors duration-150 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600/30"
                >
                  Keep {form.province || "current"}
                </button>
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="na-sector" className={labelClass}>
              Parent Sector
            </label>
            <select
              id="na-sector"
              value={form.sectorId}
              disabled={Boolean(agency)}
              onChange={(e) => set("sectorId", e.target.value)}
              className={inputClass}
            >
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="na-code" className={labelClass}>
              Agency Acronym
            </label>
            <input
              id="na-code"
              value={form.code}
              disabled={Boolean(agency)}
              onChange={(e) => set("code", e.target.value)}
              placeholder="e.g. LWMC"
              className={`${inputClass} font-mono uppercase`}
            />
          </div>
        </div>
        {/* Lifecycle — prominent because it gates report intake and every
            status pill across the console */}
        <div className="space-y-1.5">
          <span className={labelClass}>Agency Status</span>
          <div role="radiogroup" aria-label="Agency status" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {AGENCY_STATUS_CHOICES.map((choice) => {
              const on = form.status === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("status", choice.value)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                    on
                      ? `${choice.selected} ring-1`
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-xs font-bold ${
                      on ? choice.labelSelected : "text-slate-800"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${choice.dot}`} />
                    {choice.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-500">
                    {choice.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="na-full" className={labelClass}>
            Full Official Name
          </label>
          <input
            id="na-full"
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="e.g. Lahore Waste Management Company"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="na-hq" className={labelClass}>
            Headquarters City
          </label>
          <div className="relative">
            <input
              id="na-hq"
              value={form.headquarters}
              disabled={provinceLocked}
              onChange={(e) => {
                set("headquarters", e.target.value);
                setHqOpen(true);
              }}
              onFocus={() => setHqOpen(true)}
              onBlur={() => {
                // Let the suggestion's mousedown land before the blur closes.
                window.setTimeout(() => setHqOpen(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Dismiss only the suggestion list — preventDefault keeps
                  // ModalShell's document-level Escape from closing the modal.
                  e.preventDefault();
                  e.stopPropagation();
                  setHqOpen(false);
                }
                if (e.key === "Enter" && hqOpen && hqMatches.length > 0) {
                  e.preventDefault();
                  set("headquarters", hqMatches[0]);
                  setHqOpen(false);
                } else if (e.key === "Enter") {
                  // Never let Enter implicitly submit the agency form.
                  e.preventDefault();
                }
              }}
              placeholder={
                provinceLocked
                  ? "Pick the operating province first"
                  : "Type to search the Territories roster — e.g. Gujranwala"
              }
              autoComplete="off"
              role="combobox"
              aria-expanded={hqOpen && !provinceLocked && hqMatches.length > 0}
              aria-controls="na-hq-list"
              className={inputClass}
            />
            {hqOpen && !provinceLocked && hqMatches.length > 0 && (
              <div
                id="na-hq-list"
                role="listbox"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xl"
              >
                {hqMatches.map((city) => (
                  <button
                    key={city}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      set("headquarters", city);
                      setHqOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-emerald-50/70 focus:outline-none focus-visible:bg-emerald-50/70"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {city}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {cityProvince.get(city)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {provinceLocked ? (
            <p className="text-[11px] font-medium text-slate-400">
              Locked — pick the operating province above and its city roster
              loads here.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="na-hq-addr" className={labelClass}>
            HQ Street Address{" "}
            <span className="font-medium normal-case text-slate-400">
              (optional)
            </span>
          </label>
          <input
            id="na-hq-addr"
            value={form.hqAddress}
            onChange={(e) => set("hqAddress", e.target.value)}
            placeholder="e.g. Plot 422-C, Ferozepur Road, Civil Lines, Gujranwala"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Jurisdiction Districts</span>
          {/* Chip combobox — selected districts as removable chips, typing
              suggests districts from the Territories roster (province-scoped). */}
          <div className="relative rounded-xl border border-slate-200 bg-white px-2 py-2 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/20">
            <div className="flex flex-wrap items-center gap-1.5">
              {form.districts.map((district) => (
                <span
                  key={district}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-tint py-1 pl-2.5 pr-1.5 text-xs font-semibold text-primary"
                >
                  {district}
                  <button
                    type="button"
                    aria-label={`Remove ${district}`}
                    onClick={() =>
                      set(
                        "districts",
                        form.districts.filter((d) => d !== district)
                      )
                    }
                    className="flex h-4 w-4 items-center justify-center rounded-full text-primary/60 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={districtQuery}
                disabled={provinceLocked}
                onChange={(e) => {
                  setDistrictQuery(e.target.value);
                  setDistrictOpen(true);
                }}
                onFocus={() => setDistrictOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setDistrictOpen(false), 120);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setDistrictOpen(false);
                  }
                  if (e.key === "Enter") {
                    // Enter adds the top match — it must never submit the form.
                    e.preventDefault();
                    if (districtOpen && districtMatches.length > 0) {
                      addDistrict(districtMatches[0].name);
                    }
                  }
                }}
                placeholder={
                  provinceLocked
                    ? "Pick the operating province first"
                    : form.districts.length
                      ? "Add district — type to search Territories..."
                      : "Search the Territories roster — e.g. Sialkot"
                }
                aria-label="Search jurisdiction districts"
                className="min-w-[160px] flex-1 bg-transparent px-1.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-transparent"
              />
            </div>
            {districtOpen && !provinceLocked && districtMatches.length > 0 && (
              <div
                role="listbox"
                aria-label="Jurisdiction district suggestions"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xl"
              >
                {districtMatches.map((candidate) => (
                  <button
                    key={candidate.name}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addDistrict(candidate.name);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-emerald-50/70 focus:outline-none focus-visible:bg-emerald-50/70"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Plus className="h-3 w-3 text-slate-400" />
                      {candidate.name}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {candidate.province}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!form.province ? (
            <p className="text-[11px] font-medium text-slate-400">
              Suggestions come from the Territories roster — narrow them by
              picking operating provinces above.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="na-hotline" className={labelClass}>
              Control Room Emergency Hotline
            </label>
            <input
              id="na-hotline"
              value={form.controlHotline}
              onChange={(e) => set("controlHotline", e.target.value)}
              placeholder="e.g. 055-9260010"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="na-email" className={labelClass}>
              Dispatch Email
            </label>
            <input
              id="na-email"
              type="email"
              value={form.dispatchEmail}
              onChange={(e) => set("dispatchEmail", e.target.value)}
              placeholder="e.g. dispatch@agency.gop.pk"
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="na-webhook" className={labelClass}>
            Live API Webhook Endpoint{" "}
            <span className="font-medium normal-case text-slate-400">
              (optional — automatic ticket sync)
            </span>
          </label>
          <input
            id="na-webhook"
            value={form.webhookUrl}
            onChange={(e) => set("webhookUrl", e.target.value)}
            placeholder="https://agency.gop.pk/hooks/sada-e-awam"
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          submitLabel={agency ? "Save Agency Details" : "Register Agency"}
        />
      </form>
    </ModalShell>
  );
}

/* ----------------------------- Ward area editor ---------------------------- */

/** THE single ward/area picker used everywhere areas are assigned — the
    division's coverage editor and each squad's serving-area editor are the
    exact same component. Compact by design: only selected areas render as
    chips (collapsing past 8), everything else lives behind the type-ahead,
    which searches the Territories roster with parent-zone badges and accepts
    custom names for areas not yet registered. Zone chips bulk-add the
    remaining wards of a zone, and flip to a one-click remove-all state once
    fully covered. */
export function WardAreaEditor({
  districtName,
  values,
  onChange,
}: {
  districtName: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const { getAreasByCity } = useCoverage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const wards = useMemo(() => getAreasByCity(districtName), [districtName, getAreasByCity]);
  /** Zone → ward names, from the Territories tree's town grouping. */
  const wardsByZone = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ward of wards) {
      const zone = ward.town?.trim() || "District-wide";
      const list = map.get(zone) ?? [];
      if (!list.includes(ward.name_en)) list.push(ward.name_en);
      map.set(zone, list);
    }
    return map;
  }, [wards]);

  const needle = query.trim().toLowerCase();
  const matches = wards
    .filter((w) => !values.includes(w.name_en))
    .filter((w) => (needle ? w.name_en.toLowerCase().includes(needle) : false))
    .slice(0, 8);
  const trimmed = query.trim();
  const customAllowed =
    trimmed.length > 0 &&
    !values.includes(trimmed) &&
    !wards.some((w) => w.name_en.toLowerCase() === needle);

  const addArea = (name: string) => {
    if (!values.includes(name)) onChange([...values, name]);
    setQuery("");
    setOpen(false);
  };
  const removeArea = (name: string) => onChange(values.filter((v) => v !== name));
  const addZone = (zone: string) => {
    const merged = [...values];
    for (const ward of wardsByZone.get(zone) ?? []) {
      if (!merged.includes(ward)) merged.push(ward);
    }
    onChange(merged);
  };

  const visibleValues = showAll || values.length <= 8 ? values : values.slice(0, 8);
  const hiddenCount = values.length - visibleValues.length;
  /* Every zone shows as a chip — uncovered zones offer bulk-add (+N),
     fully-covered zones flip to a bulk-remove (N ✕) state. */
  const zoneRows = [...wardsByZone.entries()];

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-slate-200 bg-white px-2 py-2 transition-colors duration-150 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/20">
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleValues.map((area) => (
            <span
              key={area}
              className="inline-flex items-center gap-1 rounded-full bg-primary-tint py-1 pl-2.5 pr-1.5 text-xs font-semibold text-primary"
            >
              {area}
              <button
                type="button"
                aria-label={`Remove ${area}`}
                onClick={() => removeArea(area)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-primary/60 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 transition-colors duration-150 hover:bg-slate-200"
            >
              +{hiddenCount} more
            </button>
          )}
          {showAll && hiddenCount === 0 && values.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 transition-colors duration-150 hover:bg-slate-200"
            >
              Show less
            </button>
          )}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (open && matches.length > 0) addArea(matches[0].name_en);
                else if (open && customAllowed) addArea(trimmed);
              }
            }}
            placeholder={
              wards.length > 0
                ? "Search areas — e.g. Model Town"
                : "Add area — e.g. Model Town"
            }
            aria-label="Area search"
            className="min-w-[150px] flex-1 bg-transparent px-1.5 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        {open && (matches.length > 0 || customAllowed) && (
          <div
            role="listbox"
            aria-label="Area suggestions"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xl"
          >
            {matches.map((ward) => (
              <button
                key={ward.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addArea(ward.name_en);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-emerald-50/70 focus:outline-none focus-visible:bg-emerald-50/70"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Plus className="h-3 w-3 text-slate-400" />
                  {ward.name_en}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {ward.town || "District-wide"}
                </span>
              </button>
            ))}
            {customAllowed && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addArea(trimmed);
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-emerald-50/70 focus:outline-none focus-visible:bg-emerald-50/70"
              >
                <Plus className="h-3 w-3 text-slate-400" />
                Add “{trimmed}” as a new area
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zone bulk toggles — cover a whole zone in one click, or clear it
          in one click once fully covered. */}
      {zoneRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            By zone:
          </span>
          {zoneRows.map(([zone, list]) => {
            const selectedInZone = list.filter((ward) => values.includes(ward)).length;
            const remaining = list.length - selectedInZone;
            /* Fully-covered zone → one click clears all its wards; partial or
               empty zone → one click adds the remaining wards. */
            if (remaining === 0 && selectedInZone > 0) {
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() =>
                    onChange(values.filter((v) => !list.includes(v)))
                  }
                  title={`Remove all ${selectedInZone} area${
                    selectedInZone === 1 ? "" : "s"
                  } in ${zone}`}
                  className="rounded-full border border-primary/30 bg-primary-tint px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors duration-150 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                >
                  <span className="inline-flex items-center gap-1">
                    {zone}
                    <span className="font-mono text-[10px]">{selectedInZone}</span>
                    <X className="h-3 w-3" />
                  </span>
                </button>
              );
            }
            return (
              <button
                key={zone}
                type="button"
                onClick={() => addZone(zone)}
                title={`Add all ${remaining} unselected area${
                  remaining === 1 ? "" : "s"
                } in ${zone}`}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3 w-3 text-slate-400" />
                  {zone}
                  <span className="font-mono text-[10px] text-slate-400">+{remaining}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {wards.length === 0 && (
        <p className="text-[11px] font-medium text-slate-400">
          No areas registered under {districtName} in Territories yet — type to
          add custom areas.
        </p>
      )}
    </div>
  );
}

type DistrictFormState = {
  district: string;
  divisionName: string;
  managerName: string;
  managerDesignation: string;
  officialPhone: string;
  officialExtension: string;
  controlRoomHotline: string;
  /* No coverage field — a division always serves its whole district.
     Ward-level picking belongs to the field squads (Serving Areas editor). */
};

function DistrictModal({

  agency,
  sectorSlug,
  district,
  onClose,
  onSubmit,
  onDelete,
}: {
  agency: RegionalAgency;
  sectorSlug: string;
  /** Present → edit mode; absent → configure a new division. */
  district: DistrictOperation | null;
  onClose: () => void;
  onSubmit: (data: DistrictFormState) => void;
  /** Edit mode only — hands off to the deletion confirm modal. */
  onDelete?: (agencyId: string, districtId: string) => void;
}) {
  const used = useMemo(
    () => new Set(agency.districtOperations.map((op) => op.district)),
    [agency]
  );
  const available = agency.jurisdictionDistricts.filter((d) => !used.has(d));

  /** Designation options lead with the sector's own officer title. */
  const designationOptions = useMemo(() => {
    const officer = SECTOR_WORKFORCE[sectorSlug]?.officer;
    const base: string[] = [...MANAGER_DESIGNATIONS];
    if (officer && !base.includes(officer)) base.unshift(officer);
    return base;
  }, [sectorSlug]);

  const [form, setForm] = useState<DistrictFormState>(() => ({
    district: district?.district ?? available[0] ?? "",
    divisionName: district?.divisionName ?? "",
    managerName: district?.managerName ?? "",
    managerDesignation: district?.managerDesignation ?? designationOptions[0],
    officialPhone: district?.officialPhone ?? "",
    officialExtension: district?.officialExtension ?? "",
    controlRoomHotline: district?.controlRoomHotline ?? "",
  }));
  const [error, setError] = useState("");

  const set = <K extends keyof DistrictFormState>(key: K, value: DistrictFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!form.district) {
      setError("All jurisdiction districts already have an operational desk.");
      return;
    }
    if (!form.divisionName.trim() || !form.managerName.trim()) {
      setError("Division title and the nodal officer's full name are required.");
      return;
    }
    if (form.officialPhone.trim().length < 6 || form.controlRoomHotline.trim().length < 3) {
      setError("Enter a valid direct mobile number and control-room hotline.");
      return;
    }
    onSubmit({
      district: form.district,
      divisionName: form.divisionName.trim(),
      managerName: form.managerName.trim(),
      managerDesignation: form.managerDesignation,
      officialPhone: form.officialPhone.trim(),
      officialExtension: form.officialExtension.trim(),
      controlRoomHotline: form.controlRoomHotline.trim(),
    });
  };

  return (
    <ModalShell
      title={
        district
          ? `Edit Division & Manager — ${district.district}`
          : "Add District Division / Manager"
      }
      description={
        district
          ? `${agency.code} · ${district.divisionName}`
          : `Assign a nodal officer and 24/7 desk under ${agency.code}.`
      }
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          /* Enter in a text field must never implicitly submit — changes are
             saved explicitly via the modal's Save button. */
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
          }
        }}
      >
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="dm-district" className={labelClass}>
              Select District / City
            </label>
            <select
              id="dm-district"
              value={form.district}
              disabled={Boolean(district) || available.length === 0}
              onChange={(e) => set("district", e.target.value)}
              className={inputClass}
            >
              {form.district && !available.includes(form.district) && (
                <option value={form.district}>{form.district}</option>
              )}
              {available.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              {available.length === 0 && !district && (
                <option value="">All districts configured</option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dm-designation" className={labelClass}>
              Official Designation
            </label>
            <select
              id="dm-designation"
              value={form.managerDesignation}
              onChange={(e) => set("managerDesignation", e.target.value)}
              className={inputClass}
            >
              {designationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dm-division" className={labelClass}>
            Division / Circle Title
          </label>
          <input
            id="dm-division"
            value={form.divisionName}
            onChange={(e) => set("divisionName", e.target.value)}
            placeholder="e.g. Sialkot Urban Division"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dm-manager" className={labelClass}>
            Nodal Officer Full Name
          </label>
          <input
            id="dm-manager"
            value={form.managerName}
            onChange={(e) => set("managerName", e.target.value)}
            placeholder="e.g. Engr. Zahid Akhtar"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="dm-cell" className={labelClass}>
              Direct Mobile Number
            </label>
            <input
              id="dm-cell"
              value={form.officialPhone}
              onChange={(e) => set("officialPhone", e.target.value)}
              placeholder="+92 300 1234567"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dm-ext" className={labelClass}>
              Official Extension
            </label>
            <input
              id="dm-ext"
              value={form.officialExtension}
              onChange={(e) => set("officialExtension", e.target.value)}
              placeholder="e.g. 2611"
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dm-hotline" className={labelClass}>
            Central Control Room Hotline (24/7)
          </label>
          <input
            id="dm-hotline"
            value={form.controlRoomHotline}
            onChange={(e) => set("controlRoomHotline", e.target.value)}
            placeholder="e.g. 052-9250141"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
              <MapPin className="h-3.5 w-3.5" />
              Serves all of {form.district}
            </p>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-emerald-800/80">
              This division covers every area in {form.district} — no ward
              picking needed here. When you build field squads, you choose
              exactly which areas each crew operates from.
            </p>
          </div>
        </div>
        {district && onDelete && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Danger Zone
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-rose-600/90">
                  {district.openTickets > 0
                    ? `Blocked — resolve or reassign the ${district.openTickets} open ticket${
                        district.openTickets === 1 ? "" : "s"
                      } at this desk first.`
                    : `Removes the ${district.district} division with its ${
                        district.squads.length
                      } squad${district.squads.length === 1 ? "" : "s"} and ward assignments. You'll be asked to confirm.`}
                </p>
              </div>
              <button
                type="button"
                disabled={district.openTickets > 0}
                onClick={() => onDelete(agency.id, district.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Division
              </button>
            </div>
          </div>
        )}
        <ModalFooter
          onCancel={onClose}
          submitLabel={district ? "Save Division Details" : "Add Division & Manager"}
        />
      </form>
    </ModalShell>
  );
}

/* -------------------------- Modal 3: squad CRUD ---------------------------- */

type SquadFormState = {
  name: string;
  leadTechnician: string;
  phone: string;
  membersCount: number;
  roleClass: WorkforceClass;
  vehiclePlate?: string;
  wards?: string[];
  shift: SquadShift;
  status: SquadStatus;
};

function SquadModal({
  agency,
  district,
  sectorSlug,
  squad,
  onClose,
  onSubmit,
}: {
  agency: RegionalAgency;
  district: DistrictOperation;
  sectorSlug: string;
  /** Present → edit mode. */
  squad: FieldSquad | null;
  onClose: () => void;
  onSubmit: (data: SquadFormState) => void;
}) {
  const workforce = SECTOR_WORKFORCE[sectorSlug];
  const [name, setName] = useState(squad?.name ?? "");
  const [lead, setLead] = useState(squad?.leadTechnician ?? "");
  const [phone, setPhone] = useState(squad?.phone ?? "");
  const [members, setMembers] = useState(squad?.membersCount ?? 6);
  const [roleClass, setRoleClass] = useState<WorkforceClass>(squad?.roleClass ?? "worker");
  const [vehicle, setVehicle] = useState(squad?.vehiclePlate ?? "");
  const [shift, setShift] = useState<SquadShift>(squad?.shift ?? "morning");
  const [wards, setWards] = useState<string[]>(squad?.wards ?? []);
  /* Operational status — the same field in create and edit mode; the old
     create-only "Deployment Mode" split is gone. */
  const [status, setStatus] = useState<SquadStatus>(squad?.status ?? "active");
  const [error, setError] = useState("");

  const submit = () => {
    if (!name.trim() || !lead.trim()) {
      setError("Squad designation and the lead supervisor's name are required.");
      return;
    }
    if (phone.trim().length < 6) {
      setError("Enter the lead supervisor's mobile contact.");
      return;
    }
    onSubmit({
      name: name.trim(),
      leadTechnician: lead.trim(),
      phone: phone.trim(),
      membersCount: members,
      roleClass,
      vehiclePlate: vehicle.trim() || undefined,
      wards: wards.length ? wards : undefined,
      shift,
      status,
    });
  };

  return (
    <ModalShell
      title={squad ? `Edit Squad — ${squad.name}` : "Deploy Field Squad / Team"}
      description={`${agency.code} · ${district.divisionName} (${district.district})`}
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          /* Enter in a text field must never implicitly submit — changes are
             saved explicitly via the modal's Save button. */
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
          }
        }}
      >
        <FormError message={error} />
        <div className="space-y-1.5">
          <label htmlFor="sq-name" className={labelClass}>
            Squad Designation
          </label>
          <input
            id="sq-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cantt Drain Clearance Unit 02"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="sq-lead" className={labelClass}>
              Lead Supervisor / Foreman
            </label>
            <input
              id="sq-lead"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              placeholder="e.g. Tariq Butt"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sq-phone" className={labelClass}>
              Mobile Contact
            </label>
            <input
              id="sq-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92 300 1234567"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="sq-members" className={labelClass}>
              Workforce Count
            </label>
            <NumberStepper value={members} onChange={setMembers} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="sq-role" className={labelClass}>
              Workforce Classification
            </label>
            <select
              id="sq-role"
              value={roleClass}
              onChange={(e) => setRoleClass(e.target.value as WorkforceClass)}
              className={inputClass}
            >
              <option value="worker">{workforce?.worker ?? "Field Workers"}</option>
              <option value="skilled">{workforce?.skilled ?? "Skilled Operators"}</option>
              <option value="officer">{workforce?.officer ?? "Field Officers"}</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sq-vehicle" className={labelClass}>
            Assigned Vehicle Plate{" "}
            <span className="font-medium normal-case text-slate-400">(optional)</span>
          </label>
          <input
            id="sq-vehicle"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="e.g. SWM-4091"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Serving Areas</span>
          {/* Crew-level ward picking — the division itself stays district-wide.
              Whatever the crew picks here is stored on the squad only. */}
          <WardAreaEditor
            districtName={district.district}
            values={wards}
            onChange={setWards}
          />
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Active Duty Shift</span>
          <RadioPills
            groupLabel="Active duty shift"
            value={shift}
            onChange={setShift}
            options={SQUAD_SHIFTS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        {/* Operational status — identical field in create and edit mode */}
        <div className="space-y-1.5">
          <span className={labelClass}>Operational Status</span>
          <RadioPills
            groupLabel="Operational status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active in Field" },
              { value: "on_call", label: "Standby / On-Call" },
              { value: "off_duty", label: "Off-Duty" },
            ]}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          submitLabel={
            squad
              ? "Save Squad Changes"
              : status === "active"
                ? "Deploy Squad"
                : "Save to Roster"
          }
        />
      </form>
    </ModalShell>
  );
}

/* ------------------- Modal 5: destructive safety dialogs ------------------- */

function DeleteSquadModal({
  agency,
  district,
  squad,
  onClose,
  onConfirm,
}: {
  agency: RegionalAgency;
  district: DistrictOperation;
  squad: FieldSquad;
  onClose: () => void;
  /** Receives the inheriting squad's id when open tickets must move. */
  onConfirm: (reassignTo: string | null) => void;
}) {
  const tickets = squad.activeTickets ?? 0;
  const needsTarget = tickets > 0;
  /** Every other squad in the agency is an eligible inheritor — tickets can
      cross district desks since complaints belong to the agency's queue. */
  const inheritors = agency.districtOperations
    .flatMap((op) =>
      op.squads
        .filter((s) => s.id !== squad.id)
        .map((s) => ({ squad: s, district: op.district }))
    );
  const [target, setTarget] = useState("");
  const canConfirm = !needsTarget || (target !== "" && inheritors.length > 0);

  return (
    <ModalShell
      title={`Decommission Squad: ${squad.name}?`}
      description={`${agency.code} · ${district.divisionName} (${district.district})`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          This removes <span className="font-bold text-slate-900">{squad.name}</span>{" "}
          (lead {squad.leadTechnician}
          {squad.vehiclePlate ? `, vehicle ${squad.vehiclePlate}` : ""}) from the{" "}
          {district.district} roster. The action cannot be undone.
        </p>
        {needsTarget && (
          <>
            <AmberWarning
              message={`This squad still carries ${tickets} open ${
                tickets === 1 ? "ticket" : "tickets"
              }. Choose where they go — the hand-off happens the moment you confirm.`}
            />
            <div className="space-y-1.5">
              <label htmlFor="dsq-target" className={labelClass}>
                Reassign open tickets to
              </label>
              <select
                id="dsq-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose a squad…</option>
                {inheritors.map(({ squad: s, district: d }) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {d} ({(s.activeTickets ?? 0) + tickets} after)
                  </option>
                ))}
              </select>
              {inheritors.length === 0 && (
                <p className="text-[11px] font-medium text-slate-400">
                  No other squad exists in {agency.code} yet — register or
                  deploy one before decommissioning this crew.
                </p>
              )}
            </div>
          </>
        )}
        <ModalFooter
          onCancel={onClose}
          submitLabel="Confirm Decommission"
          danger
          disabled={!canConfirm}
          hint={
            needsTarget && !target
              ? "Choose where the open tickets go to enable decommissioning"
              : undefined
          }
        />
      </div>
    </ModalShell>
  );
}

function DeleteDivisionModal({
  agency,
  district,
  onClose,
  onConfirm,
}: {
  agency: RegionalAgency;
  district: DistrictOperation;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const tickets = district.openTickets;
  const squadCount = district.squads.length;
  const personnel = district.squads.reduce((n, s) => n + s.membersCount, 0);
  return (
    <ModalShell
      title={`Delete Division: ${district.district}?`}
      description={`${agency.code} · ${district.divisionName}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {tickets > 0 ? (
          <AmberWarning
            message={`${district.divisionName} still carries ${tickets} open ${
              tickets === 1 ? "complaint" : "complaints"
            }. Resolve or reassign them before deleting this division.`}
          />
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            “{district.divisionName}” will be permanently removed from{" "}
            {agency.code}. {squadCount} deployed {squadCount === 1 ? "squad" : "squads"} (
            {personnel} personnel) under {district.managerName} will also be
            decommissioned.
          </p>
        )}
        <ModalFooter
          onCancel={onClose}
          submitLabel="Confirm Delete"
          danger
          disabled={tickets > 0}
          hint={`Resolve or reassign ${tickets} open ${
            tickets === 1 ? "ticket" : "tickets"
          } before deleting this division`}
        />
      </div>
    </ModalShell>
  );
}

function ArchiveAgencyModal({
  sector,
  agency,
  onClose,
  onConfirm,
}: {
  sector: CoreSector;
  agency: RegionalAgency;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ops = agency.districtOperations;
  const squadCount = ops.reduce((n, op) => n + op.squads.length, 0);
  const personnel = ops.reduce(
    (n, op) => n + op.squads.reduce((m, s) => m + s.membersCount, 0),
    0
  );
  const tickets = ops.reduce((n, op) => n + op.openTickets, 0);
  return (
    <ModalShell
      title={`Archive / Decommission ${agency.code}?`}
      description={`${sector.name} · ${agency.fullName}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {tickets > 0 ? (
          <AmberWarning
            message={`${agency.code} still carries ${tickets} open ${
              tickets === 1 ? "complaint" : "complaints"
            } across its divisions. Resolve or reassign them before decommissioning the agency.`}
          />
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            Archiving removes {agency.code} from the {sector.name.toLowerCase()}{" "}
            registry and decommissions {ops.length}{" "}
            {ops.length === 1 ? "division" : "divisions"}, {squadCount}{" "}
            {squadCount === 1 ? "squad" : "squads"} ({personnel} personnel) and all
            dispatch integrations. Historical tickets remain in the archive.
          </p>
        )}
        <ModalFooter
          onCancel={onClose}
          submitLabel="Confirm Decommission"
          danger
          disabled={tickets > 0}
          hint={`Resolve ${tickets} open ${
            tickets === 1 ? "complaint" : "complaints"
          } first`}
        />
      </div>
    </ModalShell>
  );
}

/* ------------------------- Modal 6: agency API config ---------------------- */

function ApiModal({
  agency,
  onClose,
  onToast,
}: {
  agency: RegionalAgency;
  onClose: () => void;
  onToast: (tone: "success" | "error", message: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const key = apiKeyOf(agency.code);
  const endpoint = `https://api.sada-e-awam.pk/v1/agencies/${apiSlugOf(agency.code)}/incidents`;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable (insecure context) — still show feedback */
    }
    setCopied(label);
    onToast("success", `${label} copied to clipboard`);
  };

  const rowClass =
    "flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-3";

  return (
    <ModalShell
      title="Configure Agency API"
      description={`Dispatch feed credentials for ${agency.code} — control-room integrations.`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className={rowClass}>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Incidents Endpoint
            </p>
            <p className="truncate font-mono text-xs font-semibold text-slate-800">
              {endpoint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy(endpoint, "Endpoint")}
            aria-label="Copy incidents endpoint"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        {agency.webhookUrl && (
          <div className={rowClass}>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Agency Webhook (Live Sync)
              </p>
              <p className="truncate font-mono text-xs font-semibold text-slate-800">
                {agency.webhookUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copy(agency.webhookUrl!, "Webhook URL")}
              aria-label="Copy webhook URL"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className={rowClass}>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Agency API Key
            </p>
            <p className="truncate font-mono text-xs font-semibold text-slate-800">
              {revealed ? key : `sea_live_••••••••${key.slice(-4)}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? "Hide API key" : "Reveal API key"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => copy(key, "API key")}
              aria-label="Copy API key"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Dispatch events stream to the {agency.code} control room over this key.
          Rotating it invalidates agency-side tokens immediately.
        </p>

        <button
          type="button"
          onClick={() =>
            onToast(
              "success",
              `API key rotated for ${agency.code} — new key emailed to the nodal manager`
            )
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-amber-500/50 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rotate API Key
        </button>
      </div>
    </ModalShell>
  );
}

/* ------------------------------ Left pane rows ------------------------------ */

function AgencyRow({
  agency,
  selected,
  onSelect,
  onToggleReports,
}: {
  agency: RegionalAgency;
  selected: boolean;
  onSelect: () => void;
  onToggleReports: () => void;
}) {
  const reportsOn = agency.reportsEnabled !== false;
  /* Coverage = declared jurisdiction + districts where a desk actually runs,
     so a deployed desk still counts even while the declared list is empty. */
  const cityCount = agencyCoverageDistricts(agency).length;
  return (
    <li>
      <div
        className={`flex w-full items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5 transition-colors duration-150 ${
          selected ? "bg-emerald-50 ring-1 ring-emerald-200/70" : "hover:bg-white"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span
            className={`truncate text-xs ${
              selected ? "font-black text-emerald-900" : "font-bold text-slate-800"
            }`}
          >
            {agency.code}
          </span>
          {agency.maintenance && (
            <span
              aria-label="Maintenance mode"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            />
          )}
          <span
            title={`${cityCount} cit${
              cityCount === 1 ? "y" : "ies"
            } / districts under ${agency.code}`}
            className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-slate-500"
          >
            {cityCount} Cities
          </span>
        </button>
        {/* Report-intake switch — green means citizen complaints still route
            here; pause it for bodies that are standby or being reallocated. */}
        <button
          type="button"
          role="switch"
          aria-checked={reportsOn}
          aria-label={`Report intake for ${agency.code} — ${reportsOn ? "on" : "paused"}`}
          title={
            reportsOn
              ? `Taking reports for ${agency.code} — click to pause intake`
              : `Not taking reports for ${agency.code} — click to resume`
          }
          onClick={onToggleReports}
          className="flex h-7 shrink-0 items-center rounded-lg px-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
        >
          <span
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
              reportsOn ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                reportsOn ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </div>
    </li>
  );
}

function SectorSection({
  sector,
  open,
  onToggle,
  selectedAgencyId,
  onSelectAgency,
  onToggleReports,
}: {
  sector: CoreSector;
  open: boolean;
  onToggle: () => void;
  selectedAgencyId: string;
  onSelectAgency: (id: string) => void;
  onToggleReports: (id: string) => void;
}) {
  const Icon = SECTOR_ICONS[sector.icon] ?? SECTOR_ICON_FALLBACK;
  const hasSelected = sector.agencies.some((a) => a.id === selectedAgencyId);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`group/sector relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          open ? "bg-slate-100" : "hover:bg-slate-50"
        }`}
      >
        {/* Open-state accent bar — marks the expanded sector */}
        <span
          aria-hidden
          className={`absolute -left-px top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-shadow duration-200 ${
            SECTOR_ACCENTS[sector.id] ?? "bg-indigo-50 text-indigo-600"
          } ${open ? "ring-2 ring-primary/15" : ""}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">
            {sector.name}
          </span>
        </span>
        {/* Quiet marker: the currently-selected agency lives in this sector */}
        {hasSelected && (
          <span
            title="The agency currently open on the right lives here"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
          />
        )}
        {/* Agency roll-up bubble — emerald when the sector is populated. */}
        <span
          title={`${sector.agencies.length} ${sector.unit ?? "Agencies"} registered`}
          className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-colors duration-150 ${
            sector.agencies.length > 0
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {sector.agencies.length}
        </span>
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-white transition-all duration-200 ${
            open
              ? "border-slate-400 text-slate-700"
              : "border-slate-300 text-slate-500 group-hover/sector:border-slate-400 group-hover/sector:text-slate-700"
          }`}
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          {sector.agencies.length > 0 ? (
            <ul className="mx-1.5 mb-1.5 mt-1 space-y-0.5 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200/80">
              {sector.agencies.map((agency) => (
                <AgencyRow
                  key={agency.id}
                  agency={agency}
                  selected={agency.id === selectedAgencyId}
                  onSelect={() => onSelectAgency(agency.id)}
                  onToggleReports={() => onToggleReports(agency.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="mx-1.5 mb-1.5 mt-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200/80">
              No agencies registered under this sector yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Squads management grid ------------------------- */

const SQUAD_GRID =
  "grid grid-cols-[minmax(175px,1.4fr)_minmax(130px,0.9fr)_minmax(110px,0.85fr)_minmax(100px,0.75fr)_minmax(140px,1fr)_88px] items-center gap-x-3";

function SquadRow({
  squad,
  sectorSlug,
  sectorId,
  onEdit,
  onOpen,
  onDelete,
}: {
  squad: FieldSquad;
  sectorSlug: string;
  sectorId: string;
  onEdit: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const statusMeta = SQUAD_STATUS_META[squad.status];
  return (
    <li
      className={`group grid grid-cols-1 gap-3 px-3 py-3 transition-colors duration-150 hover:bg-slate-50/70 ${SQUAD_GRID}`}
    >
      {/* Squad name & assigned wards */}
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-900">{squad.name}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
          {squad.wards && squad.wards.length > 0
            ? squad.wards.join(", ")
            : "District-wide"}
        </p>
      </div>
      {/* Team lead & direct contact */}
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-700">
          {squad.leadTechnician}
        </p>
        <a
          href={`tel:${squad.phone.replace(/[^\d+]/g, "")}`}
          className="mt-0.5 inline-block truncate font-mono text-[10px] font-semibold text-slate-400 transition-colors duration-150 hover:text-emerald-700"
        >
          {squad.phone}
        </a>
      </div>
      {/* Workforce strength + domain role pill */}
      <div>
        <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
          {squad.membersCount}
        </p>
        <span
          className={`mt-0.5 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-bold ${SECTOR_WORKFORCE_PILLS[sectorId] ?? "bg-slate-100 text-slate-600"}`}
        >
          {workforceLabel(sectorSlug, squad)}
        </span>
      </div>
      {/* Logistics & vehicle */}
      <div>
        {squad.vehiclePlate ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700">
            <Truck className="h-3 w-3 text-slate-400" />
            {squad.vehiclePlate}
          </span>
        ) : (
          <p className="text-xs font-medium text-slate-300">—</p>
        )}
      </div>
      {/* Shift & operational status */}
      <div>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${statusMeta.pill}`}
        >
          <span className={statusMeta.dot} />
          {statusMeta.label}
        </span>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          {squad.shift ? shiftLabelOf(squad.shift) : "Shift unscheduled"}
        </p>
      </div>
      {/* Row actions — revealed on hover (always visible on touch widths) */}
      <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${squad.name}`}
          title="Edit squad"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-white hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${squad.name}`}
          title="Open squad details & tickets"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-white hover:text-slate-700 hover:ring-1 hover:ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        >
          <MapIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Decommission ${squad.name}`}
          title="Decommission squad"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 hover:ring-1 hover:ring-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/* ------------------------------- District card ------------------------------ */

function DistrictCard({
  sector,
  agency,
  op,
  expanded,
  onToggle,
  onOpenDesk,
  onAddSquad,
  onEditManager,
  onEditSquad,
  onOpenSquad,
  onDeleteSquad,
  onDeleteDivision,
  onReassignWards,
}: {
  sector: CoreSector;
  agency: RegionalAgency;
  op: DistrictOperation;
  expanded: boolean;
  onToggle: () => void;
  onOpenDesk: () => void;
  onAddSquad: () => void;
  onEditManager: () => void;
  onEditSquad: (squadId: string) => void;
  onOpenSquad: (squadId: string) => void;
  onDeleteSquad: (squadId: string) => void;
  onDeleteDivision: () => void;
  onReassignWards: () => void;
}) {
  const siblings = agency.districtOperations.length - 1;
  const activeSquads = op.squads.filter((s) => s.status === "active").length;
  const personnel = op.squads.reduce((n, s) => n + s.membersCount, 0);
  const settingsMenu: MenuItem[] = [
    {
      label: "Reassign All Wards to Another Division",
      icon: ArrowRightLeft,
      disabled: op.coverage.length === 0 || siblings === 0,
      reason:
        op.coverage.length === 0
          ? "No wards assigned to this division"
          : siblings === 0
            ? "No other division in this agency"
            : undefined,
      onSelect: onReassignWards,
    },
    {
      label: `View Open Incidents (${op.openTickets})`,
      icon: Activity,
      href: "/admin/triage",
    },
    {
      label: "Delete Division",
      icon: Trash2,
      danger: true,
      dividerBefore: true,
      disabled: op.openTickets > 0,
      reason:
        op.openTickets > 0
          ? `Resolve or reassign ${op.openTickets} open ${
              op.openTickets === 1 ? "ticket" : "tickets"
            } before deleting this division`
          : undefined,
      onSelect: onDeleteDivision,
    },
  ];

  return (
    <article
      className={`rounded-2xl border bg-white shadow-2xs transition-colors duration-150 ${
        expanded
          ? /* Focused — the open division tints softly emerald */
            "border-emerald-200/80 bg-emerald-50/30"
          : "border-slate-200/90 hover:border-slate-300/70"
      }`}
    >
      <div className="flex items-start gap-1.5 px-3 py-3 sm:px-4">
        {/* District monogram tile — instant visual anchor per division */}
        <span
          aria-hidden
          title={`${op.district} desk`}
          className={`mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black transition-shadow duration-200 ${
            SECTOR_ACCENTS[sector.id] ?? "bg-indigo-50 text-indigo-600"
          } ${expanded ? "ring-2 ring-primary/15" : ""}`}
        >
          {op.district.slice(0, 2).toUpperCase()}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-base font-bold text-slate-900">
                {op.district} District Division
              </span>
              {op.divisionNameUrdu && (
                <span className="urdu text-[11px] font-semibold text-slate-400">
                  {op.divisionNameUrdu}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <span
                title={`${activeSquads} active in field right now`}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
              >
                {op.squads.length} Squads · {personnel} personnel
              </span>
              <span
                title={
                  op.coverage.length > 0
                    ? op.coverage.join(", ")
                    : `District-wide — serves every area in ${op.district}`
                }
                className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200"
              >
                {op.coverage.length > 0
                  ? `${op.coverage.length} Coverage Area${op.coverage.length === 1 ? "" : "s"}`
                  : "District-wide"}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                {op.openTickets} Open Tickets
              </span>
            </span>
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block text-xs font-bold text-slate-800">{op.managerName}</span>
            <span className="block text-[10px] font-medium text-slate-400">
              {op.managerDesignation}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pt-1.5">
          <button
            type="button"
            onClick={onOpenDesk}
            title="Open the division desk — manage squads & coverage for this district"
            aria-label={`Open ${op.district} division desk`}
            className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            <MapIcon className="h-3 w-3" />
            Open Desk
          </button>
          <button
            type="button"
            onClick={onEditManager}
            aria-label={`Edit Division & Manager — ${op.district}`}
            title="Edit Division & Manager"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <KebabMenu menuLabel={`Division settings — ${op.district}`} items={settingsMenu} />
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${op.district} division`}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div
        className={`grid transition-all duration-200 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 rounded-b-2xl border-t border-slate-100 bg-slate-50/40 px-5 py-4">
          {/* Nodal manager & desk info box */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Users className="h-3 w-3" /> Nodal Manager
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">{op.managerName}</p>
              <p className="text-[11px] font-medium text-slate-500">
                {op.managerDesignation}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Phone className="h-3 w-3" /> Official Contact
              </p>
              <p className="mt-1 font-mono text-xs font-bold text-slate-800">
                {op.officialPhone}
                {op.officialExtension && (
                  <span className="ml-2 font-sans text-[10px] font-semibold text-slate-400">
                    Ext. {op.officialExtension}
                  </span>
                )}
              </p>
              <p className="font-mono text-[11px] font-semibold text-slate-500">
                Direct Hotline: {op.controlRoomHotline}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <MapPin className="h-3 w-3" /> Coverage
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">
                {op.coverage.length > 0
                  ? op.coverage.join(", ")
                  : `District-wide — every area in ${op.district}. Squads roster against the wards you assign them.`}
              </p>
            </div>
          </div>

          {/* Field squads management grid */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Field Squads Deployed ({op.squads.length})
              </p>
              <p className="text-[10px] font-semibold text-slate-400">
                {op.squads.reduce((n, s) => n + s.membersCount, 0)} personnel total
              </p>
            </div>
            {op.squads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-xs font-medium text-slate-400">
                No field squads deployed at this desk yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <ul className="min-w-[800px] divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                  <li
                    className={`${SQUAD_GRID} bg-slate-50/60 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-400`}
                  >
                    <span>Squad &amp; Wards</span>
                    <span>Lead &amp; Contact</span>
                    <span>Workforce</span>
                    <span>Logistics</span>
                    <span>Shift &amp; Status</span>
                    <span className="justify-self-end">Actions</span>
                  </li>
                  {op.squads.map((squad) => (
                    <SquadRow
                      key={squad.id}
                      squad={squad}
                      sectorSlug={sector.slug}
                      sectorId={sector.id}
                      onEdit={() => onEditSquad(squad.id)}
                      onOpen={() => onOpenSquad(squad.id)}
                      onDelete={() => onDeleteSquad(squad.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Card footer actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
            <button
              type="button"
              onClick={onAddSquad}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-tint px-3.5 py-2 text-xs font-bold text-primary ring-1 ring-primary/20 transition-colors duration-150 hover:bg-primary-soft/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Field Squad to {op.district}
            </button>
            <button
              type="button"
              onClick={onEditManager}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Manager Details
            </button>
            <Link
              href="/admin/triage"
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Activity className="h-3.5 w-3.5" />
              View Active Workload ({op.openTickets} Tickets)
            </Link>
          </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* --------------------------------- Console --------------------------------- */

type AgencyModalState = { mode: "create" } | { mode: "edit"; agencyId: string } | null;
type DistrictModalState = { agencyId: string; districtId: string | null } | null;
type SquadModalState = {
  agencyId: string;
  districtId: string;
  squadId: string | null;
} | null;
type DeleteSquadState = {
  agencyId: string;
  districtId: string;
  squadId: string;
} | null;
type DeleteDivisionState = { agencyId: string; districtId: string } | null;
type ReassignWardsState = { agencyId: string; districtId: string } | null;
type ArchiveAgencyState = { agencyId: string } | null;
type ToastState = { tone: "success" | "error"; message: string } | null;

export default function DepartmentManager() {
  /* The persisted registry — mutations land here and are pushed to the
     server store. `savedSectors` never carries rendered telemetry. */
  const [savedSectors, setSavedSectors] = useState<CoreSector[]>([]);
  const { raw: liveReportRows } = useLiveReports();
  /* Hydration guard — the persist effect must not overwrite stored edits
     with the fresh seed before the stored copy has been read. */
  const registryHydrated = useRef(false);
  /* The exact object the server last acknowledged — guards the persist
     effect against echoing freshly-synced state back to the API. */
  const registrySynced = useRef<CoreSector[] | null>(null);
  /* Display copy — the registry with live ledger telemetry (open/resolved
     complaint counts per division and agency) folded in. */
  const sectors = useMemo(
    () => withLiveTelemetry(savedSectors, liveReportRows),
    [savedSectors, liveReportRows],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      try {
        const { sectors: remote } = await fetchRegistry();
        if (cancelled) return;
        registrySynced.current = remote;
        if (!cancelled) setSavedSectors(remote);
      } catch {
        /* server unreachable — keep the current (empty) state */
      }
      registryHydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount — pulls the shared registry before edits are armed.
  }, []);

  useEffect(() => {
    /* Skip echoes: after a sync, `sectors` holds the exact object we just
       pulled; only genuine mutations produce a new identity worth pushing.
       Also never push before one successful sync — if hydration failed, the
       local state is still seed-derived and pushing it would wipe the
       shared store (squads included). */
    if (
      !registryHydrated.current ||
      registrySynced.current === null ||
      registrySynced.current === savedSectors
    )
      return;
    void pushRegistry(savedSectors).then((ok) => {
      if (ok) {
        registrySynced.current = savedSectors;
        announceRegistryUpdate();
      }
    });
  }, [sectors]);
  /* Agency focus rides the URL (?sector=power&agency=gepco) — same deep-link
     contract as the territories pages. Unknown ids degrade to the default. */
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [openSectors, setOpenSectors] = useState<Set<string>>(
    () => new Set(["power"])
  );
  const [search, setSearch] = useState("");
  /* Sidebar navigator mode: the sector roster accordion or the province
     coverage tree (which departments operate where). */
  const [sidebarMode, setSidebarMode] = useState<"sector" | "geo">("sector");
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(
    () => new Set(["gepco-skt"])
  );
  const [agencyModal, setAgencyModal] = useState<AgencyModalState>(null);
  const [districtModal, setDistrictModal] = useState<DistrictModalState>(null);
  const [squadModal, setSquadModal] = useState<SquadModalState>(null);
  const [deleteSquad, setDeleteSquad] = useState<DeleteSquadState>(null);
  const [deleteDivision, setDeleteDivision] = useState<DeleteDivisionState>(null);
  const [reassignWards, setReassignWards] = useState<ReassignWardsState>(null);
  const [archiveAgency, setArchiveAgency] = useState<ArchiveAgencyState>(null);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  /* URL is the selection source of truth — an unknown agency id (or an
     empty registry) leaves the deck empty instead of forcing a default. */
  const requestedAgencyId = searchParams.get("agency");
  const selectedAgencyId = sectors.some((s) =>
    s.agencies.some((a) => a.id === requestedAgencyId)
  )
    ? (requestedAgencyId as string)
    : "";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (tone: "success" | "error", message: string) =>
    setToast({ tone, message });

  /* ------------------------------- Lookups ------------------------------- */

  // Plain derivation — the React Compiler auto-memoizes this component and
  // rejects the manual useMemo wrapper here.
  let selected: { sector: CoreSector; agency: RegionalAgency } | null = null;
  for (const sector of sectors) {
    const agency = sector.agencies.find((a) => a.id === selectedAgencyId);
    if (agency) {
      selected = { sector, agency };
      break;
    }
  }

  const findAgencyContext = (agencyId: string) => {
    for (const sector of sectors) {
      const agency = sector.agencies.find((a) => a.id === agencyId);
      if (agency) return { sector, agency };
    }
    return null;
  };

  const findDistrict = (agency: RegionalAgency, districtId: string) =>
    agency.districtOperations.find((op) => op.id === districtId);

  const findSquad = (district: DistrictOperation, squadId: string) =>
    district.squads.find((s) => s.id === squadId);

  /* Division-desk focus rides the URL as well (?division=<op id>): when the
     param is present and valid for the selected agency, the agency deck is
     replaced by the full-page squad workbench for that one district. */
  const requestedDivisionId = searchParams.get("division");
  const focusedDivision =
    selected && requestedDivisionId
      ? findDistrict(selected.agency, requestedDivisionId)
      : undefined;
  /* Squad focus rides on top of the division (?squad=<id>): the desk is
     replaced by the full-page squad detail with its ticket queue. */
  const requestedSquadId = searchParams.get("squad");
  const focusedSquad =
    focusedDivision && requestedSquadId
      ? findSquad(focusedDivision, requestedSquadId)
      : undefined;
  const focusSectorId = selected?.sector.id;
  const focusAgencyId = selected?.agency.id;

  useEffect(() => {
    /* Stale ?division= (desk deleted, or the agency changed underneath) —
       canonicalize back to the plain agency deck. */
    if (!requestedDivisionId || focusedDivision || !focusSectorId || !focusAgencyId)
      return;
    router.replace(
      `${pathname}?sector=${focusSectorId}&agency=${focusAgencyId}`,
      { scroll: false }
    );
  }, [
    requestedDivisionId,
    focusedDivision,
    focusSectorId,
    focusAgencyId,
    router,
    pathname,
  ]);

  useEffect(() => {
    /* Stale ?squad= (squad deleted, or the division changed) — canonicalize
       back to the division desk. */
    if (!requestedSquadId || focusedSquad || !focusedDivision || !focusSectorId || !focusAgencyId)
      return;
    router.replace(
      `${pathname}?sector=${focusSectorId}&agency=${focusAgencyId}&division=${focusedDivision.id}`,
      { scroll: false }
    );
  }, [
    requestedSquadId,
    focusedSquad,
    focusedDivision,
    focusSectorId,
    focusAgencyId,
    router,
    pathname,
  ]);

  /* ------------------------- Left-pane filtering ------------------------- */

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  const visibleSectors = useMemo(() => {
    if (!searching) return sectors;
    return sectors
      .map((sector) => {
        const sectorHit =
          sector.name.toLowerCase().includes(query) ||
          sector.nameUrdu.includes(query);
        if (sectorHit) return sector;
        const agencies = sector.agencies.filter(
          (a) =>
            a.code.toLowerCase().includes(query) ||
            a.fullName.toLowerCase().includes(query) ||
            a.headquarters.toLowerCase().includes(query) ||
            agencyCoverageDistricts(a).some((d) => d.toLowerCase().includes(query))
        );
        return agencies.length === sector.agencies.length
          ? sector
          : { ...sector, agencies };
      })
      .filter(
        (sector) =>
          sector.name.toLowerCase().includes(query) ||
          sector.nameUrdu.includes(query) ||
          sector.agencies.length > 0
      );
  }, [sectors, searching, query]);

  const sectorIsOpen = (sectorId: string) => searching || openSectors.has(sectorId);

  /* Single-open accordion — expanding one sector folds the others so the
     rail never scrolls away from the row you're working in. */
  const toggleSector = (sectorId: string) =>
    setOpenSectors((prev) =>
      prev.has(sectorId) ? new Set<string>() : new Set([sectorId])
    );

  const selectAgency = (id: string) => {
    const parentSector = sectors.find((s) => s.agencies.some((a) => a.id === id));
    const agency = parentSector?.agencies.find((a) => a.id === id);
    if (parentSector && agency) {
      router.push(`${pathname}?sector=${parentSector.id}&agency=${agency.id}`, {
        scroll: false,
      });
      // Reveal the tier-2 accordion the selection lives in and expand its
      // first district desk so the right pane never opens fully collapsed.
      setOpenSectors(new Set([parentSector.id]));
      setExpandedDistricts(
        new Set(agency.districtOperations[0] ? [agency.districtOperations[0].id] : [])
      );
    }
  };

  /* Coverage-tree selection: a leaf opens its agency; the root clears back
     to the default deck. */
  const selectFromTree = (id: string | null) => {
    if (id) selectAgency(id);
    else router.replace(pathname, { scroll: false });
  };

  /* Drill into one district desk: the deck swaps to the division's squad
     workbench (?division=…). The desk stays expanded in the deck for when
     the user comes back. */
  const openDivisionDesk = (agencyId: string, divisionId: string) => {
    const parent = sectors.find((s) => s.agencies.some((a) => a.id === agencyId));
    if (!parent) return;
    router.push(
      `${pathname}?sector=${parent.id}&agency=${agencyId}&division=${divisionId}`,
      { scroll: false }
    );
    setExpandedDistricts((prev) => new Set(prev).add(divisionId));
  };

  const closeDivisionDesk = () => {
    if (!selected) return;
    router.push(
      `${pathname}?sector=${selected.sector.id}&agency=${selected.agency.id}`,
      { scroll: false }
    );
  };

  /* Squad-page focus rides on top of the division desk (?squad=<id>). */
  const openSquadPage = (agencyId: string, divisionId: string, squadId: string) => {
    const parent = sectors.find((s) => s.agencies.some((a) => a.id === agencyId));
    if (!parent) return;
    router.push(
      `${pathname}?sector=${parent.id}&agency=${agencyId}&division=${divisionId}&squad=${squadId}`,
      { scroll: false }
    );
  };

  const closeSquadPage = () => {
    if (!selected) return;
    router.push(
      `${pathname}?sector=${selected.sector.id}&agency=${selected.agency.id}&division=${focusedDivision?.id ?? ""}`,
      { scroll: false }
    );
  };

  /* Report-intake switch per agency — green means citizen complaints still
     route here; paused bodies stay selectable but stop receiving reports. */
  const toggleReports = (agencyId: string) => {
    const ctx = findAgencyContext(agencyId);
    if (!ctx) return;
    const enabling = ctx.agency.reportsEnabled === false;
    patchAgency(agencyId, (a) => ({ ...a, reportsEnabled: enabling }));
    notify(
      "success",
      enabling
        ? `Citizen reports are now routing to ${ctx.agency.code}`
        : `Report intake paused for ${ctx.agency.code}`
    );
  };

  /* ------------------------------ Mutations ------------------------------ */

  const patchAgency = (agencyId: string, patch: (a: RegionalAgency) => RegionalAgency) =>
    setSavedSectors((prev) =>
      prev.map((sector) => ({
        ...sector,
        agencies: sector.agencies.map((a) => (a.id === agencyId ? patch(a) : a)),
      }))
    );

  const patchDistrict = (
    agencyId: string,
    districtId: string,
    patch: (op: DistrictOperation) => DistrictOperation
  ) =>
    patchAgency(agencyId, (a) => ({
      ...a,
      districtOperations: a.districtOperations.map((op) =>
        op.id === districtId ? patch(op) : op
      ),
    }));

  /* — Tier 1: agencies — */

  const registerAgency = (data: AgencyFormState) => {
    const agency: RegionalAgency = {
      id: uid("agency"),
      code: data.code,
      fullName: data.fullName,
      headquarters: data.headquarters,
      hqAddress: data.hqAddress || undefined,
      descriptor: `Covering ${data.districts.join(", ")}`,
      province: data.province,
      jurisdictionDistricts: data.districts,
      status: data.status,
      controlHotline: data.controlHotline || undefined,
      dispatchEmail: data.dispatchEmail || undefined,
      webhookUrl: data.webhookUrl || undefined,
      reportsEnabled: data.status !== "standby",
      districtOperations: [],
    };
    setSavedSectors((prev) =>
      prev.map((sector) =>
        sector.id === data.sectorId
          ? { ...sector, agencies: [...sector.agencies, agency] }
          : sector
      )
    );
    setAgencyModal(null);
    // Select directly — selectAgency closes over the pre-insertion sectors
    // state and would fail to find the new agency's parent sector.
    router.push(`${pathname}?sector=${data.sectorId}&agency=${agency.id}`, {
      scroll: false,
    });
    setOpenSectors(new Set([data.sectorId]));
    setExpandedDistricts(new Set());
    notify("success", `${data.code} registered — configure its district divisions next`);
  };

  const updateAgency = (agencyId: string, data: AgencyFormState) => {
    patchAgency(agencyId, (a) => ({
      ...a,
      fullName: data.fullName,
      headquarters: data.headquarters,
      hqAddress: data.hqAddress || undefined,
      descriptor: `Covering ${data.districts.join(", ")}`,
      province: data.province,
      jurisdictionDistricts: data.districts,
      status: data.status,
      controlHotline: data.controlHotline || undefined,
      dispatchEmail: data.dispatchEmail || undefined,
      webhookUrl: data.webhookUrl || undefined,
    }));
    setAgencyModal(null);
    notify("success", `${data.code} details updated successfully`);
  };

  const toggleMaintenance = (agencyId: string) => {
    const context = findAgencyContext(agencyId);
    if (!context) return;
    const next = !context.agency.maintenance;
    patchAgency(agencyId, (a) => ({ ...a, maintenance: next }));
    notify(
      "success",
      next
        ? `${context.agency.code} dispatches paused — maintenance mode enabled`
        : `${context.agency.code} dispatches resumed`
    );
  };

  const confirmArchiveAgency = (agencyId: string) => {
    const context = findAgencyContext(agencyId);
    if (!context) return;
    const openTickets = context.agency.districtOperations.reduce(
      (n, op) => n + op.openTickets,
      0
    );
    if (openTickets > 0) {
      setArchiveAgency(null);
      notify("error", "Cannot delete agency with active complaints");
      return;
    }
    setSavedSectors((prev) =>
      prev.map((sector) => ({
        ...sector,
        agencies: sector.agencies.filter((a) => a.id !== agencyId),
      }))
    );
    setArchiveAgency(null);
    const fallback = sectors
      .flatMap((s) => s.agencies)
      .find((a) => a.id !== agencyId);
    if (fallback) selectAgency(fallback.id);
    else router.replace(pathname, { scroll: false });
    notify("success", `${context.agency.code} archived — registry updated`);
  };

  /* — Tier 2: district divisions — */

  const addDistrictDivision = (agencyId: string, data: DistrictFormState) => {
    const op: DistrictOperation = {
      id: uid("do"),
      // Empty coverage = district-wide — the desk serves every area in the
      // district; squads declare their own serving areas.
      coverage: [],
      ...data,
      openTickets: 0,
      resolvedTickets: 0,
      totalSquadsDeployed: 0,
      squads: [],
    };
    patchAgency(agencyId, (a) => ({
      ...a,
      districtOperations: [...a.districtOperations, op],
    }));
    setExpandedDistricts((prev) => new Set(prev).add(op.id));
    setDistrictModal(null);
    notify("success", `District division added to ${data.district} — nodal officer assigned`);
  };

  const updateDistrictDivision = (
    agencyId: string,
    districtId: string,
    data: DistrictFormState
  ) => {
    // data carries no coverage key — a division's coverage is district-wide
    // and any legacy ward lists on older divisions stay untouched.
    patchDistrict(agencyId, districtId, (op) => ({ ...op, ...data }));
    setDistrictModal(null);
    notify("success", `Division details updated for ${data.district}`);
  };

  const deleteDistrictDivision = (agencyId: string, districtId: string) => {
    const context = findAgencyContext(agencyId);
    const district = context && findDistrict(context.agency, districtId);
    if (!context || !district) return;
    if (district.openTickets > 0) {
      setDeleteDivision(null);
      notify("error", "Cannot delete division with active complaints");
      return;
    }
    patchAgency(agencyId, (a) => ({
      ...a,
      districtOperations: a.districtOperations.filter((op) => op.id !== districtId),
    }));
    setDeleteDivision(null);
    notify(
      "success",
      `District division “${district.district}” deleted from ${context.agency.code}`
    );
  };

  const reassignWardsToDivision = (
    agencyId: string,
    sourceId: string,
    targetId: string
  ) => {
    const context = findAgencyContext(agencyId);
    if (!context) return;
    const source = findDistrict(context.agency, sourceId);
    const target = findDistrict(context.agency, targetId);
    if (!source || !target || source.id === target.id) return;
    const moved = source.coverage.filter((w) => !target.coverage.includes(w));
    patchDistrict(agencyId, sourceId, (op) => ({ ...op, coverage: [] }));
    patchDistrict(agencyId, targetId, (op) => ({
      ...op,
      coverage: [...op.coverage, ...moved],
    }));
    setReassignWards(null);
    notify(
      "success",
      `${moved.length} ${moved.length === 1 ? "ward" : "wards"} reassigned to ${target.district} division`
    );
  };

  /* — Tier 3: field squads — */

  const addSquad = (
    agencyId: string,
    districtId: string,
    data: SquadFormState
  ) => {
    patchDistrict(agencyId, districtId, (op) => {
      const squads = [
        ...op.squads,
        {
          ...data,
          id: uid("sq"),
        } satisfies FieldSquad,
      ];
      /* Division coverage stays district-wide — squad serving areas live on
         the squads themselves, they don't shrink or redefine the desk. */
      return { ...op, squads, totalSquadsDeployed: squads.length };
    });
    setSquadModal(null);
    notify(
      "success",
      data.status === "active"
        ? `Field squad “${data.name}” deployed — status: Active in Field`
        : data.status === "on_call"
          ? `Field squad “${data.name}” saved to the on-call roster`
          : `Field squad “${data.name}” registered — status: Off-Duty`
    );
  };

  const updateSquad = (
    agencyId: string,
    districtId: string,
    squadId: string,
    data: SquadFormState
  ) => {
    patchDistrict(agencyId, districtId, (op) => ({
      ...op,
      squads: op.squads.map((s) => (s.id === squadId ? { ...s, ...data } : s)),
    }));
    setSquadModal(null);
    notify("success", `Field squad “${data.name}” updated successfully`);
  };

  /* Decommission with ticket hand-off: when the crew still carries open
     complaints, reassignTo names the squad that inherits them — the transfer
     and the removal happen in one atomic registry patch. */
  const decommissionSquad = (
    agencyId: string,
    districtId: string,
    squadId: string,
    reassignTo: string | null
  ) => {
    const context = findAgencyContext(agencyId);
    const district = context && findDistrict(context.agency, districtId);
    const squad = district && findSquad(district, squadId);
    if (!context || !district || !squad) return;
    const tickets = squad.activeTickets ?? 0;
    if (tickets > 0 && !reassignTo) {
      setDeleteSquad(null);
      notify(
        "error",
        `Pick a squad to take over “${squad.name}”'s ${tickets} open ticket${
          tickets === 1 ? "" : "s"
        } first`
      );
      return;
    }
    let targetName = "another squad";
    if (tickets > 0 && reassignTo) {
      const target = context.agency.districtOperations
        .flatMap((op) => op.squads)
        .find((s) => s.id === reassignTo);
      targetName = target?.name ?? "another squad";
    }
    // Agency-level patch — the inheriting squad may sit in another district.
    patchAgency(agencyId, (a) => ({
      ...a,
      districtOperations: a.districtOperations.map((op) => {
        if (op.id !== districtId) {
          return {
            ...op,
            squads: op.squads.map((s) =>
              s.id === reassignTo
                ? { ...s, activeTickets: (s.activeTickets ?? 0) + tickets }
                : s
            ),
          };
        }
        const squads = op.squads
          .filter((s) => s.id !== squadId)
          .map((s) =>
            s.id === reassignTo
              ? { ...s, activeTickets: (s.activeTickets ?? 0) + tickets }
              : s
          );
        return { ...op, squads, totalSquadsDeployed: squads.length };
      }),
    }));
    setDeleteSquad(null);
    notify(
      "success",
      tickets > 0
        ? `“${squad.name}” decommissioned — ${tickets} open ticket${
            tickets === 1 ? "" : "s"
          } moved to ${targetName}`
        : `Squad “${squad.name}” decommissioned`
    );
  };

  /* ------------------------------ Telemetry ------------------------------ */

  const telemetry = useMemo(() => {
    if (!selected) return null;
    const ops = selected.agency.districtOperations;
    const squads = ops.flatMap((op) => op.squads);
    /* Live ledger counts — the registry copy carries them folded in by
       withLiveTelemetry; fall back to the stored fields when absent. */
    const openTickets = selected.agency.liveOpen ?? ops.reduce((n, op) => n + op.openTickets, 0);
    const resolvedTickets =
      selected.agency.liveResolved ?? ops.reduce((n, op) => n + op.resolvedTickets, 0);
    return {
      servedDistricts: new Set(ops.map((op) => op.district.toLowerCase())).size,
      activeSquads: squads.filter((s) => s.status === "active").length,
      onCallSquads: squads.filter((s) => s.status === "on_call").length,
      totalSquads: squads.length,
      personnel: squads.reduce((n, s) => n + s.membersCount, 0),
      openTickets,
      resolvedTickets,
      closureRate:
        openTickets + resolvedTickets > 0
          ? Math.round((resolvedTickets / (openTickets + resolvedTickets)) * 100)
          : null,
      avgHours: selected.agency.avgResolutionHours,
    };
  }, [selected]);

  /* --------------------------- Modal bound data --------------------------- */

  const agencyCtx = (state: { agencyId: string }) => findAgencyContext(state.agencyId);

  const districtModalCtx = districtModal && agencyCtx(districtModal);
  const districtModalDistrict =
    districtModalCtx && districtModal.districtId
      ? findDistrict(districtModalCtx.agency, districtModal.districtId)
      : undefined;

  const squadModalCtx = squadModal && agencyCtx(squadModal);
  const squadModalDistrict =
    squadModalCtx && squadModal ? findDistrict(squadModalCtx.agency, squadModal.districtId) : undefined;
  const squadModalSquad =
    squadModalDistrict && squadModal?.squadId
      ? findSquad(squadModalDistrict, squadModal.squadId)
      : undefined;

  const deleteSquadCtx = deleteSquad && agencyCtx(deleteSquad);
  const deleteSquadDistrict =
    deleteSquadCtx && deleteSquad ? findDistrict(deleteSquadCtx.agency, deleteSquad.districtId) : undefined;
  const deleteSquadItem =
    deleteSquadDistrict && deleteSquad ? findSquad(deleteSquadDistrict, deleteSquad.squadId) : undefined;

  const deleteDivisionCtx = deleteDivision && agencyCtx(deleteDivision);
  const deleteDivisionDistrict =
    deleteDivisionCtx && deleteDivision
      ? findDistrict(deleteDivisionCtx.agency, deleteDivision.districtId)
      : undefined;

  const reassignWardsCtx = reassignWards && agencyCtx(reassignWards);
  const reassignWardsDistrict =
    reassignWardsCtx && reassignWards
      ? findDistrict(reassignWardsCtx.agency, reassignWards.districtId)
      : undefined;

  const archiveCtx = archiveAgency && agencyCtx(archiveAgency);

  const editAgencyCtx =
    agencyModal?.mode === "edit" ? findAgencyContext(agencyModal.agencyId) : null;

  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col gap-6 lg:flex-row">
      {/* ------------------------- LEFT: sector selector ------------------------- */}
      {/* Sticky navigator — stays pinned while the agency deck scrolls, and
          scrolls internally when the registry outgrows the viewport. */}
      <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-0 lg:max-h-[calc(100vh-140px)] lg:w-80 lg:overflow-y-auto lg:pb-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sectors or agencies..."
              aria-label="Search sectors or agencies"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setAgencyModal({ mode: "create" })}
            title="Register a new agency"
            aria-label="New Agency"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Navigator mode — sector roster or province coverage tree */}
        <div
          role="tablist"
          aria-label="Navigator mode"
          className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {(["sector", "geo"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={sidebarMode === mode}
              onClick={() => setSidebarMode(mode)}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                sidebarMode === mode
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {mode === "sector" ? (
                <>
                  By Sector{" "}
                  <span className="urdu text-[10px] font-medium text-slate-400">
                    سیکٹر
                  </span>
                </>
              ) : (
                <>
                  By Province{" "}
                  <span className="urdu text-[10px] font-medium text-slate-400">
                    صوبہ
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {sidebarMode === "sector" ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
            <p className="px-4 pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Core Sectors
            </p>
            {visibleSectors.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-xs font-medium text-slate-400">
                No sectors or agencies match “{search}”.
              </p>
            ) : (
              visibleSectors.map((sector) => (
                <div
                  key={sector.id}
                  className="mx-1 border-b border-slate-200/70 px-1.5 pb-1.5 pt-1 last:border-b-0"
                >
                  <SectorSection
                    sector={sector}
                    open={sectorIsOpen(sector.id)}
                    onToggle={() => toggleSector(sector.id)}
                    selectedAgencyId={selectedAgencyId}
                    onSelectAgency={selectAgency}
                    onToggleReports={toggleReports}
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
            <DepartmentGeoTree
              sectors={sectors}
              selectedAgencyId={selectedAgencyId}
              onSelectAgency={selectFromTree}
              query={search}
            />
          </div>
        )}

        <p className="px-1 text-[11px] font-medium leading-relaxed text-slate-400">
          Registry spans provincial DISCOs, waste companies, WASAs, emergency
          services and municipal councils. Standby bodies activate as pilot
          districts onboard.
        </p>
      </aside>

      {/* ------------------- RIGHT: district operations desk ------------------- */}
      <div className="@container min-w-0 flex-1 space-y-6">
        {!selected ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60">
            <p className="text-sm font-medium text-slate-400">
              Select an agency from the left to inspect its district operations.
            </p>
          </div>
        ) : focusedDivision && focusedSquad ? (
          /* ---- Tier 4 drill-down: one squad's detail + ticket queue ---- */
          <SquadPage
            sector={selected.sector}
            agency={selected.agency}
            op={focusedDivision}
            squad={focusedSquad}
            onBack={closeSquadPage}
            onEdit={() =>
              setSquadModal({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
                squadId: focusedSquad.id,
              })
            }
          />
        ) : focusedDivision ? (
          /* ------- Tier 3 drill-down: one district's squad workbench ------- */
          <DivisionDesk
            sector={selected.sector}
            agency={selected.agency}
            op={focusedDivision}
            onBack={closeDivisionDesk}
            onAddSquad={() =>
              setSquadModal({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
                squadId: null,
              })
            }
            onEditManager={() =>
              setDistrictModal({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
              })
            }
            onEditSquad={(squadId) =>
              setSquadModal({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
                squadId,
              })
            }
            onOpenSquad={(squadId) =>
              openSquadPage(selected.agency.id, focusedDivision.id, squadId)
            }
            onDeleteSquad={(squadId) =>
              setDeleteSquad({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
                squadId,
              })
            }
            onReassignWards={() =>
              setReassignWards({
                agencyId: selected.agency.id,
                districtId: focusedDivision.id,
              })
            }
          />
        ) : (
          <>
            {/* 1. Agency header banner */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
              {/* Provinces-pattern breadcrumb: module › sector › agency */}
              <nav
                aria-label="Department breadcrumb"
                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
              >
                <span>Departments</span>
                <span aria-hidden className="text-slate-300">
                  &gt;
                </span>
                <span>{selected.sector.name}</span>
                <span aria-hidden className="text-slate-300">
                  &gt;
                </span>
                <span className="font-bold text-emerald-800">
                  {selected.agency.code}
                </span>
              </nav>
              <div className="mt-2 flex flex-col gap-5 @2xl:flex-row @2xl:items-start @2xl:justify-between">
                <div className="flex min-w-0 gap-4">
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                      SECTOR_ACCENTS[selected.sector.id] ?? "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {(() => {
                      const Icon =
                        SECTOR_ICONS[selected.sector.icon] ?? SECTOR_ICON_FALLBACK;
                      return <Icon className="h-6 w-6" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className="text-2xl font-black tracking-tight text-slate-900">
                        {selected.agency.code}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${
                          AGENCY_STATUS_META[selected.agency.status].pill
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            AGENCY_STATUS_META[selected.agency.status].dot
                          }`}
                        />
                        {AGENCY_STATUS_META[selected.agency.status].label}
                      </span>
                      {selected.agency.maintenance && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                          <Pause className="h-3 w-3" />
                          Maintenance Mode
                        </span>
                      )}
                      {selected.agency.reportsEnabled === false && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                          <EyeOff className="h-3 w-3" />
                          Reports Paused
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-slate-700">
                      {selected.agency.fullName}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {selected.agency.descriptor}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 @lg:flex-row @lg:items-center @2xl:flex-col @2xl:items-stretch">
                  <button
                    type="button"
                    onClick={() =>
                      setDistrictModal({ agencyId: selected.agency.id, districtId: null })
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add District Division
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setApiModalOpen(true)}
                      className="min-w-0 flex-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    >
                      Configure Agency API
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgencyModal({ mode: "edit", agencyId: selected.agency.id })}
                      aria-label="Edit Agency Details"
                      title="Edit Agency Details"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <KebabMenu
                      menuLabel={`Agency settings — ${selected.agency.code}`}
                      items={[
                        {
                          label: "Download Deployment Roster (CSV / PDF)",
                          icon: Download,
                          onSelect: () => {
                            downloadRosterCsv(selected.sector.name, selected.agency);
                            notify(
                              "success",
                              `Deployment roster for ${selected.agency.code} exported — print the CSV to PDF if needed`
                            );
                          },
                        },
                        {
                          label: selected.agency.maintenance
                            ? "Resume Agency Dispatches"
                            : "Pause Agency Dispatches (Maintenance Mode)",
                          icon: selected.agency.maintenance ? Play : Pause,
                          onSelect: () => toggleMaintenance(selected.agency.id),
                        },
                        {
                          label: "Archive / Decommission Agency",
                          icon: Archive,
                          danger: true,
                          dividerBefore: true,
                          disabled:
                            selected.agency.districtOperations.reduce(
                              (n, op) => n + op.openTickets,
                              0
                            ) > 0,
                          reason:
                            selected.agency.districtOperations.reduce(
                              (n, op) => n + op.openTickets,
                              0
                            ) > 0
                              ? "Agency still carries open complaints"
                              : undefined,
                          onSelect: () =>
                            setArchiveAgency({ agencyId: selected.agency.id }),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Identity plate — headquarters, jurisdiction and reach */}
              <div className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 @xl:grid-cols-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <Building2 className="h-3 w-3" />
                    Headquarters
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-900">
                    HQ {selected.agency.headquarters}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-500">
                    {selected.agency.hqAddress ?? "Full address not on record yet"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <MapPin className="h-3 w-3" />
                    Jurisdiction
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-900">
                    {agencyCoverageDistricts(selected.agency).length}{" "}
                    {agencyCoverageDistricts(selected.agency).length === 1
                      ? "City"
                      : "Cities"}{" "}
                    / Districts
                  </p>
                  <p
                    title={agencyCoverageDistricts(selected.agency).join(", ")}
                    className="mt-0.5 truncate text-[11px] font-medium text-slate-500"
                  >
                    {agencyCoverageDistricts(selected.agency).join(", ") || "No district on record"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <Phone className="h-3 w-3" />
                    Reach
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-900">
                    {selected.agency.controlHotline ?? "—"}
                  </p>
                  {selected.agency.dispatchEmail ? (
                    <a
                      href={`mailto:${selected.agency.dispatchEmail}`}
                      className="mt-0.5 inline-block max-w-full truncate font-mono text-[11px] font-semibold text-slate-500 transition-colors duration-150 hover:text-emerald-700"
                    >
                      {selected.agency.dispatchEmail}
                    </a>
                  ) : (
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                      No dispatch email on record
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Agency metric strip — served geography, teams, ticket flow */}
            <section className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-4">
              {telemetry && (
                <>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Cities &amp; Districts Served
                      </p>
                      <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                      {telemetry.servedDistricts}
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-slate-400">
                      of {agencyCoverageDistricts(selected.agency).length} in
                      the agency&apos;s coverage
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Total Teams / Squads
                      </p>
                      <Truck className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                      {telemetry.totalSquads}
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-slate-400">
                      {telemetry.activeSquads} active · {telemetry.personnel}{" "}
                      personnel
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Open Complaints
                      </p>
                      <Activity className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                      {telemetry.openTickets}
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-slate-400">
                      {telemetry.avgHours != null
                        ? `Average resolution: ${telemetry.avgHours}h`
                        : "Resolution telemetry pending"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Resolved Complaints
                      </p>
                      <CircleCheck className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
                      {telemetry.resolvedTickets.toLocaleString()}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                      {telemetry.closureRate != null
                        ? `${telemetry.closureRate}% closure rate`
                        : "No closures recorded yet"}
                    </p>
                  </div>
                </>
              )}
            </section>

            {/* 3. District divisions & field teams */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-sm font-bold text-slate-900">
                    District Operations &amp; Field Teams
                  </h3>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
                    {selected.agency.districtOperations.length}{" "}
                    {selected.agency.districtOperations.length === 1
                      ? "Division"
                      : "Divisions"}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-400">
                  {telemetry?.totalSquads ?? 0} squads on ground ·{" "}
                  {telemetry?.personnel ?? 0} field personnel
                </p>
              </div>

              {selected.agency.districtOperations.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <Landmark className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      No district divisions configured yet
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      Add the first division under {selected.agency.code} to
                      assign a nodal manager and deploy field squads.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDistrictModal({ agencyId: selected.agency.id, districtId: null })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add District Division
                  </button>
                </div>
              ) : (
                selected.agency.districtOperations.map((op) => (
                  <DistrictCard
                    key={op.id}
                    sector={selected.sector}
                    agency={selected.agency}
                    op={op}
                    expanded={expandedDistricts.has(op.id)}
                    onToggle={() =>
                      setExpandedDistricts((prev) => {
                        const next = new Set(prev);
                        if (next.has(op.id)) next.delete(op.id);
                        else next.add(op.id);
                        return next;
                      })
                    }
                    onOpenDesk={() =>
                      openDivisionDesk(selected.agency.id, op.id)
                    }
                    onAddSquad={() =>
                      setSquadModal({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                        squadId: null,
                      })
                    }
                    onEditManager={() =>
                      setDistrictModal({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                      })
                    }
                    onEditSquad={(squadId) =>
                      setSquadModal({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                        squadId,
                      })
                    }
                    onOpenSquad={(squadId) =>
                      openSquadPage(selected.agency.id, op.id, squadId)
                    }
                    onDeleteSquad={(squadId) =>
                      setDeleteSquad({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                        squadId,
                      })
                    }
                    onDeleteDivision={() =>
                      setDeleteDivision({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                      })
                    }
                    onReassignWards={() =>
                      setReassignWards({
                        agencyId: selected.agency.id,
                        districtId: op.id,
                      })
                    }
                  />
                ))
              )}
            </section>
          </>
        )}
      </div>

      {/* -------------------------------- Modals -------------------------------- */}
      {agencyModal && (agencyModal.mode === "create" || editAgencyCtx) && (
        <AgencyModal
          key={`agency-${agencyModal.mode === "edit" ? agencyModal.agencyId : "new"}`}
          sectors={sectors}
          agency={agencyModal.mode === "edit" ? editAgencyCtx!.agency : null}
          onClose={() => setAgencyModal(null)}
          onCreate={registerAgency}
          onUpdate={updateAgency}
        />
      )}
      {districtModal && districtModalCtx && (
        <DistrictModal
          key={`${districtModal.agencyId}-${districtModal.districtId ?? "new"}`}
          agency={districtModalCtx.agency}
          sectorSlug={districtModalCtx.sector.slug}
          district={districtModalDistrict ?? null}
          onClose={() => setDistrictModal(null)}
          onSubmit={(data) =>
            districtModal.districtId
              ? updateDistrictDivision(districtModal.agencyId, districtModal.districtId, data)
              : addDistrictDivision(districtModal.agencyId, data)
          }
          onDelete={(agencyId, districtId) => {
            setDistrictModal(null);
            setDeleteDivision({ agencyId, districtId });
          }}
        />
      )}
      {squadModal && squadModalCtx && squadModalDistrict && (
        <SquadModal
          key={`${squadModal.agencyId}-${squadModal.districtId}-${squadModal.squadId ?? "new"}`}
          agency={squadModalCtx.agency}
          district={squadModalDistrict}
          sectorSlug={squadModalCtx.sector.slug}
          squad={squadModalSquad ?? null}
          onClose={() => setSquadModal(null)}
          onSubmit={(data) =>
            squadModal.squadId
              ? updateSquad(squadModal.agencyId, squadModal.districtId, squadModal.squadId, data)
              : addSquad(squadModal.agencyId, squadModal.districtId, data)
          }
        />
      )}
      {deleteSquad && deleteSquadCtx && deleteSquadDistrict && deleteSquadItem && (
        <DeleteSquadModal
          key={`del-squad-${deleteSquad.squadId}`}
          agency={deleteSquadCtx.agency}
          district={deleteSquadDistrict}
          squad={deleteSquadItem}
          onClose={() => setDeleteSquad(null)}
          onConfirm={(reassignTo) =>
            decommissionSquad(
              deleteSquad.agencyId,
              deleteSquad.districtId,
              deleteSquad.squadId,
              reassignTo
            )
          }
        />
      )}
      {deleteDivision && deleteDivisionCtx && deleteDivisionDistrict && (
        <DeleteDivisionModal
          key={`del-division-${deleteDivision.districtId}`}
          agency={deleteDivisionCtx.agency}
          district={deleteDivisionDistrict}
          onClose={() => setDeleteDivision(null)}
          onConfirm={() => deleteDistrictDivision(deleteDivision.agencyId, deleteDivision.districtId)}
        />
      )}
      {reassignWards && reassignWardsCtx && reassignWardsDistrict && (
        <ReassignWardsModal
          key={`reassign-wards-${reassignWards.districtId}`}
          agency={reassignWardsCtx.agency}
          source={reassignWardsDistrict}
          onClose={() => setReassignWards(null)}
          onConfirm={(targetId) =>
            reassignWardsToDivision(reassignWards.agencyId, reassignWards.districtId, targetId)
          }
        />
      )}
      {archiveCtx && (
        <ArchiveAgencyModal
          key={`archive-${archiveCtx.agency.id}`}
          sector={archiveCtx.sector}
          agency={archiveCtx.agency}
          onClose={() => setArchiveAgency(null)}
          onConfirm={() => confirmArchiveAgency(archiveCtx.agency.id)}
        />
      )}
      {apiModalOpen && selected && (
        <ApiModal
          agency={selected.agency}
          onClose={() => setApiModalOpen(false)}
          onToast={notify}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`animate-toast-rise fixed bottom-6 right-6 z-[80] flex max-w-sm items-start gap-2.5 rounded-2xl px-4 py-3 text-xs font-semibold text-white shadow-xl ${
            toast.tone === "error" ? "bg-rose-700" : "bg-slate-900"
          }`}
        >
          {toast.tone === "error" ? (
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <Check className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

/* -------------------- Modal 7: reassign wards to sibling -------------------- */

function ReassignWardsModal({
  agency,
  source,
  onClose,
  onConfirm,
}: {
  agency: RegionalAgency;
  source: DistrictOperation;
  onClose: () => void;
  onConfirm: (targetId: string) => void;
}) {
  const targets = agency.districtOperations.filter((op) => op.id !== source.id);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");

  return (
    <ModalShell
      title="Reassign All Wards to Another Division"
      description={`${agency.code} · ${source.divisionName} (${source.coverage.length} ${
        source.coverage.length === 1 ? "ward" : "wards"
      })`}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (targetId) onConfirm(targetId);
        }}
      >
        <p className="text-sm leading-relaxed text-slate-600">
          All ward coverage currently assigned to {source.divisionName}
          {source.coverage.length > 0 ? (
            <>
              {" "}
              (<span className="font-semibold text-slate-800">{source.coverage.join(", ")}</span>)
            </>
          ) : null}{" "}
          will move to the selected division. Deployed squads stay in place —
          re-roster them afterwards if needed.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="rw-target" className={labelClass}>
            Target Division
          </label>
          <select
            id="rw-target"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={inputClass}
          >
            {targets.map((op) => (
              <option key={op.id} value={op.id}>
                {op.district} — {op.divisionName}
              </option>
            ))}
          </select>
        </div>
        <ModalFooter
          onCancel={onClose}
          submitLabel="Reassign Wards"
          disabled={!targetId || source.coverage.length === 0}
          hint={source.coverage.length === 0 ? "No wards assigned to this division" : undefined}
        />
      </form>
    </ModalShell>
  );
}
