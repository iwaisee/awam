"use client";

/* Resolved History & Citizen Proof Tab — real tickets this squad closed,
   with the dual-photo proof (citizen "before" vs squad "after"), the time
   taken against the SLA window, and citizen feedback once submitted. */

import { useState } from "react";
import { Camera, Check, Clock3, ThumbsUp, Timer } from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import {
  slaCountdown,
  spanLabel,
  type SquadSession,
} from "@/lib/squadFields";

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function SquadHistoryTab({
  session,
  resolved,
  now,
  onZoom,
}: {
  session: SquadSession;
  resolved: IncidentReport[];
  now: number;
  onZoom: (url: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const recent = resolved.filter(
    (r) =>
      r.resolved_at !== undefined &&
      now - new Date(r.resolved_at).getTime() <= RECENT_WINDOW_MS,
  );
  const visible = showAll ? resolved : recent;

  return (
    <section className="space-y-4" aria-label="Resolved history">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-black tracking-tight text-slate-900">
          Resolved History
          <span className="urdu ml-2 text-xs font-semibold text-slate-400">
            حل شدہ
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-200"
        >
          {showAll ? "Last 48 hours" : `All time (${resolved.length})`}
        </button>
      </div>

      {visible.length === 0 && (
        <p className="flex items-center gap-2 rounded-3xl border border-slate-200/90 bg-white p-5 text-xs font-semibold text-slate-500 shadow-2xs">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          No tickets resolved by {session.squadName}
          {showAll ? " yet." : " in the last 48 hours."}
        </p>
      )}

      {visible.map((ticket) => (
        <HistoryCard key={ticket.id} ticket={ticket} now={now} onZoom={onZoom} />
      ))}
    </section>
  );
}

function HistoryCard({
  ticket,
  now,
  onZoom,
}: {
  ticket: IncidentReport;
  now: number;
  onZoom: (url: string) => void;
}) {
  const resolvedMs = ticket.resolved_at
    ? new Date(ticket.resolved_at).getTime()
    : now;
  const startIso = ticket.dispatched_at ?? ticket.created_at;
  const taken = spanLabel(startIso, resolvedMs);
  const metSla = resolvedMs <= new Date(ticket.sla_deadline).getTime();
  const withinWindow = metSla
    ? slaCountdown(ticket.sla_deadline, resolvedMs)
    : slaCountdown(ticket.sla_deadline, resolvedMs);

  return (
    <article className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs transition-all hover:border-slate-300 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-bold text-slate-900">
          {ticket.id}
        </p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
          ✔ Resolved
        </span>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">
          {ticket.resolved_at
            ? new Date(ticket.resolved_at).toLocaleString("en-PK", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "timestamp pending"}
        </span>
      </div>

      <p className="text-xs font-semibold text-slate-700">
        {ticket.category_title}
        <span aria-hidden className="mx-1.5 text-slate-300">•</span>
        <span className="font-medium text-slate-500">{ticket.area_name}</span>
      </p>

      {/* Dual-photo proof — before vs after */}
      <div className="grid grid-cols-2 gap-3">
        <figure className="min-w-0">
          <figcaption className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            <Camera className="h-3 w-3" /> Before
          </figcaption>
          {ticket.photo_url ? (
            <button
              type="button"
              onClick={() => onZoom(ticket.photo_url as string)}
              className="block w-full overflow-hidden rounded-2xl border border-slate-200/90"
              aria-label={`Zoom before photo for ${ticket.id}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ticket.photo_url}
                alt={`Citizen report photo for ${ticket.id}`}
                className="h-28 w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-[9px] font-medium text-slate-400">
              No citizen photo
            </div>
          )}
        </figure>
        <figure className="min-w-0">
          <figcaption className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
            <Camera className="h-3 w-3" /> After
          </figcaption>
          {ticket.after_photo_url ? (
            <button
              type="button"
              onClick={() => onZoom(ticket.after_photo_url as string)}
              className="block w-full overflow-hidden rounded-2xl border border-emerald-300/80"
              aria-label={`Zoom after proof for ${ticket.id}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ticket.after_photo_url}
                alt={`Squad resolution proof for ${ticket.id}`}
                className="h-28 w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-[9px] font-medium text-slate-400">
              Proof filed before this portal shipped
            </div>
          )}
        </figure>
      </div>

      {/* Time taken vs SLA */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600">
          <Timer className="h-3 w-3" />
          Fixed in {taken}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            metSla
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
        >
          <Clock3 className="h-3 w-3" />
          {metSla
            ? `Within SLA — ${withinWindow} to spare`
            : `SLA breached by ${withinWindow}`}
        </span>
        {/* Citizen feedback — real upvotes from the ledger */}
        {ticket.upvotes > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
            <ThumbsUp className="h-3 w-3" />
            {ticket.upvotes} citizen confirm{ticket.upvotes === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">
            Awaiting citizen feedback
          </span>
        )}
      </div>

      {/* Work notes + materials — shown once filed */}
      {(ticket.resolution_notes || ticket.materials_used) && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
          {ticket.resolution_notes && (
            <p className="text-[11px] leading-4 text-slate-600">
              <span className="font-bold text-slate-700">Work notes: </span>
              {ticket.resolution_notes}
            </p>
          )}
          {ticket.materials_used && (
            <p className="text-[11px] leading-4 text-slate-600">
              <span className="font-bold text-slate-700">Materials: </span>
              <span className="font-mono">{ticket.materials_used}</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
