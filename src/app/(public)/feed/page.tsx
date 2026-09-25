"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  RotateCcw,
  Search,
} from "lucide-react";
import { useLiveFeedReports } from "@/lib/feedReports";
import IncidentCard, {
  agencyBucketOf,
  localityZoneOf,
  type AgencyBucket,
  type LocalityZone,
} from "@/components/feed/IncidentCard";
import WorkOrderDrawer from "@/components/feed/WorkOrderDrawer";

/* ----------------------------------------------------------------------------
 * Community Incident Feed — the Civic Discovery Hub. Sialkot-localized
 * filters (zone + agency), four sort lenses, a pinned P1 emergency banner,
 * tactile "I'm Affected" upvoting with toast, 1-tap WhatsApp share, and
 * per-card Work Order slide-over dossiers.
 * Deep links: /feed?q=<keyword> and /feed?status=resolved now actually work.
 * -------------------------------------------------------------------------- */

type SortLens = "affected" | "life" | "newest" | "resolved";

const LOCALITY_OPTIONS: { value: LocalityZone | "all"; label: string }[] = [
  { value: "all", label: "All Sialkot (Pilot)" },
  { value: "city_center", label: "Paris Road / City Center" },
  { value: "cantonment", label: "Sialkot Cantonment" },
  { value: "model_town", label: "Model Town" },
  { value: "kotli", label: "Kotli Loharan" },
  { value: "shahabpura", label: "Shahabpura" },
];

const AGENCY_OPTIONS: { value: AgencyBucket | "all"; label: string }[] = [
  { value: "all", label: "All Agencies" },
  { value: "mcs", label: "MCS (Drainage & Roads)" },
  { value: "swmc", label: "SWMC (Sanitation)" },
  { value: "gepco", label: "GEPCO (Power)" },
  { value: "ctp", label: "CTP (Traffic)" },
];

const SORT_OPTIONS: { value: SortLens; label: string }[] = [
  { value: "affected", label: "🔥 Most Affected / Upvoted" },
  { value: "life", label: "⚡ Life Hazards (P1)" },
  { value: "newest", label: "🕒 Newest First" },
  { value: "resolved", label: "✅ Recently Resolved" },
];

const selectClass =
  "w-full cursor-pointer appearance-none rounded-xl border border-slate-200/80 bg-white py-2.5 pl-4 pr-9 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 lg:w-auto";

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/50">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          </div>
        </div>
      }
    >
      <FeedHub />
    </Suspense>
  );
}

