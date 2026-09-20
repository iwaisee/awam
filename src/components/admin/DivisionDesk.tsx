"use client";

/* Division Desk — the full-page management surface for ONE agency × district
   desk (registry Tier 3). Reached by drilling : department → city division,
   i.e. ?sector=power&agency=gepco&division=gepco-skt. Where the agency deck
   summarizes every district, this page is the workbench for a single area:
   its nodal officer, contact lines, the wards it covers, and every field
   squad assigned there — add, edit, reassign or decommission each crew. */

import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  CircleCheck,
  Clock,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import {
  type CoreSector,
  type DistrictOperation,
  type FieldSquad,
  type RegionalAgency,
} from "@/data/departmentRegistry";
import {
  SQUAD_STATUS_META,
  shiftLabelOf,
  workforceLabel,
} from "./departmentMeta";
import { SECTOR_ACCENTS, SECTOR_ICONS, SECTOR_ICON_FALLBACK } from "./sectorIcons";

/* -------------------------------- Squad card ------------------------------- */

function SquadCard({
  sector,
  squad,
  onEdit,
  onOpen,
  onDelete,
}: {
  sector: CoreSector;
  squad: FieldSquad;
  onEdit: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = SQUAD_STATUS_META[squad.status];
  /** Squads still carrying unresolved tickets cannot be decommissioned. */
  const blocked = (squad.activeTickets ?? 0) > 0;
  const actionClass =
    "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30";

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold break-words text-slate-900">
            {squad.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              {squad.vehiclePlate ? (
                <span className="font-mono text-[11px] font-semibold text-slate-400">
                  {squad.vehiclePlate}
                </span>
              ) : (
                <span className="text-slate-400">No vehicle assigned</span>
              )}
            </span>
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.pill}`}
        >
          <span className={`h-1.5 w-1.5 ${meta.dot}`} />
          {meta.label}
        </span>
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
                {squad.leadTechnician}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {squad.membersCount} personnel ·{" "}
                {workforceLabel(sector.slug, squad)}
              </p>
            </div>
          </div>
          <a
            href={`tel:${squad.phone.replace(/\s+/g, "")}`}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1.5 font-mono text-[10px] font-bold text-white transition-colors duration-150 hover:bg-emerald-700"
          >
            <Phone className="h-3 w-3" />
            <span className="sr-only">Call crew radio </span>
            {squad.phone}
          </a>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="min-w-0 text-xs font-medium break-words text-slate-700">
            <span className="sr-only">Serving wards: </span>
            {squad.wards && squad.wards.length > 0
              ? squad.wards.join(", ")
              : "District-wide — no specific wards assigned"}
          </p>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="min-w-0 text-xs font-medium break-words text-slate-700">
            <span className="sr-only">Duty shift: </span>
            {squad.shift ? (
              shiftLabelOf(squad.shift)
            ) : (
              <span className="italic text-slate-400">Shift unassigned</span>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="min-w-0 text-xs leading-5">
            <span className="sr-only">Open tickets: </span>
            {blocked ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                {squad.activeTickets} open ticket
                {squad.activeTickets === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="italic text-slate-400">No open tickets</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
        {/* Accents with intent — emerald = manage, sky = reschedule, rose =
            destructive; each reads as its own action at a glance. */}
        <button
          type="button"
          onClick={onEdit}
          className={`${actionClass} bg-primary text-white shadow-xs hover:bg-primary-dark`}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        <button
          type="button"
          onClick={onOpen}
          title="Open squad details & citizen tickets"
          className={`${actionClass} bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100`}
        >
          <ArrowRightLeft className="h-3 w-3" />
          Details
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Decommission this squad"
          title="Decommission this squad"
          className={`${actionClass} flex-none bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </article>
  );
}

/* ------------------------------- Desk surface ------------------------------ */

