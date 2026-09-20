"use client";

import { useEffect, useState } from "react";
import type { IncidentReport } from "@/types/civic";
import type { RadarIncident, RadarSeverity } from "@/data/operationsData";

/* Sync bridge between the local JSON backend and the admin console views. */

export type TriageTone = RadarIncident["statusTone"] | "emerald";
export type TriageIncident = Omit<RadarIncident, "statusTone"> & {
  statusTone: TriageTone;
  /** Raw ledger status (triage/dispatched/…) kept alongside its presentation. */
  rawStatus: string;
  /** Reporter identity + real SLA window — the dossier's contact & clock. */
  citizenName: string;
  citizenPhone: string;
  createdAt: string;
  slaDeadline?: string;
  /** Citizen-written headline + submitted photo from the wizard. */
  title?: string;
  photoUrl?: string;
};

const STATUS_PRESENTATION: Record<string, { label: string; tone: TriageTone }> = {
  triage: { label: "Newly Filed — In Triage", tone: "amber" },
  dispatched: { label: "Dispatched to Agency", tone: "blue" },
  in_progress: { label: "Field Work In Progress", tone: "blue" },
  resolved: { label: "Resolved — Pending Verification", tone: "emerald" },
  disputed: { label: "Fix Disputed by Citizens", tone: "purple" },
};

const severityOf = (urgency: IncidentReport["urgency"]): RadarSeverity =>
  urgency === "emergency" ? "emergency" : urgency === "high" ? "high" : "medium";

function elapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0h";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Flatten a stored IncidentReport into the triage ledger row shape. */
export function reportToIncident(report: IncidentReport): TriageIncident {
  const presentation =
    STATUS_PRESENTATION[report.status] ?? STATUS_PRESENTATION.triage;
  return {
    id: report.id,
    severity: severityOf(report.urgency),
    demoTag: `${report.category_title} • ${report.jurisdiction}`,
    demoIcon: "community",
    hazard: `${report.category_title} — ${report.area_name}, ${report.city_name}`,
    location: report.area_name,
    uc: [report.uc_number, report.city_name]
      .filter((part) => part && part !== "—")
      .join(", "),
    votes: report.upvotes,
    elapsed: elapsedSince(report.created_at),
    agency: report.assigned_agency,
    status: presentation.label,
    statusTone: presentation.tone,
    rawStatus: report.status,
    citizenName: report.citizen_name,
    citizenPhone: report.citizen_phone,
    createdAt: report.created_at,
    slaDeadline: report.sla_deadline,
    title: report.title,
    photoUrl: report.photo_url,
    photoTint: "from-emerald-500 to-emerald-900",
    gps: report.coordinates
      ? `${report.coordinates.lat.toFixed(4)}° N, ${report.coordinates.lng.toFixed(4)}° E (±8m)`
      : "",
    voiceTranscript: report.description,
    tags: [],
    // Quick-issue pills tapped in Step 2 — surfaced to dispatchers verbatim.
    quickTags: report.selected_tags ?? [],
  };
}

/** Fetch the citizen-filed tickets once per mount (view switches remount).
    Bump `refreshKey` to force a re-fetch — the Command Radar uses this for
    its manual refresh button and the 60s auto-sync. */
export function useLiveReports(refreshKey = 0): {
  live: TriageIncident[];
  raw: IncidentReport[];
  loading: boolean;
  /** Wall-clock stamp captured when the fetch settles (null until the first
      sync completes) — feeds freshness indicators. */
  settledAt: Date | null;
} {
  const [ledger, setLedger] = useState<{
    key: number;
    raw: IncidentReport[];
    settledAt: Date | null;
  }>({ key: -1, raw: [], settledAt: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
      )
      .then((data) => {
        if (!cancelled) {
          setLedger({
            key: refreshKey,
            raw: Array.isArray(data) ? (data as IncidentReport[]) : [],
            settledAt: new Date(),
          });
        }
      })
      .catch(() => {
        // Sync failed — settle against the previous ledger so the console
        // falls back to the baseline dataset instead of spinning forever.
        if (!cancelled) {
          setLedger((prev) => ({
            key: refreshKey,
            raw: prev.raw,
            settledAt: prev.settledAt,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const { raw, settledAt } = ledger;
  return {
    live: raw.map(reportToIncident),
    raw,
    loading: ledger.key !== refreshKey,
    settledAt,
  };
}