function FeedHub() {
  const params = useSearchParams();

  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [locality, setLocality] = useState<LocalityZone | "all">("all");
  const [agency, setAgency] = useState<AgencyBucket | "all">("all");
  const [sort, setSort] = useState<SortLens>(() =>
    params.get("status") === "resolved" ? "resolved" : "affected",
  );
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  /** Optimistic bridge between the ledger snapshot and this session's votes.
      Kept separate from `votedIds` because a vote restored from the server is
      already inside the snapshot's `upvotes` — counting those again would
      double every prior confirmation after a reload. */
  const [voteDeltas, setVoteDeltas] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [drawerToken, setDrawerToken] = useState<string | null>(null);

  /* The feed is the live Neon ledger — every card below is a real submission. */
  const { reports: liveReports, loading: feedLoading } = useLiveFeedReports();

  const recentCount = liveReports.filter((r) => r.hoursAgo <= 6).length;

  /* Toast auto-dismiss */
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* Which tickets has this account already confirmed? Restores the pressed
     state after a reload; a signed-out visitor gets an empty list. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports/votes", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: { votedTokens?: unknown }) => {
        if (cancelled || !Array.isArray(data.votedTokens)) return;
        setVotedIds(
          new Set(
            data.votedTokens.filter(
              (token): token is string => typeof token === "string",
            ),
          ),
        );
      })
      .catch(() => {
        // Signed out or offline — the buttons simply start unpressed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleVote = (id: string) => {
    const willVote = !votedIds.has(id);
    // The snapshot the cards render from — the PATCH answer is reconciled
    // against it, so the ledger's verdict (including a duplicate-vote no-op)
    // always wins over the optimistic guess.
    const snapshotUpvotes = liveReports.find((r) => r.id === id)?.upvotes;

    setVotedIds((prev) => {
      const next = new Set(prev);
      if (willVote) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    setVoteDeltas((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + (willVote ? 1 : -1),
    }));
    if (willVote) {
      setToast("✓ Your confirmation escalated this ticket's priority.");
    }

    void fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, upvote: willVote }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          voted?: boolean;
          report?: { upvotes?: number };
          error?: string;
        } | null;
        if (!res.ok || !body?.success) {
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return body;
      })
      .then((body) => {
        if (
          typeof snapshotUpvotes === "number" &&
          typeof body.report?.upvotes === "number"
        ) {
          setVoteDeltas((prev) => ({
            ...prev,
            [id]: body.report!.upvotes! - snapshotUpvotes,
          }));
        }
        if (typeof body.voted === "boolean") {
          setVotedIds((prev) => {
            const next = new Set(prev);
            if (body.voted) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          });
        }
      })
      .catch((error: unknown) => {
        setVotedIds((prev) => {
          const next = new Set(prev);
          if (willVote) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        setVoteDeltas((prev) => ({
          ...prev,
          [id]: (prev[id] ?? 0) + (willVote ? -1 : 1),
        }));
        const reason = error instanceof Error ? error.message : "";
        setToast(
          reason && !/^(HTTP|Failed to fetch|Load failed)/.test(reason)
            ? reason
            : "Could not save your confirmation — please try again.",
        );
      });
  };

  const reports = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = liveReports.filter((report) => {
      if (locality !== "all" && localityZoneOf(report) !== locality) return false;
      if (agency !== "all" && agencyBucketOf(report) !== agency) return false;
      if (sort === "life" && report.severity !== "emergency") return false;
      if (sort === "resolved" && report.status !== "resolved") return false;
      if (
        q &&
        ![report.title, report.description, report.landmark, report.area, report.id, report.categoryTag]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    if (sort === "newest" || sort === "resolved") {
      return [...filtered].sort((a, b) => a.hoursAgo - b.hoursAgo);
    }
    return [...filtered].sort(
      (a, b) =>
        b.upvotes + (voteDeltas[b.id] ?? 0) -
        (a.upvotes + (voteDeltas[a.id] ?? 0)),
    );
  }, [liveReports, search, locality, agency, sort, voteDeltas]);

  const resetFilters = () => {
    setSearch("");
    setLocality("all");
    setAgency("all");
    setSort("affected");
  };

  /* Pinned P1 banner — first unresolved emergency in the pilot. */
  const critical = liveReports.find(
    (r) => r.severity === "emergency" && r.status !== "resolved",
  );

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* ----------------------- Headline + live pill ---------------------- */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Community Incident Feed{" "}
              <span className="urdu text-lg font-semibold text-emerald-700">
                عوامی شکایات کا لائیو فیڈ
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Live municipal reports submitted across Sialkot. Confirm hazards
              to accelerate government dispatch.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-200/70 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {liveReports.length} incidents live across Sialkot ·{" "}
            {recentCount} updated in last 6h
          </span>
        </div>

        {/* ----------------------- Pinned P1 banner -------------------------- */}
        {critical && (
          <div className="relative mb-8 mt-8 flex flex-col items-start justify-between gap-4 overflow-hidden rounded-3xl border border-rose-200/90 bg-gradient-to-r from-rose-50 via-rose-50/80 to-amber-50/50 p-5 shadow-xs md:flex-row md:items-center">
            <div className="flex items-start gap-3.5">
              <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-rose-950">
                  Active Life-Safety Hazard • {critical.area}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-rose-800/90">
                  {critical.title}. {critical.agency} crew dispatched •{" "}
                  {critical.upvotes} neighbors confirmed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerToken(critical.id)}
              className="shrink-0 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-rose-800"
            >
              View Work Order →
            </button>
          </div>
        )}

        {/* ------------------------- Filter strip ---------------------------- */}
        <div className="mb-8 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
          {/* Top row: search + geographic + agency */}
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by street, mohallah, or keyword (e.g. Paris Road, manhole)..."
                aria-label="Search reports"
                className="w-full rounded-xl border border-slate-200/80 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            <div className="relative">
              <select
                aria-label="Filter by locality or zone"
                value={locality}
                onChange={(e) =>
                  setLocality(e.target.value as LocalityZone | "all")
                }
                className={selectClass}
              >
                {LOCALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <select
                aria-label="Filter by managing agency"
                value={agency}
                onChange={(e) =>
                  setAgency(e.target.value as AgencyBucket | "all")
                }
                className={selectClass}
              >
                {AGENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Bottom row: sort lenses */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Sort reports"
                className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/80 p-1"
              >
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSort(option.value)}
                    aria-pressed={sort === option.value}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                      sort === option.value
                        ? "bg-white text-emerald-800 shadow-sm"
                        : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="hidden font-mono text-[10px] font-bold text-slate-400 xl:inline">
                {reports.length} of {liveReports.length} tickets
              </span>
            </div>
          </div>
        </div>

        {/* --------------------------- Content area -------------------------- */}
        {feedLoading ? (
          /* ------------------------- Loading skeleton ----------------------- */
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : reports.length === 0 ? (
          /* -------------------------- Empty state -------------------------- */
          <div className="flex flex-col items-center rounded-3xl border border-emerald-100 bg-white p-12 text-center shadow-2xs">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </span>
            <p className="font-heading mt-4 text-base font-bold text-slate-800">
              No open hazards reported in this area.
            </p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
              Your neighborhood is operating smoothly. Try widening the zone or
              agency filters to see the rest of the pilot district.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 flex items-center gap-2 rounded-xl bg-[#0F5132] px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-emerald-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            key={`${locality}-${agency}-${sort}-${search}`}
            className="animate-in grid grid-cols-1 gap-6 xl:grid-cols-2"
          >
            {reports.map((report) => (
              <IncidentCard
                key={report.id}
                report={report}
                voted={votedIds.has(report.id)}
                voteDelta={voteDeltas[report.id] ?? 0}
                onToggleVote={() => toggleVote(report.id)}
                onInspect={() => setDrawerToken(report.id)}
                onToast={setToast}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast — upvote reward feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-toast-rise fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl"
        >
          {toast}
        </div>
      )}

      {/* Work order slide-over dossier */}
      <WorkOrderDrawer token={drawerToken} onClose={() => setDrawerToken(null)} />
    </div>
  );
}
