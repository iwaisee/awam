"use client";

/* Left hierarchy navigator for the Areas & Wards Controls split pane — the
   Province → District & City → Tehsil & Zone → Ward/Mohallah/Village tree with
   search, jurisdiction filter pills, a column legend and telemetry pills.
   Purely presentational: the selection lives in the URL (see territoryUrl.ts),
   so every click routes instead of mutating local state. */

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronsUpDown,
  ChevronRight,
  Layers,
  LayoutGrid,
  ListTree,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import {
  collectParentIds,
  type TerritoryNode,
} from "@/lib/territoryTree";
import type { JurisdictionType } from "@/types/civic";

/* ------------------------------ Filter pills ------------------------------ */

/** Segmented jurisdiction filter — toggles civilian municipal wards against
    military cantonment boards (relevant wherever both govern, e.g. Sialkot). */
const JURISDICTION_FILTERS: {
  value: "all" | JurisdictionType;
  label: string;
  title: string;
}[] = [
  { value: "all", label: "All", title: "Show every zone regardless of governing desk" },
  {
    value: "Municipal Corporation",
    label: "MCS Municipal",
    title: "Civilian municipal wards under the Municipal Corporation (MCS)",
  },
  {
    value: "Cantonment Board",
    label: "Cantt Board",
    title: "Military cantonment wards under the Cantonment Board",
  },
];

/* -------------------------------- Tree row -------------------------------- */

interface TreeRowProps {
  node: TerritoryNode;
  depth: number;
  selectedId: string;
  isOpen: (node: TerritoryNode) => boolean;
  onToggle: (id: string) => void;
  onSelect: (node: TerritoryNode) => void;
  onQuickAdd: (node: TerritoryNode) => void;
}

