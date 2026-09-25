"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  Copy,
  FileWarning,
  Globe,
  Hash,
  History,
  Landmark,
  Link2,
  MapPin,
  Mail,
  Maximize2,
  MessageCircle,
  Phone,
  PhoneCall,
  Scale,
  ScanLine,
  Share2,
  ShieldCheck,
  ThumbsUp,
  Truck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  dayLabel,
  dossierFromReport,
  fmtClock,
  normalizePhone,
  normalizeToken,
  resolveRegistryAssignment,
  slaProgressPct,
  slaRemainingLabel,
  type TrackDossier,
  type TrackPhoto,
} from "@/lib/trackDossiers";
import { useDepartmentRegistry } from "@/hooks/useDepartmentRegistry";
import { agencyCode, reportTitle } from "@/lib/feedReports";
import { useCitizenProfile } from "@/context/UserContext";
import type { IncidentReport } from "@/types/civic";

type LookupMode = "ticket" | "mobile";

/** Official District Headquarters turnaround limits, by agency. */
const SLA_TARGETS = [
  { agency: "GEPCO", scope: "Emergency", hours: "4h", dot: "bg-rose-400" },
  { agency: "MCS", scope: "Drain", hours: "6h", dot: "bg-sky-400" },
  { agency: "SWMC", scope: "Waste", hours: "12h", dot: "bg-lime-500" },
];

type CardTone = "emerald" | "blue" | "amber";

const CARD_TONE: Record<CardTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
};

const STATUS_PILL: Record<
  TrackDossier["statusTone"],
  { pill: string; dot: string }
