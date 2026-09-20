"use client";

/* Province → District → Agency coverage tree for the departments console.
   Mirrors the territories page's hierarchy tree (same row geometry, spine
   lines and tier-tinted count bubbles) but rolls up the department registry
   by geography instead: a province row answers "how many departments operate
   here", a district row lists the desks deployed there, and each leaf opens
   that agency's operations deck. Empty provinces stay visible so the
   across-province allocation gap reads at a glance. */

import { useMemo, useState } from "react";
import { Building2, ChevronRight, LayoutGrid, Map as MapIcon } from "lucide-react";
import type {
  CoreSector,
  RegionalAgency,
} from "@/data/departmentRegistry";
import { SECTOR_ACCENTS, SECTOR_ICONS, SECTOR_ICON_FALLBACK } from "./sectorIcons";

const PROVINCE_URDU: Record<string, string> = {
  Punjab: "پنجاب",
  Sindh: "سندھ",
  KPK: "خیبر پختونخوا",
  Balochistan: "بلوچستان",
  "Islamabad ICT": "وفاقی راجگڑھ",
};

/** Canonical province order — PROVINCE_OPTIONS sequence, so the tree matches
    the agency form's multi-select and the provinces page's roster. */
const PROVINCE_ORDER = [
  "Punjab",
  "Sindh",
  "KPK",
  "Balochistan",
  "Islamabad ICT",
];

interface GeoLeaf {
  agency: RegionalAgency;
  sector: CoreSector;
  /** Desks this agency runs inside the district (0 = registered, not yet deployed). */
  divisions: number;
  /** Field squads across those desks. */
  squads: number;
}

interface GeoDistrict {
  name: string;
  leaves: GeoLeaf[];
}

interface GeoProvince {
  name: string;
  districts: GeoDistrict[];
  agencies: number;
}

function buildGeoIndex(sectors: CoreSector[]): GeoProvince[] {
  const provinces = new Map<
    string,
    Map<string, { name: string; leaves: Map<string, GeoLeaf> }>
  >();
  for (const sector of sectors) {
    for (const agency of sector.agencies) {
      const province = agency.province;
      if (!province) continue;
      if (!provinces.has(province)) provinces.set(province, new Map());
      const districts = provinces.get(province)!;
      for (const district of agency.jurisdictionDistricts) {
        const key = district.toLowerCase();
        if (!districts.has(key)) {
          districts.set(key, { name: district, leaves: new Map() });
        }
        const ops = agency.districtOperations.filter(
          (op) => op.district.toLowerCase() === key
        );
        districts.get(key)!.leaves.set(agency.id, {
          agency,
          sector,
          divisions: ops.length,
          squads: ops.reduce((n, op) => n + op.squads.length, 0),
        });
      }
    }
  }
  const ordered = [
    ...PROVINCE_ORDER.filter((p) => provinces.has(p)),
    ...[...provinces.keys()].filter((p) => !PROVINCE_ORDER.includes(p)),
  ];
  return ordered.map((name) => {
    const districts = [...provinces.get(name)!.values()].map((d) => ({
      name: d.name,
      leaves: [...d.leaves.values()],
    }));
    const agencies = new Set(
      districts.flatMap((d) => d.leaves.map((l) => l.agency.id))
    );
    return { name, districts, agencies: agencies.size };
  });
}

const STATUS_DOT: Record<RegionalAgency["status"], string> = {
  active: "bg-emerald-500",
  pilot: "bg-amber-500 animate-pulse",
  standby: "bg-slate-300",
};

const STATUS_LABEL: Record<RegionalAgency["status"], string> = {
  active: "Active",
  pilot: "Active Pilot",
  standby: "Standby — not yet deployed",
};

/* -------------------------------- Tree rows ------------------------------- */

