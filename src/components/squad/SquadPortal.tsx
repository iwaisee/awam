"use client";

/* Field Squad Operations Portal — mobile-first field console for one bound
   squad. Live ledger sync (60s), availability toggle (PATCH /api/squad/session,
   mirrored into the departments registry), dispatch actions and the resolution
   proof pipeline all read/write the real report ledger via /api/reports. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import {
  agencyMatchesSquad,
  compareByDispatchPriority,
  isAssignedToSquad,
  isToday,
  SQUAD_AVAILABILITY,
  type SquadSession,
} from "@/lib/squadFields";
import SquadHeader from "./SquadHeader";
import SquadTaskQueue from "./SquadTaskQueue";
import SquadHistoryTab from "./SquadHistoryTab";
import SquadProfileTab from "./SquadProfileTab";
import SquadSessionGate from "./SquadSessionGate";
import ResolveTaskModal from "./ResolveTaskModal";

type Tab = "tasks" | "history" | "profile";

export type { Tab };

const SYNC_INTERVAL = 60_000;
const CLOCK_TICK = 30_000;

export default function SquadPortal() {
  const [session, setSession] = useState<SquadSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [reports, setReports] = useState<IncidentReport[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("tasks");
  const [resolveTarget, setResolveTarget] = useState<IncidentReport | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Ticket ids with an in-flight PATCH — buttons disable, rows dim. */
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [availabilityChanging, setAvailabilityChanging] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* SLA countdowns stay honest with a slow wall-clock tick. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK);
    return () => window.clearInterval(timer);
  }, []);

  const syncSession = useCallback(async () => {
    const res = await fetch("/api/squad/session", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { session: SquadSession | null };
    setSession(data.session);
  }, []);

  const syncReports = useCallback(async () => {
    const res = await fetch("/api/reports", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    setReports(Array.isArray(data) ? (data as IncidentReport[]) : []);
  }, []);

  /* Initial load + periodic ledger/session re-sync (console parity). */
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void syncSession().catch(() => {
        // Session endpoint unreachable — keep the last known binding.
      });
      void syncReports().catch(() => {
        // Sync failed — keep the last known ledger rather than blanking.
      });
    };
    void (async () => {
      try {
        await syncSession();
      } catch {
        /* gate renders when unbound */
      }
      if (!cancelled) setSessionLoading(false);
    })();
    sync();
    const timer = window.setInterval(sync, SYNC_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [syncSession, syncReports]);

  /* ------------------------- Derived ledger views ------------------------- */

  const activeTickets = useMemo(
    () =>
      (reports ?? [])
        .filter(
          (r) =>
            session !== null &&
            isAssignedToSquad(r, session.squadName) &&
            (r.status === "dispatched" || r.status === "in_progress"),
        )
        .sort(compareByDispatchPriority),
    [reports, session],
  );

  const resolvedTickets = useMemo(
    () =>
      (reports ?? [])
        .filter(
          (r) =>
            session !== null &&
            isAssignedToSquad(r, session.squadName) &&
            r.status === "resolved",
        )
        .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "")),
    [reports, session],
  );

  const kpis = useMemo(
    () => ({
      activeCount: activeTickets.length,
      criticalCount: activeTickets.filter((r) => r.urgency === "emergency")
        .length,
      resolvedTodayCount: resolvedTickets.filter((r) =>
        isToday(r.resolved_at, now),
      ).length,
    }),
    [activeTickets, resolvedTickets, now],
  );

  /** Agency desk tickets the crew can accept: same agency, still unowned. */
  const claimableTickets = useMemo(
    () =>
      (reports ?? [])
        .filter(
          (r) =>
            session !== null &&
            !isAssignedToSquad(r, session.squadName) &&
            agencyMatchesSquad(session.agencyCode, r.assigned_agency) &&
            (r.status === "triage" ||
              (r.status === "dispatched" && !r.assigned_unit)),
        )
        .sort(compareByDispatchPriority),
    [reports, session],
  );

  /* ------------------------------ Actions ------------------------------ */

  const markBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) =>
      busy ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );

  const patchTicket = useCallback(
    async (id: string, body: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch("/api/reports", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...body }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  /** Live status transition (acknowledged dispatch ➔ on-site work). */
  const advanceTicket = useCallback(
    async (report: IncidentReport, status: "in_progress") => {
      if (!session) return;
      markBusy(report.id, true);
      setReports(
        (prev) =>
          prev?.map((r) =>
            r.id === report.id ? { ...r, status } : r,
          ) ?? prev,
      );
      const ok = await patchTicket(report.id, { status });
      markBusy(report.id, false);
      if (ok) {
        showToast(`✓ ${report.id} marked on-site — working now.`);
      } else {
        showToast(`⚠ Could not update ${report.id} — retry.`);
      }
      void syncReports().catch(() => undefined);
    },
    [patchTicket, session, showToast, syncReports],
  );

  /** Accept an unowned agency ticket — a real dispatch write. */
  const claimTicket = useCallback(
    async (report: IncidentReport) => {
      if (!session) return;
      markBusy(report.id, true);
      const ok = await patchTicket(report.id, {
        status: "dispatched",
        assigned_unit: session.squadName,
      });
      markBusy(report.id, false);
      if (ok) {
        showToast(`✓ ${report.id} accepted — assigned to ${session.squadName}.`);
        setTab("tasks");
      } else {
        showToast(`⚠ Could not accept ${report.id} — retry.`);
      }
      void syncReports().catch(() => undefined);
    },
    [patchTicket, session, showToast, syncReports],
  );

  const changeAvailability = useCallback(
    async (availability: SquadSession["availability"]) => {
      setAvailabilityChanging(true);
      try {
        const res = await fetch("/api/squad/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ availability }),
        });
        if (res.ok) {
          const data = (await res.json()) as { session: SquadSession };
          setSession(data.session);
          showToast(
            `✓ Status set to ${SQUAD_AVAILABILITY[availability].label}.`,
          );
        } else {
          showToast("⚠ Status change failed — retry.");
        }
      } catch {
        showToast("⚠ Status change failed — retry.");
      } finally {
        setAvailabilityChanging(false);
      }
    },
    [showToast],
  );

  const switchSquad = useCallback(async () => {
    try {
      await fetch("/api/squad/session", { method: "DELETE" });
    } catch {
      /* unbind is best-effort — the gate re-renders regardless */
    }
    setSession(null);
    setTab("tasks");
    showToast("Squad unbound — sign in to a squad to continue.");
  }, [showToast]);

  /* ------------------------------ Render ------------------------------ */

  if (sessionLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50/70 px-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Connecting to the field ledger…
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-50/70 px-4 py-6">
        <SquadSessionGate
          onBound={(bound) => {
            setSession(bound);
            showToast(`✓ Signed in as ${bound.squadName}.`);
            void syncReports().catch(() => undefined);
          }}
          onError={showToast}
        />
        {toast && (
          <div
            role="status"
            className="animate-toast-rise fixed inset-x-4 bottom-6 z-[90] mx-auto flex max-w-sm items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-900 shadow-lg sm:right-6 sm:left-auto sm:mx-0"
          >
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            {toast}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/70">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5 pb-28 sm:max-w-2xl sm:pb-10 lg:max-w-3xl">
        <SquadHeader
          session={session}
          kpis={kpis}
          now={now}
          tab={tab}
          onTabChange={setTab}
          onAvailabilityChange={changeAvailability}
          availabilityChanging={availabilityChanging}
        />

        {tab === "tasks" && (
          <SquadTaskQueue
            session={session}
            tickets={activeTickets}
            claimable={claimableTickets}
            now={now}
            busyIds={busyIds}
            onAdvance={(report) => void advanceTicket(report, "in_progress")}
            onClaim={claimTicket}
            onResolve={setResolveTarget}
            onZoom={setZoomUrl}
          />
        )}

        {tab === "history" && (
          <SquadHistoryTab
            session={session}
            resolved={resolvedTickets}
            now={now}
            onZoom={setZoomUrl}
          />
        )}

        {tab === "profile" && (
          <SquadProfileTab
            session={session}
            activeCount={kpis.activeCount}
            resolvedTodayCount={kpis.resolvedTodayCount}
            onAvailabilityChange={changeAvailability}
            availabilityChanging={availabilityChanging}
            onSwitchSquad={switchSquad}
          />
        )}
      </div>

      {/* Sticky mobile action bar — Active Tasks / Resolved History / Profile */}
      <nav
        aria-label="Field console sections"
        className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 p-3 backdrop-blur-md sm:hidden"
      >
        <BottomTabButton
          active={tab === "tasks"}
          onClick={() => setTab("tasks")}
          label="Active Tasks"
          badge={kpis.activeCount}
        />
        <BottomTabButton
          active={tab === "history"}
          onClick={() => setTab("history")}
          label="Resolved History"
        />
        <BottomTabButton
          active={tab === "profile"}
          onClick={() => setTab("profile")}
          label="Profile"
        />
      </nav>

      {resolveTarget && (
        <ResolveTaskModal
          incident={resolveTarget}
          session={session}
          now={now}
          onClose={() => setResolveTarget(null)}
          onZoom={setZoomUrl}
          onResolved={(message) => {
            setResolveTarget(null);
            showToast(message);
            void syncReports().catch(() => undefined);
          }}
        />
      )}

      {zoomUrl && (
        <button
          type="button"
          aria-label="Close photo preview"
          onClick={() => setZoomUrl(null)}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt="Incident photo, enlarged"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="animate-toast-rise fixed right-4 bottom-24 z-[90] flex max-w-sm items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-white px-4 py-3 text-xs font-bold text-emerald-900 shadow-[0_16px_48px_rgba(15,81,50,0.22)] sm:bottom-6 sm:right-6"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          {toast}
        </div>
      )}
    </main>
  );
}

/* ------------------------------ Bottom tab -------------------------------- */

function BottomTabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-12 min-w-20 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 text-[10px] font-bold transition-colors duration-150 ${
        active ? "bg-emerald-50 text-emerald-900" : "text-slate-500"
      }`}
    >
      <span className="flex items-center gap-1">
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-px font-mono text-[9px] font-bold text-amber-800">
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
