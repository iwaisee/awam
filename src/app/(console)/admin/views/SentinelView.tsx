"use client";

/* /admin/sentinel — Flagged report queue. Minimal: scan, open proof, decide.
   Details open in a right-side panel with issue + reporter context. */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Ban,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import type {
  ConsoleFlagged,
  FlagCategory,
  FlagEvidence,
} from "@/data/operationsData";

/* ------------------------------- Category info ----------------------------- */

const CATEGORIES: Record<
  FlagCategory,
  { tab: string; title: string; dot: string }
> = {
  duplicate: {
    tab: "Same photo",
    title: "Same photo used before",
    dot: "bg-amber-400",
  },
  gps: {
    tab: "Wrong place",
    title: "Reported from the wrong place",
    dot: "bg-rose-500",
  },
  flood: {
    tab: "Too many",
    title: "Sending too many reports",
    dot: "bg-orange-400",
  },
};

const TABS: { id: "all" | FlagCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "duplicate", label: "Same photo" },
  { id: "gps", label: "Wrong place" },
  { id: "flood", label: "Too many" },
];

const sinceLabel = (uploaded: string) => uploaded.replace("Uploaded ", "");
const spanLabel = (hours: number) =>
  hours % 24 === 0
    ? `${hours / 24} day${hours === 24 ? "" : "s"}`
    : `${hours} hours`;

/* -------------------------------- Component -------------------------------- */

