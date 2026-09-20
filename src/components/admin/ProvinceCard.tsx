"use client";

/* Rich operational province card — the single rendering of a province used by
   the Province Manager dashboard grid (the creator modal's live preview keeps
   its own mirrored markup). Balanced, high-density: header identity, a 2x2
   metrics grid, a standalone caseload strip, and footer actions that
   deep-link into the district manager. */

import { ArrowRight, Building2, CheckCircle2, Landmark, MapPin, Pencil, Plus, Siren, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ProvinceLifecycle } from "@/types/civic";
import { formatInt } from "@/utils/format";

interface CoverageTile {
  icon: LucideIcon;
  label: string;
  labelUr?: string;
  value: ReactNode;
  /** Secondary breakdown rendered under the value (e.g. active/inactive split). */
  sub?: ReactNode;
}

export interface ProvinceCardData {
  name: string;
  nameUr?: string;
  /** Registry identifier, e.g. "PROV-PUN". */
  code: string;
  /** ISO-style slug, e.g. "PK-PU". */
  slug?: string;
  capital?: string;
  lifecycle?: ProvinceLifecycle;
  isDraft?: boolean;
  /** Districts & Cities filed under the province. */
  districts: number;
  /** Districts currently enrolled in the active rollout. */
  activeDistricts: number;
  /** Linked departments (agency rosters) across every district & city. */
  departments: number;
  /** Wards & localities registered across every zone (Tier 4). */
  wards: number;
  /** Municipal desks / field squads on ground. */
  teams: number;
  open: number;
  completed: number;
  total: number;
}

export interface ProvinceCardProps {
  province: ProvinceCardData;
  /** Route to /admin/territories/cities?province=<slug> (district manager). */
  onManage?: () => void;
  /** Quick rename affordance on the card header (dashboard only). */
  onEdit?: () => void;
  /** Flip an unpublished draft to active (dashboard only). */
  onActivate?: () => void;
  /** Quick inline "+ Add District" with this province pre-selected. */
  onAddCity?: () => void;
}

