"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  Mic,
  Phone,
  RotateCcw,
  Search,
  Siren,
  Tag,
  ThumbsUp,
  Timer,
  Truck,
  X,
  Zap,
} from "lucide-react";
import type { RadarSeverity } from "@/data/operationsData";
import {
  useLiveReports,
  type TriageIncident,
  type TriageTone,
} from "@/lib/liveReports";
import {
  DailyColumnChart,
  SeverityBars,
  type DayCount,
  type SeveritySlice,
} from "@/components/admin/TriageCharts";

/* --------------------------------- Types ----------------------------------- */

const SEVERITY_PILLS: Record<RadarSeverity, { label: string; cls: string }> = {
  emergency: { label: "Emergency", cls: "bg-rose-100 text-rose-700 ring-rose-200" },
  high: { label: "High Priority", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  medium: { label: "Medium", cls: "bg-sky-100 text-sky-700 ring-sky-200" },
  contested: { label: "Fix Contested", cls: "bg-purple-100 text-purple-700 ring-purple-200" },
};

const SEVERITY_RANK: Record<RadarSeverity, number> = {
  emergency: 4,
  high: 3,
  medium: 2,
  contested: 1,
};

const STATUS_TONES: Record<TriageTone, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};


const REROUTE_AGENCIES = ["MCS", "SWMC", "GEPCO", "CTP Sialkot", "Cantt Board"];

const DISTRICTS = [
  "All Districts",
  "Sialkot",
  "Daska",
  "Pasrur",
];

const districtOf = (uc: string) =>
  DISTRICTS.find((d) => d !== "All Districts" && uc.includes(d)) ?? "Other";