function TreeRow({
  node,
  depth,
  selectedId,
  isOpen,
  onToggle,
  onSelect,
  onQuickAdd,
}: TreeRowProps) {
  const open = isOpen(node);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const Icon =
    node.level === "province"
      ? MapIcon
      : node.level === "city"
        ? Building2
        : node.level === "zone"
          ? Layers
          : MapPin;
  const iconClass =
    node.level === "province"
      ? "text-slate-400"
      : node.level === "city"
        ? "text-emerald-600"
        : node.level === "zone"
          ? "text-blue-600"
          : "text-rose-600";
  const quickAddLabel =
    node.level === "province"
      ? `Add District & City under ${node.name}`
      : node.level === "city"
        ? `Add Tehsil / Zone in ${node.name}`
        : `Add Ward / Mohallah in ${node.name}`;

  return (
    <li className="relative">
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={0}
        onClick={() => onSelect(node)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node);
          }
        }}
        title={
          node.level === "province"
            ? `Tier 1 · Province (صوبہ)`
            : node.level === "city"
              ? `Tier 2 · District & City (ضلع / شہر)`
              : node.level === "zone"
                ? `Tier 3 · Tehsil & Zone (تحصیل / زون)`
                : `Tier 4 · Ward, Mohallah & Village (وارڈ / محلہ / دیہات)`
        }
        className={`group/node relative flex cursor-pointer items-center gap-1.5 rounded-r-xl py-1 pr-1.5 text-xs font-semibold transition-colors duration-150 before:absolute before:-left-3 before:top-3.5 before:h-px before:w-3 before:bg-slate-200/90 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
          depth > 0 ? "" : "before:hidden"
        } ${
          isSelected
            ? "-ml-[15px] border-l-4 border-emerald-600 bg-emerald-50 pl-3 font-bold text-emerald-950 before:hidden"
            : "text-slate-800 hover:bg-slate-50"
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                open ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
        <span className="min-w-0 truncate">{node.name}</span>
        {node.nameUr && (
          <span className="urdu hidden shrink-0 text-[10px] font-medium text-slate-400 sm:inline">
            {node.nameUr}
          </span>
        )}
        <span className="flex-1" />
        {/* Roll-up count bubble — provinces show their District & City count,
            districts their Tehsil & Zone count, zones their Ward/Mohallah
            count. Tinted per tier so the levels read apart; zero-count rows
            stay quiet slate. */}
        {node.level !== "mohallah" && (
          <span
            title={
              node.level === "province"
                ? `${node.children.length} District & Cit${node.children.length === 1 ? "y" : "ies"} under ${node.name}`
                : node.level === "city"
                  ? `${node.children.length} Tehsil${node.children.length === 1 ? "" : "s"} & Zone${node.children.length === 1 ? "" : "s"} in ${node.name}`
                  : `${node.children.length} Ward / Mohallah${node.children.length === 1 ? "" : "s"} in ${node.name}`
            }
            className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
              node.children.length > 0
                ? node.level === "province"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
                  : node.level === "city"
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200/70"
                    : "bg-violet-50 text-violet-700 ring-1 ring-violet-200/70"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {node.children.length}
          </span>
        )}
        {node.level !== "mohallah" && (
          <button
            type="button"
            aria-label={quickAddLabel}
            title={quickAddLabel}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(node);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity duration-150 hover:bg-emerald-50 hover:text-emerald-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 group-hover/node:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {hasChildren && (
        <div
          className={`grid transition-all duration-200 ease-out ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            {/* Nested spine: vertical rule + elbow ticks drawn by each row's
                before pseudo-element pointing at the branch. */}
            <ul className="relative ml-4 space-y-1 border-l border-slate-200/80 pl-3 pt-1">
              {node.children.map((child) => (
                <TreeRow
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  isOpen={isOpen}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onQuickAdd={onQuickAdd}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

/* --------------------------------- Tree ----------------------------------- */

export default function TerritoryTree({
  roots,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onQuickAdd,
  onOpenAllProvinces,
  allProvincesActive = false,
}: {
  /** Full province-rooted hierarchy (unfiltered). */
  roots: TerritoryNode[];
  /** Selected node id — "" when a level dashboard is open. */
  selectedId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: TerritoryNode) => void;
  onQuickAdd: (node: TerritoryNode) => void;
  /** Opens the Province Manager — the all-provinces dashboard. When provided,
      a pinned shortcut is rendered above the tree roots. */
  onOpenAllProvinces?: () => void;
  /** Highlights the pinned shortcut while the all-provinces dashboard shows. */
  allProvincesActive?: boolean;
}) {
  const [treeSearch, setTreeSearch] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<
    "all" | JurisdictionType
  >("all");

  const searchActive = treeSearch.trim().length > 0;

  /** Jurisdiction filter first (prunes non-matching zones), then search
      (keeps any node whose name/code/Urdu matches or has matching progeny). */
  const visibleRoots = useMemo(() => {
    let current = roots;
    if (jurisdictionFilter !== "all") {
      const filterZones = (nodes: TerritoryNode[]): TerritoryNode[] =>
        nodes
          .map((node) => {
            if (node.level === "province" || node.level === "city")
              return { ...node, children: filterZones(node.children) };
            if (node.level === "zone")
              return node.zone?.jurisdiction === jurisdictionFilter
                ? node
                : null;
            return node;
          })
          .filter((n): n is TerritoryNode => n !== null);
      current = filterZones(current);
    }
    const rawQ = treeSearch.trim();
    if (!rawQ) return current;
    const q = rawQ.toLowerCase();
    const searchTree = (nodes: TerritoryNode[]): TerritoryNode[] => {
      const out: TerritoryNode[] = [];
      for (const node of nodes) {
        const childMatches =
          node.children.length > 0 ? searchTree(node.children) : [];
        const selfMatch =
          node.name.toLowerCase().includes(q) ||
          node.code.toLowerCase().includes(q) ||
          (node.nameUr ?? "").includes(rawQ);
        if (selfMatch || childMatches.length > 0) {
          out.push({
            ...node,
            children: selfMatch ? node.children : childMatches,
          });
        }
      }
      return out;
    };
    return searchTree(current);
  }, [roots, treeSearch, jurisdictionFilter]);

  const isNodeOpen = (node: TerritoryNode) =>
    searchActive ? node.children.length > 0 : expanded.has(node.id);

  const visibleParentIds = useMemo(
    () => collectParentIds(visibleRoots),
    [visibleRoots]
  );
  const allOpen =
    visibleParentIds.length > 0 &&
    visibleParentIds.every((id) => expanded.has(id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ------------------------- Tree header ------------------------- */}
      <div className="shrink-0 border-b border-slate-100 px-4 pb-3.5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <ListTree className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading truncate text-sm font-bold text-slate-900">
                Administrative Hierarchy
              </h2>
              {/* Standard 4-tier civic chain — English label + Urdu nomenclature. */}
              <p className="text-[9px] font-medium leading-3.5 text-slate-400">
                Province (صوبہ) → District &amp; City (ضلع / شہر) → Tehsil
                &amp; Zone (تحصیل / زون) → Ward · Mohallah · Village (وارڈ /
                محلہ / دیہات)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (allOpen) {
                for (const id of visibleParentIds) onToggle(id);
              } else {
                // Expand All toggles every collapsed parent through the same
                // handler the rows use, so one code path owns the state.
                for (const id of visibleParentIds)
                  if (!expanded.has(id)) onToggle(id);
              }
            }}
            aria-label={allOpen ? "Collapse all branches" : "Expand all branches"}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {allOpen ? "Collapse All" : "Expand All"}
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder="Search territories..."
            aria-label="Search territories"
            className="w-full rounded-xl border border-slate-200/80 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by jurisdiction"
          className="mt-2 flex items-center gap-1"
        >
          {JURISDICTION_FILTERS.map((filter) => {
            const active = jurisdictionFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={active}
                title={filter.title}
                onClick={() => setJurisdictionFilter(filter.value)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ${
                  active
                    ? "bg-[#0F5132] text-white shadow-xs"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* --------------------------- Tree nodes --------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {/* Pinned "All Provinces" shortcut — always one click from the
            Province Manager, whatever branch the tree is in. */}
        {onOpenAllProvinces && (
          <button
            type="button"
            aria-current={allProvincesActive || undefined}
            title="Open the Province Manager — see and manage every province"
            onClick={onOpenAllProvinces}
            className={`mb-2.5 flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 ${
              allProvincesActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-900"
            }`}
          >
            <LayoutGrid className={`h-3.5 w-3.5 shrink-0 ${allProvincesActive ? "text-emerald-700" : "text-slate-400"}`} />
            All Provinces
            <span className="urdu text-[10px] font-medium text-slate-400">تمام صوبے</span>
            <span className="flex-1" />
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
              {roots.length}
            </span>
          </button>
        )}
        {visibleRoots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
            <Search className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-600">
              No territories match
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Nothing matches “{treeSearch.trim()}”
              {jurisdictionFilter !== "all"
                ? " in the selected jurisdiction filter"
                : ""}
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setTreeSearch("");
                setJurisdictionFilter("all");
              }}
              className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <ul role="tree" aria-label="Administrative hierarchy" className="space-y-1">
            {visibleRoots.map((root) => (
              <TreeRow
                key={root.id}
                node={root}
                depth={0}
                selectedId={selectedId}
                isOpen={isNodeOpen}
                onToggle={onToggle}
                onSelect={onSelect}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
