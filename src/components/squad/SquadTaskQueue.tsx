"use client";

/* Live Dispatch Queue — every real ticket currently assigned to the bound
   squad (status dispatched | in_progress), ordered P1-life-emergencies first
   then nearest SLA cliff. Plus an "accept" strip for unowned agency tickets.
   All actions PATCH /api/reports — the same ledger the admin console reads. */

import { useState } from "react";
import {
  Camera,
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  MapPin,
  Navigation,
  Phone,
  User,
  Wrench,
} from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import {
  isP1,
  mapDirectionsUrl,
  maskPhone,
  slaCountdown,
  type SquadSession,
} from "@/lib/squadFields";

export default function SquadTaskQueue({
  session,
  tickets,
  claimable,
  now,
  busyIds,
  onAdvance,
  onClaim,
  onResolve,
  onZoom,
}: {
  session: SquadSession;
  tickets: IncidentReport[];
  claimable: IncidentReport[];
  now: number;
  busyIds: string[];
  onAdvance: (report: IncidentReport) => void;
  onClaim: (report: IncidentReport) => void;
  onResolve: (report: IncidentReport) => void;
  onZoom: (url: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Assigned tasks">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-black tracking-tight text-slate-900">
          Assigned Tasks
          <span className="urdu ml-2 text-xs font-semibold text-slate-400">
            موجودہ کام
          </span>
        </h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600">
          {tickets.length} in field
        </span>
      </div>

      {tickets.length === 0 && (
        <p className="flex items-center gap-2 rounded-3xl border border-emerald-200/70 bg-emerald-50/60 p-5 text-xs font-semibold text-emerald-800">
          <Check className="h-4 w-4 shrink-0" />
          Queue clear — no open tickets assigned to {session.squadName}. New
          dispatches land here the moment control routes them.
        </p>
      )}

      {tickets.map((ticket) => (
        <TaskCard
          key={ticket.id}
          ticket={ticket}
          now={now}
          busy={busyIds.includes(ticket.id)}
          onAdvance={onAdvance}
          onResolve={onResolve}
          onZoom={onZoom}
        />
      ))}

      {claimable.length > 0 && (
        <div className="space-y-2.5 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-4">
          <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            {session.agencyCode} desk • unclaimed dispatches
          </p>
          {claimable.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3"
            >
              <div className="min-w-0 text-xs">
                <p className="flex items-center gap-2 font-mono font-bold text-slate-900">
                  {ticket.id}
                  {isP1(ticket) && (
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 font-sans text-[9px] font-black text-white">
                      ⚡ P1
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate font-medium text-slate-500">
                  {ticket.category_title} • {ticket.area_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onClaim(ticket)}
                disabled={busyIds.includes(ticket.id)}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#0F5132] px-3.5 text-[11px] font-bold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900 disabled:opacity-60"
              >
                {busyIds.includes(ticket.id) ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Accept"
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------- Task card -------------------------------- */

function TaskCard({
  ticket,
  now,
  busy,
  onAdvance,
  onResolve,
  onZoom,
}: {
  ticket: IncidentReport;
  now: number;
  busy: boolean;
  onAdvance: (report: IncidentReport) => void;
  onResolve: (report: IncidentReport) => void;
  onZoom: (url: string) => void;
}) {
  const p1 = isP1(ticket);
  const deadlineMs = new Date(ticket.sla_deadline).getTime();
  const overdue = deadlineMs <= now;
  const countdown = slaCountdown(ticket.sla_deadline, now);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the ID stays selectable on screen.
    }
  };

  return (
    <article
      className={`space-y-4 rounded-3xl border bg-white p-5 shadow-2xs transition-all sm:p-6 ${
        p1
          ? "border-rose-300/80 hover:border-rose-400"
          : "border-slate-200/90 hover:border-slate-300"
      } ${busy ? "opacity-60" : ""}`}
    >
      {/* Card header: priority badge + real SLA countdown */}
      <div className="flex flex-wrap items-center gap-2">
        {p1 ? (
          <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white">
            ⚡ P1 LIFE EMERGENCY
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
            ● Routine Service
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
            overdue
              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
          }`}
        >
          ⏱ {overdue ? `Overdue by ${countdown}` : `${countdown} left`}
        </span>
        <button
          type="button"
          onClick={copyId}
          aria-label="Copy ticket reference"
          className="ml-auto rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Incident details — real ledger fields */}
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm font-bold text-slate-900">
          {ticket.id}
          <span aria-hidden className="font-sans text-slate-300">•</span>
          <span className="font-sans text-xs font-semibold text-slate-600">
            {ticket.category_title}
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span>
            <span className="font-semibold text-slate-800">
              {ticket.area_name}
            </span>
            {ticket.uc_number ? `, UC ${ticket.uc_number}` : ""} •{" "}
            {ticket.city_name}
            {!ticket.coordinates && (
              <span className="ml-1 text-[10px] text-slate-400">
                (navigating by area)
              </span>
            )}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-semibold text-slate-800">
            {ticket.citizen_name}
          </span>
          {ticket.citizen_phone && (
            <>
              <span className="font-mono text-[11px] text-slate-500">
                {phoneRevealed
                  ? ticket.citizen_phone
                  : maskPhone(ticket.citizen_phone)}
              </span>
              <button
                type="button"
                onClick={() => setPhoneRevealed((v) => !v)}
                className="text-[10px] font-bold text-emerald-700 underline-offset-2 hover:underline"
              >
                {phoneRevealed ? "Hide" : "Reveal"}
              </button>
            </>
          )}
        </p>
      </div>

      {ticket.description && (
        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
          “{ticket.description}”
        </p>
      )}

      {ticket.selected_tags && ticket.selected_tags.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {ticket.selected_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500"
            >
              #{tag.replace(/\s+/g, "")}
            </span>
          ))}
        </p>
      )}

      {/* Citizen's "before" evidence photo */}
      {ticket.photo_url ? (
        <button
          type="button"
          onClick={() => onZoom(ticket.photo_url as string)}
          className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200/90"
          aria-label="Zoom citizen evidence photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.photo_url}
            alt={`Citizen evidence for ${ticket.id}`}
            className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-xl bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
            <Camera className="h-3 w-3 shrink-0" />
            Citizen Evidence (Before) • Click to zoom
          </span>
        </button>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-3.5 py-3 text-[11px] font-medium text-slate-500">
          <Camera className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          No citizen photo attached to this report — verify the hazard on site.
        </p>
      )}

      {/* In-field action buttons — full-width, 48px touch targets */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <a
          href={mapDirectionsUrl(ticket)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs transition-colors duration-150 hover:border-emerald-500/60 hover:text-emerald-800"
        >
          <Navigation className="h-4 w-4 text-emerald-700" />
          🗺 Open Map Directions
        </a>
        {ticket.citizen_phone ? (
          <a
            href={`tel:${ticket.citizen_phone.replace(/\s+/g, "")}`}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs transition-colors duration-150 hover:border-emerald-500/60 hover:text-emerald-800"
          >
            <Phone className="h-4 w-4 text-emerald-700" />
            📞 Call Reporter
          </a>
        ) : (
          <span className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
            <Phone className="h-4 w-4" />
            No reporter phone on file
          </span>
        )}
      </div>

      {/* Live status transition — dispatched ➔ in_progress, ledger-backed */}
      {ticket.status === "dispatched" ? (
        <button
          type="button"
          onClick={() => onAdvance(ticket)}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700/30 bg-emerald-50 text-xs font-bold text-emerald-800 transition-all duration-150 hover:bg-emerald-700 hover:text-white active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Clock3 className="h-4 w-4" />
              🛻 Arrived On-Site — Start Work
            </>
          )}
        </button>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-2.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/70">
          <Wrench className="h-3.5 w-3.5" />
          Working on-site — resolution proof pending
        </p>
      )}

      {/* Primary resolution CTA */}
      <button
        type="button"
        onClick={() => onResolve(ticket)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-xs transition-colors duration-150 hover:bg-emerald-700 active:scale-[0.99]"
      >
        <Check className="h-4 w-4" />
        ✔ Mark Resolved &amp; Upload Proof
      </button>
    </article>
  );
}
