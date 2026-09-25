"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowBigUp,
  ArrowRight,
  Building2,
  Check,
  Clock,
  Copy,
  HardHat,
  LoaderCircle,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Truck,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import {
  dossierFromReport,
  normalizeToken,
  resolveRegistryAssignment,
  slaProgressPct,
  slaRemainingLabel,
  spanLabel,
  type TrackDossier,
  type TrackStep,
} from "@/lib/trackDossiers";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import type { IncidentReport } from "@/types/civic";

/* ----------------------------------------------------------------------------
 * WorkOrderDrawer — slide-over dossier for a ticket, opened from the feed
 * cards ("View Details →"). Resolves the same way /track does: demo dossier
 * first, then the live reports.json ledger, so feed and dossier stay one
 * source of truth. The overlay + panel stay mounted and toggle GPU-friendly
 * transform/opacity transitions, so entrance and exit never trigger layout
 * thrash; body scroll is locked with scrollbar-width compensation to avoid
 * the classic open-time reflow jump. Escape / overlay click closes.
 *
 * Layout: header with 1-tap copy token → status badges + SLA gauge →
 * ergonomic two-column progress timeline (mono timestamps | node rail |
 * milestone) → warm amber assignment card (authority, squad, supervisor,
 * direct hotline) → sticky "Open Live Tracker" CTA.
 * -------------------------------------------------------------------------- */

const URGENCY_TONE: Record<TrackDossier["urgencyTone"], string> = {
  rose: "border border-rose-200 bg-rose-50 text-rose-700",
  amber: "border border-amber-200 bg-amber-50 text-amber-700",
  slate: "border border-slate-200 bg-slate-100 text-slate-600",
};

/* Timeline node: emerald check (done) · pulsing amber ring (active) ·
   muted outline (pending). Connectors inherit the step state. */
function TimelineNode({ state }: { state: TrackStep["state"] }) {
  if (state === "completed") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-5 w-5 shrink-0 animate-pulse items-center justify-center rounded-full border-2 border-amber-500 bg-amber-100">
        <Truck className="h-2.5 w-2.5 text-amber-600" />
      </span>
    );
  }
  return (
    <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200 bg-white" />
  );
}

function TimelineConnector({ state }: { state: TrackStep["state"] }) {
  if (state === "completed") {
    return <span className="w-0.5 flex-1 bg-emerald-500" />;
  }
  if (state === "active") {
    return <span className="w-0.5 flex-1 bg-amber-400" />;
  }
  return <span className="w-0.5 flex-1 border-l border-dashed border-slate-200" />;
}