export default function ProvinceCard({
  province,
  onManage,
  onEdit,
  onActivate,
  onAddCity,
}: ProvinceCardProps) {
  const { name, nameUr, isDraft } = province;
  /* Metric fallbacks — a partially-built card payload must never print
     "undefined" inside a tile. */
  const num = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const districts = num(province.districts);
  const activeDistricts = num(province.activeDistricts);
  const departments = num(province.departments);
  const wards = num(province.wards);
  const teams = num(province.teams);
  const open = num(province.open);
  const completed = num(province.completed);
  const total = num(province.total);
  const fixRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const inactiveDistricts = districts - activeDistricts;

  const coverageTiles: CoverageTile[] = [
    {
      icon: Building2,
      label: "Total Cities",
      labelUr: "کل شہر",
      value: `${districts} Managed`,
      sub:
        inactiveDistricts > 0 ? (
          <>
            <span className="text-emerald-700">{activeDistricts} Active</span>
            {" · "}
            <span className="text-slate-400">{inactiveDistricts} Inactive</span>
          </>
        ) : (
          <span className="text-emerald-700">{activeDistricts} Active</span>
        ),
    },
    {
      icon: MapPin,
      label: "Wards & Localities",
      labelUr: "وارڈ / محلہ",
      value: formatInt(wards),
      sub:
        wards > 0 ? (
          <span className="text-slate-400">registered localities</span>
        ) : (
          <span className="text-slate-400">none registered yet</span>
        ),
    },
    {
      icon: Landmark,
      label: "Departments",
      labelUr: "محکمے",
      value: `${departments} Department${departments === 1 ? "" : "s"}`,
      sub:
        departments > 0 ? (
          <span className="text-slate-400">combined municipal desks</span>
        ) : (
          <span className="text-slate-400">none linked yet</span>
        ),
    },
    {
      icon: Users,
      label: "Squads Active",
      labelUr: "ٹیمیں",
      value: `${teams} Active Squad${teams === 1 ? "" : "s"}`,
      sub: <span className="text-slate-400">combined on-ground teams</span>,
    },
  ];

  return (
    <article
      className={`group flex flex-col justify-between gap-4 rounded-3xl border bg-white p-6 shadow-2xs transition-all hover:shadow-sm ${
        isDraft
          ? "border-dashed border-slate-300 hover:border-slate-400"
          : "border-slate-200/90 hover:border-emerald-500/40"
      }`}
    >
      {/* Header: avatar, prominent bilingual identity */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-100 text-lg font-black text-slate-700"
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h3 className="truncate text-xl font-black tracking-tight text-slate-900">
                  {name}
                </h3>
                {nameUr && (
                  <span className="urdu rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-900">
                    {nameUr}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <button
                type="button"
                aria-label={`Rename province ${name}`}
                title={`Edit ${name}`}
                onClick={onEdit}
                className="rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 group-hover:opacity-100 max-sm:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2x2 body metrics grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {coverageTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 transition-colors duration-150 group-hover:border-slate-200"
            >
              <p className="flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <tile.icon className="h-3 w-3 shrink-0" />
                {tile.label}
                {tile.labelUr && (
                  <span className="urdu shrink-0 text-[10px] font-normal normal-case tracking-normal text-slate-400">
                    {tile.labelUr}
                  </span>
                )}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-900">
                {tile.value}
              </p>
              {tile.sub && (
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                  {tile.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Reports & Issues — standalone caseload container inside the card.
            Amber while incidents are live, quiet slate for silent regions. */}
        <div
          className={`rounded-2xl border px-3.5 py-3 transition-colors duration-150 ${
            total > 0
              ? "border-amber-200/70 bg-amber-50/50"
              : "border-slate-100 bg-slate-50/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <Siren className="h-3 w-3 shrink-0" />
              Reports &amp; Issues
              <span className="urdu shrink-0 text-[10px] font-normal normal-case tracking-normal text-slate-400">
                رپورٹس
              </span>
            </p>
            <span
              className={`shrink-0 text-[10px] font-bold tabular-nums ${
                total === 0
                  ? "text-slate-400"
                  : fixRate >= 70
                    ? "text-emerald-700"
                    : "text-amber-700"
              }`}
            >
              {total > 0 ? `${fixRate}% Resolved` : "No reports yet"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5">
            <span className="text-sm font-black text-slate-900 tabular-nums">
              {formatInt(total)}
              <span className="ml-1 text-[10px] font-semibold text-slate-400">
                Reported
              </span>
            </span>
            <span className="flex items-baseline text-sm font-black text-amber-700 tabular-nums">
              {formatInt(open)}
              {open > 0 && (
                <span
                  aria-hidden
                  className="mx-1 h-1.5 w-1.5 self-center animate-pulse rounded-full bg-amber-500"
                />
              )}
              <span className="ml-1 text-[10px] font-semibold text-amber-600/80">
                Open
              </span>
            </span>
            <span className="text-sm font-black text-emerald-700 tabular-nums">
              {formatInt(completed)}
              <span className="ml-1 text-[10px] font-semibold text-emerald-700/80">
                Resolved
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions: deep link into the district manager + quick add */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {isDraft && onActivate ? (
          <button
            type="button"
            onClick={onActivate}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-600/30 bg-white py-2 text-xs font-bold text-emerald-800 transition-all duration-150 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Activate Province
          </button>
        ) : (
          onManage && (
            <button
              type="button"
              onClick={onManage}
              className="flex items-center gap-1 text-xs font-bold text-slate-800 transition-colors duration-150 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
            >
              Manage Districts &amp; Cities
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )
        )}
        {onAddCity && !isDraft && (
          <button
            type="button"
            onClick={onAddCity}
            aria-label={`Add District & City in ${name}`}
            title={`Add District & City in ${name} — opens the form with ${name} pre-selected`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-all duration-150 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