const hoursOf = (elapsed: string) => {
  const n = parseInt(elapsed, 10);
  // Live tickets report "10m" style strings — minutes are a fraction of an
  // hour, so they must not sort as whole hours under "Most Recent".
  if (elapsed.includes("m")) return n / 60;
  return elapsed.includes("d") ? n * 24 : n;
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** Human duration from hours — "6.5h" under two days, then "2.3d". */
const fmtDuration = (hours: number) =>
  hours < 48
    ? `${Math.round(hours * 10) / 10}h`
    : `${Math.round((hours / 24) * 10) / 10}d`;

const SEGMENTS = [
  { id: "all", label: "All Open", count: "1,248" },
  { id: "emergency", label: "Emergency & Critical", count: "19" },
  { id: "breached", label: "SLA Breached", count: "64" },
  { id: "disputed", label: "Disputed Fixes", count: "6" },
  { id: "resolved", label: "Resolved", count: "941" },
] as const;

type SegmentId = (typeof SEGMENTS)[number]["id"];

/** KPI cards act as one-click filters onto the table's segment state. */
const METRIC_SEGMENTS = {
  all: "all",
  critical: "emergency",
  resolution: "resolved",
} as const;

type MetricFilter = keyof typeof METRIC_SEGMENTS;

const PAGE_SIZES = [10, 20, 50, 100];

/* -------------------------------- Component -------------------------------- */

export default function TriageView() {
  const router = useRouter();
  // The queue IS the live Neon ledger — no demo baseline is merged in.
  const [refreshKey, setRefreshKey] = useState(0);
  const { live, raw, settledAt } = useLiveReports(refreshKey);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentId>("all");
  const [agency, setAgency] = useState("All Agencies");
  const [district, setDistrict] = useState("All Districts");
  const [severity, setSeverity] = useState("All Severities");
  const [sort, setSort] = useState("Most Recent");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const openDossier = (id: string) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setDossierId(id);
    setDrawerOpen(true);
  };

  const closeDossier = () => {
    setDrawerOpen(false);
    closeTimer.current = window.setTimeout(() => {
      setDossierId(null);
      closeTimer.current = null;
    }, 320);
  };

  // Persist a dispatcher action to the ledger, then re-sync the queue so the
  // derived status labels reflect what the API actually stored. Returns the
  // updated report so callers can read the auto-assigned crew.
  const apiPatch = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, crew: null as string | null };
    const data = (await res.json().catch(() => null)) as {
      report?: { assigned_unit?: string };
    } | null;
    setRefreshKey((k) => k + 1);
    return { ok: true as const, crew: data?.report?.assigned_unit ?? null };
  };

  // Drawer action handler — maps presentation intent to ledger fields.
  const handleDrawerAction = async (
    action: "dispatch" | "reroute" | "escalate" | "resolve",
    incidentId: string,
    rerouteTo?: string,
  ): Promise<{ ok: boolean; crew: string | null }> => {
    const bodies: Record<string, Record<string, unknown>> = {
      dispatch: { id: incidentId, status: "dispatched" },
      reroute: { id: incidentId, assigned_agency: rerouteTo },
      escalate: { id: incidentId, urgency: "emergency" },
      resolve: { id: incidentId, status: "resolved" },
    };
    return apiPatch(bodies[action]);
  };

  const filtersActive =
    search.trim() !== "" ||
    segment !== "all" ||
    agency !== "All Agencies" ||
    district !== "All Districts" ||
    severity !== "All Severities" ||
    sort !== "Most Recent";

  const resetFilters = () => {
    setSearch("");
    setSegment("all");
    setMetricFilter("all");
    setAgency("All Agencies");
    setDistrict("All Districts");
    setSeverity("All Severities");
    setSort("Most Recent");
  };

  // KPI cards toggle the underlying segment filter; clicking the active card
  // clears back to the full queue.
  const toggleMetric = (metric: MetricFilter) => {
    const next = metricFilter === metric ? "all" : metric;
    setMetricFilter(next);
    setSegment(METRIC_SEGMENTS[next]);
  };

  // Citizen-filed tickets ARE the queue now — dedupe guards against a
  // duplicate ticket id ever reaching the table's React keys.
  const allIncidents = useMemo<TriageIncident[]>(() => {
    if (live.length === 0) return live;
    const seen = new Set<string>();
    const merged: TriageIncident[] = [];
    for (const row of live) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    return merged;
  }, [live]);

  const liveCount = live.length;
  const liveCritical = live.filter((row) => row.severity === "emergency").length;
  const liveTriage = raw.filter((row) => row.status === "triage").length;
  const liveStats = {
    queue: liveCount,
    critical: liveCritical,
    criticalShare: liveCount > 0 ? liveCritical / liveCount : 0,
  };

  // Real daily intake series — each report bucketed by the calendar day its
  // created_at hit the ledger (last 7 days, oldest first). Anchored to the
  // sync wall-clock (settledAt) so the derivation stays render-pure.
  const intakeData = useMemo<DayCount[]>(() => {
    if (!settledAt) return [];
    const startOfToday = new Date(settledAt);
    startOfToday.setHours(0, 0, 0, 0);
    const DAY = 86_400_000;
    const buckets = new Array<number>(7).fill(0);
    for (const report of raw) {
      const filedAt = new Date(report.created_at);
      if (Number.isNaN(filedAt.getTime())) continue;
      const startOfDay = new Date(filedAt);
      startOfDay.setHours(0, 0, 0, 0);
      const daysAgo = Math.round((startOfToday.getTime() - startOfDay.getTime()) / DAY);
      if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo] += 1;
    }
    return buckets.map((count, i) => ({
      label: new Date(startOfToday.getTime() + (i - 6) * DAY).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      count,
    }));
  }, [raw, settledAt]);

  // Severity mix over the live queue — feeds the P1 donut.
  const severityMix = useMemo<SeveritySlice[]>(
    () => [
      {
        name: "Emergency",
        value: live.filter((r) => r.severity === "emergency").length,
        color: "#DC2626",
      },
      {
        name: "High Priority",
        value: live.filter((r) => r.severity === "high").length,
        color: "#F59E0B",
      },
      {
        name: "Medium",
        value: live.filter((r) => r.severity === "medium").length,
        color: "#0EA5E9",
      },
    ],
    [live],
  );

  // Real resolution performance — tickets closed in the last 7 days, timed
  // from created_at to resolved_at (both real ledger stamps). Anchored to
  // the sync wall-clock (settledAt) so the derivation stays render-pure.
  const resolution = useMemo(() => {
    if (!settledAt)
      return {
        avgHours: null as number | null,
        resolvedWeek: 0,
        daily: [] as DayCount[],
      };
    const startOfToday = new Date(settledAt);
    startOfToday.setHours(0, 0, 0, 0);
    const DAY = 86_400_000;
    const buckets = new Array<number>(7).fill(0);
    let totalMs = 0;
    let count = 0;
    for (const report of raw) {
      if (report.status !== "resolved" || !report.resolved_at) continue;
      const resolvedAt = new Date(report.resolved_at);
      if (Number.isNaN(resolvedAt.getTime())) continue;
      const startOfDay = new Date(resolvedAt);
      startOfDay.setHours(0, 0, 0, 0);
      const daysAgo = Math.round((startOfToday.getTime() - startOfDay.getTime()) / DAY);
      if (daysAgo < 0 || daysAgo >= 7) continue;
      buckets[6 - daysAgo] += 1;
      const createdAt = new Date(report.created_at).getTime();
      if (Number.isFinite(createdAt) && resolvedAt.getTime() >= createdAt) {
        totalMs += resolvedAt.getTime() - createdAt;
        count += 1;
      }
    }
    const daily = buckets.map((count, i) => ({
      label: new Date(startOfToday.getTime() + (i - 6) * DAY).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      count,
    }));
    return {
      avgHours: count > 0 ? totalMs / count / 3_600_000 : null,
      resolvedWeek: buckets.reduce((sum, n) => sum + n, 0),
      daily,
    };
  }, [raw, settledAt]);

  const segmentCount = (id: SegmentId): string => {
    if (id === "all") return fmt(liveStats.queue);
    if (id === "emergency") return String(liveStats.critical);
    if (id === "breached")
      return String(live.filter((row) => hoursOf(row.elapsed) >= 24).length);
    if (id === "resolved") return String(raw.filter((row) => row.status === "resolved").length);
    return String(raw.filter((row) => row.status === "disputed").length);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allIncidents.filter((row) => {
      if (
        q &&
        ![row.id, row.hazard, row.location, row.uc, row.agency]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (segment === "emergency" && row.severity !== "emergency") return false;
      if (segment === "breached" && hoursOf(row.elapsed) < 24) return false;
      if (segment === "disputed" && row.rawStatus !== "disputed") return false;
      if (segment === "resolved" && row.rawStatus !== "resolved") return false;
      if (agency !== "All Agencies" && row.agency !== agency) return false;
      if (district !== "All Districts" && districtOf(row.uc) !== district) return false;
      if (severity !== "All Severities" && SEVERITY_PILLS[row.severity].label !== severity)
        return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "Most Recent") sorted.sort((a, b) => hoursOf(a.elapsed) - hoursOf(b.elapsed));
    else if (sort === "Most Upvotes") sorted.sort((a, b) => b.votes - a.votes);
    else if (sort === "Longest Elapsed") sorted.sort((a, b) => hoursOf(b.elapsed) - hoursOf(a.elapsed));
    else if (sort === "Highest Severity")
      sorted.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    return sorted;
  }, [allIncidents, search, segment, agency, district, severity, sort]);

  // Pagination — any filter change lands the operator back on page 1.
  // Render-phase state adjustment (the React-endorsed derived-reset pattern).
  const filterSignature = `${search}|${segment}|${agency}|${district}|${severity}|${sort}`;
  const [activeFilterSignature, setActiveFilterSignature] = useState(filterSignature);
  if (activeFilterSignature !== filterSignature) {
    setActiveFilterSignature(filterSignature);
    setCurrentPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );

  const pageItems = useMemo<(number | "…")[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const wanted = new Set<number>([1, totalPages, safePage - 1, safePage, safePage + 1]);
    const nums = [...wanted]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    let prev = 0;
    for (const n of nums) {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }, [totalPages, safePage]);

  const dossier = allIncidents.find((r) => r.id === dossierId) ?? null;

  return (
    <>
      <div className="space-y-6">
        {/* 1 ─ Interactive triage telemetry — each card is a 1-click filter */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Card 1: Live Triage Queue → filter: all */}
          <button
            type="button"
            aria-pressed={metricFilter === "all"}
            onClick={() => toggleMetric("all")}
            className={`rounded-2xl border p-5 text-left shadow-xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
              metricFilter === "all"
                ? "border-emerald-200 bg-emerald-50/20 ring-2 ring-emerald-600"
                : "border-slate-200/80 bg-white hover:border-emerald-200 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Inbox className="h-4 w-4" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live Queue
              </p>
            </div>
            <p className="font-heading mt-3 text-2xl font-black tracking-tight tabular-nums text-slate-900">
              {fmt(liveStats.queue)}
            </p>
            <div className="mt-3" aria-hidden>
              {intakeData.length > 0 ? (
                <DailyColumnChart data={intakeData} color="#10B981" verb="filed" />
              ) : (
                <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-[10px] font-semibold text-slate-400">
                  Waiting for ledger sync…
                </div>
              )}
            </div>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono">{liveTriage}</span> awaiting first dispatch
            </span>
            <p className="mt-2 text-[11px] font-bold text-slate-400">
              Click to view all open tickets
              <ArrowRight className="ml-1 inline h-3 w-3" />
            </p>
          </button>

          {/* Card 2: Emergency & Critical → filter: critical */}
          <button
            type="button"
            aria-pressed={metricFilter === "critical"}
            onClick={() => toggleMetric("critical")}
            className={`rounded-2xl border p-5 text-left shadow-xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 ${
              metricFilter === "critical"
                ? "border-rose-200 bg-rose-50/20 ring-2 ring-emerald-600"
                : "border-rose-200/70 bg-rose-50/40 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Zap className="h-4 w-4" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                Emergency (P1)
              </p>
            </div>
            <p className="font-heading mt-3 text-2xl font-black tracking-tight tabular-nums text-rose-700">
              {liveStats.critical}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">
              {Math.round(liveStats.criticalShare * 100)}% of {fmt(liveStats.queue)}{" "}
              tickets in the live queue
            </p>
            <div className="mt-3" aria-hidden>
              <SeverityBars data={severityMix} />
            </div>
            <p className={`mt-2 text-[11px] font-bold ${metricFilter === "critical" ? "text-rose-700" : "text-slate-400"}`}>
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500 ${metricFilter === "critical" ? "" : "opacity-40"}`} />
              Filter Critical Only
              <ArrowRight className="ml-1 inline h-3 w-3" />
            </p>
          </button>

          {/* Card 3: Resolution performance → filter: resolved */}
          <button
            type="button"
            aria-pressed={metricFilter === "resolution"}
            onClick={() => toggleMetric("resolution")}
            className={`rounded-2xl border p-5 text-left shadow-xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 ${
              metricFilter === "resolution"
                ? "border-sky-200 bg-sky-50/20 ring-2 ring-emerald-600"
                : "border-slate-200/80 bg-white hover:border-sky-200 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Timer className="h-4 w-4" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Resolution Performance
              </p>
            </div>
            <p className="font-heading mt-3 text-2xl font-black tracking-tight tabular-nums text-slate-900">
              {resolution.avgHours !== null ? fmtDuration(resolution.avgHours) : "—"}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">
              avg close time · {fmt(resolution.resolvedWeek)} resolved in 7 days
            </p>
            <div className="mt-3" aria-hidden>
              {resolution.daily.length > 0 ? (
                <DailyColumnChart data={resolution.daily} color="#0284C7" verb="resolved" />
              ) : (
                <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-[10px] font-semibold text-slate-400">
                  Waiting for ledger sync…
                </div>
              )}
            </div>
            <p className={`mt-2 text-[11px] font-bold ${metricFilter === "resolution" ? "text-sky-700" : "text-slate-400"}`}>
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 ${metricFilter === "resolution" ? "" : "opacity-40"}`} />
              Click to view resolved tickets
              <ArrowRight className="ml-1 inline h-3 w-3" />
            </p>
          </button>
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
                aria-label="Search triage queue"
                placeholder="Search by Ticket ID (#SKT-1042), hazard, union council, or landmark..."
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
                  <span
                    className={`font-mono ${segment === seg.id ? "text-emerald-600" : "text-slate-400"}`}
                  >
                    ({segmentCount(seg.id)})
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              {
                value: agency,
                set: setAgency,
                label: "Responsible agency",
                options: ["All Agencies", "MCS", "SWMC", "GEPCO", "CTP Sialkot", "Cantt Board"],
              },
              {
                value: district,
                set: setDistrict,
                label: "District",
                options: DISTRICTS,
              },
              {
                value: severity,
                set: setSeverity,
                label: "Severity",
                options: [
                  "All Severities",
                  "Emergency",
                  "High Priority",
                  "Medium",
                  "Fix Contested",
                ],
              },
              {
                value: sort,
                set: setSort,
                label: "Sort order",
                options: ["Most Recent", "Most Upvotes", "Longest Elapsed", "Highest Severity"],
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

        {/* 3 ─ Incident ledger — isolated horizontal scroll, fixed column widths */}
        <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0">
              <h2 className="font-heading flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
                Live Incident Triage Queue
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  LIVE
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Severity-ranked tickets awaiting dispatch, re-route or escalation.
                {liveCount > 0 && (
                  <span className="ml-1.5 font-bold text-emerald-700">
                    {liveCount} citizen-filed ticket{liveCount === 1 ? "" : "s"} in the live
                    ledger.
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-bold text-slate-800">{paginatedRows.length}</span> of{" "}
                <span className="font-bold text-slate-800">{rows.length}</span> tickets
              </span>
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100 px-2 py-1">
                <span className="pl-1 text-[11px] font-medium text-slate-500">Per page:</span>
                <select
                  aria-label="Tickets per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="cursor-pointer bg-transparent pr-1 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Resilient horizontal scroll — wide table slides inside the card */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1015px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="w-[100px] px-3 py-3 font-bold">Ticket</th>
                  <th className="w-[170px] px-3 py-3 font-bold">Hazard</th>
                  <th className="w-[105px] px-3 py-3 font-bold">Severity</th>
                  <th className="w-[115px] px-3 py-3 font-bold">District</th>
                  <th className="w-[75px] px-3 py-3 font-bold">Agency</th>
                  <th className="w-[65px] px-3 py-3 font-bold">Votes</th>
                  <th className="w-[110px] px-3 py-3 font-bold">SLA</th>
                  <th className="w-[145px] px-3 py-3 font-bold">Status</th>
                  <th className="w-[130px] px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const sev = SEVERITY_PILLS[row.severity];
                  const hours = hoursOf(row.elapsed);
                  const breached = hours >= 24;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openDossier(row.id)}
                      className="cursor-pointer border-t border-slate-100 align-middle transition-colors duration-150 hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-4">
                        <p className="whitespace-nowrap font-mono text-xs font-bold text-slate-700">
                          {row.id}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <p className="truncate text-xs font-semibold text-slate-900 transition-colors duration-150 hover:text-emerald-950" title={row.hazard}>
                          {row.hazard.split(" — ")[0]}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${sev.cls}`}
                        >
                          {row.severity === "emergency" && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                          )}
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <p className="whitespace-nowrap text-xs font-bold text-slate-800">
                          {districtOf(row.uc)}
                        </p>
                        <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">
                          {row.location}
                        </p>
                        {row.uc !== districtOf(row.uc) && (
                          <p className="whitespace-nowrap font-mono text-[10px] font-semibold text-slate-400">
                            {row.uc}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <span className="whitespace-nowrap rounded-lg bg-slate-50 px-2 py-1 font-mono text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                          {row.agency}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className="flex items-center gap-1"
                          title={`${row.votes} neighbor confirmations received`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {row.votes}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <p
                          className={`whitespace-nowrap font-mono text-sm font-bold tabular-nums ${
                            breached ? "text-rose-600" : "text-slate-800"
                          }`}
                        >
                          {row.elapsed}
                        </p>
                        <p
                          className={`mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-bold ${
                            breached ? "text-rose-600" : "text-slate-400"
                          }`}
                        >
                          {breached ? (
                            <>
                              <AlertTriangle className="h-3 w-3" />
                              SLA breached
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              within window
                            </>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${STATUS_TONES[row.statusTone]}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDossier(row.id);
                          }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-800 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                        >
                          Inspect Details
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Search className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-600">
                No incidents match this filter combination
              </p>
              <p className="max-w-sm text-xs font-medium text-slate-400">
                Try widening the agency, district or severity filters — or reset the
                toolbar to see the full triage queue.
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

          {/* Bottom pagination dock */}
          {rows.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:px-6">
              <p className="text-xs font-semibold text-slate-600">
                Page {safePage} of {totalPages}
                <span className="ml-2 font-normal text-slate-400">
                  ({fmt(rows.length)} filtered ticket{rows.length === 1 ? "" : "s"})
                </span>
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(safePage - 1)}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                {pageItems.map((item, idx) =>
                  item === "…" ? (
                    <span key={`gap-${idx}`} className="px-1 text-xs font-bold text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      aria-current={item === safePage ? "page" : undefined}
                      onClick={() => setCurrentPage(item)}
                      className={`h-8 w-8 rounded-xl text-xs font-bold transition-colors duration-150 ${
                        item === safePage
                          ? "bg-[#0F5132] text-white shadow-xs"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage(safePage + 1)}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 4 ─ Incident dossier drawer — rendered OUTSIDE the space-y container
          so sibling margins can't shrink the fixed backdrop (see UsersView). */}
      {dossier && (
        <IncidentDrawer
          key={dossier.id}
          incident={dossier}
          open={drawerOpen}
          now={settledAt}
          onClose={closeDossier}
          onAction={handleDrawerAction}
        />
      )}
    </>
  );
}

/* ------------------------------ Incident drawer ----------------------------- */

function IncidentDrawer({
  incident,
  open,
  now,
  onClose,
  onAction,
}: {
  incident: TriageIncident;
  open: boolean;
  /** Sync wall-clock from the ledger hook — anchors the SLA countdown. */
  now: Date | null;
  onClose: () => void;
  /** Persists the dispatcher action to the ledger; crew carries the
      auto-assigned field squad (dispatch) for the confirmation note. */
  onAction: (
    action: "dispatch" | "reroute" | "escalate" | "resolve",
    incidentId: string,
    rerouteTo?: string,
  ) => Promise<{ ok: boolean; crew: string | null }>;
}) {
  const [rerouteTo, setRerouteTo] = useState(
    REROUTE_AGENCIES.includes(incident.agency) ? incident.agency : "MCS"
  );
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [noteError, setNoteError] = useState(false);
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
  const sev = SEVERITY_PILLS[incident.severity];
  const dispatched =
    incident.rawStatus === "dispatched" || incident.rawStatus === "in_progress";
  const resolved = incident.rawStatus === "resolved";

  // Real SLA clock — anchored to the ticket's own mandated deadline, not a
  // flat 24h rule. remaining < 0 ⇒ breached; progress = elapsed share of window.
  const createdMs = new Date(incident.createdAt).getTime();
  const deadlineMs = incident.slaDeadline
    ? new Date(incident.slaDeadline).getTime()
    : null;
  const nowMs = now?.getTime() ?? null;
  const windowHours =
    deadlineMs !== null && Number.isFinite(createdMs)
      ? (deadlineMs - createdMs) / 3_600_000
      : null;
  const remainingHours =
    deadlineMs !== null && nowMs !== null ? (deadlineMs - nowMs) / 3_600_000 : null;
  const slaBreached = remainingHours !== null && remainingHours < 0;
  const slaProgress =
    windowHours && windowHours > 0 && remainingHours !== null
      ? Math.min(100, Math.max(0, ((windowHours - remainingHours) / windowHours) * 100))
      : null;

  const lifecycleStep = resolved ? 2 : dispatched ? 1 : 0;
  const lifecycle = ["Filed", "Dispatched", "Resolved"] as const;

  const dispatch = async () => {
    const { ok, crew } = await onAction("dispatch", incident.id);
    setNoteError(!ok);
    setActionNote(
      !ok
        ? "Could not reach the ledger — please retry."
        : crew
          ? `Field crew dispatched — ${crew} assigned · citizens notified`
          : `Ticket dispatched to ${incident.agency} — no crew serves ${incident.location} yet, assign one from Field Teams`,
    );
  };
  const reroute = async () => {
    const { ok } = await onAction("reroute", incident.id, rerouteTo);
    setNoteError(!ok);
    setActionNote(
      ok
        ? `Ticket re-routed to ${rerouteTo} — SLA clock restarted`
        : "Could not reach the ledger — please retry.",
    );
  };
  const escalate = async () => {
    const { ok } = await onAction("escalate", incident.id);
    setNoteError(!ok);
    setActionNote(
      ok
        ? "Severity escalated to Emergency — pushed to top of queue"
        : "Could not reach the ledger — please retry.",
    );
  };
  const resolve = async () => {
    const { ok } = await onAction("resolve", incident.id);
    setNoteError(!ok);
    setActionNote(
      ok
        ? "Marked resolved — awaiting citizen photo verification"
        : "Could not reach the ledger — please retry.",
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close incident inspector"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Incident dossier — ${incident.id}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header — identity, chips, lifecycle */}
        <div className="border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-bold text-slate-400">{incident.id}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dossier"
              className="flex shrink-0 items-center justify-center rounded-md bg-slate-100 p-1.5 text-slate-500 transition-colors duration-150 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-heading mt-1 text-base font-bold leading-snug tracking-tight text-slate-900">
            {incident.hazard}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {incident.location}
            <span className="text-slate-300">·</span>
            <span className="font-mono text-[11px]">{incident.uc}</span>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${sev.cls}`}
            >
              {incident.severity === "emergency" && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              )}
              {sev.label}
            </span>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${STATUS_TONES[incident.statusTone]}`}
            >
              {incident.status}
            </span>
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-600">
              {incident.agency}
            </span>
          </div>
          {/* Lifecycle — where this ticket sits between filing and closure */}
          <ol className="mt-4 flex items-center gap-1.5">
            {lifecycle.map((step, i) => {
              const done = i < lifecycleStep;
              const active = i === lifecycleStep;
              return (
                <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : active
                          ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`truncate text-[9px] font-bold uppercase tracking-wide ${
                      active ? "text-slate-700" : "text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                  {i < lifecycle.length - 1 && (
                    <span
                      aria-hidden
                      className={`h-px flex-1 ${done ? "bg-emerald-500" : "bg-slate-200"}`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {/* Deadline — anchored to the ticket's own mandated window */}
          {remainingHours !== null && !resolved && incident.slaDeadline && (
            <div className="mt-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/80">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="uppercase tracking-wide text-slate-400">
                  Deadline ·{" "}
                  {new Date(incident.slaDeadline).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className={slaBreached ? "text-rose-600" : "text-emerald-700"}>
                  {slaBreached
                    ? `Breached ${fmtDuration(-remainingHours)} ago`
                    : `${fmtDuration(remainingHours)} left`}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    slaBreached
                      ? "bg-rose-500"
                      : (slaProgress ?? 0) > 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${slaProgress ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* At a glance — the fields a dispatcher acts on */}
          <section className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              At a Glance
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt className="font-medium text-slate-400">Filed</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {incident.elapsed} ago
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-400">Jurisdiction</dt>
                <dd className="mt-0.5 truncate font-semibold text-slate-800">
                  {incident.demoTag.split(" • ")[1] ?? "—"}
                </dd>
              </div>
            </dl>
            {/* Reporter card — who filed it, how to reach them, who backs them */}
            <div className="mt-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Reported by
              </p>
              <p
                className="mt-1 truncate text-sm font-bold text-slate-800"
                title={incident.citizenName}
              >
                {incident.citizenName}
              </p>
              {incident.citizenPhone ? (
                <a
                  href={`tel:${incident.citizenPhone.replace(/\s/g, "")}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:text-emerald-900"
                >
                  <Phone className="h-3 w-3" />
                  <span className="font-mono">{incident.citizenPhone}</span>
                </a>
              ) : (
                <p className="mt-1 text-[10px] font-medium text-slate-400">
                  No contact number shared
                </p>
              )}
              <p className="mt-2 flex items-center gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] font-semibold text-slate-600">
                <ThumbsUp className="h-3 w-3 text-emerald-600" />
                <span className="font-mono font-bold text-slate-800">{incident.votes}</span>
                neighbor confirmations
              </p>
            </div>
          </section>

          {/* Evidence — the citizen's own photo, location fix, report, tags */}
          <section className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Evidence
            </h3>
            {incident.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ledger photo is a downscaled data URL; next/image can't optimize it.
              <img
                src={incident.photoUrl}
                alt={`Photo submitted with ${incident.id}`}
                className="mt-2.5 h-44 w-full rounded-xl object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div
                className={`relative mt-2.5 flex h-36 items-center justify-center rounded-xl bg-gradient-to-br ${incident.photoTint}`}
              >
                <Camera className="h-8 w-8 text-white/50" />
                <span className="absolute bottom-2.5 left-1/2 w-max -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-slate-500">
                  No photo attached
                </span>
              </div>
            )}
            {incident.gps && (
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {incident.gps}
              </p>
            )}
            {/* Citizen report — the headline + description they typed in step 3 */}
            {(incident.title || incident.voiceTranscript) && (
              <blockquote className="mt-3 rounded-xl border-l-4 border-emerald-500/60 bg-slate-50 px-3.5 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Mic className="h-3 w-3 text-emerald-600" />
                  Citizen report
                </p>
                {incident.title && (
                  <p className="mt-1.5 text-sm font-bold leading-snug text-slate-900">
                    “{incident.title}”
                  </p>
                )}
                {incident.voiceTranscript && (
                  <p className="mt-1 text-sm italic leading-6 text-slate-700">
                    {incident.voiceTranscript}
                  </p>
                )}
              </blockquote>
            )}
            {incident.quickTags && incident.quickTags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Tag className="h-3 w-3 text-slate-400" />
                {incident.quickTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Assignment — owning agency + one-tap re-routing */}
          <section className="px-5 py-4">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Siren className="h-3.5 w-3.5" />
              Assignment &amp; Routing
            </h3>
            <p className="mt-2.5 text-xs font-semibold text-slate-600">
              Currently assigned to{" "}
              <span className="font-mono font-bold text-emerald-800">{incident.agency}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REROUTE_AGENCIES.map((a) => {
                const selected = rerouteTo === a;
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRerouteTo(a)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                      selected
                        ? "bg-emerald-800 text-white ring-emerald-800"
                        : "bg-white text-slate-600 ring-slate-300 hover:ring-emerald-500"
                    }`}
                  >
                    {a}
                    {a === incident.agency && (
                      <span
                        className={`ml-1 text-[8px] font-bold uppercase ${
                          selected ? "text-emerald-200" : "text-emerald-600"
                        }`}
                      >
                        · current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={reroute}
              disabled={incident.agency === rerouteTo}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-500"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {incident.agency === rerouteTo
                ? `Re-route to ${rerouteTo} — pick another desk`
                : `Re-Route to ${rerouteTo}`}
            </button>
          </section>
        </div>

        {/* Sticky action bar — always visible, no scrolling to act */}
        <footer className="border-t border-slate-100 bg-white px-5 py-4">
          {actionNote && (
            <p
              className={`mb-2.5 rounded-xl px-3 py-2 text-center text-[10px] font-semibold ring-1 ${
                noteError
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-200/70"
              }`}
            >
              {actionNote}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={dispatch}
              disabled={dispatched || resolved}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-2 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-800"
            >
              <Truck className="h-3.5 w-3.5 shrink-0" />
              {dispatched ? "Dispatched" : "Dispatch"}
            </button>
            <button
              type="button"
              onClick={escalate}
              disabled={incident.severity === "emergency" || resolved}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400 bg-amber-50 px-2 py-2.5 text-xs font-bold text-amber-800 transition-colors duration-150 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-50"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Escalate
            </button>
            <button
              type="button"
              onClick={resolve}
              disabled={resolved}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-50 px-2 py-2.5 text-xs font-bold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {resolved ? "Resolved" : "Resolve"}
            </button>
          </div>
          <a
            href={`/track?id=${incident.id.replace("#", "")}`}
            className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400 transition-colors duration-150 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          >
            <Timer className="h-3 w-3" />
            Open citizen timeline for {incident.id}
          </a>
        </footer>
      </aside>
    </>
  );
}

