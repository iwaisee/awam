"use client";

/* Province Manager — the right canvas of /admin/territories/provinces.

   Dashboard mode (no ?province= param): the three top KPI cards plus the
   full province card grid. Focus mode (?province=punjab): the selected
   province rendered with the Districts & Cities manager layout — the same
   telemetry tiles and the same row editor (status switch, zones/wards/open
   counts, configure / edit / delete actions). */

import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Inbox,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import ProvinceCard, { type ProvinceCardData } from "./ProvinceCard";
import TerritoryKPIs, { type TerritoryTelemetry } from "./TerritoryKPIs";
import type { CityItem, ProvinceItem } from "@/types/civic";
import { LIFECYCLE_META } from "@/types/civic";
import type { TerritoryNode } from "@/lib/territoryTree";
import { agenciesOperatingIn, squadsOnGround } from "@/data/departmentRegistry";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import { sectorIcon } from "./sectorIcons";
import { formatInt } from "@/utils/format";

export interface ProvinceGridEntry {
  name: string;
  nameUr?: string;
  item?: ProvinceItem;
  node?: TerritoryNode;
  card: ProvinceCardData;
}

/** Public-reporting toggle — identical widget to the districts manager's
    status switch. */
function StatusSwitch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
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
}

export default function ProvinceManager({
  mode,
  entries,
  telemetry,
  focus,
  onOpenAddProvince,
  onOpenProvince,
  onEditProvince,
  onActivateProvince,
  onAddDistrict,
  onOpenDistrict,
  onEditDistrict,
  onToggleDistrictStatus,
  onDeleteDistrict,
  onGoToDashboard,
}: {
  mode: "dashboard" | "focus";
  entries: ProvinceGridEntry[];
  telemetry: TerritoryTelemetry;
  /** Required in focus mode — the selected province node + stored record. */
  focus?: {
    node: TerritoryNode;
    item?: ProvinceItem;
  };
  onOpenAddProvince: () => void;
  /** Card CTA — routes to /admin/territories/cities?province=<slug>. */
  onOpenProvince: (name: string) => void;
  onEditProvince: (item: ProvinceItem) => void;
  onActivateProvince: (name: string) => void;
  /** Opens the Add District modal, province pre-selected. */
  onAddDistrict: (provinceName?: string) => void;
  /** District row click — routes to /admin/territories/cities?district=…. */
  onOpenDistrict: (node: TerritoryNode) => void;
  onEditDistrict: (city: CityItem) => void;
  /** Flips a district's public-reporting status (cities-manager switch). */
  onToggleDistrictStatus: (cityId: string) => void;
  /** Opens the type-to-confirm district deletion dialog. */
  onDeleteDistrict: (city: CityItem) => void;
  onGoToDashboard: () => void;
}) {
  /* Live departments registry — the store the /admin/departments console
     owns, so focus-deck department chips and squad rosters mirror admin
     edits. Called unconditionally (before the focus-mode early return). */
  const { sectors: registrySectors } = useDepartmentRegistry();

  /* ============================ Focus mode ============================ */
  if (mode === "focus" && focus) {
    const { node, item } = focus;
    const lifecycleMeta = item?.lifecycle
      ? LIFECYCLE_META[item.lifecycle]
      : null;
    const activeDistricts = node.children.filter(
      (d) => d.city?.status === "active"
    ).length;
    /* Departments operating in this province — resolved from the government
       department registry (GEPCO, LESCO, WASA, SWMC, LWMC, …), scoped to the
       province's rostered districts, grouped by sector for the chips. */
    const departments = agenciesOperatingIn(
      node.name,
      node.children.map((d) => d.name),
      registrySectors
    );
    const sectorGroups: {
      sector: string;
      departments: typeof departments;
    }[] = [];
    for (const dept of departments) {
      const group = sectorGroups.find((g) => g.sector === dept.sector);
      if (group) group.departments.push(dept);
      else sectorGroups.push({ sector: dept.sector, departments: [dept] });
    }
    /* Every deployed field squad inside the province's districts — the real
       roster from the department registry (off_duty excluded). */
    const squads = squadsOnGround(
      node.children.map((d) => d.name),
      registrySectors
    );

    return (
      <>
        {/* Header — manager-style, mirroring the districts manager */}
        <div className="space-y-3">
          <nav
            aria-label="Territory breadcrumb"
            className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
          >
            <button
              type="button"
              onClick={onGoToDashboard}
              className="transition-colors duration-150 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
            >
              Province
            </button>
            <span aria-hidden className="text-slate-300">
              &gt;
            </span>
            <span className="font-bold text-emerald-800">{node.name}</span>
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Districts &amp; Cities Manager
                <span className="urdu shrink-0 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                  ضلع / شہر
                </span>
              </p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                  {node.name}
                </h2>
                {node.nameUr && (
                  <span className="urdu text-lg font-medium text-slate-500">
                    {node.nameUr}
                  </span>
                )}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {item?.code ?? node.code}
                  {item?.slug ? ` • ${item.slug}` : ""}
                </span>
                {item?.lifecycle && (
                  <span
                    title={lifecycleMeta?.label}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      item.lifecycle === "phase1_pilot"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
                        : item.lifecycle === "full_rollout"
                          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200/70"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        item.lifecycle === "phase1_pilot"
                          ? "animate-pulse bg-emerald-500"
                          : item.lifecycle === "full_rollout"
                            ? "bg-blue-500"
                            : "border border-slate-400 bg-white"
                      }`}
                    />
                    {lifecycleMeta?.label ?? ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                  <ShieldCheck className="h-3 w-3" />
                  {node.children.length} District
                  {node.children.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                Tier 1 · Province (صوبہ) — managing the Districts &amp; Cities
                filed under {node.name}.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onGoToDashboard}
                title="Back to the Province Manager — all provinces"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All Provinces
              </button>
              <button
                type="button"
                onClick={() => onAddDistrict(node.name)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
              >
                <Plus className="h-3.5 w-3.5" />
                Add District &amp; City
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry tiles — the districts manager's exact strip */}
        <section
          aria-label="Districts telemetry"
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
              {node.children.length}
            </p>
            <p className="mt-2 text-[11px] font-medium text-emerald-700">
              {activeDistricts} active pilot
              {activeDistricts === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Registered Citizens
              </p>
              <Users className="h-4 w-4 shrink-0 text-slate-300" />
            </div>
            <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
              {formatInt(node.citizens)}
            </p>
            <p className="mt-2 text-[11px] font-medium text-slate-400">
              across {node.children.length} district
              {node.children.length === 1 ? "" : "s"}
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
              {formatInt(node.open)}{" "}
              <span className="text-xs font-semibold text-slate-400">
                Open Tickets
              </span>
            </p>
            <p className="mt-2 text-[11px] font-medium text-slate-400">
              live ledger + seeded baseline
            </p>
          </div>
        </section>

        {/* Departments & squads on the ground in this province */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <section
            aria-label={`Departments operating in ${node.name}`}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs lg:col-span-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Departments Operating in {node.name}
              </p>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 tabular-nums">
                {departments.length}
              </span>
            </div>
            {departments.length === 0 ? (
              <p className="mt-3 text-[11px] font-medium text-slate-400">
                No departments linked yet — add agencies to this province&apos;s
                districts to see them here.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                {sectorGroups.map((group) => {
                  const SectorIcon = sectorIcon(
                    group.departments[0]?.sectorIcon
                  );
                  return (
                    <div key={group.sector}>
                      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        <SectorIcon className="h-3 w-3 shrink-0" />
                        {group.sector}
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {group.departments.map((dept) => (
                          <li
                            key={dept.code}
                            title={`${dept.fullName} — ${dept.sector}`}
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
            aria-label={`Field squads in ${node.name}`}
            className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Field Squads on Ground
              </p>
              <Users className="h-4 w-4 shrink-0 text-slate-300" />
            </div>
            <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
              {formatInt(squads.length)}{" "}
              <span className="text-xs font-semibold text-slate-400">
                Deployed Squad{squads.length === 1 ? "" : "s"}
              </span>
            </p>
            {squads.length === 0 ? (
              <p className="mt-2 text-[11px] font-medium text-slate-400">
                No squads deployed yet — squads roster from the Departments
                &amp; Agencies registry.
              </p>
            ) : (
              <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pb-1" style={{ maxHeight: 224 }}>
                {squads.map((squad) => (
                  <li
                    key={squad.id}
                    title={`${squad.name} — ${squad.agencyCode} (${squad.district}) · ${squad.members} members${squad.shift ? ` · ${squad.shift} shift` : ""}`}
                    className="flex items-center gap-1.5 text-[11px]"
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        squad.status === "active"
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span className="min-w-0 truncate font-medium text-slate-700">
                      {squad.name}
                    </span>
                    <span className="flex-1" />
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                      {squad.agencyCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Districts & Cities — the districts manager's exact table editor */}
        <section
          aria-label="Districts and cities in province"
          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h3 className="font-heading text-sm font-bold text-slate-900">
                Districts &amp; Cities in {node.name}
              </h3>
              <p className="text-[11px] text-slate-400">
                Tier 2 · ضلع / شہر — click a row to open its governance deck.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddDistrict(node.name)}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-100/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 hover:text-emerald-950"
            >
              <Plus className="h-3 w-3" />
              Add District &amp; City
            </button>
          </div>
          {node.children.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <MapPin className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-600">
                No districts in {node.name} yet
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[11px] leading-4 text-slate-400">
                {node.name} is in the {lifecycleMeta?.label ?? "setup"} stage —
                file its first District &amp; City to begin mapping wards.
              </p>
              <button
                type="button"
                onClick={() => onAddDistrict(node.name)}
                className="mt-3 rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900"
              >
                + Add District &amp; City
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">
                      District &amp; City
                    </th>
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
                  {node.children.map((district) => {
                    const active = district.city?.status === "active";
                    return (
                      <tr
                        key={district.id}
                        onClick={() => onOpenDistrict(district)}
                        className="cursor-pointer transition-colors duration-150 hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">
                            {district.name}
                          </p>
                          {district.nameUr && (
                            <p className="urdu text-[11px] text-slate-400">
                              {district.nameUr}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            <StatusSwitch
                              checked={active}
                              onToggle={() =>
                                onToggleDistrictStatus(district.city!.id)
                              }
                              label={`Public reporting for ${district.name}`}
                            />
                            <span
                              className={`whitespace-nowrap text-[10px] font-bold ${
                                active ? "text-emerald-700" : "text-slate-400"
                              }`}
                            >
                              {active ? "Active" : "Staged"}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">
                          {district.zoneCount}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">
                          {formatInt(district.areaCount)}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">
                          {district.open > 0 ? formatInt(district.open) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            aria-label={`Configure district ${district.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDistrict(district);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit district ${district.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (district.city) onEditDistrict(district.city);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete district ${district.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (district.city)
                                onDeleteDistrict(district.city);
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
        </section>
      </>
    );
  }

  /* =========================== Dashboard mode =========================== */

  return (
    <>
      {/* Header: breadcrumb + title + the single primary Add Province button */}
      <div className="space-y-3">
        <nav
          aria-label="Territory breadcrumb"
          className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
        >
          <span className="font-bold text-emerald-800">Province</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                Province Manager
              </h2>
              <span className="urdu text-lg font-medium text-slate-500">
                صوبہ
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                <ShieldCheck className="h-3 w-3" />
                {entries.length} Region{entries.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-400">
              Tier 1 · Province (صوبہ) — top-level regions; every District
              &amp; City nests under one of these.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAddProvince}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0F5132] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Province / Region
          </button>
        </div>
      </div>

      {/* Executive KPI telemetry strip */}
      <TerritoryKPIs
        telemetry={telemetry}
        regionNames={entries.map((e) => e.name)}
      />

      {/* Province cards grid */}
      <section aria-label="Provinces and regions" className="space-y-3">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <MapIcon className="mx-auto h-7 w-7 text-slate-300" />
            <p className="font-heading mt-3 text-sm font-bold text-slate-700">
              No provinces yet
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-400">
              Create the first top-level region to start nesting districts
              under it.
            </p>
            <button
              type="button"
              onClick={onOpenAddProvince}
              className="mt-4 rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900"
            >
              + Add Province / Region
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {entries.map((entry) => (
              <ProvinceCard
                key={entry.name}
                province={entry.card}
                onManage={() => onOpenProvince(entry.name)}
                onEdit={() =>
                  onEditProvince(
                    entry.item ?? {
                      name_en: entry.name,
                      name_ur: entry.nameUr,
                    }
                  )
                }
                onActivate={() => onActivateProvince(entry.name)}
                onAddCity={() => onAddDistrict(entry.name)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
