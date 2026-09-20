"use client";

/* Executive KPI strip for the Province Manager — the three top telemetry
   cards (regions, citizens, incident lifecycle) above the province grid. */

import { Activity, EyeOff, Map as MapIcon, UserCheck, Users } from "lucide-react";
import { formatInt } from "@/utils/format";

export interface TerritoryTelemetry {
  totalRegions: number;
  activeRegions: number;
  /** Distinct phone-identified reporters in the live ledger — real users only. */
  citizens: number;
  /** Reports filed without any identity; excluded from the citizens count. */
  anonymousReports: number;
  open: number;
  resolved: number;
  total: number;
}

export default function TerritoryKPIs({
  telemetry,
  regionNames,
}: {
  telemetry: TerritoryTelemetry;
  /** Display names of every rostered region (footer of the incident card). */
  regionNames: string[];
}) {
  const plannedRegions = telemetry.totalRegions - telemetry.activeRegions;

  return (
    <section
      aria-label="Province telemetry"
      className="grid grid-cols-1 gap-5 md:grid-cols-3"
    >
      {/* 1 · Provinces & regions */}
      <article className="flex h-[160px] flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Provinces &amp; Regions
          </p>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <MapIcon className="h-4 w-4" />
          </span>
        </div>
        <p className="flex items-baseline">
          <span className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">
            {telemetry.totalRegions}
          </span>
          <span className="ml-2 text-[11px] font-medium text-slate-500">
            Total Territories
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            />
            {telemetry.activeRegions} Active Pilot
            {telemetry.activeRegions === 1 ? "" : "s"}
          </span>
          <span aria-hidden className="text-slate-300">
            ·
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full border border-slate-400 bg-white"
            />
            {plannedRegions} Setup / Planned
          </span>
        </p>
      </article>

      {/* 2 · Platform citizens */}
      <article className="flex h-[160px] flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Platform Citizens
          </p>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Users className="h-4 w-4" />
          </span>
        </div>
        <p className="flex items-baseline">
          {/* en-US grouping — never a stray space before the comma. */}
          <span className="font-mono text-xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatInt(telemetry.citizens)}
          </span>
          <span className="ml-2 text-[11px] font-medium text-slate-500">
            Total Joined
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
          <span className="flex items-center gap-1 text-emerald-700">
            <UserCheck className="h-3 w-3" />
            {formatInt(telemetry.citizens)} Registered
          </span>
          <span aria-hidden className="text-slate-300">
            ·
          </span>
          <span className="flex items-center gap-1 text-amber-700">
            <EyeOff className="h-3 w-3" />
            {formatInt(telemetry.anonymousReports)} Anonymous
          </span>
        </p>
      </article>

      {/* 3 · Incident status across all regions */}
      <article className="flex h-[160px] flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Incident Status (All Regions)
          </p>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Activity className="h-4 w-4" />
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="pr-2">
            <p className="text-lg font-bold tracking-tight text-slate-900 tabular-nums">
              {formatInt(telemetry.total)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              All
            </p>
          </div>
          <div className="px-3">
            <p className="text-lg font-bold tracking-tight text-amber-600 tabular-nums">
              {formatInt(telemetry.open)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
              Open
            </p>
          </div>
          <div className="pl-3">
            <p className="text-lg font-bold tracking-tight text-emerald-600 tabular-nums">
              {formatInt(telemetry.resolved)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
              Resolved
            </p>
          </div>
        </div>
        <p className="truncate pt-1 text-[10px] font-medium text-slate-400">
          Cross-province total: {regionNames.join(" & ")}
        </p>
      </article>
    </section>
  );
}
