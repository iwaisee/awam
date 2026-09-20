"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowBigUp,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  IdCard,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  ThumbsUp,
  X,
} from "lucide-react";
import type { CitizenProfile } from "@/lib/citizenProfiles";

/* --------------------------------- Helpers --------------------------------- */

const levelFor = (score: number) => {
  if (score >= 300) return { label: "Level 3 Civic Champion", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" };
  if (score >= 150) return { label: "Level 2 Civic Guardian", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (score >= 0) return { label: "Level 1 Citizen", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  return { label: "Restricted / Banned", cls: "bg-rose-50 text-rose-700 ring-rose-200" };
};

const INCIDENT_TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

/* Timeline dot + halo tones for the profile activity history. */
const INCIDENT_DOTS: Record<string, string> = {
  emerald: "bg-emerald-500 ring-emerald-100",
  amber: "bg-amber-500 ring-amber-100",
  rose: "bg-rose-500 ring-rose-100",
  sky: "bg-sky-500 ring-sky-100",
};

/* Icon-led uppercase heading used by every profile section. */
function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {children}
    </h3>
  );
}

const relativeLabel = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/* Channel markers — the reporting wizard captures name + phone only, so the
   WhatsApp/SMS channels stay neutral until channel verification exists and
   CNIC lights up solely through a manual admin badge override. */
function VerificationChips({ citizen }: { citizen: CitizenProfile }) {
  const base = "inline-flex items-center rounded-full p-1 ring-1";
  const off = "bg-white ring-slate-200";
  const cnicOn = citizen.badgeOverride;
  return (
    <span className="flex items-center gap-1">
      <span className={`${base} ${off}`} title="WhatsApp channel not verified">
        <MessageCircle className="h-3 w-3 text-slate-300" />
      </span>
      <span className={`${base} ${off}`} title="SMS channel not verified">
        <MessageSquare className="h-3 w-3 text-slate-300" />
      </span>
      <span
        className={`${base} ${cnicOn ? "bg-emerald-50 ring-emerald-200" : off}`}
        title={
          cnicOn
            ? "Verified via manual administrator badge override"
            : "No CNIC on record"
        }
      >
        <IdCard className={`h-3 w-3 ${cnicOn ? "text-emerald-600" : "text-slate-300"}`} />
      </span>
    </span>
  );
}

/* Segment tabs — identity signals the backend actually holds: the admin
   badge override, its absence, and sanctions. */
const SEGMENTS = [
  { id: "all", label: "All Citizens" },
  { id: "badged", label: "Badge Granted" },
  { id: "unbadged", label: "No Badge" },
  { id: "flagged", label: "Flagged / Suspended" },
] as const;

type SegmentId = (typeof SEGMENTS)[number]["id"];

/* Bar / dot palettes for the per-district breakdown, applied by rank. */
const DISTRICT_BAR_TONES = [
  "bg-emerald-700",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-slate-300",
];
const DISTRICT_DOT_TONES = DISTRICT_BAR_TONES;

/* Optional table columns — toggled from the "Columns" picker on the ledger
   card. Citizen + Actions are structural and always render. */
const COLUMN_OPTIONS = [
  { id: "district", label: "District" },
  { id: "contact", label: "Contact" },
  { id: "accuracy", label: "Accuracy" },
  { id: "endorsements", label: "Endorsements" },
] as const;

type ColumnId = (typeof COLUMN_OPTIONS)[number]["id"];

/* -------------------------------- Component -------------------------------- */

export default function UsersView() {
  const router = useRouter();
  // The citizen ledger IS the reports backend — profiles are derived from the
  // SQLite ledger via /api/citizens; no demo baseline is merged in.
  const [citizens, setCitizens] = useState<CitizenProfile[]>([]);
  const [sync, setSync] = useState<"loading" | "ready" | "error">("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentId>("all");
  const [district, setDistrict] = useState("All Districts");
  const [sort, setSort] = useState("Most Issues Reported");
  const [profileKey, setProfileKey] = useState<string | null>(null);
  // drawerOpen drives the slide-out state; profileKey is cleared only after
  // the exit transition finishes so the panel animates away instead of
  // vanishing.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  // Column visibility picker — hidden optional columns drop out of the ledger.
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnId>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);
  // "Rows" display-count selector — slices the filtered list before render.
  const [pageSize, setPageSize] = useState<number | "all">(10);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/citizens", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data) => {
        if (cancelled) return;
        setCitizens(Array.isArray(data) ? (data as CitizenProfile[]) : []);
        setSync("ready");
      })
      .catch(() => {
        if (!cancelled) setSync("error");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!colsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) {
        setColsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [colsOpen]);

  const toggleCol = (id: ColumnId) =>
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const showCol = (id: ColumnId) => !hiddenCols.has(id);

  // Every figure on this page derives from the derived citizen profiles — no
  // hardcoded demo totals.
  const stats = useMemo(() => {
    const total = citizens.length;
    const reported = citizens.reduce((sum, c) => sum + c.reported, 0);
    const resolved = citizens.reduce((sum, c) => sum + c.resolved, 0);
    const byDistrict = new Map<string, number>();
    citizens.forEach((c) =>
      byDistrict.set(c.district, (byDistrict.get(c.district) ?? 0) + 1),
    );
    const districts = [...byDistrict.entries()]
      .map(([name, count]) => ({
        name,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      total,
      badged: citizens.filter((c) => c.badgeOverride).length,
      reported,
      resolved,
      accuracy: reported > 0 ? Math.round((resolved / reported) * 100) : 0,
      suspended: citizens.filter((c) => c.standing === "suspended").length,
      disputed: citizens.reduce((sum, c) => sum + c.disputed, 0),
      blacklisted: citizens.filter((c) => c.blacklisted).length,
      districts,
    };
  }, [citizens]);

  const segCounts = useMemo(
    () => ({
      all: citizens.length,
      badged: citizens.filter((c) => c.badgeOverride).length,
      unbadged: citizens.filter((c) => !c.badgeOverride).length,
      flagged: citizens.filter(
        (c) => c.standing === "suspended" || c.blacklisted || c.score < 0,
      ).length,
    }),
    [citizens],
  );

  const districtOptions = useMemo(() => {
    const names = [...new Set(citizens.map((c) => c.district))].sort();
    return ["All Districts", ...names];
  }, [citizens]);

  const openProfile = (key: string) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setProfileKey(key);
    setDrawerOpen(true);
  };

  const closeProfile = () => {
    setDrawerOpen(false);
    closeTimer.current = window.setTimeout(() => {
      setProfileKey(null);
      closeTimer.current = null;
    }, 320);
  };

  // Governance actions persist through the citizens API; success bumps the
  // refresh key so the ledger (and the open drawer) re-derives from SQLite.
  const actuate = async (key: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/citizens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...body }),
    });
    if (res.ok) setRefreshKey((k) => k + 1);
    return res.ok;
  };

  const filtersActive =
    search.trim() !== "" ||
    segment !== "all" ||
    district !== "All Districts" ||
    sort !== "Most Issues Reported";

  const resetFilters = () => {
    setSearch("");
    setSegment("all");
    setDistrict("All Districts");
    setSort("Most Issues Reported");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Phone lookups tolerate dropped country codes (+92) and leading zeros (0333…).
    const qDigits = q.replace(/\D/g, "").replace(/^0/, "");
    const list = citizens.filter((c) => {
      const localPhone = c.phone.replace(/\D/g, "").replace(/^92/, "");
      if (
        q &&
        !`${c.name} ${c.id} ${c.phone}`.toLowerCase().includes(q) &&
        !(qDigits && localPhone.includes(qDigits))
      )
        return false;
      if (segment === "badged" && !c.badgeOverride) return false;
      if (segment === "unbadged" && c.badgeOverride) return false;
      if (
        segment === "flagged" &&
        !(c.standing === "suspended" || c.blacklisted || c.score < 0)
      )
        return false;
      if (district !== "All Districts" && c.district !== district) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "Most Issues Reported") sorted.sort((a, b) => b.reported - a.reported);
    else if (sort === "Highest Upvotes") sorted.sort((a, b) => b.upvotes - a.upvotes);
    else if (sort === "Recently Active")
      sorted.sort((a, b) => Date.parse(b.lastActive) - Date.parse(a.lastActive));
    return sorted;
  }, [citizens, search, segment, district, sort]);

  const profile = citizens.find((c) => c.key === profileKey) ?? null;

  /* "Rows" selector applies after filtering + sorting. */
  const visibleRows =
    pageSize === "all" ? filtered : filtered.slice(0, pageSize);

  return (
    <>
      <div className="space-y-6">
      {/* 1 ─ Demographic & civic trust metrics — derived from the live ledger */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Registered citizens */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Registered Citizens
          </p>
          <p className="font-heading mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {stats.total}
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Citizens behind filed reports
          </p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            <BadgeCheck className="h-3 w-3" />
            {stats.badged} Badge Granted
          </span>
        </div>

        {/* District participation share */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Citizens by District
          </p>
          {stats.districts.length > 0 ? (
            <>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {stats.districts.map((d, i) => (
                  <div
                    key={d.name}
                    className={DISTRICT_BAR_TONES[i % DISTRICT_BAR_TONES.length]}
                    style={{ width: `${d.pct}%` }}
                    title={`${d.name} — ${d.pct}%`}
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-1 text-[10px] font-semibold text-slate-600">
                {stats.districts.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${DISTRICT_DOT_TONES[i % DISTRICT_DOT_TONES.length]}`}
                    />
                    <span className="w-20 shrink-0">{d.name}</span>
                    <span className="font-mono tabular-nums text-slate-400">{d.pct}%</span>
                    <span className="ml-auto font-mono tabular-nums text-slate-500">
                      {d.count}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] font-medium text-slate-400">
                {stats.districts[0].name} leads in registered citizens
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs font-medium text-slate-400">
              No citizen records loaded.
            </p>
          )}
        </div>

        {/* Reporting authenticity */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Report Authenticity
          </p>
          <p className="font-heading mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {stats.accuracy}%
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Verified fixes across reported issues
          </p>
          <p className="mt-3 text-[11px] font-semibold text-slate-600">
            <span className="font-mono text-emerald-700">{stats.resolved}</span> Verified
            Fixed
            <span className="mx-1.5 text-slate-300">•</span>
            <span className="font-mono text-amber-600">
              {stats.reported - stats.resolved}
            </span>{" "}
            Awaiting Verification
          </p>
        </div>

        {/* Integrity & abuse sentinel queue */}
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-500/80">
            Integrity &amp; Abuse Sentinel Queue
          </p>
          <p className="font-heading mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
            {stats.suspended}
            <span className="rounded-md bg-[#DC2626] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Suspended
            </span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Flagged Accounts Under Review
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-rose-500" />
              <span className="font-mono">{stats.disputed}</span> Disputed Reports
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1">
              <Ban className="h-3 w-3 text-rose-500" />
              <span className="font-mono">{stats.blacklisted}</span> Blacklisted
            </span>
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/sentinel")}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#DC2626] transition-colors duration-150 hover:text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          >
            Review Flagged Accounts
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2 ─ Multi-facet filter toolbar */}
      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search citizens"
              placeholder="Search citizen by name or phone..."
              className="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-10 pr-4 text-xs text-slate-700 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {SEGMENTS.map((seg) => (
              <button
                key={seg.id}
                type="button"
                aria-pressed={segment === seg.id}
                onClick={() => setSegment(seg.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                  segment === seg.id
                    ? "bg-white text-emerald-800 shadow-xs ring-1 ring-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {seg.label}{" "}
                <span className={`font-mono ${segment === seg.id ? "text-emerald-600" : "text-slate-400"}`}>
                  ({segCounts[seg.id]})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              value: district,
              set: setDistrict,
              label: "Primary district",
              options: districtOptions,
            },
            {
              value: sort,
              set: setSort,
              label: "Sort order",
              options: ["Most Issues Reported", "Highest Upvotes", "Recently Active"],
            },
          ].map((sel) => (
            <div key={sel.label} className="relative">
              <select
                aria-label={sel.label}
                value={sel.value}
                onChange={(e) => sel.set(e.target.value)}
                className="cursor-pointer appearance-none rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-3 pr-8 text-xs font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              >
                {sel.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          ))}
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 transition-colors duration-150 hover:text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 3 ─ Citizen ledger table */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-slate-900">
              Citizen Ledger
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Derived from the live reports ledger — reporting and endorsement
              stats per citizen.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative" ref={colsRef}>
              <button
                type="button"
                onClick={() => setColsOpen((v) => !v)}
                aria-expanded={colsOpen}
                aria-label="Choose visible columns"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Columns
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-150 ${colsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {colsOpen && (
                <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {COLUMN_OPTIONS.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={showCol(col.id)}
                        onChange={() => toggleCol(col.id)}
                        className="h-3.5 w-3.5 accent-emerald-700"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* "Show:" segmented control — matches the My Reports tab presets */}
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 text-xs">
              <span className="pl-1.5 text-[11px] font-semibold text-slate-400">
                Show:
              </span>
              {([5, 10, 25, "all"] as const).map((opt) => (
                <button
                  key={String(opt)}
                  type="button"
                  aria-pressed={pageSize === opt}
                  onClick={() => setPageSize(opt)}
                  className={`inline-flex min-w-9 items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                    pageSize === opt
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {opt === "all" ? "All" : opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Horizontal-scroll ledger — rows keep their natural height and the
            full table width slides left/right inside the card. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-bold">Citizen</th>
                {showCol("district") && (
                  <th className="px-4 py-3 font-bold">District</th>
                )}
                {showCol("contact") && (
                  <th className="px-4 py-3 font-bold">Contact</th>
                )}
                {showCol("accuracy") && (
                  <th className="px-4 py-3 font-bold">Accuracy</th>
                )}
                {showCol("endorsements") && (
                  <th className="px-4 py-3 font-bold">Endorsements</th>
                )}
                <th className="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((c) => {
                return (
                  <tr key={c.key} className="border-t border-slate-100 align-middle transition-colors duration-150 hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white ${c.tint}`}
                        >
                          {c.initials}
                        </span>
                        <p className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {c.name}
                          </span>
                          {c.blacklisted ? (
                            <span className="shrink-0 rounded bg-rose-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                              Banned
                            </span>
                          ) : c.standing === "suspended" ? (
                            <span className="shrink-0 rounded bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                              Suspended
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </td>
                    {showCol("district") && (
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-bold text-slate-800">{c.district}</p>
                        <p className="text-[11px] font-medium text-slate-500">{c.area}</p>
                        <p className="font-mono text-[10px] font-semibold text-slate-400">{c.uc}</p>
                      </td>
                    )}
                    {showCol("contact") && (
                      <td className="px-4 py-3.5">
                        <p
                          className={`font-mono text-xs font-semibold ${
                            c.phone ? "text-slate-800" : "text-slate-400"
                          }`}
                        >
                          {c.phone || "No phone captured"}
                        </p>
                        <div className="mt-1.5">
                          <VerificationChips citizen={c} />
                        </div>
                      </td>
                    )}
                    {showCol("accuracy") && (
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex items-center gap-1"
                            title={`${c.reported} reports filed`}
                          >
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {c.reported}
                            </span>
                          </span>
                          <span
                            className="flex items-center gap-1"
                            title={`${c.resolved} verified fixed`}
                          >
                            <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {c.resolved}
                            </span>
                          </span>
                          <span
                            className="flex items-center gap-1.5"
                            title={`Accuracy ${c.accuracy}% — ${c.resolved} of ${c.reported} reports verified fixed`}
                          >
                            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                              <span
                                className={`block h-full rounded-full ${
                                  c.accuracy === 0
                                    ? "bg-rose-400"
                                    : c.accuracy >= 70
                                      ? "bg-emerald-500"
                                      : "bg-amber-400"
                                }`}
                                style={{ width: `${c.accuracy}%` }}
                              />
                            </span>
                            <span className="font-mono text-[10px] font-bold tabular-nums text-slate-500">
                              {c.accuracy}%
                            </span>
                          </span>
                        </div>
                      </td>
                    )}
                    {showCol("endorsements") && (
                      <td className="px-4 py-3.5">
                        <span
                          className="flex items-center gap-1"
                          title={`${c.upvotes} upvotes received across all reports`}
                        >
                          <ArrowBigUp className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {c.upvotes}
                          </span>
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openProfile(c.key)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                          c.standing === "suspended" || c.blacklisted
                            ? "bg-slate-700 hover:bg-slate-800"
                            : "bg-emerald-800 hover:bg-emerald-900"
                        }`}
                      >
                        {c.standing === "suspended" || c.blacklisted ? "Unban / Review" : "View Profile"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sync states — loading, API failure, and the genuinely-empty ledger. */}
        {sync === "loading" && citizens.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Clock className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-600">
              Syncing citizen ledger…
            </p>
            <p className="max-w-sm text-xs font-medium text-slate-400">
              Deriving citizen profiles from the live reports database.
            </p>
          </div>
        )}
        {sync === "error" && citizens.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-600">
              Could not reach the citizen API
            </p>
            <p className="max-w-sm text-xs font-medium text-slate-400">
              The ledger could not be loaded from the backend. Check the server
              and retry the sync.
            </p>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <RotateCcw className="h-3 w-3" />
              Retry Sync
            </button>
          </div>
        )}
        {sync === "ready" && citizens.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-600">
              No citizen records yet
            </p>
            <p className="max-w-sm text-xs font-medium text-slate-400">
              Citizens appear here automatically as soon as reports are filed
              through the public reporting wizard — no manual registration
              needed.
            </p>
          </div>
        )}
        {sync === "ready" && citizens.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-600">
              No citizens match this filter combination
            </p>
            <p className="max-w-sm text-xs font-medium text-slate-400">
              Try widening the district, badge or standing filters — or reset the
              toolbar to see the full loaded ledger.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Filters
            </button>
          </div>
        )}
      </section>

      </div>

      {/* Rendered OUTSIDE the space-y-6 container: space-y's sibling margin
          would shave 24px off the fixed backdrop's stretched height and leak a
          sharp strip of the page at the bottom of the viewport. */}
      {profile && (
        <ProfileDrawer
          key={profile.key}
          citizen={profile}
          open={drawerOpen}
          onClose={closeProfile}
          onAct={(body) => actuate(profile.key, body)}
        />
      )}
    </>
  );
}

/* ------------------------------ Profile drawer ----------------------------- */

function ProfileDrawer({
  citizen,
  open,
  onClose,
  onAct,
}: {
  citizen: CitizenProfile;
  open: boolean;
  onClose: () => void;
  onAct: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [sanctionNote, setSanctionNote] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  // Flip one frame after mount so the panel transitions in from off-screen.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = entered && open;

  const lvl = levelFor(citizen.score);
  const runAction = async (body: Record<string, unknown>, note: string) => {
    setActing(true);
    const ok = await onAct(body);
    setActing(false);
    setSanctionNote(ok ? note : "Action failed — the citizen ledger could not be updated.");
    return ok;
  };
  const suspend = () =>
    runAction({ standing: "suspended" }, "Account suspended — reporting locked, lifts in 14 days");
  const reactivate = () =>
    runAction(
      { standing: "active", blacklisted: false },
      "Account reactivated — reporting privileges restored",
    );
  const blacklist = () =>
    runAction(
      { blacklisted: true, standing: "suspended" },
      "Device & phone blacklisted — new sign-ups with this number are blocked",
    );

  const suspended = citizen.standing === "suspended";
  const endorsements = citizen.incidents.filter((inc) => inc.upvotes > 0);

  const noteTone = !sanctionNote
    ? ""
    : sanctionNote.startsWith("Account suspended")
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : sanctionNote.startsWith("Account reactivated")
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : sanctionNote.startsWith("Action failed")
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <>
      <button
        type="button"
        aria-label="Close citizen profile"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Citizen profile — ${citizen.name}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Identity cover — deep emerald banner anchoring the profile */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 px-6 pb-12 pt-5">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="pointer-events-none absolute -left-14 bottom-0 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200/70">
              Citizen Profile
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 transition-colors duration-150 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Identity block — avatar straddles the cover edge */}
        <div className="relative -mt-9 shrink-0 px-6 pb-5">
          <span
            className={`flex h-[72px] w-[72px] items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg ring-4 ring-white ${citizen.tint}`}
          >
            {citizen.initials}
          </span>
          <h2 className="font-heading mt-3 truncate text-xl font-bold tracking-tight text-slate-900">
            {citizen.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              First report {formatDate(citizen.memberSince)}
            </span>
            <span className="text-slate-300">•</span>
            <span>Last active {relativeLabel(citizen.lastActive)}</span>
          </p>
          {/* Full-width chip rail — four fixed slots (CNIC, standing, level, ID);
              the manual-override state swaps the CNIC chip in place so toggling
              the badge never re-wraps or shifts the header. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {citizen.badgeOverride ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                <ShieldCheck className="h-3 w-3" />
                Verified — Manual Override
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                <BadgeCheck className="h-3 w-3" />
                Unverified
              </span>
            )}
            {citizen.blacklisted ? (
              <span className="whitespace-nowrap rounded-full bg-rose-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                Blacklisted
              </span>
            ) : citizen.standing === "suspended" ? (
              <span className="whitespace-nowrap rounded-full bg-[#DC2626] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                Suspended
              </span>
            ) : (
              <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                Active
              </span>
            )}
            <span
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${lvl.cls}`}
            >
              {lvl.label}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">
              {citizen.id}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-slate-100">
          {/* Persistent state banner — instant admin awareness of restrictions */}
          {suspended && (
            <div className="flex items-start gap-2.5 border-b border-rose-100 bg-rose-50/70 px-6 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-xs font-bold text-rose-800">
                  Account suspended — reporting locked
                </p>
                <p className="mt-0.5 text-[10px] font-medium leading-4 text-rose-700/80">
                  This citizen cannot file new reports until an administrator
                  reactivates the account.
                </p>
              </div>
            </div>
          )}

          {/* Stat band — the four figures an admin scans first */}
          <section className="grid grid-cols-4 gap-2 border-b border-slate-100 px-6 py-4">
            <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center ring-1 ring-slate-100">
              <p className="font-heading text-lg font-bold tabular-nums text-slate-900">
                {citizen.reported}
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Reports
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center ring-1 ring-slate-100">
              <p className="font-heading text-lg font-bold tabular-nums text-emerald-700">
                {citizen.resolved}
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Fixed
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center ring-1 ring-slate-100">
              <p
                className={`font-heading text-lg font-bold tabular-nums ${
                  citizen.accuracy === 0
                    ? "text-rose-600"
                    : citizen.accuracy >= 70
                      ? "text-emerald-700"
                      : "text-amber-600"
                }`}
              >
                {citizen.accuracy}%
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Accuracy
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center ring-1 ring-slate-100">
              <p className="font-heading text-lg font-bold tabular-nums text-slate-900">
                {citizen.upvotes}
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Upvotes
              </p>
            </div>
          </section>

          {/* Section 1 — registration & verification */}
          <section className="border-b border-slate-100 px-6 py-5">
            <SectionHeading icon={IdCard}>Registration &amp; Verification</SectionHeading>
            <dl className="mt-3 divide-y divide-slate-100 text-xs">
              <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                <dt className="shrink-0 font-medium text-slate-400">Home District</dt>
                <dd className="text-right font-semibold text-slate-800">
                  {citizen.district} — {citizen.area}{" "}
                  <span className="block font-mono text-[10px] font-medium text-slate-400">
                    {citizen.uc}
                  </span>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="shrink-0 font-medium text-slate-400">Mobile</dt>
                <dd className="text-right">
                  <span
                    className={`font-mono font-semibold ${
                      citizen.phone ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    {citizen.phone || "Not captured"}
                  </span>
                  {citizen.phone && (
                    <>
                      <span
                        className={`mt-0.5 block text-[10px] font-bold ${
                          citizen.blacklisted ? "text-rose-600" : "text-slate-400"
                        }`}
                      >
                        {citizen.blacklisted
                          ? "Number blacklisted — sign-ups blocked"
                          : "Captured at report submission — channel verification pending"}
                      </span>
                      <span className="mt-1.5 flex justify-end">
                        <VerificationChips citizen={citizen} />
                      </span>
                    </>
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="shrink-0 font-medium text-slate-400">CNIC</dt>
                <dd className="text-right">
                  <span className="font-mono font-semibold text-slate-400">
                    Not captured
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium leading-4 text-slate-400">
                    The reporting wizard collects name &amp; phone only — NADRA
                    verification is not yet wired in.
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5 last:pb-0">
                <dt className="font-medium text-slate-400">Reporting Since</dt>
                <dd className="font-semibold text-slate-800">
                  {formatDate(citizen.memberSince)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Section 3 — recent reports & endorsements (final section) */}
          <section className="px-6 py-5">
            <SectionHeading icon={FileText}>Recent Reports</SectionHeading>
            <p className="mt-1.5 text-[10px] font-medium text-slate-400">
              Latest {citizen.incidents.length} of {citizen.reported} filed —
              click a ticket chip to track that report.
            </p>
            {citizen.incidents.length > 0 ? (
              <ul className="mt-3 space-y-4">
                {citizen.incidents.map((inc, i) => (
                  <li key={inc.ref} className="relative pl-6">
                    {i < citizen.incidents.length - 1 && (
                      <span
                        className="absolute left-[4.5px] top-4 -bottom-4 w-px bg-slate-200"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ring-4 ${INCIDENT_DOTS[inc.tone]}`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/track?id=${encodeURIComponent(inc.token)}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Track ${inc.ref} — opens the public tracking view`}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-800 hover:ring-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      >
                        {inc.ref}
                        <ArrowUpRight className="h-2.5 w-2.5" />
                      </a>
                      <span
                        className={`ml-auto whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${INCIDENT_TONES[inc.tone]}`}
                      >
                        {inc.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                      {inc.title}
                    </p>
                    <p
                      className={`mt-0.5 text-[10px] font-bold ${
                        inc.award.startsWith("−")
                          ? "text-rose-600"
                          : inc.award === "Pending"
                            ? "text-slate-400"
                            : "text-emerald-600"
                      }`}
                    >
                      {inc.award}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
                No reports filed under this citizen identity yet.
              </p>
            )}

            <h4 className="mt-5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <ThumbsUp className="h-3 w-3" />
              Endorsement Ledger — neighbor-validated reports
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-bold normal-case tracking-normal text-slate-400">
                <ArrowBigUp className="h-3 w-3" />
                {citizen.upvotes} upvotes
              </span>
            </h4>
            {endorsements.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5">
                {endorsements.map((e) => (
                  <li
                    key={e.ref}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <ThumbsUp className="h-2.5 w-2.5" />
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-500">{e.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-600">
                      {e.title} · {e.area}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                      +{e.upvotes}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
                <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                No neighbor-validated reports yet — endorsements appear when
                other citizens upvote this citizen&apos;s submissions.
              </p>
            )}
          </section>
        </div>

        {/* Sticky sanction bar — suspend / reactivate and blacklist stay reachable
            no matter how far the profile is scrolled */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-6 py-4">
          {sanctionNote && (
            <p
              className={`mb-2.5 rounded-lg px-3 py-2 text-center text-[10px] font-semibold ring-1 ${noteTone}`}
            >
              {sanctionNote}
            </p>
          )}
          <div className="flex items-center gap-2">
            {suspended ? (
              <button
                type="button"
                onClick={reactivate}
                disabled={acting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reactivate Account
              </button>
            ) : (
              <button
                type="button"
                onClick={suspend}
                disabled={acting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 transition-colors duration-150 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Temporarily Suspend
              </button>
            )}
            <button
              type="button"
              onClick={blacklist}
              disabled={citizen.blacklisted || acting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
            >
              <Ban className="h-3.5 w-3.5" />
              {citizen.blacklisted ? "Blacklisted" : "Blacklist Device"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
