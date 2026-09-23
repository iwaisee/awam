"use client";

/* Client transport for the report ledger — the read-side twin of
   registryClient.ts. The console shell (nav badge) and the overview deck
   (KPI tiles) both need the ledger on first paint, so concurrent callers
   share a single in-flight request instead of each opening its own. */

import type { IncidentReport } from "@/types/civic";

let inFlight: Promise<IncidentReport[]> | null = null;

async function loadLedger(): Promise<IncidentReport[]> {
  const res = await fetch("/api/reports", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as IncidentReport[]) : [];
}

export function fetchLedger(): Promise<IncidentReport[]> {
  if (inFlight) return inFlight;
  const pending = loadLedger().finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  inFlight = pending;
  return pending;
}
