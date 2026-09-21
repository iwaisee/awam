"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Car,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Copy,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  X,
} from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import { slaRemainingLabel } from "@/lib/trackDossiers";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import { announceRegistryUpdate, pushRegistry } from "@/lib/registryClient";
import type { CoreSector } from "@/data/departmentRegistry";
import { shiftLabelOf, workforceLabel } from "@/components/admin/departmentMeta";
import { ACCESS_CODE_PATTERN } from "@/lib/squadFields";
import { WardAreaEditor } from "@/components/admin/DepartmentManager";

/* ----------------------------------------------------------------------------
 * Field Dispatch — Municipal Operations Command Center (/admin/field-gateway).
 * Icon-anchored KPI dock + two full-width sub-tabs (Dispatch & Work Orders /
 * Mobile Squads & Fleet). Dispatching PATCHes /api/reports with the assigned
 * squad + timestamp, so the triage table and public /track dossiers follow.
 * -------------------------------------------------------------------------- */

type UnitStatus = "on_site" | "en_route" | "idle" | "off_duty";

const UNIT_STATUS: Record<
  UnitStatus,
  { label: string; emoji: string; pill: string }
> = {
  on_site: {
    label: "On-Site",
    emoji: "🟢",
    pill: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  },
  en_route: {
    label: "En Route",
    emoji: "🟡",
    pill: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  },
  idle: {
    label: "Available / Idle",
    emoji: "⚪",
    pill: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  },
  off_duty: {
    label: "Off-Duty",
    emoji: "⚫",
    pill: "bg-slate-100 text-slate-500 ring-1 ring-slate-300",
  },
};

/** Ledger agency strings each sector's filter chip covers. Mirrors the
    registry's agency codes (departmentRegistry.ts) so a ticket filed under
    any department routes to its sector's crews. */
const LEDGER_SECTOR_MATCH: Record<string, string[]> = {
  power: ["GEPCO", "LESCO", "IESCO", "FESCO", "MEPCO", "PESCO", "HAZECO", "TESCO", "HESCO", "SEPCO", "QESCO"],
  waste: ["SWMC", "LWMC", "GWMC", "RWMC", "FWMC", "SSWMB"],
  water: ["WASA", "KW&SC", "WSSC"],
  emergency: ["Rescue", "PDMA"],
  traffic: ["CTP", "TEPA", "Traffic"],
  municipal: ["MCS", "Municipal Corporation", "Cantonment", "Cantt", "CB", "MCL", "CDA"],
  roads: ["C&W", "Highways", "MCL Roads"],
  horticulture: ["PHA", "Parks", "Horticulture"],
  gas: ["SNGPL"],
};

/** Does a triage ticket's ledger agency string belong to this sector?
    Unknown slugs ("all", or a future sector) never hide tickets. */