export default function WorkOrderDrawer({
  token,
  onClose,
}: {
  token: string | null;
  onClose: () => void;
}) {
  const isOpen = token !== null;

  // The dossier is derived from the ledger row plus the departments registry,
  // so the assignment card carries the real desk and rebuilds when the
  // registry syncs.
  const [dossierSource, setDossierSource] = useState<IncidentReport | null>(
    null,
  );
  const { sectors } = useDepartmentRegistry();
  const dossier = useMemo(() => {
    if (!dossierSource) return null;
    return dossierFromReport(
      dossierSource,
      resolveRegistryAssignment(
        sectors,
        dossierSource.assigned_agency,
        // In triage the crew attachment is only a reservation — show the
        // agency's own desk, not the provisional crew's chain of command.
        dossierSource.status === "triage" ? undefined : dossierSource.assigned_unit,
        dossierSource.city_name,
      ),
    );
  }, [dossierSource, sectors]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  /* Ticket kept from the last open so content survives the exit slide. */
  const [lastToken, setLastToken] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const copyTimer = useRef<number | null>(null);

  const displayToken = token ?? lastToken;

  /* Live SLA clock while the drawer is open. */
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  /* Body scroll lock — compensate the vanishing scrollbar so the page
     behind never reflows (the classic open-time horizontal jump). */
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.paddingRight = "";
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.paddingRight = "";
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  /* Escape to close. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* Move focus into the dialog when it opens. */
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  /* Clear a pending "Copied" reset timer on unmount. */
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const copyToken = async () => {
    if (!displayToken) return;
    const text = displayToken;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* Restricted context (unfocused window, missing permission) — fall
         back to a temporary textarea + execCommand copy. */
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      } finally {
        ta.remove();
      }
      if (!ok) return;
    }
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  /* Resolve the dossier from the live ledger. Kept on the token (not isOpen)
     so the resolved content stays put during the exit. State resets live
     after the microtask yield so renders never cascade. */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLastToken(token);
      setLoading(true);
      setDossierSource(null);
      try {
        const response = await fetch("/api/reports", { cache: "no-store" });
        const data: unknown = await response.json();
        const reports = Array.isArray(data) ? (data as IncidentReport[]) : [];
        const wanted = normalizeToken(token);
        const live = reports.find(
          (r) =>
            normalizeToken(r.tracking_token) === wanted ||
            normalizeToken(r.id) === wanted,
        );
        if (live && !cancelled) {
          setDossierSource(live);
        }
      } catch {
        /* fall through to not-found */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* Live drawer — while a ticket is open, its ledger row is re-polled so a
     squad assignment or status change made in the console shows up without
     closing the drawer. The state only moves when the row changed. */
  const openToken = token ? normalizeToken(token) : null;
  useEffect(() => {
    if (!openToken) return;
    let cancelled = false;
    const poll = () => {
      void (async () => {
        try {
          const response = await fetch("/api/reports", { cache: "no-store" });
          const data: unknown = await response.json();
          const fresh = Array.isArray(data)
            ? (data as IncidentReport[]).find(
                (r) =>
                  normalizeToken(r.tracking_token) === openToken ||
                  normalizeToken(r.id) === openToken,
              )
            : null;
          if (!cancelled && fresh) {
            setDossierSource((prev) =>
              prev && JSON.stringify(prev) === JSON.stringify(fresh)
                ? prev
                : fresh,
            );
          }
        } catch {
          // Ledger unreachable — keep the last known state.
        }
      })();
    };
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [openToken]);

  if (!displayToken) return null;

  const sla = dossier?.sla ?? null;
  const resolvedMs = sla?.resolvedMs;
  const clockNow = resolvedMs ?? now;
  const slaLeft = sla ? slaRemainingLabel(sla.deadlineMs - clockNow) : null;
  const slaPct = sla
    ? slaProgressPct(sla.createdAtMs, sla.deadlineMs, clockNow)
    : 0;
  const slaTone =
    resolvedMs !== undefined
      ? "bg-emerald-600"
      : !slaLeft
        ? "bg-rose-600"
        : "bg-amber-500";
  const slaBadgeTone =
    resolvedMs !== undefined
      ? "bg-emerald-100 text-emerald-900"
      : !slaLeft
        ? "bg-rose-100 text-rose-800"
        : "bg-amber-100 text-amber-900";
  const slaElapsed = sla ? spanLabel(sla.createdAtMs, clockNow) : null;
  const isResolved = dossier?.statusTone === "emerald";
  const fixedIn = sla && resolvedMs ? spanLabel(sla.createdAtMs, resolvedMs) : null;
  /* Agency acronym: "MCS" style agencies keep it inside parentheses, while
     "GEPCO (Gujranwala Electric Power Company)" puts the code up front. */
  const agencyCode = (() => {
    if (!dossier) return "";
    const paren = dossier.agency.match(/\(([^)]+)\)/)?.[1] ?? "";
    if (paren && paren.length <= 6) return paren;
    const before = dossier.agency.split("(")[0].trim();
    return before.split(" ")[0] || dossier.agency;
  })();
  /* Site line for the dossier container: demo tickets carry a rich landmark;
     live filings synthesize landmark from the description, so prefer the
     area/city there. The locality is only appended when the landmark does
     not already name it. */
  const siteLandmark = dossier?.source === "demo" ? (dossier.landmark ?? "") : "";
  const siteLocality = dossier?.location ?? "";
  const slaTargetH = sla
    ? Math.max(1, Math.round((sla.deadlineMs - sla.createdAtMs) / 3_600_000))
    : 0;

  return (
    <div
      role="dialog"
      aria-modal={isOpen}
      aria-label="Work order details"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      {/* Overlay */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-50 cursor-default bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Slide-over panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full transform-gpu flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:max-w-lg ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header — reference token with 1-tap copy */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Work Order Details
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="truncate font-mono text-sm font-extrabold text-slate-900">
                #{displayToken}
              </p>
              <button
                type="button"
                onClick={copyToken}
                aria-label="Copy ticket number"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-700"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              {copied && (
                <span className="text-[10px] font-bold text-emerald-700">
                  Copied
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && isOpen && (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-400">
              <LoaderCircle className="h-6 w-6 animate-spin text-emerald-600" />
              Pulling the work order…
            </div>
          )}

          {!loading && !dossier && isOpen && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-bold text-slate-700">
                No details found for #{displayToken}
              </p>
              <p className="max-w-[240px] text-xs leading-5 text-slate-400">
                This ticket is not in the live ledger or the showcase set —
                it may have been filed from another device.
              </p>
            </div>
          )}

          {!loading && dossier && (
            <div className="space-y-5">
              <div>
                {/* Cleaned metadata bar: operational state left, endorsements right */}
                <div className="mt-3 mb-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 uppercase tracking-wide ${
                        dossier.urgencyTone === "rose"
                          ? `animate-pulse text-[10px] font-extrabold ${URGENCY_TONE[dossier.urgencyTone]}`
                          : `text-[10px] font-semibold ${URGENCY_TONE[dossier.urgencyTone]}`
                      }`}
                    >
                      {dossier.urgencyTone === "rose" && (
                        <Zap className="h-3 w-3 text-rose-600" />
                      )}
                      {dossier.urgencyLabel}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        isResolved
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isResolved ? "bg-emerald-600" : "animate-ping bg-amber-500"
                        }`}
                      />
                      {dossier.statusLabel}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-2xs">
                    <ArrowBigUp className="h-4 w-4 text-emerald-700" />
                    <span>{dossier.upvotes} Endorsements</span>
                  </div>
                </div>

                {/* Single unified incident details container: meta, site,
                    headline and citizen narrative in clean vertical rhythm */}
                <div className="rounded-2xl border border-slate-200/80 p-4 shadow-2xs sm:p-5">
                  {/* 1. Top meta row: agency & category tag + ticket ref */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
                      <span className="font-bold text-slate-900">
                        {agencyCode}
                      </span>
                      <span className="text-slate-300" aria-hidden>
                        •
                      </span>
                      <span className="text-slate-600">{dossier.category}</span>
                    </div>
                    <span className="font-mono text-[11px] font-medium text-slate-400">
                      #{displayToken}
                    </span>
                  </div>

                  {/* 2. Full-width incident site block (never squeezed) */}
                  <div className="space-y-1 pb-3.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                      <span>Incident Site (مقامِ واقعہ)</span>
                    </div>
                    <p className="break-words pl-5 text-[11px] font-medium leading-snug text-slate-900">
                      {siteLandmark}
                      {siteLandmark &&
                        siteLocality &&
                        !siteLandmark.includes(
                          siteLocality.split(",")[0]?.trim() ?? "",
                        ) && (
                          <span className="font-medium text-slate-700">
                            , {siteLocality}
                          </span>
                        )}
                      {!siteLandmark && (
                        <span className="font-medium text-slate-700">
                          {siteLocality}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* 3. Report title */}
                  <h2 className="pt-1 text-base font-extrabold leading-snug tracking-tight text-slate-900 sm:text-lg">
                    {dossier.title}
                  </h2>

                  {/* 4. Citizen narrative */}
                  {dossier.description && (
                    <div className="space-y-1 pt-2.5">
                      <p className="text-xs leading-relaxed text-slate-600">
                        {dossier.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SLA telemetry card — target, countdown, progress, elapsed */}
              {sla && (
                <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      <span>
                        Mandated SLA Target ({slaTargetH}h Window)
                      </span>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${slaBadgeTone}`}
                    >
                      {slaLeft ? `${slaLeft} remaining` : "window elapsed"}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${slaTone}`}
                      style={{ width: `${Math.max(3, slaPct)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px] font-medium text-slate-400">
                    <span>Elapsed: {slaElapsed ?? "—"}</span>
                    <span>Max Target: {slaTargetH}h 00m</span>
                  </div>
                </div>
              )}

              {/* Progress timeline — mono timestamps | node rail | milestone */}
              <div>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Progress timeline
                </p>
                <ol>
                  {dossier.steps.map((step, i) => {
                    const isLast = i === dossier.steps.length - 1;
                    return (
                      <li key={step.title} className="flex gap-3">
                        <span className="w-16 shrink-0 pt-0.5 text-right font-mono text-[11px] font-semibold leading-4 text-slate-400">
                          {step.timeLabel ??
                            (step.state === "active" ? "Now" : "")}
                        </span>
                        <div className="flex w-5 shrink-0 flex-col items-center">
                          <TimelineNode state={step.state} />
                          {!isLast && <TimelineConnector state={step.state} />}
                        </div>
                        <div className="min-w-0 flex-1 pb-5">
                          <p
                            className={`text-xs font-bold leading-4 ${
                              step.state === "pending"
                                ? "text-slate-400"
                                : "text-slate-800"
                            }`}
                          >
                            {step.title}
                          </p>
                          {step.detail && (
                            <p
                              className={`mt-1 text-[11px] leading-4 ${
                                step.state === "active"
                                  ? "font-medium text-amber-800/90"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.detail}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Assignment card — warm amber while active, verified emerald
                  once the ticket resolves. Supervisor + office stack so long
                  names never collide with the location. */}
              <div
                className={`space-y-3 rounded-2xl border p-4 shadow-2xs transition-colors ${
                  isResolved
                    ? "border-emerald-200/80 bg-emerald-50/70"
                    : "border-amber-200/80 bg-amber-50/90"
                }`}
              >
                <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        isResolved
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100/90 text-amber-900"
                      }`}
                    >
                      {isResolved ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <Truck className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs font-bold ${isResolved ? "text-emerald-950" : "text-amber-950"}`}
                        >
                          {dossier.deskShort ?? dossier.agency}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            isResolved
                              ? "bg-emerald-200/80 text-emerald-900"
                              : "bg-amber-200/80 text-amber-900"
                          }`}
                        >
                          {isResolved ? "Resolved & Verified" : "Assigned"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SLA countdown (active) · resolution duration (resolved) */}
                  <div
                    className={`flex shrink-0 items-center gap-1.5 self-start rounded-xl border bg-white/90 px-2.5 py-1.5 font-mono text-xs font-bold shadow-2xs sm:self-center ${
                      isResolved
                        ? "border-emerald-300 text-emerald-900"
                        : "border-amber-300/80 text-amber-950"
                    }`}
                  >
                    {isResolved ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                        <span>
                          {fixedIn ? `Fixed in ${fixedIn}` : "Work Verified"}
                        </span>
                      </>
                    ) : (
                      <>
                        <Clock className="h-3.5 w-3.5 text-amber-700" />
                        <span>{slaLeft ? `${slaLeft} left` : "SLA elapsed"}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Supervisor & Office Information Box */}
                <div className="space-y-2.5 rounded-xl border border-amber-200/70 bg-white/90 p-3.5 shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900/70">
                      <UserCheck className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                      <span>Desk Supervisor In-Charge</span>
                    </div>
                    <div className="break-words pl-5 text-xs font-semibold leading-snug text-slate-800">
                      {dossier.officer}
                    </div>
                  </div>

                  {dossier.deskLocation && (
                    <>
                      <div className="border-t border-dashed border-slate-300/70" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900/70">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                          <span>Government Office Facility (دفتری پتہ)</span>
                        </div>
                        <div className="break-words pl-5 text-[11px] font-medium leading-snug text-slate-600">
                          {dossier.deskLocation}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="border-t border-dashed border-slate-300/70" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900/70">
                      <HardHat className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                      <span>Assigned Squad</span>
                    </div>
                    {dossier.squad ? (
                      <div className="break-words pl-5 text-xs font-semibold leading-snug text-slate-800">
                        {dossier.squad}
                      </div>
                    ) : (
                      <div className="break-words pl-5 text-xs font-medium leading-snug text-slate-400">
                        Will be assigned at dispatch
                      </div>
                    )}
                  </div>
                </div>

                {/* Ghost call button — themed to the card state */}
                <a
                  href={`tel:${dossier.deskPhone.replace(/[^+\d]/g, "")}`}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-bold shadow-2xs transition-all duration-150 active:scale-98 ${
                    isResolved
                      ? "border-emerald-300/80 text-emerald-950 hover:bg-emerald-50"
                      : "border-amber-300/80 text-amber-950 hover:bg-amber-100/60"
                  }`}
                >
                  <PhoneCall
                    className={`h-3.5 w-3.5 ${isResolved ? "text-emerald-800" : "text-amber-800"}`}
                  />
                  <span>
                    Call Desk: {dossier.deskPhone} ({dossier.deskHours})
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer CTA */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-100 bg-white/95 p-4 backdrop-blur-md sm:p-5">
          <Link
            href={`/track?id=${displayToken}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F5132] px-4 py-3.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 hover:shadow-md active:scale-98"
          >
            <span>Open Live Tracker</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