export default function SentinelView() {
  /* The review queue starts empty — flagged rows are produced by the
     abuse-detection pass, never seeded. */
  const [queue, setQueue] = useState<ConsoleFlagged[]>([]);
  const [tab, setTab] = useState<"all" | FlagCategory>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<ConsoleFlagged | null>(null);
  const closeTimer = useRef<number | null>(null);

  const remove = (id: string) =>
    setQueue((prev) => prev.filter((f) => f.id !== id));

  const openDrawer = (id: string) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setDetailId(id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    closeTimer.current = window.setTimeout(() => {
      setDetailId(null);
      closeTimer.current = null;
    }, 300);
  };

  const counts = useMemo(
    () => ({
      duplicate: queue.filter((f) => f.category === "duplicate").length,
      gps: queue.filter((f) => f.category === "gps").length,
      flood: queue.filter((f) => f.category === "flood").length,
    }),
    [queue]
  );

  const rows = useMemo(
    () => (tab === "all" ? queue : queue.filter((f) => f.category === tab)),
    [queue, tab]
  );

  const detailFlag = queue.find((f) => f.id === detailId) ?? null;

  return (
    <>
      <div className="space-y-4">
        {/* Slim toolbar — count + filters, nothing else */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            Reports to check
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                queue.length === 0
                  ? "bg-slate-100 text-slate-500"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {queue.length}
            </span>
          </h2>
          <div
            className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1"
            role="group"
            aria-label="Filter reports by problem"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              const count = t.id === "all" ? queue.length : counts[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-slate-900/20 ${
                    active
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? "text-slate-400" : "text-slate-400/70"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The queue */}
        {queue.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-slate-200/80 bg-white p-14 text-center shadow-2xs">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-slate-900">
              All caught up
            </p>
            <p className="mt-1 text-xs text-slate-500">
              No flagged reports right now.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-slate-200/80 bg-white p-14 text-center shadow-2xs">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-slate-900">
              Nothing under this filter
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Switch to “All” to see the rest.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
            {rows.map((flag) => {
              const meta = CATEGORIES[flag.category];
              const active = detailId === flag.id && drawerOpen;
              return (
                <div
                  key={flag.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors duration-150 ${
                    active ? "bg-slate-50" : "hover:bg-slate-50/70"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {meta.title}
                      <span className="ml-2 font-mono text-[11px] font-medium text-slate-400">
                        {flag.id}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-300" />
                        {flag.area}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{flag.reporter}</span>
                      <span aria-hidden>·</span>
                      <span>new user</span>
                    </p>
                  </div>

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => openDrawer(flag.id)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                    >
                      Details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mark ${flag.id} as real`}
                      onClick={() => remove(flag.id)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Real
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss ${flag.id}`}
                      onClick={() => remove(flag.id)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                    >
                      <X className="h-3.5 w-3.5" />
                      Not real
                    </button>
                    <button
                      type="button"
                      aria-label={`Block reporter of ${flag.id}`}
                      onClick={() => setBlockTarget(flag)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Block
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right-side details panel */}
      {detailFlag && (
        <DetailDrawer
          flag={detailFlag}
          reportsFromReporter={
            queue.filter((f) => f.reporter === detailFlag.reporter).length
          }
          open={drawerOpen}
          blocked={blockTarget?.id === detailFlag.id}
          onClose={closeDrawer}
          onDecide={() => {
            remove(detailFlag.id);
            closeDrawer();
          }}
          onBlock={() => setBlockTarget(detailFlag)}
        />
      )}

      {/* Block confirmation */}
      {blockTarget && (
        <BlockModal
          flag={blockTarget}
          waitingCount={
            queue.filter((f) => f.reporter === blockTarget.reporter).length
          }
          onCancel={() => setBlockTarget(null)}
          onConfirm={() => {
            remove(blockTarget.id);
            setBlockTarget(null);
            closeDrawer();
          }}
        />
      )}
    </>
  );
}

/* ---------------------- One-sentence explanation per flag -------------------- */

function Explain({ flag }: { flag: ConsoleFlagged }) {
  const ev = flag.evidence;
  if (ev.kind === "duplicate") {
    return (
      <>
        The photo in this report is the same as the one in {ev.matchedTicket},
        sent {sinceLabel(ev.matchedUploaded)}
        {ev.alsoMatched ? (
          <>
            {" "}
            — and it was also used in {ev.alsoMatched}.
          </>
        ) : (
          "."
        )}
      </>
    );
  }
  if (ev.kind === "gps") {
    return (
      <>
        They say the problem is in {ev.claimed}, but the phone that sent this
        was in {ev.detected} — {ev.distance} away.
      </>
    );
  }
  return (
    <>
      This phone number sent {ev.pins.length} reports in just{" "}
      {spanLabel(ev.windowHours)}, spread across {ev.zones.length} different
      areas.
    </>
  );
}

/* ------------------------------- Proof panels ------------------------------- */

function DuplicateProof({
  ev,
}: {
  ev: Extract<FlagEvidence, { kind: "duplicate" }>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PhotoBox
          src={ev.photo}
          label="New photo"
          sub={`Sent ${sinceLabel(ev.thisUploaded)}`}
        />
        <PhotoBox
          src={ev.photo}
          label="Old photo"
          sub={`Report ${ev.matchedTicket} · ${sinceLabel(ev.matchedUploaded)}`}
        />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">
        The two photos are the same.
      </p>
    </section>
  );
}

function PhotoBox({
  src,
  label,
  sub,
}: {
  src: string;
  label: string;
  sub: string;
}) {
  return (
    <figure className="min-w-0">
      <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <Image
          src={src}
          alt={`${label} sent with the report`}
          fill
          sizes="(max-width: 640px) 100vw, 320px"
          className="object-cover"
        />
        <span className="absolute left-2 top-2 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {label}
        </span>
      </div>
      <figcaption className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
        <Clock className="h-3 w-3 shrink-0 text-slate-400" />
        {sub}
      </figcaption>
    </figure>
  );
}

function GpsProof({ ev }: { ev: Extract<FlagEvidence, { kind: "gps" }> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            They say they are here
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            {ev.claimed}
          </p>
        </div>
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            But their phone is really in
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-rose-700">
            <Smartphone className="h-4 w-4 shrink-0 text-rose-600" />
            {ev.detected}
          </p>
          <p className="mt-0.5 text-xs font-medium text-rose-600">
            {ev.distance} away — outside our area.
          </p>
        </div>
      </div>
    </section>
  );
}

function FloodProof({ ev }: { ev: Extract<FlagEvidence, { kind: "flood" }> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative h-8">
        <span
          className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-slate-200"
          aria-hidden
        />
        {ev.pins.map((pin, i) => (
          <span
            key={i}
            title={`${pin.at} — ${ev.zones[pin.zone].name}`}
            style={{ left: `${pin.left}%` }}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${ev.zones[pin.zone].dot}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-400">
        <span>{spanLabel(ev.windowHours)} ago</span>
        <span>today</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {ev.zones.map((zone) => (
          <span
            key={zone.name}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${zone.dot}`} aria-hidden />
            {zone.name} — {zone.count}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Details drawer ------------------------------ */

function DetailDrawer({
  flag,
  reportsFromReporter,
  open,
  blocked,
  onClose,
  onDecide,
  onBlock,
}: {
  flag: ConsoleFlagged;
  reportsFromReporter: number;
  open: boolean;
  blocked: boolean;
  onClose: () => void;
  onDecide: (decision: "real" | "notreal") => void;
  onBlock: () => void;
}) {
  // Flip one frame after mount so the panel transitions in from off-screen.
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

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
      // When the block dialog is stacked on top, Escape closes only that one.
      if (e.key === "Escape" && !blocked) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, blocked]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const shown = entered && open;
  const meta = CATEGORIES[flag.category];

  return (
    <>
      <button
        type="button"
        aria-label="Close report details"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Report details — ${flag.id}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl outline-none transition-transform duration-300 ease-in-out ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-bold text-slate-400">
                {flag.id}
              </p>
              <h3 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-900">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                  aria-hidden
                />
                {meta.title}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3 text-slate-300" />
                {flag.area}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* The issue */}
          <section className="border-b border-slate-100 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              What looks wrong
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700">
              <Explain flag={flag} />
            </p>
            <div className="mt-3">
              {flag.evidence.kind === "duplicate" && (
                <DuplicateProof ev={flag.evidence} />
              )}
              {flag.evidence.kind === "gps" && (
                <GpsProof ev={flag.evidence} />
              )}
              {flag.evidence.kind === "flood" && (
                <FloodProof ev={flag.evidence} />
              )}
            </div>
          </section>

          {/* The reporter */}
          <section className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              About the reporter
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Phone</dt>
                <dd className="font-mono font-bold text-slate-900">
                  {flag.reporter}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Account</dt>
                <dd className="font-semibold text-slate-900">
                  New user — no history before this week
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Reports waiting</dt>
                <dd className="font-semibold text-slate-900">
                  {reportsFromReporter} in this queue
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Decision footer */}
        <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onDecide("real")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Check className="h-4 w-4" />
              Real
            </button>
            <button
              type="button"
              onClick={() => onDecide("notreal")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
            >
              <X className="h-4 w-4" />
              Not real
            </button>
            <button
              type="button"
              onClick={onBlock}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2.5 text-xs font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            >
              <Ban className="h-4 w-4" />
              Block
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ----------------------------- Block confirmation --------------------------- */

function BlockModal({
  flag,
  waitingCount,
  onCancel,
  onConfirm,
}: {
  flag: ConsoleFlagged;
  waitingCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [stop30, setStop30] = useState(true);
  const [forever, setForever] = useState(false);
  const [deleteWaiting, setDeleteWaiting] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const OPTIONS = [
    {
      id: "stop30",
      checked: stop30,
      set: setStop30,
      label: "Stop this number for 30 days",
      sub: "They can send reports again after a month.",
    },
    {
      id: "forever",
      checked: forever,
      set: setForever,
      label: "Block their phone forever",
      sub: "For repeat troublemakers only.",
    },
    {
      id: "waiting",
      checked: deleteWaiting,
      set: setDeleteWaiting,
      label: "Delete their reports that are waiting",
      sub: `Removes ${waitingCount} report${
        waitingCount === 1 ? "" : "s"
      } from this list right away.`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
            <Ban className="h-5 w-5 text-rose-600" />
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3
          id="block-title"
          className="mt-3 text-base font-bold text-slate-900"
        >
          Block {flag.reporter}?
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          They will not be able to send more reports. You can undo the 30-day
          block later.
        </p>

        <div className="mt-4 space-y-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 transition-colors duration-150 hover:border-slate-300"
            >
              <input
                type="checkbox"
                checked={opt.checked}
                onChange={(e) => opt.set(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-rose-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {opt.sub}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          >
            <Ban className="h-3.5 w-3.5" />
            Yes, Block
          </button>
        </div>
      </div>
    </div>
  );
}