function ProvinceRow({
  province,
  open,
  onToggle,
}: {
  province: GeoProvince;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={false}
      aria-expanded={open}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      title={`Tier 1 · ${province.agencies} department${
        province.agencies === 1 ? "" : "s"
      } registered across ${province.name}`}
      className="group/node relative flex cursor-pointer items-center gap-1.5 rounded-r-xl py-1 pr-1.5 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
    >
      <button
        type="button"
        aria-label={`${open ? "Collapse" : "Expand"} ${province.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      <MapIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="min-w-0 truncate">{province.name}</span>
      <span className="urdu hidden shrink-0 text-[10px] font-medium text-slate-400 sm:inline">
        {PROVINCE_URDU[province.name] ?? ""}
      </span>
      <span className="flex-1" />
      <span
        title={`${province.agencies} department${
          province.agencies === 1 ? "" : "s"
        } operating in ${province.name}`}
        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
          province.agencies > 0
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {province.agencies}
      </span>
    </div>
  );
}

function DistrictRow({
  district,
  open,
  onToggle,
}: {
  district: GeoDistrict;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={false}
      aria-expanded={open}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      title={`Tier 2 · ${district.leaves.length} department${
        district.leaves.length === 1 ? "" : "s"
      } present in ${district.name}`}
      className="group/node relative flex cursor-pointer items-center gap-1.5 rounded-r-xl py-1 pr-1.5 text-xs font-semibold text-slate-800 transition-colors duration-150 before:absolute before:-left-3 before:top-3.5 before:h-px before:w-3 before:bg-slate-200/90 before:content-[''] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
    >
      <button
        type="button"
        aria-label={`${open ? "Collapse" : "Expand"} ${district.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span className="min-w-0 truncate">{district.name}</span>
      <span className="flex-1" />
      <span
        title={`${district.leaves.length} department${
          district.leaves.length === 1 ? "" : "s"
        } operating in ${district.name}`}
        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
          district.leaves.length > 0
            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200/70"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {district.leaves.length}
      </span>
    </div>
  );
}

function AgencyLeafRow({
  leaf,
  district,
  selected,
  onSelect,
}: {
  leaf: GeoLeaf;
  district: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = SECTOR_ICONS[leaf.sector.icon] ?? SECTOR_ICON_FALLBACK;
  const accent = SECTOR_ACCENTS[leaf.sector.id] ?? "bg-indigo-50 text-indigo-600";
  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={selected}
      onClick={onSelect}
      title={`${leaf.agency.code} — ${leaf.agency.fullName} · ${STATUS_LABEL[leaf.agency.status]} · ${leaf.divisions} desk${leaf.divisions === 1 ? "" : "s"}, ${leaf.squads} squad${leaf.squads === 1 ? "" : "s"} in ${district}`}
      className={`flex w-full cursor-pointer items-center gap-1.5 rounded-r-xl py-1 pr-1.5 text-xs font-semibold transition-colors duration-150 before:absolute before:-left-3 before:top-3.5 before:h-px before:w-3 before:bg-slate-200/90 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
        selected
          ? "bg-emerald-50 text-emerald-950"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span aria-hidden className="w-5 shrink-0" />
      <span
        title={STATUS_LABEL[leaf.agency.status]}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[leaf.agency.status]}`}
      />
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${accent}`}
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
      <span className="min-w-0 truncate font-bold">{leaf.agency.code}</span>
      <span className="min-w-0 flex-1 truncate font-normal text-slate-400">
        {leaf.divisions > 0 ? leaf.agency.districtOperations.find((op) => op.district.toLowerCase() === district.toLowerCase())?.divisionName : "No desk yet"}
      </span>
      <span
        title={`${leaf.squads} field squad${leaf.squads === 1 ? "" : "s"} on ground in ${district}`}
        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
          leaf.squads > 0
            ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200/70"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {leaf.squads}
      </span>
    </button>
  );
}

/* --------------------------------- Panel ---------------------------------- */

export default function DepartmentGeoTree({
  sectors,
  selectedAgencyId,
  onSelectAgency,
  query,
}: {
  sectors: CoreSector[];
  selectedAgencyId: string;
  onSelectAgency: (id: string | null) => void;
  /** Active sidebar search — non-empty switches the tree to a flat hit list. */
  query: string;
}) {
  const geo = useMemo(() => buildGeoIndex(sectors), [sectors]);

  const [open, setOpen] = useState<Set<string>>(() => {
    // Land expanded around the URL-selected agency: its province and the
    // first district where it operates. Later selections (leaf clicks) expand
    // their branch inside the click handler — no selection-sync effect.
    for (const province of geo) {
      for (const district of province.districts) {
        if (district.leaves.some((l) => l.agency.id === selectedAgencyId)) {
          return new Set([province.name, `${province.name}::${district.name}`]);
        }
      }
    }
    return new Set<string>();
  });

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const revealBranch = (provinceName: string, districtName: string) =>
    setOpen((prev) =>
      new Set(prev).add(provinceName).add(`${provinceName}::${districtName}`)
    );

  const totalAgencies = geo.reduce((n, p) => n + p.agencies, 0);
  const q = query.trim().toLowerCase();

  if (q) {
    const hits = geo
      .flatMap((p) =>
        p.districts.flatMap((d) =>
          d.leaves.map((l) => ({ leaf: l, district: d.name, province: p.name }))
        )
      )
      .filter(
        ({ leaf, district, province }) =>
          leaf.agency.code.toLowerCase().includes(q) ||
          leaf.agency.fullName.toLowerCase().includes(q) ||
          district.toLowerCase().includes(q) ||
          province.toLowerCase().includes(q)
      );
    const seen = new Set<string>();
    return (
      <div className="space-y-1 px-3 pb-4 pt-3">
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Matches in coverage ({hits.length})
        </p>
        {hits.length === 0 && (
          <p className="px-1 py-2 text-xs font-medium text-slate-400">
            No department, district or province matches “{query}”.
          </p>
        )}
        {hits.map(({ leaf, district, province }) => {
          if (seen.has(leaf.agency.id + district)) return null;
          seen.add(leaf.agency.id + district);
          const Icon = SECTOR_ICONS[leaf.sector.icon] ?? SECTOR_ICON_FALLBACK;
          const accent =
            SECTOR_ACCENTS[leaf.sector.id] ?? "bg-indigo-50 text-indigo-600";
          return (
            <button
              key={leaf.agency.id + district}
              type="button"
              onClick={() => onSelectAgency(leaf.agency.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
                leaf.agency.id === selectedAgencyId
                  ? "bg-emerald-50 text-emerald-950"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${accent}`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{leaf.agency.code}</span>
                <span className="block truncate text-[10px] font-medium text-slate-400">
                  {district} · {province}
                </span>
              </span>
              <span className="flex-1" />
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                  leaf.squads > 0
                    ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200/70"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {leaf.squads}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="px-3 pb-4 pt-3">
      <button
        type="button"
        aria-current={false}
        title="Clear the selection — every province's coverage rolls up here"
        onClick={() => onSelectAgency(null)}
        className="mb-2.5 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
      >
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        All Departments
        <span className="urdu text-[10px] font-medium text-slate-400">تمام محکمے</span>
        <span className="flex-1" />
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
          {totalAgencies}
        </span>
      </button>

      <ul role="tree" aria-label="Department coverage by province" className="space-y-1">
        {geo.map((province) => {
          const provinceOpen = open.has(province.name);
          return (
            <li key={province.name} className="relative">
              <ProvinceRow
                province={province}
                open={provinceOpen}
                onToggle={() => toggle(province.name)}
              />
              {province.districts.length > 0 && (
                <div
                  className={`grid transition-all duration-200 ease-out ${
                    provinceOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                  aria-hidden={!provinceOpen}
                  inert={!provinceOpen}
                >
                  <div className="min-h-0 overflow-hidden">
                    <ul className="relative ml-4 space-y-1 border-l border-slate-200/80 pl-3 pt-1">
                      {province.districts.map((district) => {
                        const districtKey = `${province.name}::${district.name}`;
                        const districtOpen = open.has(districtKey);
                        return (
                          <li key={district.name} className="relative">
                            <DistrictRow
                              district={district}
                              open={districtOpen}
                              onToggle={() => toggle(districtKey)}
                            />
                            <div
                              className={`grid transition-all duration-200 ease-out ${
                                districtOpen
                                  ? "grid-rows-[1fr] opacity-100"
                                  : "grid-rows-[0fr] opacity-0"
                              }`}
                              aria-hidden={!districtOpen}
                              inert={!districtOpen}
                            >
                              <div className="min-h-0 overflow-hidden">
                                <ul className="relative ml-4 space-y-1 border-l border-slate-200/80 pl-3 pt-1">
                                  {district.leaves.map((leaf) => (
                                    <li key={leaf.agency.id} className="relative">
                                      <AgencyLeafRow
                                        leaf={leaf}
                                        district={district.name}
                                        selected={leaf.agency.id === selectedAgencyId}
                                        onSelect={() => {
                                          revealBranch(province.name, district.name);
                                          onSelectAgency(leaf.agency.id);
                                        }}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
              {province.districts.length === 0 && provinceOpen && (
                <p className="ml-9 py-1 text-[11px] font-medium text-slate-400">
                  No departments registered yet — assign one to start coverage.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