function sectorMatches(sectorSlug: string, ledgerAgency: string): boolean {
  const needles = LEDGER_SECTOR_MATCH[sectorSlug];
  if (!needles) return true;
  const haystack = ledgerAgency.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

interface FieldUnit {
  id: string;
  name: string;
  vehicle: string;
  vehicleShort: string;
  reg: string;
  /** Owning registry agency's code (e.g. "SWMC", "WASA-SKT"). */
  agency: string;
  /** Sector slug of the owning agency (drives the department filter chips). */
  sector: string;
  /** Division district — the fallback territory for district-wide crews. */
  district: string;
  crewLead: string;
  crewDetail: string;
  phone: string;
  zoneAnchor: string;
  zoneShort: string;
  status: UnitStatus;
  activeJob: ActiveJob | null;
  completed: number;
  capacity: number;
  /** Registry linkage — the owning division and the crew's serving wards. */
  divisionId?: string;
  wards?: string[];
  /** Roster details mirrored from the registry squad (departments-card parity). */
  shiftLabel?: string;
  workforce?: string;
  activeTickets?: number;
}

interface ActiveJob {
  title: string;
  token?: string;
}

function squadId(): string {
  return `sq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildUnits(
  sectors: CoreSector[],
  reports: IncidentReport[],
  overlays: Record<string, Partial<FieldUnit>>,
): FieldUnit[] {
  const units: FieldUnit[] = [];
  for (const sector of sectors) {
    for (const agency of sector.agencies) {
      for (const op of agency.districtOperations) {
        for (const sq of op.squads) {
          const assigned = (r: IncidentReport) =>
            (r.assigned_unit ?? "").toLowerCase() === sq.name.toLowerCase();
          const active = reports.filter(
            (r) =>
              assigned(r) &&
              (r.status === "dispatched" || r.status === "in_progress"),
          );
          const job = active[0];
          const completed = reports.filter(
            (r) => assigned(r) && r.status === "resolved",
          ).length;
          const base: FieldUnit = {
            id: sq.id,
            divisionId: op.id,
            wards: sq.wards ?? [],
            name: sq.name,
            vehicle: sq.vehiclePlate ?? "Unassigned vehicle",
            vehicleShort: sq.vehiclePlate?.split(/[-\u2013]/)[0]?.trim() ?? "—",
            reg: sq.vehiclePlate ?? "—",
            agency: agency.code,
            sector: sector.slug,
            district: op.district,
            crewLead: sq.leadTechnician,
            crewDetail: `${sq.membersCount} personnel`,
            phone: sq.phone,
            zoneAnchor: sq.wards?.length
              ? sq.wards.join(", ")
              : `District-wide · ${op.district}`,
            zoneShort: sq.wards?.[0] ?? op.district,
            // Derived from the ledger — tasked crews show en route / on site.
            status: job
              ? job.status === "in_progress"
                ? "on_site"
                : "en_route"
              : sq.status === "off_duty"
                ? "off_duty"
                : "idle",
            activeJob: job ? { title: job.category_title, token: job.tracking_token } : null,
            completed,
            capacity: Math.max(1, sq.membersCount),
            shiftLabel: sq.shift ? shiftLabelOf(sq.shift) : undefined,
            workforce: workforceLabel(sector.slug, sq),
            activeTickets: (sq.activeTickets ?? 0) + active.length,
          };
          units.push({ ...base, ...(overlays[sq.id] ?? {}) });
        }
      }
    }
  }
  return units;
}

interface DispatchCandidate {
  id: string;
  agency: string;
  title: string;
  area: string;
  /** Raw territory fields — drive the crew serving-area match. */
  areaName: string;
  cityName: string;
  urgency: IncidentReport["urgency"];
  slaDeadlineMs: number;
  ageLabel: string;
  description: string;
  tags: string[];
}

function toCandidate(r: IncidentReport): DispatchCandidate {
  return {
    id: r.id,
    agency: r.assigned_agency,
    title: r.category_title,
    area: [r.area_name, r.city_name].filter(Boolean).join(", "),
    areaName: r.area_name,
    cityName: r.city_name,
    urgency: r.urgency,
    slaDeadlineMs: new Date(r.sla_deadline).getTime(),
    ageLabel: ageLabel(r.created_at),
    description: r.description,
    tags: r.selected_tags ?? [],
  };
}

function ageLabel(iso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* Registry writes from the gateway — a squad registered here lands in the
   first division of its agency (the departments console can move it later). */

/** Issue/rotate the /squad sign-in credential for a crew (server-side store). */
async function putSquadAccessCode(
  squadId: string,
  code: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/squad/access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squadId, code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function addSquadToRegistry(
  sectors: CoreSector[],
  unit: FieldUnit,
): CoreSector[] | null {
  const agency = sectors
    .flatMap((s) => s.agencies)
    .find((a) => a.code === unit.agency);
  if (!agency || agency.districtOperations.length === 0) return null;
  const next: CoreSector[] = structuredClone(sectors);
  const target = next.flatMap((s) => s.agencies).find((a) => a.id === agency.id);
  if (!target) return null;
  target.districtOperations[0]?.squads.push({
    id: squadId(),
    name: unit.name,
    leadTechnician: unit.crewLead,
    phone: unit.phone,
    membersCount: Math.max(1, unit.capacity),
    vehiclePlate: unit.reg !== "—" ? unit.reg : undefined,
    status: unit.status === "off_duty" ? "off_duty" : "active",
  });
  return next;
}

function updateSquadInRegistry(
  sectors: CoreSector[],
  unit: FieldUnit,
): CoreSector[] | null {
  const next: CoreSector[] = structuredClone(sectors);
  const squads = next.flatMap((s) =>
    s.agencies.flatMap((a) => a.districtOperations.flatMap((op) => op.squads)),
  );
  const squad = squads.find((s) => s.id === unit.id);
  if (!squad) return null;
  squad.name = unit.name;
  squad.leadTechnician = unit.crewLead;
  squad.phone = unit.phone;
  squad.membersCount = Math.max(1, unit.capacity);
  squad.vehiclePlate = unit.reg !== "—" ? unit.reg : undefined;
  squad.status = unit.status === "off_duty" ? "off_duty" : "active";
  squad.wards = unit.wards?.length ? unit.wards : undefined;
  return next;
}

function categoryUrdu(title: string): string | null {
  const t = title.toLowerCase();
  if (/sanita|waste|garbage|dump/.test(t)) return "صفائی کا مسئلہ";
  if (/drain|sewer|water|manhole|pipeline/.test(t)) return "نکاسی آب کا مسئلہ";
  if (/electric|power|cable|light/.test(t)) return "بجلی کا مسئلہ";
  if (/road|street|footpath|crater/.test(t)) return "سڑک کا مسئلہ";
  return null;
}

function categoryUrduShort(title: string): string | null {
  const t = title.toLowerCase();
  if (/sanita|waste|garbage|dump/.test(t)) return "صفائی";
  if (/drain|sewer|water|manhole|pipeline/.test(t)) return "نکاسی آب";
  if (/electric|power|cable|light/.test(t)) return "بجلی";
  if (/road|street|footpath|crater/.test(t)) return "سڑک";
  return null;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

/** Stable pseudo geo-distance (400–1800m) per ticket↔unit pair. */
function pseudoDistanceMeters(candidateId: string, unitId: string): number {
  let hash = 0;
  const key = candidateId + unitId;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return 400 + (hash % 29) * 50;
}

function scoreUnit(candidate: DispatchCandidate, unit: FieldUnit): number {
  const agencyMatch = sectorMatches(unit.sector, candidate.agency) ? 120 : 0;
  const zoneWords = candidate.area
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const zoneOverlap =
    zoneWords.filter((w) => unit.zoneAnchor.toLowerCase().includes(w)).length *
    25;
  const availability =
    unit.status === "off_duty"
      ? -500
      : unit.status === "idle"
        ? 30
        : unit.status === "en_route"
          ? -10
          : 0;
  return (
    agencyMatch +
    zoneOverlap +
    availability -
    pseudoDistanceMeters(candidate.id, unit.id) / 50
  );
}

/** Territory rule — a crew covers the report only when one of its serving
    wards names the reported area (exact, or a substring match in either
    direction, guarded against short fragments). A crew with no wards is a
    district-wide desk and covers every area in its division's district. */
function unitServesReport(
  unit: FieldUnit,
  areaName: string,
  cityName: string,
): boolean {
  const area = areaName.trim().toLowerCase();
  if (!area) return true;
  if (unit.wards && unit.wards.length > 0) {
    return unit.wards.some((ward) => {
      const w = ward.trim().toLowerCase();
      if (!w) return false;
      return (
        w === area ||
        (w.length >= 4 && area.includes(w)) ||
        (area.length >= 4 && w.includes(area))
      );
    });
  }
  return unit.district.trim().toLowerCase() === cityName.trim().toLowerCase();
}

/** Shared popover plumbing: outside-click + Escape dismissal. */
function usePopoverDismiss(
  open: boolean,
  close: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, ref]);
}

/** Shared modal plumbing: Escape dismissal. */
function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}

type SubTab = "queue" | "squads";

export default function FieldGatewayView() {
  const [subTab, setSubTab] = useState<SubTab>("queue");
  const { sectors } = useDepartmentRegistry();
  const [reports, setReports] = useState<IncidentReport[] | null>(null);
  /* Session overlays (status flips, zone edits, modal edits) ride on top of
     the registry-derived roster and survive ledger re-syncs until reload. */
  const [overlays, setOverlays] = useState<Record<string, Partial<FieldUnit>>>({});
  const units = useMemo(
    () => buildUnits(sectors, reports ?? [], overlays),
    [sectors, reports, overlays],
  );
  const [agencyFilter, setAgencyFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<FieldUnit | null>(null);
  const [zoneUnit, setZoneUnit] = useState<FieldUnit | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  // SLA / overdue badges stay honest with a slow tick.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshReports = async () => {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const data: unknown = await response.json();
      setReports(Array.isArray(data) ? (data as IncidentReport[]) : []);
    } catch {
      setReports([]);
    }
  };

  /* Initial ledger load — setState runs inside the fetch callbacks (an
     external-system subscription), never synchronously in the effect body. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${response.status}`))
      )
      .then((data: unknown) => {
        if (!cancelled)
          setReports(Array.isArray(data) ? (data as IncidentReport[]) : []);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeUnits = units.filter((u) => u.status !== "off_duty");
  const onSiteCount = units.filter((u) => u.status === "on_site").length;
  const offDutyCount = units.filter((u) => u.status === "off_duty").length;
  /** Department chips mirror the sectors that actually field squads. */
  const departmentFilters = useMemo(
    () =>
      sectors
        .filter((s) => units.some((u) => u.sector === s.slug))
        .map((s) => ({ key: s.slug, label: s.name })),
    [sectors, units],
  );
  /* Executive KPI dock — every figure derives from the live ledger:
     dispatch latency from filed→dispatched stamps, today's closures from
     resolution stamps, and the geotag rate from report coordinates. */
  const kpi = useMemo(() => {
    const rows = reports ?? [];
    const arrivals = rows.flatMap((r) =>
      r.dispatched_at
        ? [
            (new Date(r.dispatched_at).getTime() -
              new Date(r.created_at).getTime()) /
              60_000,
          ]
        : [],
    );
    const avgArrivalMin = arrivals.length
      ? Math.round(arrivals.reduce((sum, m) => sum + m, 0) / arrivals.length)
      : null;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const fixedToday = rows.filter((r) => {
      if (!r.resolved_at) return false;
      const resolvedOn = new Date(r.resolved_at);
      return !Number.isNaN(resolvedOn.getTime()) && resolvedOn >= dayStart;
    }).length;
    const geotaggedPct = rows.length
      ? Math.round(
          (rows.filter((r) => r.coordinates).length / rows.length) * 100,
        )
      : null;
    return { avgArrivalMin, fixedToday, geotaggedPct };
  }, [reports]);

  const candidates = useMemo(
    () =>
      reports?.filter((r) => r.status === "triage").map(toCandidate) ?? null,
    [reports],
  );
  const pendingCount = candidates?.length ?? 0;
  const activeDispatches = useMemo(
    () =>
      reports
        ?.filter((r) => r.status === "dispatched" || r.status === "in_progress")
        .sort((a, b) => {
          const at = a.dispatched_at ?? a.created_at;
          const bt = b.dispatched_at ?? b.created_at;
          return bt.localeCompare(at);
        }) ?? [],
    [reports],
  );

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    const needle = search.trim().replace(/^#/, "").toLowerCase();
    return candidates.filter((c) => {
      if (!sectorMatches(agencyFilter, c.agency)) return false;
      if (!needle) return true;
      return (
        c.id.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        c.area.toLowerCase().includes(needle)
      );
    });
  }, [candidates, agencyFilter, search]);

  const setStatus = (unitId: string, status: UnitStatus) => {
    setOverlays((prev) => {
      const current = { ...(units.find((u) => u.id === unitId) ?? {}), ...prev[unitId] };
      return {
        ...prev,
        [unitId]: {
          ...prev[unitId],
          status,
          // Parked squads hand their job slot back.
          activeJob: status === "idle" || status === "off_duty" ? null : current.activeJob,
        },
      };
    });
  };

  const patchTicket = async (
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const dispatchTicket = (candidate: DispatchCandidate, unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;

    // Optimistic queue update…
    setReports(
      (prev) =>
        prev?.map((r) =>
          r.id === candidate.id
            ? {
                ...r,
                status: "dispatched" as const,
                dispatched_at: new Date().toISOString(),
                assigned_unit: unit.name,
                assigned_agency: unit.agency,
              }
            : r,
        ) ?? prev,
    );
    // The roster derives status + active job from the ledger, so the tasked
    // crew lights up as en route as soon as the sync lands.
    setToast(`✓ Work order ${candidate.id} dispatched to ${unit.name}.`);

    // …then persist (assigned_agency rides along so every ledger consumer —
    // department telemetry, /track, triage — agrees on the owning department).
    void (async () => {
      await patchTicket(candidate.id, {
        status: "dispatched",
        assigned_unit: unit.name,
        assigned_agency: unit.agency,
      });
      void refreshReports();
    })();
  };

  const reassignTicket = (report: IncidentReport) => {
    setReports(
      (prev) =>
        prev?.map((r) =>
          r.id === report.id
            ? {
                ...r,
                status: "triage" as const,
                dispatched_at: undefined,
                assigned_unit: undefined,
              }
            : r,
        ) ?? prev,
    );
    // The roster's job slot clears when the ledger sync lands.
    setToast(`↩ ${report.id} returned to the dispatch queue.`);

    void (async () => {
      await patchTicket(report.id, { status: "triage" });
      void refreshReports();
    })();
  };

  const assignSquadToReport = (report: IncidentReport, unit: FieldUnit) => {
    setReports(
      (prev) =>
        prev?.map((r) =>
          r.id === report.id
            ? { ...r, assigned_unit: unit.name, assigned_agency: unit.agency }
            : r,
        ) ?? prev,
    );
    setToast(`✓ ${report.id} assigned to ${unit.name}.`);
    void (async () => {
      await patchTicket(report.id, {
        status: report.status,
        assigned_unit: unit.name,
        assigned_agency: unit.agency,
      });
      void refreshReports();
    })();
  };

  return (
    <div className="mx-auto max-w-7xl pb-12">
      {/* ============ Executive header (scrolls with the panel — nothing
          tucks underneath it, so filters and cards are never cropped) ============ */}
      <div className="mb-8">
        {/* Icon-anchored civic telemetry dock */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Truck className="h-4.5 w-4.5" />}
            iconTone="bg-emerald-50 text-emerald-800"
            badge={
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-800">
                🟢 {onSiteCount} On-Site • {offDutyCount} Off-Duty
              </span>
            }
            value={`${units.length} Total Squads`}
            sub={
              <>
                Active Field Units •{" "}
                <span className="font-semibold text-emerald-800/80">
                  فعال موبائل ٹیمیں
                </span>
              </>
            }
          />
          <KpiCard
            icon={<ClipboardList className="h-4.5 w-4.5" />}
            iconTone="bg-amber-50 text-amber-800"
            badge={
              pendingCount > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-800">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
                  />
                  ⚠️ Action Needed
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-800">
                  ✓ Queue Clear
                </span>
              )
            }
            value={`${pendingCount} Unassigned`}
            sub={
              <>
                Awaiting Dispatch •{" "}
                <span className="font-semibold text-emerald-800/80">
                  زیر التواء کام
                </span>
              </>
            }
          />
          <KpiCard
            icon={<Clock3 className="h-4.5 w-4.5" />}
            iconTone="bg-blue-50 text-blue-700"
            badge={
              <span className="inline-flex shrink-0 items-center rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-blue-700">
                Target: &lt;30m
              </span>
            }
            value={
              kpi.avgArrivalMin != null
                ? formatDurationMinutes(kpi.avgArrivalMin)
                : "—"
            }
            sub={
              <>
                Avg Filed → Dispatched •{" "}
                <span className="font-semibold text-emerald-800/80">
                  اوسط رسپانس وقت
                </span>
              </>
            }
          />
          <KpiCard
            icon={<ShieldCheck className="h-4.5 w-4.5" />}
            iconTone="bg-emerald-50 text-emerald-800"
            badge={
              <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-800">
                {kpi.geotaggedPct != null
                  ? `${kpi.geotaggedPct}% Geotagged`
                  : "Geotag —"}
              </span>
            }
            value={`${kpi.fixedToday} Fixed Today`}
            sub={
              <>
                Resolved Today •{" "}
                <span className="font-semibold text-emerald-800/80">
                  آج کے حل شدہ مسائل
                </span>
              </>
            }
          />
        </div>

        {/* Sub-tab switcher with contextual action */}
        <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-slate-100/80 p-1">
            <SubTabButton
              active={subTab === "queue"}
              onClick={() => setSubTab("queue")}
              icon={<ClipboardList className="h-4 w-4 text-emerald-700" />}
              label="Dispatch & Work Orders"
              badge={
                pendingCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {pendingCount} Action Needed
                  </span>
                ) : null
              }
            />
            <SubTabButton
              active={subTab === "squads"}
              onClick={() => setSubTab("squads")}
              icon={<Truck className="h-4 w-4 text-emerald-700" />}
              label="Mobile Squads & Fleet"
              badge={
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {units.length} Units
                </span>
              }
            />
          </div>

          <div>
            {subTab === "queue" ? (
              <button
                type="button"
                onClick={() => setBroadcastOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white shadow-xs transition-colors duration-150 hover:bg-slate-800"
              >
                <Radio className="h-3.5 w-3.5 animate-pulse text-amber-400" />
                Broadcast Priority Alert
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRegisterOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
              >
                <Plus className="h-3.5 w-3.5" />
                Register New Field Unit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============ Sub-tab 1: dispatch queue ============ */}
      {subTab === "queue" && (
        <div>
          {/* Filter & triage strip */}
          <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "all", label: "All Urgent" },
                ...departmentFilters,
              ].map((filter) => {
                const count =
                  filter.key === "all"
                    ? (candidates?.length ?? 0)
                    : (candidates?.filter((c) =>
                        sectorMatches(filter.key, c.agency),
                      ).length ?? 0);
                const active = agencyFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setAgencyFilter(filter.key)}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all duration-150 ${
                      active
                        ? "bg-[#0F5132] text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                    }`}
                  >
                    {filter.label}
                    {filter.key === "all" && ` (${count})`}
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by ticket ID (#SKT-...) or mohallah name..."
                aria-label="Filter work orders"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3.5 pl-10 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </div>
          </div>

          {candidates === null && (
            <p className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs font-medium text-slate-500 shadow-2xs">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Loading the triage queue…
            </p>
          )}

          {candidates !== null && filteredCandidates.length === 0 && (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 text-xs font-semibold text-emerald-800">
              <Check className="h-4 w-4 shrink-0" />
              {candidates.length === 0
                ? "Queue clear — every unassigned report has been dispatched."
                : "No work orders match this filter or search."}
            </p>
          )}

          <div className="space-y-4">
            {filteredCandidates.map((candidate) => (
              <WorkOrderCard
                key={candidate.id}
                candidate={candidate}
                units={activeUnits}
                now={now}
                onDispatch={(unitId) => dispatchTicket(candidate, unitId)}
              />
            ))}
          </div>

          {/* Active dispatches currently in field */}
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Active Dispatches Currently In Field
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Live work orders dispatched to Sialkot operational crews
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {activeDispatches.length} Work Orders Assigned
              </span>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    <th className="w-[14%] px-5 py-3">Ticket ID</th>
                    <th className="w-[18%] px-5 py-3">Category</th>
                    <th className="w-[24%] px-5 py-3">Assigned Squad</th>
                    <th className="w-[14%] px-5 py-3">Dispatched</th>
                    <th className="w-[16%] px-5 py-3">SLA Status</th>
                    <th className="w-[14%] px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {activeDispatches.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-6 text-center text-slate-400"
                      >
                        No work orders in the field yet — dispatch one from the
                        queue above.
                      </td>
                    </tr>
                  )}
                  {activeDispatches.map((report) => {
                    const remaining =
                      new Date(report.sla_deadline).getTime() - now;
                    const overdue = remaining <= 0;
                    const slaText = overdue
                      ? `Overdue by ${formatOverdue(remaining)}`
                      : `${slaRemainingLabel(remaining)} left`;
                    return (
                      <tr
                        key={report.id}
                        className="transition-colors duration-150 hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/track?id=${report.tracking_token}`}
                            target="_blank"
                            className="cursor-pointer font-mono font-bold text-slate-900 transition-colors duration-150 hover:text-emerald-800"
                          >
                            {report.id}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-medium text-slate-700">
                            {report.category_title}
                          </span>
                          {categoryUrduShort(report.category_title) && (
                            <span className="urdu mt-0.5 block text-[11px] text-slate-400">
                              {categoryUrduShort(report.category_title)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {report.assigned_unit ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-800">
                              <Truck className="h-3 w-3 text-slate-400" />
                              {report.assigned_unit}
                            </span>
                          ) : (
                            <AssignSquadPopover
                              units={activeUnits.filter((u) =>
                                sectorMatches(u.sector, report.assigned_agency),
                              )}
                              onAssign={(unit) =>
                                assignSquadToReport(report, unit)
                              }
                            />
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {report.dispatched_at ? (
                            ageLabel(report.dispatched_at)
                          ) : (
                            <span className="text-slate-400">
                              Pending Assignment
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap ${
                              overdue
                                ? "border-rose-200 bg-rose-50 font-bold text-rose-800"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {slaText}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <Link
                            href={`/track?id=${report.tracking_token}`}
                            target="_blank"
                            className="rounded-lg px-2 py-1 font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-950"
                          >
                            View Dossier
                          </Link>
                          <button
                            type="button"
                            onClick={() => reassignTicket(report)}
                            className="cursor-pointer rounded-lg px-2 py-1 font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                          >
                            Reassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ============ Sub-tab 2: fleet roster ============ */}
      {subTab === "squads" && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <SquadCard
              key={unit.id}
              unit={unit}
              onStatusChange={(status) => setStatus(unit.id, status)}
              onEdit={() => setEditUnit(unit)}
              onReassignZone={() => setZoneUnit(unit)}
            />
          ))}
        </div>
      )}

      {/* Dispatch confirmation toast */}
      {toast && (
        <div
          role="status"
          className="animate-toast-rise fixed right-6 bottom-6 z-[90] flex max-w-sm items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-white px-4 py-3 text-xs font-bold text-emerald-900 shadow-[0_16px_48px_rgba(15,81,50,0.22)]"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          {toast}
        </div>
      )}

      {/* Modals */}
      {registerOpen && (
        <FleetUnitModal
          sectors={sectors}
          onClose={() => setRegisterOpen(false)}
          onSave={(unit, accessCode) => {
            void (async () => {
              const updated = addSquadToRegistry(sectors, unit);
              if (!updated) {
                setToast(
                  `⚠ No division found for ${unit.agency} — create one in Departments & Agencies first.`,
                );
                return;
              }
              const ok = await pushRegistry(updated);
              if (ok) announceRegistryUpdate();
              let codeNote = "";
              if (ok && accessCode) {
                const codeOk = await putSquadAccessCode(unit.id, accessCode);
                codeNote = codeOk
                  ? ` Access code issued — the crew can sign in on /squad.`
                  : ` ⚠ Access code could not be saved.`;
              }
              setToast(
                ok
                  ? `✓ ${unit.name} registered in the departments registry.${codeNote}`
                  : `⚠ Registry unreachable — ${unit.name} kept for this session.`,
              );
            })();
            setRegisterOpen(false);
          }}
        />
      )}
      {editUnit && (
        <FleetUnitModal
          unit={editUnit}
          sectors={sectors}
          onClose={() => setEditUnit(null)}
          onSave={(next, accessCode) => {
            setOverlays((prev) => ({
              ...prev,
              [next.id]: { ...prev[next.id], ...next },
            }));
            void (async () => {
              const updated = updateSquadInRegistry(sectors, next);
              if (updated) {
                const ok = await pushRegistry(updated);
                if (ok) announceRegistryUpdate();
              }
              if (accessCode) {
                const codeOk = await putSquadAccessCode(next.id, accessCode);
                setToast(
                  codeOk
                    ? `✓ ${next.name} details updated — access code rotated.`
                    : `✓ ${next.name} details updated, but the access code could not be saved.`,
                );
                return;
              }
              setToast(`✓ ${next.name} details updated.`);
            })();
            setEditUnit(null);
          }}
        />
      )}
      {zoneUnit && (
        <ZoneModal
          unit={zoneUnit}
          onClose={() => setZoneUnit(null)}
          onSave={(zoneAnchor, zoneShort) => {
            setOverlays((prev) => ({
              ...prev,
              [zoneUnit.id]: { ...prev[zoneUnit.id], zoneAnchor, zoneShort },
            }));
            setZoneUnit(null);
            setToast(`✓ ${zoneUnit.name} reassigned to ${zoneShort}.`);
          }}
        />
      )}
      {broadcastOpen && (
        <BroadcastModal
          activeUnits={activeUnits.length}
          onClose={() => setBroadcastOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Sub-tab button ----------------------------- */

function SubTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 ${
        active
          ? "bg-white text-emerald-950 shadow-xs"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge}
    </button>
  );
}

/* --------------------------------- KPI card -------------------------------- */

function KpiCard({
  icon,
  iconTone,
  badge,
  value,
  sub,
  mint,
}: {
  icon: ReactNode;
  iconTone: string;
  badge: ReactNode;
  value: string;
  sub: ReactNode;
  mint?: boolean;
}) {
  return (
    <div className="flex h-[116px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs transition-all duration-150 hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          {icon}
        </span>
        {badge}
      </div>
      <div className="min-w-0">
        <p
          className={`truncate text-lg font-extrabold tracking-tight ${
            mint ? "text-emerald-700" : "text-slate-900"
          }`}
        >
          {value}
        </p>
        <p className="truncate text-[11px] font-medium text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

/* ------------------------------ Status pill menu ---------------------------- */

function StatusPillMenu({
  unit,
  onStatusChange,
}: {
  unit: FieldUnit;
  onStatusChange: (status: UnitStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => setOpen(false), ref);
  const status = UNIT_STATUS[unit.status];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Change deployment status for ${unit.name}`}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all duration-150 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-emerald-700/40 focus-visible:outline-none ${status.pill}`}
      >
        {status.emoji} {status.label}
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`Set status for ${unit.name}`}
          className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === unit.status}
              onClick={() => {
                onStatusChange(key);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-emerald-50"
            >
              <span>
                {UNIT_STATUS[key].emoji} {UNIT_STATUS[key].label}
                {key === "on_site" && (
                  <span className="block text-[10px] text-slate-400">
                    Working on ticket
                  </span>
                )}
                {key === "en_route" && (
                  <span className="block text-[10px] text-slate-400">
                    Traveling to location
                  </span>
                )}
                {key === "idle" && (
                  <span className="block text-[10px] text-slate-400">
                    Free for immediate dispatch
                  </span>
                )}
              </span>
              {key === unit.status && (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Squad fleet card ---------------------------- */

function SquadCard({
  unit,
  onStatusChange,
  onEdit,
  onReassignZone,
}: {
  unit: FieldUnit;
  onStatusChange: (status: UnitStatus) => void;
  onEdit: () => void;
  onReassignZone: () => void;
}) {
  const pct = Math.min(
    100,
    Math.round((unit.completed / Math.max(1, unit.capacity)) * 100),
  );
  return (
    <article className="min-w-0 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold break-words text-slate-900">
            {unit.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Car className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              {unit.vehicleShort}{" "}
              <span className="font-mono text-[11px] font-semibold text-slate-400">
                ({unit.reg})
              </span>
            </span>
          </p>
        </div>
        <StatusPillMenu unit={unit} onStatusChange={onStatusChange} />
      </div>

      {/* Telemetry panel — one soft container, icon-led rows; min-w-0 so text
          wraps, never clips. Phone capsule carries a single glyph. */}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-xs font-bold break-words text-slate-800">
                <span className="sr-only">Crew lead: </span>
                {unit.crewLead}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {unit.crewDetail}
                {unit.workforce ? ` · ${unit.workforce}` : ""}
              </p>
            </div>
          </div>
          <a
            href={`tel:${unit.phone.replace(/-/g, "")}`}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1.5 font-mono text-[10px] font-bold text-white transition-colors duration-150 hover:bg-emerald-700"
          >
            <Phone className="h-3 w-3" />
            <span className="sr-only">Call crew radio </span>
            {unit.phone}
          </a>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="min-w-0 text-xs font-medium break-words text-slate-700">
            <span className="sr-only">Patrol perimeter: </span>
            {unit.zoneAnchor}
          </p>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="min-w-0 text-xs font-medium break-words text-slate-700">
            <span className="sr-only">Duty shift: </span>
            {unit.shiftLabel ?? (
              <span className="italic text-slate-400">Shift unassigned</span>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="min-w-0 text-xs leading-5">
            <span className="sr-only">Current job: </span>
            {unit.activeJob ? (
              <p>
                {unit.activeJob.token ? (
                  <Link
                    href={`/track?id=${unit.activeJob.token}`}
                    target="_blank"
                    className="font-mono font-bold break-words text-emerald-700 underline-offset-2 hover:underline"
                  >
                    #{unit.activeJob.token}
                  </Link>
                ) : null}{" "}
                {unit.activeJob.token && (
                  <span className="font-semibold break-words text-slate-600">
                    ({unit.activeJob.title})
                  </span>
                )}
                {!unit.activeJob.token && (
                  <span className="font-semibold break-words text-slate-600">
                    {unit.activeJob.title}
                  </span>
                )}
              </p>
            ) : (
              <p className="italic text-slate-400">Idle • Central Yard</p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="min-w-0 text-xs leading-5">
            <span className="sr-only">Open tickets: </span>
            {(unit.activeTickets ?? 0) > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                {unit.activeTickets} open ticket{unit.activeTickets === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="italic text-slate-400">No open tickets</span>
            )}
          </div>
        </div>
      </div>

      {/* Workload capacity bar */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Shift Progress</span>
          <span className="font-mono">
            {unit.completed} of {unit.capacity} resolved ({pct}%)
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors duration-150 hover:border-emerald-400 hover:text-emerald-800"
        >
          <Pencil className="h-3 w-3" />
          Edit Squad Details
        </button>
        <button
          type="button"
          onClick={onReassignZone}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors duration-150 hover:border-emerald-400 hover:text-emerald-800"
        >
          <MapPin className="h-3 w-3" />
          Reassign Zone
        </button>
      </div>
    </article>
  );
}

/* ----------------------------- Work order card ------------------------------ */

function WorkOrderCard({
  candidate,
  units,
  now,
  onDispatch,
}: {
  candidate: DispatchCandidate;
  units: FieldUnit[];
  now: number;
  onDispatch: (unitId: string) => void;
}) {
  /* Dispatch rule — department first, then territory. The recommendation is
     only drawn from crews of the ticket's own department whose serving wards
     actually cover the reported area; the dropdown lists the department's
     crews so the dispatcher keeps the final call. */
  const departmentUnits = units.filter(
    (u) => u.status !== "off_duty" && sectorMatches(u.sector, candidate.agency),
  );
  const servingUnits = departmentUnits.filter((u) =>
    unitServesReport(u, candidate.areaName, candidate.cityName),
  );
  // Rerank only when the ticket or the unit roster actually changes; the
  // signature keeps the memo dependency list primitive for the hooks lint.
  const unitSignature = units.map((u) => `${u.id}:${u.status}`).join("|");
  const recommended = useMemo(() => {
    const scored = [...servingUnits].sort(
      (a, b) => scoreUnit(candidate, b) - scoreUnit(candidate, a),
    );
    return scored[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id, unitSignature]);

  const [manualPick, setManualPick] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const manualUnit = departmentUnits.find((u) => u.id === manualPick) ?? null;

  const remaining = candidate.slaDeadlineMs - now;
  const overdue = remaining <= 0;
  const slaLabel = slaRemainingLabel(remaining);
  const urdu = categoryUrdu(candidate.title);
  const recDistance = recommended
    ? pseudoDistanceMeters(candidate.id, recommended.id)
    : 0;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(candidate.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the ID stays selectable on screen.
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-bold text-slate-900">
          {candidate.id}
        </p>
        <button
          type="button"
          onClick={copyId}
          aria-label="Copy ticket reference"
          className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${URGENCY_PILL[candidate.urgency]}`}
        >
          {candidate.urgency === "routine"
            ? "Routine"
            : candidate.urgency === "high"
              ? "High Urgency"
              : "Emergency"}
        </span>
        {overdue ? (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">
            ⚠️ Overdue by {formatOverdue(remaining)} — Auto-escalated to Desk
            Supervisor
          </span>
        ) : (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            ⏱️ {slaLabel} remaining
          </span>
        )}
      </div>

      {/* Category & incident narrative */}
      <p className="mt-2.5 text-sm font-bold text-slate-900">
        {candidate.title}
        {urdu && (
          <span className="urdu ml-2 text-[13px] font-semibold text-emerald-800">
            {urdu}
          </span>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        Reported {candidate.ageLabel} • {candidate.area}
      </p>
      {candidate.description && (
        <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
          “{candidate.description}”
        </p>
      )}
      {candidate.tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {candidate.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500"
            >
              #{tag.replace(/\s+/g, "")}
            </span>
          ))}
        </p>
      )}

      {/* Smart proximity recommendation — only when a department crew actually
          serves the reported area; otherwise point the dispatcher at the
          dropdown instead of implying a crew owns territory it doesn't. */}
      {recommended ? (
        <div className="my-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">
                Recommended: {recommended.name}
              </p>
              <p className="text-[11px] leading-4 text-emerald-800">
                📍 {formatDistance(recDistance)} away in {recommended.zoneShort}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDispatch(recommended.id)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-[#0F5132] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95"
          >
            1-Click Dispatch to Recommended Unit
          </button>
        </div>
      ) : (
        <div className="my-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900">
              {departmentUnits.length > 0
                ? "This area's squad isn't available"
                : "No squads registered for this department yet"}
            </p>
            <p className="text-[11px] leading-4 text-amber-800">
              {departmentUnits.length > 0
                ? "No crew serving this location is free right now — please select a crew from the dropdown."
                : "Add a field squad for this department, or pick from the dropdown once one is registered."}
            </p>
          </div>
        </div>
      )}

      {/* Alternative assignment — the department's own crews only */}
      <SquadCombobox
        units={departmentUnits}
        candidateId={candidate.id}
        selected={manualPick}
        onSelect={(unitId) =>
          setManualPick(unitId === manualPick ? null : unitId)
        }
      />
      {manualUnit && (
        <button
          type="button"
          onClick={() => {
            onDispatch(manualUnit.id);
            setManualPick(null);
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-4 py-2 text-xs font-bold text-emerald-800 transition-all duration-150 hover:bg-emerald-700 hover:text-white active:scale-[0.99]"
        >
          Dispatch {manualUnit.name} →
        </button>
      )}
    </article>
  );
}

function formatOverdue(remainingMs: number): string {
  const minutes = Math.floor(-remainingMs / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `${hours}h`;
  return `${minutes}m`;
}

/** "18 min" / "2h 30m" — KPI dock dispatch-latency display. */
function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const URGENCY_PILL: Record<IncidentReport["urgency"], string> = {
  emergency: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  high: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  routine: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
};

/* ------------------------------ Squad combobox ------------------------------ */

function SquadCombobox({
  units,
  candidateId,
  selected,
  onSelect,
}: {
  units: FieldUnit[];
  candidateId: string;
  selected: string | null;
  onSelect: (unitId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => setOpen(false), ref);
  const selectedUnit = units.find((u) => u.id === selected) ?? null;

  return (
    <div ref={ref} className="relative">
      <p className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
        Or assign to another squad…
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Select a squad for ${candidateId}`}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-700/40 focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selectedUnit ? (
            <>
              <span aria-hidden>{UNIT_STATUS[selectedUnit.status].emoji}</span>
              <span className="truncate font-semibold">
                {selectedUnit.name}
              </span>
            </>
          ) : (
            <span className="text-slate-500">
              Choose a squad for this work order…
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={`Squads available for ${candidateId}`}
          className="absolute inset-x-0 z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {units.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-slate-400">
              No active squads available.
            </p>
          )}
          {units.map((unit) => (
            <button
              key={unit.id}
              type="button"
              role="option"
              aria-selected={unit.id === selected}
              onClick={() => {
                onSelect(unit.id);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-50 px-3 py-2 text-left transition-colors duration-150 last:border-0 hover:bg-emerald-50"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-slate-800">
                  {UNIT_STATUS[unit.status].emoji} {unit.name} (
                  {unit.vehicleShort})
                </span>
                {unit.id === selected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
              </span>
              <span className="text-[11px] text-slate-500">
                📍 {formatDistance(pseudoDistanceMeters(candidateId, unit.id))}{" "}
                away • {UNIT_STATUS[unit.status].emoji}{" "}
                {unit.status === "idle"
                  ? "Idle / Ready"
                  : UNIT_STATUS[unit.status].label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------- Assign squad (table row) ------------------------ */

function AssignSquadPopover({
  units,
  onAssign,
}: {
  units: FieldUnit[];
  onAssign: (unit: FieldUnit) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => setOpen(false), ref);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Assign a squad to this work order"
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors duration-150 hover:bg-amber-100"
      >
        <Plus className="h-3 w-3" />
        Assign Squad
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Pick a squad"
          className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {units.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              No active squads.
            </p>
          )}
          {units.map((unit) => (
            <button
              key={unit.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onAssign(unit);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-emerald-50"
            >
              <span className="truncate">
                {UNIT_STATUS[unit.status].emoji} {unit.name}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {unit.zoneShort}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Fleet unit modal (CUD) ------------------------- */

function FleetUnitModal({
  unit,
  sectors,
  onClose,
  onSave,
}: {
  unit?: FieldUnit;
  sectors: CoreSector[];
  onClose: () => void;
  onSave: (unit: FieldUnit, accessCode?: string) => void;
}) {
  const editing = Boolean(unit);
  /* Every department that fields at least one division can register crews —
     grouped by sector in the dropdown below. */
  const rosterOptions = sectors.flatMap((sector) =>
    sector.agencies
      .filter((a) => a.districtOperations.length > 0)
      .map((a) => ({
        agency: a,
        sectorSlug: sector.slug,
        sectorName: sector.name,
      })),
  );
  const [name, setName] = useState(unit?.name ?? "");
  const [agencyId, setAgencyId] = useState(
    unit?.agency
      ? rosterOptions.find((o) => o.agency.code === unit.agency)?.agency.id ??
          rosterOptions[0]?.agency.id ??
          ""
      : rosterOptions[0]?.agency.id ?? "",
  );
  const [divisionId, setDivisionId] = useState(
    unit?.divisionId ??
      rosterOptions.find((o) => o.agency.id === agencyId)?.agency
        .districtOperations[0]?.id ??
      ""
  );
  const [reg, setReg] = useState(unit?.reg === "—" ? "" : unit?.reg ?? "");
  const [crewLead, setCrewLead] = useState(unit?.crewLead ?? "");
  const [phone, setPhone] = useState(unit?.phone ?? "");
  const [members, setMembers] = useState(String(unit?.capacity ?? 6));
  const [wards, setWards] = useState<string[]>(unit?.wards ?? []);
  const [status, setStatus] = useState<UnitStatus>("idle");
  /* Officer sign-in credential for /squad — required when creating a crew,
     optional on edit (blank keeps the issued code). The code itself lives in
     the server-side access store, never in the registry document. */
  const [accessCode, setAccessCode] = useState("");
  const [hasIssuedCode, setHasIssuedCode] = useState(false);

  useModalDismiss(onClose);

  useEffect(() => {
    if (!editing || !unit) return;
    let cancelled = false;
    fetch(`/api/squad/access?ids=${encodeURIComponent(unit.id)}`, {
      cache: "no-store",
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: unknown) => {
        if (cancelled) return;
        setHasIssuedCode(
          Boolean(
            (data as { hasCode?: Record<string, boolean> }).hasCode?.[unit.id],
          ),
        );
      })
      .catch(() => {
        // Unknown code state — the edit form still allows rotation.
      });
    return () => {
      cancelled = true;
    };
  }, [editing, unit]);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const selectedAgency = rosterOptions.find((o) => o.agency.id === agencyId);
  const divisions = selectedAgency?.agency.districtOperations ?? [];
  const division = divisions.find((d) => d.id === divisionId) ?? divisions[0];
  const trimmedCode = accessCode.trim();
  const codeValid =
    trimmedCode === "" ? editing : ACCESS_CODE_PATTERN.test(trimmedCode);
  const valid =
    name.trim() && reg.trim() && crewLead.trim() && division && codeValid;

  const save = () => {
    if (!valid || !selectedAgency || !division) return;
    const membersCount = Math.max(1, Number(members) || 1);
    onSave(
      {
        id: unit?.id ?? squadId(),
        divisionId: division.id,
        wards,
        name: name.trim(),
        vehicle: unit?.vehicle ?? "Unassigned vehicle",
        vehicleShort: unit?.vehicleShort ?? "—",
        reg: reg.trim().toUpperCase(),
        agency: selectedAgency?.agency.code ?? "",
        sector: selectedAgency?.sectorSlug ?? "",
        district: division.district,
        crewLead: crewLead.trim(),
        crewDetail: `${membersCount} personnel`,
        phone: phone.trim(),
        zoneAnchor: wards.length ? wards.join(", ") : `District-wide · ${division.district}`,
        zoneShort: wards[0] ?? division.district,
        status: unit?.status ?? status,
        activeJob: unit?.activeJob ?? null,
        completed: unit?.completed ?? 0,
        capacity: membersCount,
      },
      trimmedCode || undefined,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit field unit" : "Register field unit"}
      onClick={onClose}
      className="animate-overlay-in fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-in my-8 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading flex items-center gap-2 text-base font-bold text-slate-900">
              <Truck className="h-4.5 w-4.5 text-emerald-700" />
              {editing ? "Edit Field Crew" : "Add Field Crew"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {editing
                ? "Update the crew record — saved to the departments registry."
                : "Add a crew under a division, then pick the areas it serves."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close unit form"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Crew / Squad Name" className="sm:col-span-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Airport Road Field Crew 03"
              aria-label="Squad name"
              className={inputClass}
            />
          </Field>
          <Field label="Department">
            <select
              value={agencyId}
              onChange={(e) => {
                setAgencyId(e.target.value);
                const next = rosterOptions.find(
                  (o) => o.agency.id === e.target.value,
                );
                setDivisionId(next?.agency.districtOperations[0]?.id ?? "");
              }}
              aria-label="Department"
              disabled={editing}
              className={`${inputClass} cursor-pointer disabled:text-slate-400`}
            >
              {sectors.map((sector) => {
                const options = rosterOptions.filter(
                  (o) => o.sectorSlug === sector.slug,
                );
                if (options.length === 0) return null;
                return (
                  <optgroup key={sector.id} label={sector.name}>
                    {options.map((o) => (
                      <option key={o.agency.id} value={o.agency.id}>
                        {o.agency.code} — {o.agency.fullName}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </Field>
          <Field label="District Division">
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              aria-label="District division"
              disabled={editing || divisions.length === 0}
              className={`${inputClass} cursor-pointer disabled:text-slate-400`}
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.divisionName} · {d.district}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Crew Lead Name">
            <input
              value={crewLead}
              onChange={(e) => setCrewLead(e.target.value)}
              placeholder="e.g. Muhammad Aslam"
              aria-label="Crew lead name"
              className={inputClass}
            />
          </Field>
          <Field label="Contact Phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +92 300 1234567"
              aria-label="Crew contact phone"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Crew Size">
            <input
              value={members}
              onChange={(e) => setMembers(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              aria-label="Crew size"
              className={inputClass}
            />
          </Field>
          <Field label="Vehicle Plate">
            <input
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              placeholder="e.g. SWM-4091"
              aria-label="Vehicle registration"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Serving Areas — the locations this crew operates from
            </span>
            <WardAreaEditor
              districtName={division?.district ?? "Sialkot"}
              values={wards}
              onChange={setWards}
            />
          </div>
          <Field label="Squad Access Code — /squad officer sign-in" className="sm:col-span-2">
            <input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder={
                editing
                  ? hasIssuedCode
                    ? "Leave blank to keep the current code"
                    : "No code issued yet — set one to let the crew sign in"
                  : "e.g. KP7-2402 — the crew signs in with this"
              }
              autoComplete="off"
              maxLength={12}
              aria-label="Squad access code"
              className={`${inputClass} font-mono tracking-wider`}
            />
            {!codeValid && (
              <span className="mt-1 block text-[10px] font-semibold text-rose-600">
                Use 4-12 letters, numbers or dashes — no spaces.
              </span>
            )}
            <span className="mt-1 block text-[10px] font-medium text-slate-400">
              Stored server-side only — officers enter it on the /squad login
              portal; 5 wrong attempts lock sign-in for 60s.
            </span>
          </Field>
          {!editing && (
            <Field label="Initial Status" className="sm:col-span-2">
              <div className="flex gap-2">
                {(["idle", "off_duty"] as UnitStatus[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatus(key)}
                    aria-pressed={status === key}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors duration-150 ${
                      status === key
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                    }`}
                  >
                    {UNIT_STATUS[key].emoji}{" "}
                    {key === "idle" ? "Idle / Ready" : "Off-Duty"}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 disabled:opacity-40"
          >
            {editing ? "Save Changes" : "Add to Roster"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ------------------------------- Zone modal --------------------------------- */

function ZoneModal({
  unit,
  onClose,
  onSave,
}: {
  unit: FieldUnit;
  onClose: () => void;
  onSave: (zoneAnchor: string, zoneShort: string) => void;
}) {
  const [zone, setZone] = useState(unit.zoneAnchor);
  useModalDismiss(onClose);
  const valid = zone.trim().length > 2;
  const zoneShort = zone.trim().split(/[,&]/)[0].trim() || zone.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reassign patrol zone"
      onClick={onClose}
      className="animate-overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-in w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading flex items-center gap-2 text-base font-bold text-slate-900">
              <MapPin className="h-4.5 w-4.5 text-emerald-700" />
              Reassign Patrol Zone
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {unit.name} — currently covering {unit.zoneAnchor}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close zone form"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            New patrol mohallahs / zone
          </span>
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="e.g. Kashmir Road, Model Town & Uggoki"
            aria-label="New patrol zone"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => valid && onSave(zone.trim(), zoneShort)}
            disabled={!valid}
            className="rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 disabled:opacity-40"
          >
            Reassign Zone
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Emergency broadcast modal ------------------------ */

function BroadcastModal({
  activeUnits,
  onClose,
}: {
  activeUnits: number;
  onClose: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  useModalDismiss(onClose);

  const send = () => {
    setState("sending");
    window.setTimeout(() => {
      setState("sent");
      window.setTimeout(onClose, 1400);
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm emergency broadcast"
      onClick={onClose}
      className="animate-overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-in w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
            <Radio className="h-5 w-5 text-amber-600" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close broadcast"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="font-heading mt-3 text-base font-bold text-slate-900">
          Send Priority SMS broadcast to {activeUnits} active vehicle leads in
          Sialkot?
        </h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          Every on-duty squad lead receives the alert instantly by SMS and siren
          relay. Use only for rain emergencies, major power faults or public
          safety incidents.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={state !== "idle"}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition-all duration-150 hover:bg-amber-400 active:scale-95 disabled:opacity-80"
          >
            {state === "sending" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : state === "sent" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Radio className="h-3.5 w-3.5" />
            )}
            {state === "sending"
              ? "Transmitting…"
              : state === "sent"
                ? `Delivered to ${activeUnits} leads`
                : "Confirm & Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
