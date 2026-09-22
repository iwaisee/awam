"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedReport } from "@/types/report";
import type { CategoryId, } from "@/types/report";
import type { IncidentReport } from "@/types/civic";

/* Shared bridge between the SQLite report ledger (/api/reports) and every
   report-listing surface: the community feed, the settings "My Reports" tab
   and the citizen workspace. One mapper, one fetch hook — no per-view copies. */

/** Card title — falls back to the first clause of the citizen narrative. */
export function reportTitle(report: IncidentReport): string {
  return report.description.split("—")[0].trim();
}

/** Short agency code for the authority pill, e.g. "MCS Kotli Sub-Division". */
export function agencyCode(assigned: string): string {
  if (/^city traffic/i.test(assigned)) return "CTP";
  return assigned.split(/[\s,]/)[0] || assigned;
}

/** Category → field photo texture (same assets the community feed uses). */
const CATEGORY_IMAGE: Record<string, string> = {
  electricity: "/feed/electricity.svg",
  sanitation: "/feed/sanitation.svg",
  broken_road: "/feed/broken-road.svg",
  water_leak: "/feed/water-leak.svg",
  traffic: "/feed/traffic.svg",
  streetlight: "/feed/streetlight.svg",
  open_manhole: "/feed/manhole.svg",
};

const CATEGORY_TINT: Record<string, string> = {
  electricity: "from-amber-500 to-orange-800",
  sanitation: "from-lime-600 to-emerald-900",
  broken_road: "from-emerald-600 to-emerald-900",
  water_leak: "from-sky-600 to-teal-900",
  traffic: "from-rose-600 to-rose-900",
  streetlight: "from-indigo-600 to-slate-900",
  open_manhole: "from-cyan-600 to-teal-900",
};

/** Live ledger row → FeedReport card shape. `now` is captured once per data
    load so the SLA math stays render-pure. */
export function toFeedReport(report: IncidentReport, now: number): FeedReport {
  const createdMs = new Date(report.created_at).getTime();
  const deadlineMs = new Date(report.sla_deadline).getTime();
  const hoursAgo = Math.max(1, Math.round((now - createdMs) / 3_600_000));
  const resolved = report.status === "resolved";
  const status: FeedReport["status"] = resolved
    ? "resolved"
    : report.status === "dispatched" || report.status === "in_progress"
      ? "in_progress"
      : "action_required";

  const remainingMs = deadlineMs - now;
  const slaLabel =
    remainingMs > 0
      ? `${Math.floor(remainingMs / 3_600_000)}h ${Math.floor((remainingMs % 3_600_000) / 60_000)}m remaining`
      : "breached · escalated";

  return {
    id: report.tracking_token,
    title: reportTitle(report),
    description: report.description,
    landmark: report.area_name,
    city: report.city_name,
    area: report.city_name,
    category: report.category_id as CategoryId,
    categoryTag: `#${(report.selected_tags?.[0] ?? report.category_title ?? report.category_id).replace(/\s+/g, "")}`,
    agency: agencyCode(report.assigned_agency),
    status,
    statusLabel: resolved
      ? "Resolved"
      : status === "in_progress"
        ? "In Progress"
        : "Under Triage",
    severity:
      report.urgency === "emergency"
        ? "emergency"
        : report.urgency === "high"
          ? "high"
          : "normal",
    upvotes: report.upvotes,
    hoursAgo,
    reportedBy: report.citizen_name || "Anonymous",
    gpsVerified: true,
    thumbnailTint: CATEGORY_TINT[report.category_id] ?? "from-slate-500 to-slate-800",
    imageUrl: CATEGORY_IMAGE[report.category_id] ?? "/feed/street.svg",
    assignedAuthority: report.assigned_agency,
    assignedSquad: report.assigned_unit ?? undefined,
    slaLabel,
    resolvedLabel: `Completed in ${Math.max(1, Math.round((deadlineMs - createdMs) / 3_600_000))}h`,
  };
}

/** Fetch the report ledger once per mount; bump `refreshKey` to re-fetch.
    The wall clock is captured once per fetch, keeping SLA labels stable. */
export function useLiveFeedReports(refreshKey = 0): {
  reports: FeedReport[];
  raw: IncidentReport[];
  loading: boolean;
} {
  const [state, setState] = useState<{
    key: number;
    raw: IncidentReport[];
    fetchedAt: number;
  }>({ key: -1, raw: [], fetchedAt: 0 });

  useEffect(() => {
    let cancelled = false;
    /** One retry: a dev-route recompile or a Neon cold-start blip can fail
        the first hit — a single late retry spares the citizen a false
        "no reports" board without spinning forever. */
    const load = (attempt: number): void => {
      fetch("/api/reports", { cache: "no-store" })
        .then((res) =>
          res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
        )
        .then((data: unknown) => {
          if (!cancelled) {
            setState({
              key: refreshKey,
              raw: Array.isArray(data) ? (data as IncidentReport[]) : [],
              fetchedAt: Date.now(),
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 1) {
            window.setTimeout(() => load(attempt + 1), 1500);
            return;
          }
          setState((prev) => ({ key: refreshKey, raw: prev.raw, fetchedAt: prev.fetchedAt }));
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reports = useMemo(
    () => state.raw.map((r) => toFeedReport(r, state.fetchedAt || Date.now())),
    [state.raw, state.fetchedAt],
  );
  return { reports, raw: state.raw, loading: state.key !== refreshKey };
}
