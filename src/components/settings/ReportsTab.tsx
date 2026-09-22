"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Search,
  SearchX,
  X,
} from "lucide-react";
import IncidentCard from "@/components/feed/IncidentCard";
import WorkOrderDrawer from "@/components/feed/WorkOrderDrawer";
import type { FeedReport } from "@/types/report";
import {
  agencyCode,
  reportTitle,
  toFeedReport,
} from "@/lib/feedReports";
import type { IncidentReport } from "@/types/civic";

type FilterKey = "all" | "active" | "resolved";

/** Display-count presets for the "Show:" selector — "all" disables slicing. */
const PAGE_SIZE_OPTIONS: (number | "all")[] = [5, 10, 25, "all"];

export default function ReportsTab({ citizenPhone }: { citizenPhone: string }) {
  const [reports, setReports] = useState<IncidentReport[] | null>(null);
  // Clock captured once per fetch — SLA readouts stay stable per data load.
  const [fetchedAt, setFetchedAt] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [drawerToken, setDrawerToken] = useState<string | null>(null);
  // "Show:" display count — slices the filtered list before rendering.
  const [pageSize, setPageSize] = useState<number | "all">(5);
  // Live search — `query` is the raw input, `search` its debounced echo.
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 250ms debounce keeps the list from re-filtering on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // "/" (outside a field) or ⌘K / Ctrl+K jumps focus into the search bar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (
        (event.key === "/" && !typing) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const clearSearch = () => {
    setQuery("");
    setSearch("");
    searchInputRef.current?.focus();
  };

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        const data = (await res.json()) as IncidentReport[];
        const mine = data
          .filter((r) => r.citizen_phone === citizenPhone)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        setReports(mine);
        setFetchedAt(Date.now());
      } catch {
        setReports([]);
        setFetchedAt(Date.now());
      }
    })();
  }, [citizenPhone]);

  const counts = useMemo(() => {
    const total = reports?.length ?? 0;
    const resolved = reports?.filter((r) => r.status === "resolved").length ?? 0;
    return { total, resolved, active: total - resolved };
  }, [reports]);

  const visible = useMemo(() => {
    if (!reports) return null;
    let list = reports;
    if (filter === "resolved") list = list.filter((r) => r.status === "resolved");
    else if (filter === "active")
      list = list.filter((r) => r.status !== "resolved");
    // Live search — token ("1042" or "#SKT-1042"), title, locality and
    // category, always intersected with the active status tab.
    const q = search.toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          r.tracking_token,
          `#${r.tracking_token}`,
          reportTitle(r),
          r.category_title,
          r.area_name,
          r.city_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [reports, filter, search]);

  const activeFilterLabel =
    filter === "all" ? "All Reports" : filter === "active" ? "In Progress" : "Resolved";

  const displayed = useMemo(() => {
    if (!visible) return null;
    return pageSize === "all" ? visible : visible.slice(0, pageSize);
  }, [visible, pageSize]);

  /* Segmented-control anatomy — shared by the three status segments so the
     active white card, inactive ghost and counter badges stay consistent. */
  const segmentClass = (active: boolean) =>
    `flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-[11px] font-bold transition-all duration-150 sm:px-3.5 sm:text-xs ${
      active
        ? "border border-slate-200/90 bg-white text-slate-900 shadow-sm shadow-slate-900/5"
        : "border border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-800"
    }`;
  const badgeBase =
    "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums";
  /* Constant geometry (equal padding, fixed min-width, one font weight) so
     moving the active pill never reflows the row — only color + shadow shift. */
  const countOptionClass = (active: boolean) =>
    `inline-flex min-w-9 items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold transition-all duration-150 ${
      active
        ? "bg-white text-slate-900 shadow-2xs"
        : "text-slate-500 hover:text-slate-900"
    }`;

  return (
    <div className="space-y-6">
      {/* Section header card — title cluster + the single primary CTA +
          segmented filter track. All counts live inside the segment badges
          (no duplicate metrics line), and dark forest emerald is reserved
          exclusively for "+ Report New Incident". */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
        {/* Mobile: CTA stacks full-width under the title, before the filter
            track. Desktop: it anchors to the top-right corner. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-slate-900">
                My Reports
              </h2>
              <span className="urdu inline-flex shrink-0 items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-xs font-medium leading-relaxed text-emerald-900">
                میری درج شدہ شکایات
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">
              Track real-time progress, proof of work, and official actions on
              tickets you have filed.
            </p>
          </div>
          <Link
            href="/report"
            className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 sm:w-auto"
          >
            + Report New Incident
          </Link>
        </div>

        {/* Filter container — upper bar (status tabs + Show selector) and a
            lower full-width live-search toolbar. Stacks under 640px. */}
        <div className="mt-5 border-t border-dashed border-slate-100 pt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Integrated three-segment control — light slate track; the active
              segment lifts off as a white card with a crisp border and soft
              shadow, so it never competes with the primary action above. */}
          <div
            role="group"
            aria-label="Filter reports by status"
            className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-slate-200/70 bg-slate-100 p-1.5 sm:w-auto"
          >
          {/* Segment 1 — All Reports, neutral numeric counter */}
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={segmentClass(filter === "all")}
          >
            All Reports
            <span className={`${badgeBase} bg-slate-200/80 text-slate-700`}>
              {counts.total}
            </span>
          </button>

          {/* Segment 2 — In Progress, live pulsing indicator + amber counter */}
          <button
            type="button"
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
            className={segmentClass(filter === "active")}
          >
            {counts.active > 0 && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
              />
            )}
            In Progress
            <span className={`${badgeBase} bg-amber-100 text-amber-800`}>
              {counts.active}
            </span>
          </button>

          {/* Segment 3 — Resolved, verified check + emerald counter */}
          <button
            type="button"
            aria-pressed={filter === "resolved"}
            onClick={() => setFilter("resolved")}
            className={segmentClass(filter === "resolved")}
          >
            <CheckCircle2
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            />
            Resolved
            <span className={`${badgeBase} bg-emerald-100 text-emerald-800`}>
              {counts.resolved}
            </span>
          </button>
          </div>

          {/* Display count selector — tactile segmented pills (5 / 10 / 25 /
              All). Centered under the tabs on mobile, pinned right on desktop. */}
          <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 text-xs sm:w-auto sm:justify-start">
            <span className="pl-1.5 text-[11px] font-semibold text-slate-400">
              Show:
            </span>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <button
                key={String(option)}
                type="button"
                aria-pressed={pageSize === option}
                onClick={() => setPageSize(option)}
                className={countOptionClass(pageSize === option)}
              >
                {option === "all" ? "All" : option}
              </button>
            ))}
          </div>
          </div>

          {/* Lower search toolbar — debounced live filtering with 1-tap clear
              and a "/" shortcut pill (desktop only) */}
          <div className="mt-3">
            <div className="relative flex items-center rounded-xl border border-slate-200/90 bg-slate-50/80 transition-all duration-150 focus-within:border-emerald-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search your reports"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by ticket ID (#SKT-XXXX), issue title, or locality..."
                className="w-full bg-transparent py-2.5 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                {query ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear search"
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors duration-150 hover:border-slate-300 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => searchInputRef.current?.focus()}
                    aria-label="Focus search (shortcut: slash)"
                    title="Press / to search"
                    className="hidden items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 transition-colors duration-150 hover:text-slate-600 sm:inline-flex"
                  >
                    /
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report cards — the community-feed IncidentCard, fed by the live ledger */}
      <div className="space-y-4">
        {visible === null && (
          <>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-3xl border border-slate-100 bg-white"
              />
            ))}
          </>
        )}
        {visible !== null && visible.length === 0 && search && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
            <SearchX className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              No matching reports found
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-400">
              We couldn&apos;t find any reports matching{" "}
              <span className="font-semibold text-slate-600">
                &quot;{search}&quot;
              </span>{" "}
              in your {activeFilterLabel} tickets.
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800"
            >
              Clear search query
            </button>
          </div>
        )}
        {visible !== null && visible.length === 0 && !search && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              No reports under this filter yet.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Incidents you file appear here with live SLA tracking.
            </p>
          </div>
        )}
        {displayed?.map((report) => (
          <IncidentCard
            key={report.id}
            report={toFeedReport(report, fetchedAt)}
            voted={false}
            voteInteractive={false}
            showTicketId
            onToggleVote={() => {}}
            onInspect={() => setDrawerToken(report.tracking_token)}
          />
        ))}

        {/* Display-count feedback — muted counter with a Load More stepper
            that advances through the presets (5 → 10 → 25 → All) */}
        {visible !== null &&
          displayed !== null &&
          visible.length > displayed.length && (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3.5 sm:flex-row sm:justify-between">
              <p className="text-xs font-medium text-slate-400">
                Showing{" "}
                <span className="font-bold text-slate-600">
                  {displayed.length}
                </span>{" "}
                of{" "}
                <span className="font-bold text-slate-600">
                  {visible.length}
                </span>{" "}
                reported issues
              </p>
              <button
                type="button"
                onClick={() =>
                  setPageSize((prev) =>
                    prev === "all"
                      ? prev
                      : (PAGE_SIZE_OPTIONS[
                          PAGE_SIZE_OPTIONS.indexOf(prev) + 1
                        ] ?? "all")
                  )
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-semibold text-slate-700 shadow-2xs transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800"
              >
                Load More
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          )}
      </div>

      {/* Work order dossier drawer — same component as the community feed,
          so every ticket resolves to the identical dossier. Kept mounted so
          the exit slide can play. */}
      <WorkOrderDrawer
        token={drawerToken}
        onClose={() => setDrawerToken(null)}
      />
    </div>
  );
}