> = {
  amber: { pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  emerald: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  blue: { pill: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  rose: { pill: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  purple: { pill: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
};

const URGENCY_TAG: Record<TrackDossier["urgencyTone"], string> = {
  rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

/** "4h" / "2h 30m" duration label for SLA targets and fix times. */
function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Short agency acronym for boundary badges, e.g. "MCS" / "GEPCO". */
function agencyAcronym(agency: string): string {
  return /\b[A-Z]{2,6}\b/.exec(agency)?.[0] ?? agency.split(" ")[0] ?? agency;
}

/* Brand glyphs absent from lucide — used by the share popover only. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TrackPageInner() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const [mode, setMode] = useState<LookupMode>("ticket");
  const [query, setQuery] = useState(initialId ?? "");
  // The dossier is derived from the ledger row plus the departments registry,
  // so the assignment card carries the real desk — squad lead, division
  // manager, agency HQ — and rebuilds whenever the registry syncs.
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

  /* Live dossier — while a ticket is open, its ledger row is re-polled so a
     squad assignment or status change made in the admin console shows up here
     without a reload. The state only moves when the row actually changed. */
  const dossierToken = dossierSource?.tracking_token ?? null;
  useEffect(() => {
    if (!dossierToken) return;
    let cancelled = false;
    const poll = () => {
      void (async () => {
        try {
          const response = await fetch("/api/reports", { cache: "no-store" });
          const data: unknown = await response.json();
          const fresh = Array.isArray(data)
            ? (data as IncidentReport[]).find(
                (r) =>
                  normalizeToken(r.tracking_token) === dossierToken ||
                  normalizeToken(r.id) === dossierToken,
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
          // Ledger unreachable — keep showing the last known state.
        }
      })();
    };
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [dossierToken]);

  const [miss, setMiss] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Live citizen filings from the JSON ledger; null until the first fetch lands.
  const [reports, setReports] = useState<IncidentReport[] | null>(null);
  // An ?id= deep link waits for the ledger before resolving, so freshly filed
  // wizard tickets always open their dossier.
  const [pendingId, setPendingId] = useState<string | null>(initialId);
  // The signed-in citizen's phone — "my submission" is ledger-attributed.
  const { profile } = useCitizenProfile();

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/reports", { cache: "no-store" });
        const data: unknown = await response.json();
        setReports(Array.isArray(data) ? (data as IncidentReport[]) : []);
      } catch {
        setReports([]);
      }
    })();
  }, []);

  // Public sample chips — the newest live tickets, one per agency.
  const samples = useMemo(() => {
    if (!reports) return [];
    const seen = new Set<string>();
    const out: { token: string; label: string }[] = [];
    for (const r of reports) {
      const label = agencyCode(r.assigned_agency);
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ token: r.tracking_token, label });
      if (out.length === 3) break;
    }
    return out;
  }, [reports]);

  const resolveToken = (token: string): IncidentReport | null => {
    // The ledger is the single source of truth — a token that is not in the
    // backend does not resolve, no matter what a device cache once held.
    return (
      reports?.find(
        (r) =>
          normalizeToken(r.tracking_token) === token ||
          normalizeToken(r.id) === token,
      ) ?? null
    );
  };

  const runSearch = (raw: string, searchMode: LookupMode) => {
    const value = raw.trim();
    if (!value) {
      setSearchError(
        searchMode === "ticket"
          ? "Enter a ticket reference, e.g. #SKT-1042."
          : "Enter the mobile number you filed the report with.",
      );
      return;
    }
    setSearchError(null);
    let found: IncidentReport | null = null;
    let missed = value;
    if (searchMode === "ticket") {
      const token = normalizeToken(value);
      found = resolveToken(token);
      if (!found) missed = `#${token}`;
    } else {
      const needle = normalizePhone(value);
      found =
        reports?.find((r) => normalizePhone(r.citizen_phone) === needle) ??
        null;
    }
    if (found) {
      setDossierSource(found);
      setMiss(null);
      window.history.replaceState(
        null,
        "",
        `/track?id=${encodeURIComponent(found.tracking_token)}`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setDossierSource(null);
      setMiss(missed);
    }
  };

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      if (pendingId && reports) {
        runSearch(pendingId, "ticket");
        setPendingId(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId, reports]);

  const clearSearch = () => {
    setDossierSource(null);
    setMiss(null);
    setSearchError(null);
    setQuery("");
    window.history.replaceState(null, "", "/track");
  };

  /* Most recent submission — the newest ledger report filed by this account.
     Attribution is the account id (server-stamped at filing), not the contact
     number, so a ticket carrying someone else's phone still reads as theirs. */
  const latest = useMemo(() => {
    const mine = (reports ?? [])
      .filter((r) => r.user_id === profile.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return mine[0] ?? null;
  }, [reports, profile.id]);
  const latestResolved = latest ? latest.status === "resolved" : false;

  /* ------------------------------ Result view ----------------------------- */
  if (dossier) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors duration-150 hover:text-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            New search
          </button>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Municipal Tracking Dossier
          </span>
        </div>

        <DossierView key={dossier.token} dossier={dossier} />
      </div>
    );
  }

  /* ------------------------------- Hub view ------------------------------- */
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:px-6">
      {/* Top search docket card */}
      <section className="relative mb-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-emerald-50/40 p-6 shadow-sm sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
          🟢 Real-Time Municipal Radar • Sialkot Pilot
        </span>
        <h1 className="font-heading mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Track Incident Progress &amp; Resolution
        </h1>
        <p className="urdu mt-1.5 text-sm font-medium text-emerald-800">
          اپنی درج شدہ شکایت کا شناختی نمبر درج کر کے لائیو پیش رفت دیکھیں
        </p>

        {/* Dual-mode lookup */}
        <div className="mt-6">
          <div
            role="tablist"
            aria-label="Lookup mode"
            className="inline-flex rounded-full bg-slate-100 p-1"
          >
            {(["ticket", "mobile"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setSearchError(null);
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                  mode === m
                    ? "bg-white text-emerald-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "ticket"
                  ? "By Ticket Reference (#SKT-XXXX)"
                  : "By Citizen Mobile Number"}
              </button>
            ))}
          </div>

          <div className="relative mt-4">
            {mode === "ticket" ? (
              <Hash className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            ) : (
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            )}
            <input
              type={mode === "ticket" ? "text" : "tel"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(query, mode)}
              placeholder={
                mode === "ticket"
                  ? "Enter ticket reference, e.g. #SKT-1042"
                  : "Mobile number used while filing, e.g. 0300 1234567"
              }
              aria-label={
                mode === "ticket" ? "Ticket reference" : "Citizen mobile number"
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-32 text-sm font-medium text-slate-800 placeholder-slate-400 transition-colors duration-150 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="button"
              onClick={() => runSearch(query, mode)}
              className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Track Status</span>
            </button>
          </div>
          {searchError && (
            <p className="mt-2.5 text-xs font-semibold text-rose-600">
              {searchError}
            </p>
          )}

          {/* Public sample tickets — newest live tickets, one per agency */}
          <div
            className={`mt-5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 ${
              samples.length === 0 ? "hidden" : ""
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Public Sample Tickets
              </p>
              <p className="text-[11px] font-medium text-slate-400">
                One click fills the tracker and opens the live docket
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {samples.map((sample) => (
                <button
                  key={sample.token}
                  type="button"
                  onClick={() => {
                    setMode("ticket");
                    setQuery(`#${sample.token}`);
                    runSearch(`#${sample.token}`, "ticket");
                  }}
                  className="group inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 transition-colors duration-150 hover:border-emerald-700 hover:bg-emerald-700"
                >
                  <span className="font-mono text-xs font-bold text-emerald-700 transition-colors duration-150 group-hover:text-white">
                    #{sample.token}
                  </span>
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full bg-emerald-300 transition-colors duration-150 group-hover:bg-emerald-400"
                  />
                  <span className="text-xs font-semibold text-emerald-800 transition-colors duration-150 group-hover:text-white">
                    {sample.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ticket not found */}
      {miss && (
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-medium text-rose-800">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No ticket found for{" "}
              <span className="font-mono font-bold">{miss}</span>. Check the
              reference (or mobile number) and try again.
            </span>
          </p>
          <Link
            href="/feed"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-4 py-2 text-xs font-bold text-emerald-800 transition-colors duration-150 hover:bg-emerald-700 hover:text-white"
          >
            Browse Active Sialkot Tickets
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {pendingId && !reports && (
        <p className="mb-8 flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 text-sm font-medium text-slate-500">
          <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500" />
          Resolving ticket from the municipal ledger…
        </p>
      )}

      {/* Most recent submission — the citizen's newest ticket in the ledger */}
      {latest && (
        <section className="mb-8" aria-label="My recent submission">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              My Recent Submission
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Synced from the municipal ledger
            </p>
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <History className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold tracking-wide text-slate-900">
                    #{latest.tracking_token}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      latestResolved
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        latestResolved
                          ? "bg-emerald-500"
                          : "animate-pulse bg-amber-500"
                      }`}
                    />
                    {latestResolved ? "Resolved" : "Active"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                  {reportTitle(latest)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("ticket");
                setQuery(latest.tracking_token);
                runSearch(latest.tracking_token, "ticket");
              }}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95"
            >
              View Live Timeline
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Municipal trust telemetry */}
      <section
        aria-label="Tracking guarantees"
        className="grid grid-cols-1 gap-5 md:grid-cols-3"
      >
        <BentoCard
          icon={Clock}
          tone="emerald"
          kicker="Response Charter"
          title="Sialkot Municipal SLA Targets"
        >
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="grid grid-cols-[1fr_auto] gap-x-3 bg-slate-50 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Agency</span>
              <span className="text-right">Turnaround</span>
            </div>
            {SLA_TARGETS.map((row, index) => (
              <div
                key={row.agency}
                className={`grid grid-cols-[1fr_auto] items-center gap-x-3 px-3.5 py-2.5 ${
                  index > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.dot}`}
                  />
                  {row.agency}
                </span>
                <span className="text-right text-xs">
                  <span className="font-mono font-bold text-emerald-700">
                    {row.hours}
                  </span>
                  <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                    {row.scope}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-slate-400">
            Official turnaround limits enforced by District Headquarters —
            breaches auto-escalate.
          </p>
        </BentoCard>

        <BentoCard
          icon={ShieldCheck}
          tone="blue"
          kicker="Evidence Standard"
          title="Photographic Proof-of-Work"
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-3 text-center">
              <Camera className="mx-auto h-4.5 w-4.5 text-slate-400" />
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Before
              </p>
              <p className="text-[10px] leading-4 text-slate-400">
                Citizen upload
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-2 py-3 text-center">
              <ShieldCheck className="mx-auto h-4.5 w-4.5 text-blue-600" />
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                After
              </p>
              <p className="text-[10px] leading-4 text-blue-600/80">
                Field officer
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            <p className="text-[11px] font-medium leading-4 text-blue-900/80">
              Dual-angle completion photos are mandatory — a ticket cannot close
              until both geotagged frames pass municipal audit.
            </p>
          </div>
        </BentoCard>

        <BentoCard
          icon={Users}
          tone="amber"
          kicker="Priority Escalation"
          title="Citizen Community Vetting"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 font-mono text-sm font-bold text-amber-700 ring-1 ring-amber-200">
              10+
            </span>
            <p className="text-xs leading-5 text-slate-600">
              <span className="font-bold text-slate-800">
                Neighborhood endorsements
              </span>{" "}
              unlock automatic escalation.
            </p>
          </div>
          <ol className="mt-3 space-y-1.5">
            {[
              "10+ neighbors confirm the report",
              "Priority auto-escalated to the SDO desk",
              "Dispatch desk alerted for crew assignment",
            ].map((label, index) => (
              <li key={label} className="flex items-center gap-2 text-xs">
                <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-mono text-[9px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="font-medium text-slate-600">{label}</span>
              </li>
            ))}
          </ol>
        </BentoCard>
      </section>
    </div>
  );
}

/* ------------------------------ Bento card ---------------------------------- */

function BentoCard({
  icon: Icon,
  tone,
  kicker,
  title,
  children,
}: {
  icon: typeof Clock;
  tone: CardTone;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(15,23,42,0.07)]">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${CARD_TONE[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            {kicker}
          </p>
          <h3 className="font-heading mt-0.5 text-sm font-bold leading-snug text-slate-900">
            {title}
          </h3>
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

/* ------------------------------ Dossier view -------------------------------- */

function DossierView({ dossier }: { dossier: TrackDossier }) {
  const resolved =
    Boolean(dossier.sla?.resolvedMs) || dossier.statusTone === "emerald";
  const [now, setNow] = useState(() => Date.now());
  const [emailAlert, setEmailAlert] = useState(false);
  const [upvoted, setUpvoted] = useState(false);
  // Optimistic count; synced to the ledger's value once the PATCH returns.
  const [upvoteTotal, setUpvoteTotal] = useState(dossier.upvotes);
  const [voteNotice, setVoteNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<TrackPhoto | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  // Live tick only while an SLA window is still open.
  useEffect(() => {
    if (!dossier.sla || dossier.sla.resolvedMs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [dossier.sla]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Share popover: dismiss on outside pointer-down or Escape.
  useEffect(() => {
    if (!shareOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShareOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(`#${dossier.token}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the token stays selectable on screen.
    }
  };

  /** "Confirm Issue Still Present" — persisted to the ledger so the
      endorsement count is real municipal data, not per-session state. One
      confirmation per account: clicking a confirmed ticket retracts it. */
  const revertVote = (willConfirm: boolean, notice: string) => {
    setUpvoted(!willConfirm);
    setUpvoteTotal((n) => Math.max(0, n + (willConfirm ? -1 : 1)));
    setVoteNotice(notice);
    window.setTimeout(() => setVoteNotice(null), 4000);
  };

  const toggleConfirm = async () => {
    const willConfirm = !upvoted;
    setUpvoted(willConfirm);
    setUpvoteTotal((n) => n + (willConfirm ? 1 : -1));
    try {
      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dossier.token, upvote: willConfirm }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        report?: IncidentReport;
        error?: string;
      } | null;
      if (data?.success && data.report) {
        setUpvoteTotal(data.report.upvotes);
        return;
      }
      // Rejected by the ledger (signed out, etc.) — the button must not claim
      // a confirmation the account does not hold.
      revertVote(willConfirm, data?.error || "Could not save your confirmation — please try again.");
    } catch {
      revertVote(willConfirm, "Could not save your confirmation — please try again.");
    }
  };

  /** Which tickets has this account already confirmed? Restores the
      confirmed state after a reload, so the button reflects the ledger. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports/votes", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: { votedTokens?: unknown }) => {
        if (
          cancelled ||
          !Array.isArray(data.votedTokens) ||
          !data.votedTokens.includes(dossier.token)
        )
          return;
        setUpvoted(true);
      })
      .catch(() => {
        // Signed out or offline — the button starts in its invite state.
      });
    return () => {
      cancelled = true;
    };
  }, [dossier.token]);

  /** The account's per-ticket "email me on resolution" switch, restored from
      the ledger so the toggle reflects stored reality, not this browser. */
  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/reports/alerts?id=${encodeURIComponent(dossier.token)}`,
      { cache: "no-store" },
    )
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: { enabled?: boolean }) => {
        if (!cancelled && data?.enabled === true) setEmailAlert(true);
      })
      .catch(() => {
        // Signed out or offline — the switch starts off.
      });
    return () => {
      cancelled = true;
    };
  }, [dossier.token]);

  const toggleEmailAlert = async () => {
    const next = !emailAlert;
    setEmailAlert(next);
    try {
      const response = await fetch("/api/reports/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dossier.token, enabled: next }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.success) {
        setEmailAlert(!next);
        setVoteNotice(
          data?.error || "Could not save your alert preference — please try again.",
        );
        window.setTimeout(() => setVoteNotice(null), 4000);
      }
    } catch {
      setEmailAlert(!next);
      setVoteNotice("Could not save your alert preference — please try again.");
      window.setTimeout(() => setVoteNotice(null), 4000);
    }
  };

  const pill = STATUS_PILL[dossier.statusTone];

  /* ------------------------------ Social share ----------------------------- */
  // DossierView only mounts after a client-side lookup, so window is safe.
  const shareUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://sada-e-awam.pk/track?id=${dossier.token}`;
  const shareText = `#${dossier.token} — ${dossier.title} · Status: ${dossier.statusLabel}. Track live progress on Sada-e-Awam.`;

  const shareTargets: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    run: () => void;
  }[] = [
    {
      label: "Post to WhatsApp",
      icon: MessageCircle,
      run: () =>
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
          "_blank",
          "noopener",
        ),
    },
    {
      label: "Post to X",
      icon: XIcon,
      run: () =>
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
          "_blank",
          "noopener",
        ),
    },
    {
      label: "Share on Facebook",
      icon: FacebookIcon,
      run: () =>
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
          "_blank",
          "noopener",
        ),
    },
    {
      label: linkCopied ? "Link Copied" : "Copy Link",
      icon: Link2,
      run: () => {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => {
            setLinkCopied(true);
            window.setTimeout(() => setLinkCopied(false), 2000);
          })
          .catch(() => {
            // Clipboard unavailable — the URL stays in the address bar.
          });
      },
    },
  ];

  const shareReport = async () => {
    // Mobile hands off to the OS share sheet; desktop opens the quick popover.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `#${dossier.token} — ${dossier.title}`,
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // Citizen dismissed the native sheet.
      }
    } else {
      setShareOpen((open) => !open);
    }
  };

  const authorityPill = (() => {
    if (dossier.sla?.resolvedMs) {
      return `Fixed in ${durationLabel(dossier.sla.resolvedMs - dossier.sla.createdAtMs)}`;
    }
    if (resolved) return "Verified";
    if (!dossier.sla) return "In Progress";
    const remaining = dossier.sla.deadlineMs - now;
    return remaining <= 0
      ? "SLA Elapsed"
      : `${slaRemainingLabel(remaining)} left`;
  })();

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* ============================ LEFT COLUMN ============================ */}
        <article className="animate-dossier-in rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8 lg:col-span-7">
          {/* Dossier header — identity row above, status pills below */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="inline-flex items-center rounded-xl border border-slate-200/80 bg-slate-50 py-1 pl-3 pr-1.5 font-mono text-sm font-bold tracking-wide text-slate-900">
              #{dossier.token}
              <button
                type="button"
                onClick={copyToken}
                aria-label="Copy ticket reference"
                className="ml-1.5 inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-white hover:text-slate-600"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                      Copied
                    </span>
                  </>
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </span>

            <div className="relative shrink-0" ref={shareRef}>
              <button
                type="button"
                onClick={shareReport}
                aria-haspopup="menu"
                aria-expanded={shareOpen}
                aria-label="Share this report"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-950 active:scale-95"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share Report
              </button>
              {shareOpen && (
                <div
                  role="menu"
                  aria-label="Share options"
                  className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                >
                  <p className="px-2.5 pb-1.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Share this docket
                  </p>
                  {shareTargets.map((target) => (
                    <button
                      key={target.label}
                      type="button"
                      role="menuitem"
                      onClick={target.run}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-950"
                    >
                      <target.icon className="h-4 w-4 text-slate-500" />
                      {target.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lifecycle + severity — one pill row, shared shape */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${pill.pill}`}
            >
              {dossier.pulse ? (
                <span className="relative flex h-2 w-2">
                  <span
                    aria-hidden
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pill.dot}`}
                  />
                  <span
                    aria-hidden
                    className={`relative inline-flex h-2 w-2 rounded-full ${pill.dot}`}
                  />
                </span>
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {dossier.statusLabel}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold ${URGENCY_TAG[dossier.urgencyTone]}`}
            >
              {dossier.urgencyLabel}
            </span>
          </div>

          {/* Report content card — title, narrative, and site in one container */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50/70">
            <div className="p-4">
              <h2 className="font-heading text-xl font-black tracking-tight leading-snug text-slate-900 sm:text-2xl">
                {dossier.title}
              </h2>
              {dossier.titleUr && (
                <p className="urdu mt-1 text-sm font-medium text-slate-500">
                  {dossier.titleUr}
                </p>
              )}
              {dossier.description && (
                <p className="mt-2 text-xs font-normal leading-relaxed text-slate-700 sm:text-sm">
                  {dossier.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200/70 bg-white/60 px-4 py-3 text-xs font-bold text-slate-900">
              <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="shrink-0 font-semibold text-slate-500">
                Incident Site:
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                {dossier.location}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
            <span>
              Category:{" "}
              <span className="font-semibold text-slate-700">
                {dossier.category}
              </span>
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
            <span>
              Reported:{" "}
              <span className="font-semibold text-slate-700">
                {dossier.reportedLabel}
              </span>
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="flex items-center gap-1.5">
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-semibold text-slate-700">
                {upvoteTotal} Endorsements
              </span>
            </span>
          </div>

          {/* Live SLA countdown meter */}
          {dossier.sla && <SlaMeter dossier={dossier} now={now} />}

          {/* Vertical progress timeline */}
          <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">
            Resolution Progress Timeline
          </h3>
          <ol className="mt-4">
            {dossier.steps.map((step, index) => (
              <li
                key={step.title}
                className="relative flex gap-4 pb-7 last:pb-0"
              >
                {index < dossier.steps.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[13px] top-8 h-[calc(100%-2.25rem)] w-0.5 ${
                      step.state === "completed"
                        ? "bg-emerald-600"
                        : "bg-slate-200"
                    }`}
                  />
                )}
                <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">
                  {step.state === "completed" && (
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  )}
                  {step.state === "active" && (
                    <>
                      <span
                        aria-hidden
                        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/50"
                      />
                      <span
                        aria-hidden
                        className="relative h-3.5 w-3.5 rounded-full bg-amber-500 ring-4 ring-amber-100"
                      />
                    </>
                  )}
                  {step.state === "pending" && (
                    <Circle
                      className="h-7 w-7 text-slate-300"
                      strokeWidth={2}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span
                      className={`text-sm font-bold ${
                        step.state === "pending"
                          ? "text-slate-400"
                          : "text-slate-900"
                      }`}
                    >
                      {step.title}
                    </span>
                    {step.timeLabel && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          step.state === "active"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {step.timeLabel}
                      </span>
                    )}
                  </span>
                  {step.detail && (
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {/* Citizen engagement bar */}
          <div className="-mx-6 -mb-6 mt-6 space-y-3 border-t border-slate-100 bg-slate-50/60 p-6 sm:-mx-8 sm:-mb-8 sm:p-8">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
              <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-slate-700">
                <Mail
                  className={`h-4.5 w-4.5 shrink-0 ${
                    emailAlert ? "text-emerald-700" : "text-slate-400"
                  }`}
                />
                <span className="min-w-0">
                  Email me when this issue is resolved
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={emailAlert}
                aria-label="Email me on resolution"
                onClick={() => void toggleEmailAlert()}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${
                  emailAlert ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-150 ${
                    emailAlert ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {resolved && (
              <button
                type="button"
                title="Open a dispute review"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:border-rose-300 hover:text-rose-700"
              >
                <Scale className="h-4 w-4" />
                Contest Resolution
                <span className="hidden text-xs font-normal text-slate-400 sm:inline">
                  (If the marked work was incomplete)
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void toggleConfirm()}
              aria-pressed={upvoted}
              title={
                upvoted ? "Click to retract your confirmation" : undefined
              }
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.99] ${
                upvoted
                  ? "border border-[#0F5132] bg-[#0F5132] text-white shadow-xs hover:brightness-110"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-800"
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              {upvoted ? "You Already Confirmed This Issue" : "Confirm Issue Still Present"}
              <span
                className={`font-mono text-xs font-bold ${
                  upvoted ? "text-white/80" : "text-emerald-700"
                }`}
              >
                ({upvoted ? upvoteTotal : `+1 Upvote • ${upvoteTotal}`} total)
              </span>
            </button>
            {voteNotice && (
              <p role="status" className="text-center text-xs font-semibold text-rose-600">
                {voteNotice}
              </p>
            )}
          </div>
        </article>

        {/* ============================ RIGHT COLUMN =========================== */}
        <div className="animate-dossier-in space-y-6 lg:col-span-5">
          {/* Card A: Governing authority — high-contrast status container */}
          <section
            className={`space-y-3.5 rounded-3xl border p-5 shadow-2xs ${
              resolved
                ? "border-emerald-200/80 bg-emerald-50/70"
                : "border-amber-200/80 bg-amber-50/80"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    resolved
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {resolved ? (
                    <ShieldCheck className="h-4.5 w-4.5" />
                  ) : (
                    <Truck className="h-4.5 w-4.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-snug text-slate-900">
                    {dossier.agency}
                  </h3>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white ${
                      resolved ? "bg-emerald-600" : "bg-amber-500"
                    }`}
                  >
                    {resolved
                      ? "Resolved & Verified"
                      : dossier.squad
                        ? "Assigned"
                        : "Awaiting Dispatch"}
                  </span>
                </div>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  resolved
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {resolved ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {authorityPill}
              </span>
            </div>

            <div
              className={`space-y-2.5 rounded-2xl border bg-white/90 p-3.5 shadow-2xs ${
                resolved ? "border-emerald-200/60" : "border-amber-200/60"
              }`}
            >
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Desk Supervisor In-Charge
                </p>
                <p className="mt-0.5 pl-5 text-xs font-bold leading-snug text-slate-900">
                  {dossier.officer}
                </p>
              </div>
              <div className="border-t border-dashed border-slate-300/80" />
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Government Office Facility (دفتری پتہ)
                </p>
                <p className="mt-0.5 pl-5 text-xs font-medium leading-snug text-slate-600">
                  {dossier.office}
                </p>
              </div>
              <div className="border-t border-dashed border-slate-300/80" />
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Assigned Field Squad
                </p>
                {dossier.squad ? (
                  <p className="mt-0.5 pl-5 text-xs font-bold leading-snug text-slate-900">
                    {dossier.squad}
                  </p>
                ) : (
                  <p className="mt-0.5 pl-5 text-xs font-medium leading-snug text-slate-400">
                    Will be assigned at dispatch
                  </p>
                )}
              </div>
            </div>

            <a
              href={`tel:${dossier.deskPhone.replace(/[^\d+]/g, "")}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 shadow-2xs transition-all hover:bg-slate-50"
            >
              <PhoneCall className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
              Call Desk: {dossier.deskPhone} ({dossier.deskHours})
            </a>
          </section>

          {/* Card B: Verified photographic proof — dual-angle showcase */}
          <section className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Verified Photographic Proof
              </h3>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                Dual-Angle Geotagged
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {dossier.citizenPhoto ? (
                <PhotoFrame
                  photo={dossier.citizenPhoto}
                  angle="before"
                  onExpand={() => setExpanded(dossier.citizenPhoto ?? null)}
                />
              ) : (
                <EmptyEvidence
                  angle="before"
                  title="No photo attached to the citizen report"
                />
              )}
              {dossier.municipalPhoto ? (
                <PhotoFrame
                  photo={dossier.municipalPhoto}
                  angle="after"
                  onExpand={() => setExpanded(dossier.municipalPhoto ?? null)}
                />
              ) : (
                <EmptyEvidence
                  angle="after"
                  title="Pending Field Officer Upload"
                />
              )}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <ScanLine className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              Inspected and verified against device EXIF coordinates.
            </p>
          </section>

          {/* Card C: Geographic anchor & jurisdiction */}
          <section className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Geographic Jurisdiction &amp; Map
              </h3>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {agencyAcronym(dossier.agency)} Limits
              </span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Administrative Jurisdiction
                  </dt>
                  <dd className="font-semibold leading-snug text-slate-800">
                    {dossier.jurisdiction}
                  </dd>
                </div>
              </div>
              {dossier.landmark && dossier.landmark !== dossier.description && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Landmark Anchor
                    </dt>
                    <dd className="font-medium leading-snug text-slate-600">
                      {dossier.landmark}
                    </dd>
                  </div>
                </div>
              )}
              {dossier.coordinatesLabel && (
                <div className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      GPS Pin
                    </dt>
                    <dd className="font-mono font-semibold text-slate-500">
                      {dossier.coordinatesLabel}
                    </dd>
                  </div>
                </div>
              )}
            </dl>

            <div className="relative h-44 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(#f8fafc,#e8eef4)]">
              {dossier.geo ? (
                <iframe
                  title={`Map preview for #${dossier.token}`}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${dossier.geo.lng - 0.004}%2C${dossier.geo.lat - 0.0025}%2C${dossier.geo.lng + 0.004}%2C${dossier.geo.lat + 0.0025}&layer=mapnik&marker=${dossier.geo.lat}%2C${dossier.geo.lng}`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
                  <Compass className="h-6 w-6 text-emerald-600" />
                  <p className="px-6 text-[11px] font-medium leading-4 text-slate-500">
                    Approximate area pinned from the citizen report GPS.
                  </p>
                </div>
              )}
            </div>
            <a
              href={`https://www.openstreetmap.org/${dossier.geo ? `?mlat=${dossier.geo.lat}&mlon=${dossier.geo.lng}#map=17/${dossier.geo.lat}/${dossier.geo.lng}` : `search?query=${encodeURIComponent(dossier.location)}`}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
            >
              Open interactive map view ↗
            </a>
          </section>
        </div>
      </div>

      {/* Evidence modal */}
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Evidence photo"
          onClick={() => setExpanded(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        >
          <figure
            className="animate-dossier-in w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${expanded.gradient} ring-1 ring-white/20`}
            >
              {expanded.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={expanded.src}
                  alt={expanded.caption}
                  className="absolute inset-0 h-full w-full bg-slate-950 object-contain"
                />
              ) : (
                <expanded.icon
                  className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-white/70"
                  strokeWidth={1.25}
                />
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-slate-950/45 px-4 py-2.5 text-xs font-semibold text-white">
                {expanded.label}
              </span>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <span className="text-xs leading-5 text-slate-200">
                {expanded.stamp && (
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    {expanded.stamp}
                  </span>
                )}
                {expanded.caption}
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {expanded.footnote ??
                    "Original EXIF & geotag retained in the municipal audit log."}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                aria-label="Close evidence photo"
                className="shrink-0 rounded-xl bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {expanded.details && expanded.details.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl bg-white/5 p-3.5 sm:grid-cols-3">
                {expanded.details.map((detail) => (
                  <div key={detail.label} className="min-w-0">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {detail.label}
                    </dt>
                    <dd className="truncate text-[11px] font-semibold text-slate-100">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </figure>
        </div>
      )}
    </>
  );
}

/* ------------------------------- SLA meter ---------------------------------- */

function SlaMeter({ dossier, now }: { dossier: TrackDossier; now: number }) {
  const sla = dossier.sla;
  if (!sla) return null;

  const track = "mt-2.5 h-2.5 overflow-hidden rounded-full bg-white/80";
  const header = (
    <p className="text-xs font-semibold text-slate-700">
      Resolution SLA Deadline: {dayLabel(sla.deadlineMs)},{" "}
      {fmtClock(sla.deadlineMs)}
    </p>
  );

  if (sla.resolvedMs) {
    const onTime = sla.resolvedMs <= sla.deadlineMs;
    return (
      <div
        className={`mt-5 rounded-2xl border p-4 ${
          onTime
            ? "border-emerald-200/70 bg-emerald-50/60"
            : "border-rose-200/70 bg-rose-50/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {header}
          <p
            className={`text-xs font-bold ${
              onTime ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            Resolved in {durationLabel(sla.resolvedMs - sla.createdAtMs)} —{" "}
            {onTime ? "Within mandated SLA" : "SLA breached"}
          </p>
        </div>
        <div className={track}>
          <div
            className={`h-full w-full rounded-full ${
              onTime
                ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                : "bg-gradient-to-r from-rose-600 to-rose-400"
            }`}
          />
        </div>
      </div>
    );
  }

  const remaining = sla.deadlineMs - now;
  const breached = remaining <= 0;
  const pct = slaProgressPct(sla.createdAtMs, sla.deadlineMs, now);
  return (
    <div
      className={`mt-5 rounded-2xl border p-4 ${
        breached
          ? "border-rose-200/70 bg-rose-50/60"
          : "border-amber-200/70 bg-amber-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {header}
        <p
          className={`text-xs font-bold ${
            breached ? "text-rose-600" : "text-amber-700"
          }`}
        >
          {breached
            ? "(SLA window elapsed)"
            : `${slaRemainingLabel(remaining)} remaining of ${durationLabel(sla.deadlineMs - sla.createdAtMs)} SLA Target`}
        </p>
      </div>
      <div className={track}>
        <div
          aria-hidden
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            breached
              ? "bg-gradient-to-r from-rose-600 to-rose-400"
              : "bg-gradient-to-r from-emerald-700 to-emerald-400"
          }`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Photo frame --------------------------------- */

function PhotoFrame({
  photo,
  angle,
  onExpand,
}: {
  photo: TrackPhoto;
  angle: "before" | "after";
  onExpand: () => void;
}) {
  const Icon = photo.icon;
  return (
    <figure className="min-w-0 space-y-1.5">
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Expand evidence: ${photo.label}`}
        className={`group relative block aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-2xl border bg-slate-100 ${
          angle === "after" ? "border-emerald-300" : "border-slate-200"
        }`}
      >
        {photo.src ? (
          // Real uploaded evidence — zoom on hover for inspection.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.src}
            alt={photo.caption}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span
            aria-hidden
            className={`absolute inset-0 bg-gradient-to-br ${photo.gradient}`}
          >
            <Icon
              className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/70 transition-transform duration-200 group-hover:scale-110"
              strokeWidth={1.5}
            />
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors duration-150 group-hover:bg-slate-950/20"
        >
          <Maximize2 className="h-4 w-4 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </span>
        <span
          className={`absolute bottom-2 left-2 flex items-center gap-1 rounded px-2 py-0.5 text-[9px] text-white backdrop-blur-xs ${
            angle === "after"
              ? "bg-[#0F5132]/90 font-bold"
              : "bg-slate-950/75 font-medium"
          }`}
        >
          {angle === "after" && <ShieldCheck className="h-2.5 w-2.5" />}
          {photo.stamp ?? photo.label}
        </span>
      </button>
      <figcaption className="text-[10px] font-bold leading-4 text-slate-600">
        {angle === "after"
          ? "After — Official Completion Proof"
          : "Before — Citizen Submission"}
      </figcaption>
    </figure>
  );
}

function EmptyEvidence({
  angle,
  title,
}: {
  angle: "before" | "after";
  title: string;
}) {
  return (
    <figure className="min-w-0 space-y-1.5">
      <div
        className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-3 text-center ${
          angle === "after"
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-200 bg-slate-50/60"
        }`}
      >
        <Camera
          className={`h-5 w-5 ${
            angle === "after" ? "text-emerald-300" : "text-slate-300"
          }`}
        />
        <p
          className={`text-[10px] font-semibold leading-4 ${
            angle === "after" ? "text-emerald-700/70" : "text-slate-400"
          }`}
        >
          {title}
        </p>
      </div>
      <figcaption className="text-[10px] font-bold leading-4 text-slate-500">
        {angle === "after"
          ? "After — Official Completion Proof"
          : "Before — Citizen Submission"}
      </figcaption>
    </figure>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:px-6">
          <div className="h-64 animate-pulse rounded-3xl border border-slate-200/80 bg-white" />
        </div>
      }
    >
      <TrackPageInner />
    </Suspense>
  );
}
