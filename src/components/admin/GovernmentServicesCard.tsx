"use client";

/* Govt Departments & Services — executive card on the Command Radar.
   A 3-col grid of sector tiles (per-sector telemetry + deep-open into the
   registry drawer) fed by the departments registry via useDepartmentRegistry
   — the same store the /admin/departments console reads and edits. */

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Landmark,
} from "lucide-react";
import type { CoreSector } from "@/data/departmentRegistry";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import { SECTOR_ACCENTS, SECTOR_ICONS, SECTOR_ICON_FALLBACK } from "./sectorIcons";
import GovernmentServicesModal from "./GovernmentServicesModal";

/* Short display name + hover accent per sector. */
const SECTOR_STYLE: Record<string, { short: string; hoverBorder: string }> = {
  power: {
    short: "Power",
    hoverBorder: "hover:border-amber-300/80 hover:bg-amber-50/30",
  },
  waste: {
    short: "Waste",
    hoverBorder: "hover:border-emerald-300/80 hover:bg-emerald-50/30",
  },
  water: {
    short: "Water",
    hoverBorder: "hover:border-sky-300/80 hover:bg-sky-50/30",
  },
  emergency: {
    short: "Safety",
    hoverBorder: "hover:border-rose-300/80 hover:bg-rose-50/30",
  },
  traffic: {
    short: "Traffic",
    hoverBorder: "hover:border-orange-300/80 hover:bg-orange-50/30",
  },
  municipal: {
    short: "Municipal",
    hoverBorder: "hover:border-violet-300/80 hover:bg-violet-50/30",
  },
  roads: {
    short: "Roads",
    hoverBorder: "hover:border-cyan-300/80 hover:bg-cyan-50/30",
  },
  horticulture: {
    short: "Parks",
    hoverBorder: "hover:border-lime-300/80 hover:bg-lime-50/30",
  },
  gas: {
    short: "Gas",
    hoverBorder: "hover:border-red-300/80 hover:bg-red-50/30",
  },
};

/** Body-type noun per sector for the count pill — "11 DISCOs" etc. */
const SECTOR_UNITS: Record<string, string> = {
  power: "DISCOs",
  waste: "WMCs",
  water: "WASAs",
  emergency: "Agencies",
  traffic: "CTPs",
  municipal: "Councils",
  roads: "Divisions",
  horticulture: "Authorities",
  gas: "Agencies",
};

const styleFor = (sector: CoreSector) =>
  SECTOR_STYLE[sector.slug] ?? {
    short: sector.name.split(" ")[0],
    hoverBorder: "hover:border-indigo-300 hover:bg-indigo-50/30",
  };

export default function GovernmentServicesCard() {
  const { sectors, loaded: registryLoaded } = useDepartmentRegistry();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialSector, setInitialSector] = useState<string | null>(null);

  /* Sector aggregates from the same operations data the departments console
     renders — squads on ground and open tickets per agency deck. */
  const tiles = sectors.map((sector) => ({
    sector,
    live: sector.agencies.filter((a) => a.status === "pilot" || a.status === "active")
      .length,
    teams: sector.agencies.reduce(
      (n, a) => n + a.districtOperations.reduce((m, op) => m + op.squads.length, 0),
      0
    ),
    open: sector.agencies.reduce(
      (n, a) => n + a.districtOperations.reduce((m, op) => m + op.openTickets, 0),
      0
    ),
  }));

  const totals = {
    agencies: sectors.reduce((s, x) => s + x.agencies.length, 0),
    pilots: tiles.reduce((s, x) => s + x.live, 0),
    tickets: tiles.reduce((s, x) => s + x.open, 0),
    teams: tiles.reduce((s, x) => s + x.teams, 0),
  };

  const openRegistry = (sectorId: string | null) => {
    setInitialSector(sectorId);
    setModalOpen(true);
  };

  // No seed roster — hold the card skeleton until the Neon registry lands.
  if (!registryLoaded) {
    return (
      <section className="mb-6 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Landmark className="h-4 w-4" />
          </span>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Govt Departments &amp; Services
          </p>
        </div>
        <span className="rounded-lg border border-indigo-200/70 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800">
          {totals.agencies} Registered Agencies
        </span>
      </div>

      {/* Hero row */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <p className="text-3xl font-black tracking-tight text-slate-900">
            {sectors.length}
          </p>
          <p className="ml-1.5 text-xs font-semibold text-slate-400">
            Core Sectors
          </p>
        </div>
        <p className="text-[11px] font-medium text-slate-400">
          <span className="font-mono font-bold text-slate-600">
            {totals.pilots}
          </span>{" "}
          live in pilot ·{" "}
          <span className="font-mono font-bold text-slate-600">
            {totals.tickets}
          </span>{" "}
          open complaints ·{" "}
          <span className="font-mono font-bold text-slate-600">
            {totals.teams}
          </span>{" "}
          squads deployed
        </p>
      </div>

      {/* Sector tile grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ sector, live, teams, open }) => {
          const Icon = SECTOR_ICONS[sector.icon] ?? SECTOR_ICON_FALLBACK;
          const style = styleFor(sector);
          return (
            <button
              key={sector.id}
              type="button"
              onClick={() => openRegistry(sector.id)}
              aria-label={`Open ${sector.name} registry — ${sector.agencies.length} agencies`}
              className={`group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${style.hoverBorder}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${
                    SECTOR_ACCENTS[sector.slug] ?? "bg-indigo-50 text-indigo-600"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {live}/{sector.agencies.length} Active
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-black text-slate-900">
                  {style.short}
                  <span className="urdu text-[10px] font-semibold text-slate-400">
                    {sector.nameUrdu}
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  ({sector.agencies.length}{" "}
                  {SECTOR_UNITS[sector.slug] ?? sector.unit ?? "Agencies"})
                </p>
              </div>

              {/* Per-sector telemetry strip */}
              <div className="mt-3 grid grid-cols-2 divide-x divide-slate-200/70 rounded-xl bg-slate-50 ring-1 ring-slate-100 transition-colors duration-200 group-hover:bg-white">
                <div className="px-3 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Squads
                  </p>
                  <p className="font-mono text-xs font-bold tabular-nums text-slate-900">
                    {teams}
                  </p>
                </div>
                <div className="px-3 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Open
                  </p>
                  <p className="font-mono text-xs font-bold tabular-nums text-slate-900">
                    {open}
                  </p>
                </div>
              </div>

              {/* Corner affordance */}
              <ArrowUpRight className="absolute right-3.5 top-1/2 hidden h-4 w-4 -translate-y-[26px] text-slate-300 transition-all duration-200 group-hover:block group-hover:text-indigo-600" />
            </button>
          );
        })}
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => openRegistry(null)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      >
        View All {totals.agencies} Agencies &amp; Live Dispatch Status
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      <GovernmentServicesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialSectorId={initialSector}
      />
    </section>
  );
}
