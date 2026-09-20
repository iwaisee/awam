"use client";

/* Government Service Sectors & Authorities — accessible slide-out drawer
   with per-sector accordions and the full child-agency registry, fed by the
   departments registry via useDepartmentRegistry (same store the
   /admin/departments console reads and edits). */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { CoreSector, RegionalAgency } from "@/data/departmentRegistry";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import {
  AGENCY_STATUS_META,
  SLA_BAND_DOT,
  sectorSlaTarget,
  slaBandOf,
} from "./departmentMeta";
import { SECTOR_ACCENTS, SECTOR_ICONS, SECTOR_ICON_FALLBACK } from "./sectorIcons";

const sectorAccent = (sector: CoreSector): string =>
  SECTOR_ACCENTS[sector.slug] ?? "bg-indigo-50 text-indigo-600";

/** Hours → display: sub-hour reads as minutes, else "5.1h" / "72h". */
const hoursDisplay = (hours: number): string =>
  hours > 0 && hours < 1
    ? `${Math.round(hours * 60)}min`
    : `${Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10}h`;

/* Shared agency-grid template — the header row and every agency row use the
   same columns so labels sit exactly above their values. The status column
   is fixed (not auto) so both grids resolve identical track sizes. */
const AGENCY_GRID =
  "grid grid-cols-[minmax(160px,1.35fr)_minmax(150px,1fr)_76px_84px_84px_112px] items-center gap-x-4";

function AgencyRow({
  agency,
  sectorSlug,
}: {
  agency: RegionalAgency;
  sectorSlug: string;
}) {
  const meta = AGENCY_STATUS_META[agency.status];
  const squads = agency.districtOperations.reduce(
    (n, op) => n + op.squads.length,
    0
  );
  const open = agency.districtOperations.reduce(
    (n, op) => n + op.openTickets,
    0
  );
  const avgHours = agency.avgResolutionHours;
  const band =
    avgHours === undefined
      ? null
      : slaBandOf(avgHours, sectorSlaTarget(sectorSlug));

  return (
    <li
      className={`rounded-xl border bg-white p-3 ${
        agency.status === "standby"
          ? "border-slate-100 opacity-70"
          : "border-slate-200/80"
      }`}
    >
      <div className={`${AGENCY_GRID} min-w-[760px]`}>
        {/* Code + full name */}
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-900">{agency.code}</p>
          <p className="truncate text-[11px] font-medium text-slate-500">
            {agency.fullName}
          </p>
        </div>
        {/* Jurisdiction + province */}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-600">
            {agency.jurisdictionDistricts.join(", ")}
          </p>
          <p className="text-[10px] font-medium text-slate-400">
            {agency.province}
          </p>
        </div>
        {/* Squads */}
        <div>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
            {squads}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            on ground
          </p>
        </div>
        {/* Open workload */}
        <div>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
            {open}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            open
          </p>
        </div>
        {/* Avg resolution vs sector SLA budget */}
        <div>
          {avgHours !== undefined && band ? (
            <p className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums text-slate-900">
              <span className={`h-1.5 w-1.5 rounded-full ${SLA_BAND_DOT[band]}`} />
              {hoursDisplay(avgHours)}
            </p>
          ) : (
            <p className="font-mono text-sm font-bold tabular-nums text-slate-300">
              —
            </p>
          )}
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            avg res.
          </p>
        </div>
        {/* Status */}
        <div className="justify-self-end">
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </div>
    </li>
  );
}

function SectorAccordion({
  sector,
  expanded,
  onToggle,
}: {
  sector: CoreSector;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = SECTOR_ICONS[sector.icon] ?? SECTOR_ICON_FALLBACK;
  const live = sector.agencies.filter(
    (a) => a.status === "pilot" || a.status === "active"
  ).length;
  const teams = sector.agencies.reduce(
    (n, a) => n + a.districtOperations.reduce((m, op) => m + op.squads.length, 0),
    0
  );
  const open = sector.agencies.reduce(
    (n, a) => n + a.districtOperations.reduce((m, op) => m + op.openTickets, 0),
    0
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sectorAccent(sector)}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-slate-900">
            {sector.name}
            <span className="urdu text-[10px] font-semibold text-slate-400">
              {sector.nameUrdu}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            <span className="font-bold text-emerald-700">{live} Active</span> /{" "}
            {sector.agencies.length} Total
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
          <div>
            <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
              {teams}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Squads Deployed
            </p>
          </div>
          <div>
            <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
              {open}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Open Complaints
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3">
          {/* Column headers — same shared grid template as the agency rows,
              scrollable together on narrow viewports */}
          <div className="overflow-x-auto">
            <div
              className={`${AGENCY_GRID} min-w-[760px] px-3 pb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400`}
            >
              <span>Agency</span>
              <span>Jurisdiction &amp; Province</span>
              <span>Squads</span>
              <span>Open Workload</span>
              <span>Avg Res.</span>
              <span className="justify-self-end">Status</span>
            </div>
            <ul className="space-y-2">
              {sector.agencies.map((agency) => (
                <AgencyRow
                  key={agency.id}
                  agency={agency}
                  sectorSlug={sector.slug}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

interface GovernmentServicesModalProps {
  open: boolean;
  onClose: () => void;
  /** Sector id to auto-expand when the drawer opens. */
  initialSectorId?: string | null;
}

export default function GovernmentServicesModal({
  open,
  onClose,
  initialSectorId,
}: GovernmentServicesModalProps) {
  const { sectors } = useDepartmentRegistry();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totals = useMemo(
    () => ({
      sectors: sectors.length,
      agencies: sectors.reduce((s, x) => s + x.agencies.length, 0),
      pilots: sectors.reduce(
        (s, x) =>
          s +
          x.agencies.filter((a) => a.status === "pilot" || a.status === "active")
            .length,
        0
      ),
    }),
    [sectors]
  );

  /* Seed the accordion with the requested sector (or the first) on open.
     Seeded via a timeout so no state is set synchronously in the effect. */
  useEffect(() => {
    if (!open) return;
    const seed =
      initialSectorId && sectors.some((s) => s.id === initialSectorId)
        ? initialSectorId
        : sectors[0]?.id;
    const apply = window.setTimeout(() => {
      setExpanded(new Set(seed ? [seed] : []));
    }, 0);
    return () => window.clearTimeout(apply);
  }, [open, initialSectorId, sectors]);

  /* Escape closes · body scroll locks while the drawer is up. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-overlay-in bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="gov-services-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-4xl animate-in flex-col bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h2
              id="gov-services-title"
              className="font-heading text-lg font-black tracking-tight text-slate-900"
            >
              Government Service Sectors &amp; Authorities
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Bilingual registry of provincial distribution companies, municipal
              corporations, and emergency desks.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-800 ring-1 ring-indigo-200">
                {totals.sectors} Sectors
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                {totals.agencies} Total Registered Bodies
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                {totals.pilots} Active in Pilot
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close government services registry"
            autoFocus
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-slate-300 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sector accordions */}
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {sectors.map((sector) => (
            <SectorAccordion
              key={sector.id}
              sector={sector}
              expanded={expanded.has(sector.id)}
              onToggle={() => toggle(sector.id)}
            />
          ))}
        </div>

        {/* Footer note */}
        <div className="border-t border-slate-100 px-6 py-3.5">
          <p className="text-[11px] font-medium text-slate-400">
            Mirrors the departments registry — squads, tickets and turnaround
            figures are maintained from the departments console.
          </p>
        </div>
      </aside>
    </div>
  );
}
