"use client";

/* Command Radar (/admin/overview) — executive municipal command view.
   Live KPI tiles fed by the real report ledger — the SQLite ledger starts
   empty, so tiles settle on real zeros until citizens file. */

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import GovernmentServicesCard from "@/components/admin/GovernmentServicesCard";

/* --------------------------------- Helpers --------------------------------- */

const fmt = (n: number) => n.toLocaleString("en-US");

/* ------------------------------ KPI tile shell ----------------------------- */

interface KpiTileProps {
  header: string;
  icon: typeof Activity;
  iconClass: string;
  children: React.ReactNode;
}

function KpiTile({ header, icon: Icon, iconClass, children }: KpiTileProps) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {header}
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50">
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </span>
      </div>
      {children}
    </div>
  );
}

/* -------------------------------- Component -------------------------------- */

export default function OverviewView() {
  /* Live ledger sync — the KPI tiles read only real report data. Kept on the
     last known ledger if a refresh fails; re-synced every 60s like the rest
     of the console. The sync wall-clock travels with the ledger so SLA
     breach checks stay pure at render time. */
  const [ledger, setLedger] = useState<{
    reports: IncidentReport[];
    syncedAt: number;
  }>({ reports: [], syncedAt: 0 });
  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      fetch("/api/reports", { cache: "no-store" })
        .then((res) =>
          res.ok
            ? res.json()
            : Promise.reject(new Error(`HTTP ${res.status}`))
        )
        .then((data: unknown) => {
          if (!cancelled)
            setLedger({
              reports: Array.isArray(data) ? (data as IncidentReport[]) : [],
              syncedAt: Date.now(),
            });
        })
        .catch(() => {
          // Sync failed — keep the last known ledger.
        });
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  /* Throughput — resolved share vs everything still open (triage, in field,
     disputed). */
  const throughput = useMemo(() => {
    const total = ledger.reports.length;
    const resolved = ledger.reports.filter((r) => r.status === "resolved").length;
    return {
      total,
      resolved,
      open: total - resolved,
      fixRate: total ? Math.round((resolved / total) * 100) : 0,
    };
  }, [ledger.reports]);

  /* Critical focus — unresolved tickets that are either flagged as a life
     hazard (emergency urgency) or past their per-ticket SLA deadline. */
  const criticals = useMemo(() => {
    const open = ledger.reports.filter((r) => r.status !== "resolved");
    const breached = (r: IncidentReport) =>
      new Date(r.sla_deadline).getTime() < ledger.syncedAt;
    return {
      total: open.filter((r) => r.urgency === "emergency" || breached(r)).length,
      p1: open.filter((r) => r.urgency === "emergency").length,
      sla: open.filter(breached).length,
    };
  }, [ledger]);

  return (
    <div>
      {/* 1 ─ Executive KPI strip (live ledger metrics only) */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Card 1 — Incident throughput */}
        <KpiTile
          header="Incident Throughput"
          icon={Activity}
          iconClass="text-emerald-600"
        >
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-3xl font-black tracking-tight text-slate-900">
              {fmt(throughput.total)}
            </p>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {throughput.fixRate}% Fix Rate
            </span>
          </div>
          <div className="my-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${throughput.fixRate}%` }}
              title={`${throughput.resolved} resolved`}
            />
            <div
              className="h-full bg-amber-400 transition-[width] duration-500"
              style={{ width: `${100 - throughput.fixRate}%` }}
              title={`${throughput.open} open`}
            />
          </div>
          <p className="flex items-center gap-2 text-[11px]">
            <span className="font-bold text-emerald-700">
              {fmt(throughput.resolved)} Resolved
            </span>
            <span aria-hidden className="text-slate-300">•</span>
            <span className="font-medium text-amber-700">
              {fmt(throughput.open)} Open
            </span>
          </p>
        </KpiTile>

        {/* Card 2 — Critical hazards (urgent focus anchor) */}
        <div className="rounded-3xl border border-rose-200/80 bg-rose-50/40 p-5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
              Critical Hazards &amp; Escalations
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <p className="font-mono text-3xl font-black tracking-tight text-rose-700">
              {criticals.total}
            </p>
            <p className="text-xs font-bold text-rose-600">
              Urgent Action Required
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-md border border-rose-300/70 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
              {criticals.p1} P1 Life Hazards
            </span>
            <span className="rounded-md border border-amber-300/70 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              {criticals.sla} SLA Breached
            </span>
          </div>
        </div>
      </div>

      {/* 3 ─ Government services registry (executive card + inspection drawer) */}
      <GovernmentServicesCard />
    </div>
  );
}
