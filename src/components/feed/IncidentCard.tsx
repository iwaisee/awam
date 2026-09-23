"use client";

import {
  ArrowBigUp,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  MapPin,
  Truck,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { FeedReport } from "@/types/report";
import SharePopover from "./SharePopover";

/* ----------------------------------------------------------------------------
 * IncidentCard — civic-discovery card. Unified single-line metadata bar
 * (agency pill + hashtag | urgency • time), narrative beside the incident
 * photo preview, a focused geo anchor strip (landmark • locality), a
 * dispatch ribbon naming the managing authority + assigned field crew, and
 * the action dock. No horizontal overflow down to 360px.
 * -------------------------------------------------------------------------- */

export type LocalityZone =
  | "city_center"
  | "cantonment"
  | "model_town"
  | "kotli"
  | "shahabpura";

const ZONE_META: Record<
  LocalityZone,
  { label: string; division: string }
> = {
  city_center: { label: "City Center", division: "City Sub-Division" },
  cantonment: { label: "Sialkot Cantonment", division: "Cantt Sub-Division" },
  model_town: { label: "Model Town", division: "Model Town Circle" },
  kotli: { label: "Kotli Loharan", division: "Kotli Sub-Division" },
  shahabpura: { label: "Shahabpura", division: "Shahabpura Sub-Division" },
};

export function localityZoneOf(report: FeedReport): LocalityZone {
  const hay = `${report.area} ${report.landmark}`.toLowerCase();
  if (hay.includes("cantt") || hay.includes("canton")) return "cantonment";
  if (hay.includes("model town")) return "model_town";
  if (hay.includes("kotli")) return "kotli";
  if (hay.includes("shahabpura")) return "shahabpura";
  return "city_center";
}

export function localityLabelOf(report: FeedReport): string {
  return ZONE_META[localityZoneOf(report)].label;
}

export type AgencyBucket = "mcs" | "swmc" | "gepco" | "ctp";

export function agencyBucketOf(report: FeedReport): AgencyBucket {
  const a = report.agency.toLowerCase();
  if (a.includes("swmc")) return "swmc";
  if (a.includes("gepco")) return "gepco";
  if (a.includes("ctp")) return "ctp";
  return "mcs";
}

/** SLA window per severity — drives the dispatch ribbon countdown chip. */
function slaLabelFor(report: FeedReport): string {
  const windowH =
    report.severity === "emergency" ? 4 : report.severity === "urgent" ? 24 : 72;
  const remainingMin = Math.round((windowH - report.hoursAgo) * 60);
  if (remainingMin <= 0) return "breached · escalated";
  const h = Math.floor(remainingMin / 60);
  const m = remainingMin % 60;
  if (h === 0) return `${m}m remaining`;
  return m === 0 ? `${h}h remaining` : `${h}h ${m}m remaining`;
}

/** Citizen-friendly authority names, derived from the ticket's agency. */
const AUTHORITY_LABEL: Record<AgencyBucket, string> = {
  mcs: "Municipal Corporation Sialkot (MCS)",
  swmc: "Sialkot Waste Management Company (SWMC)",
  gepco: "GEPCO Sialkot",
  ctp: "City Traffic Police Sialkot (CTP)",
};

/** Named field crew per hazard category — used when the ticket record does
    not carry an explicit squad assignment. */
const SQUAD_BY_CATEGORY: Record<string, string> = {
  open_manhole: "Drainage Jetting Unit 02",
  sanitation: "Sanitation Lift Crew 04",
  electricity: "HT Line Repair Squad 04",
  water_leak: "Pipeline Repair Crew 07",
  traffic: "Signal Maintenance Unit 01",
  broken_road: "Road Patching Unit 05",
  streetlight: "Streetlight Maintenance Unit 03",
};

/* --------------------------------- card ----------------------------------- */

export default function IncidentCard({
  report,
  voted,
  onToggleVote,
  onInspect,
  onToast,
  voteInteractive = true,
  showTicketId = false,
}: {
  report: FeedReport;
  voted: boolean;
  onToggleVote: () => void;
  onInspect: () => void;
  onToast?: (message: string) => void;
  /** false renders the endorsement count as a static stat chip — used on
      the citizen's own reports, where self-endorsing makes no sense. */
  voteInteractive?: boolean;
  /** Renders the ticket reference number in the metadata bar (My Reports). */
  showTicketId?: boolean;
}) {
  const zone = ZONE_META[localityZoneOf(report)];
  const authority =
    report.assignedAuthority ?? AUTHORITY_LABEL[agencyBucketOf(report)];
  const squad =
    report.assignedSquad ?? SQUAD_BY_CATEGORY[report.category] ?? "Field Response Unit";
  const timeLabel =
    report.hoursAgo < 24
      ? `${report.hoursAgo}h ago`
      : `${Math.round(report.hoursAgo / 24)}d ago`;

  const confirmCount = report.upvotes + (voted ? 1 : 0);

  // A deleted/broken evidence photo (e.g. a purged Cloudinary asset) must
  // never render as an empty tile — drop back to the category texture. The
  // failed URL itself is remembered rather than a boolean, so swapping in a
  // new photo clears the fallback on its own, with no effect to resync it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const thumbSrc =
    report.imageUrl && report.imageUrl !== failedSrc
      ? report.imageUrl
      : "/feed/street.svg";

  return (
    <article className="group relative flex flex-col rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs transition-all duration-200 hover:border-emerald-500/40 hover:shadow-md">
      {/* A. Unified single-line metadata bar */}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
            <span className="truncate">
              {report.agency} {zone.division}
            </span>
          </span>
          {showTicketId && (
            <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-600">
              #{report.id}
            </span>
          )}
          <span className="truncate font-mono text-[11px] font-medium text-slate-500">
            {report.categoryTag}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          {report.severity === "emergency" ? (
            <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
              <Zap className="h-3 w-3 text-rose-600" />
              Emergency • شدید خطرہ
            </span>
          ) : report.severity === "urgent" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              <Zap className="h-3 w-3 text-amber-500" />
              Urgent • فوری توجہ
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              Routine • عام مسئلہ
            </span>
          )}
          <span aria-hidden className="text-slate-300">
            •
          </span>
          <span className="text-[11px] font-medium text-slate-500">
            {timeLabel}
          </span>
        </div>
      </div>

      {/* B. Narrative + media tile */}
      <div className="flex flex-col-reverse items-start justify-between gap-5 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold leading-snug text-slate-900 transition-colors duration-150 group-hover:text-emerald-950">
            {report.title}
          </h2>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
            {report.description}
          </p>
        </div>
        {/* Field photo preview — falls back to a clean municipal street shot. */}
        <div className="relative h-44 w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xs sm:h-28 sm:w-36">
          <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
            <Image
              src={thumbSrc}
              alt={report.title}
              fill
              sizes="(max-width: 640px) 100vw, 144px"
              className="object-cover"
              onError={() => setFailedSrc(report.imageUrl ?? null)}
            />
          </div>
        </div>
      </div>

      {/* C. Focused geo anchor strip — landmark • locality */}
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/90 px-3.5 py-2.5 text-xs text-slate-700">
        <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-semibold text-slate-900">
            {report.landmark}
          </span>
          <span aria-hidden className="text-slate-300">
            •
          </span>
          <span className="font-medium text-slate-500">
            {report.area === report.city
              ? report.city
              : `${report.area}, ${report.city}`}
          </span>
        </div>
      </div>

      {/* D. Operational SLA & dispatch ribbon — named authority + field crew */}
      {report.status === "in_progress" ? (
        <div className="mt-3.5 flex w-full flex-col justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3.5 text-amber-950 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-800">
              <Truck className="h-4 w-4" />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-bold text-amber-950">
                  {authority}
                </span>
                <span className="shrink-0 rounded-md bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                  Assigned
                </span>
              </div>
              <span className="mt-0.5 truncate text-[11px] text-amber-900/80">
                Assigned Squad:{" "}
                <strong className="font-semibold text-amber-950">{squad}</strong>
              </span>
            </div>
          </div>
          {/* SLA countdown badge */}
          <div className="flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-amber-300/70 bg-white/90 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-2xs sm:self-auto">
            <Clock className="h-3.5 w-3.5 text-amber-700" />
            <span className="font-mono">{report.slaLabel ?? slaLabelFor(report)}</span>
          </div>
        </div>
      ) : report.status === "resolved" ? (
        <div className="mt-3.5 flex w-full flex-col justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-emerald-950 sm:flex-row sm:items-center">
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span className="min-w-0">
              Resolved &amp; Work Verified with Field Photo Proof
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-emerald-300/60 bg-emerald-100/80 px-2.5 py-1 font-mono text-xs font-bold text-emerald-900 sm:self-auto">
            <Check className="h-3 w-3" />
            {report.resolvedLabel ?? `Completed in ${report.hoursAgo}h`}
          </span>
        </div>
      ) : (
        <div className="mt-3.5 flex w-full flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-slate-600 sm:flex-row sm:items-center">
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
            <Hourglass className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0">Pending Initial Verification</span>
          </span>
          <span className="shrink-0 self-start text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:self-auto">
            Needs Community Upvotes
          </span>
        </div>
      )}

      {/* E. High-utility civic action dock */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-dashed border-slate-300 pt-4 sm:flex sm:items-center sm:justify-between">
        {voteInteractive ? (
          <button
            type="button"
            onClick={onToggleVote}
            aria-pressed={voted}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-2xs transition-all duration-150 active:scale-95 ${
              voted
                ? "border border-[#0F5132] bg-[#0F5132] text-white shadow-xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-950"
            }`}
          >
            <ArrowBigUp
              className={`h-4 w-4 ${voted ? "fill-white text-white" : "text-slate-400"}`}
            />
            {voted
              ? `${confirmCount} Confirmed (+15 pts awarded)`
              : `${confirmCount} Affected`}
          </button>
        ) : (
          <span className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs">
            <ArrowBigUp className="h-4 w-4 text-slate-400" />
            {confirmCount} Affected
          </span>
        )}
        <SharePopover
          title={report.title}
          areaName={`${report.area}, Sialkot`}
          token={report.id}
          onToast={onToast}
          className="w-full sm:w-auto"
        />
        <button
          type="button"
          onClick={onInspect}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-2xs transition-all duration-150 hover:border-emerald-500/40 hover:bg-slate-50 hover:text-emerald-950 active:scale-95 sm:col-span-1 sm:ml-auto sm:w-auto"
        >
          <Eye className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-emerald-700" />
          <span>
            {report.status === "resolved"
              ? "View Proof & Details →"
              : "View Details →"}
          </span>
        </button>
      </div>
    </article>
  );
}