export default function DivisionDesk({
  sector,
  agency,
  op,
  onBack,
  onAddSquad,
  onEditManager,
  onEditSquad,
  onOpenSquad,
  onDeleteSquad,
  onReassignWards,
}: {
  sector: CoreSector;
  agency: RegionalAgency;
  op: DistrictOperation;
  onBack: () => void;
  onAddSquad: () => void;
  onEditManager: () => void;
  onEditSquad: (squadId: string) => void;
  onOpenSquad: (squadId: string) => void;
  onDeleteSquad: (squadId: string) => void;
  onReassignWards: () => void;
}) {
  const personnel = op.squads.reduce((n, s) => n + s.membersCount, 0);
  const activeSquads = op.squads.filter((s) => s.status === "active").length;
  const closureRate =
    op.openTickets + op.resolvedTickets > 0
      ? Math.round(
          (op.resolvedTickets / (op.openTickets + op.resolvedTickets)) * 100
        )
      : null;
  const siblings = agency.districtOperations.length - 1;
  const AccentIcon = SECTOR_ICONS[sector.icon] ?? SECTOR_ICON_FALLBACK;
  const accent = SECTOR_ACCENTS[sector.id] ?? "bg-indigo-50 text-indigo-600";

  return (
    <>
      {/* 1. Desk header — identity, nodal officer, contacts, coverage */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 font-mono text-[11px] font-bold text-slate-500 transition-colors duration-150 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {agency.code} divisions
        </button>
        <nav
          aria-label="Division breadcrumb"
          className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
        >
          <span>Departments</span>
          <span aria-hidden className="text-slate-300">
            &gt;
          </span>
          <span>{sector.name}</span>
          <span aria-hidden className="text-slate-300">
            &gt;
          </span>
          <span>{agency.code}</span>
          <span aria-hidden className="text-slate-300">
            &gt;
          </span>
          <span className="font-bold text-emerald-800">
            {op.district} Division
          </span>
        </nav>

        <div className="mt-3 flex flex-col gap-5 @2xl:flex-row @2xl:items-start @2xl:justify-between">
          <div className="flex min-w-0 gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${accent}`}
            >
              <AccentIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">
                  {op.district} District Division
                </h2>
                {op.divisionNameUrdu && (
                  <span className="urdu text-sm font-semibold text-slate-400">
                    {op.divisionNameUrdu}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-bold text-slate-700">
                {op.divisionName}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {agency.code} — {agency.fullName} · {sector.name}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  <Users className="h-3 w-3" />
                  {op.managerName}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600">
                  <Phone className="h-3 w-3 font-sans" />
                  {op.officialPhone}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600">
                  <Phone className="h-3 w-3 font-sans" />
                  Hotline {op.controlRoomHotline}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  <MapPin className="h-3 w-3" />
                  {op.coverage.length > 0
                    ? `${op.coverage.length} coverage area${op.coverage.length === 1 ? "" : "s"}`
                    : "District-wide"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 @lg:flex-row @2xl:flex-col @2xl:items-stretch">
            <button
              type="button"
              onClick={onAddSquad}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Field Squad
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onEditManager}
                className="min-w-0 flex-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                Edit Division &amp; Manager
              </button>
              <button
                type="button"
                onClick={onReassignWards}
                disabled={op.coverage.length === 0 || siblings === 0}
                title={
                  op.coverage.length === 0
                    ? "No coverage areas assigned to this division"
                    : siblings === 0
                      ? "No other division in this agency"
                      : "Hand this division's wards to another desk"
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span className="sr-only">Reassign coverage wards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Coverage roster — the specific areas teams are assigned to */}
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Coverage — areas served from this desk
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {op.coverage.length > 0 ? (
              op.coverage.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  <MapPin className="h-3 w-3 text-emerald-600" />
                  {area}
                </span>
              ))
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">
                District-wide — every area in {op.district} is served from this
                desk. Squads declare their own serving areas below.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Desk metrics — same four lenses as the agency deck */}
      <section className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Coverage Areas
            </p>
            <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
          </div>
          <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
            {op.coverage.length > 0 ? op.coverage.length : "All"}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {op.coverage.length > 0
              ? "wards & sub-localities assigned"
              : "district-wide — every area served"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Teams on Ground
            </p>
            <Truck className="h-4 w-4 shrink-0 text-slate-300" />
          </div>
          <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
            {op.squads.length}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {activeSquads} active · {personnel} personnel
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
            {op.openTickets}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            assigned to this desk
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
            {op.resolvedTickets.toLocaleString()}
          </p>
          <p className="mt-2 text-[11px] font-semibold text-emerald-700">
            {closureRate != null
              ? `${closureRate}% closure rate`
              : "No closures recorded yet"}
          </p>
        </div>
      </section>

      {/* 3. Squad workbench — one card per crew assigned to this area */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Field Squads in {op.district}
            </h3>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700 ring-1 ring-violet-200/70">
              {op.squads.length} {op.squads.length === 1 ? "Squad" : "Squads"}
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            {personnel} personnel · {activeSquads} active in field
          </p>
        </div>

        {op.squads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-700">
                No squads assigned to {op.district} yet
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Deploy the first crew, then roster it against the coverage
                areas this desk serves.
              </p>
            </div>
            <button
              type="button"
              onClick={onAddSquad}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Field Squad
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {op.squads.map((squad) => (
              <SquadCard
                key={squad.id}
                sector={sector}
                squad={squad}
                onEdit={() => onEditSquad(squad.id)}
                onOpen={() => onOpenSquad(squad.id)}
                onDelete={() => onDeleteSquad(squad.id)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
