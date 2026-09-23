"use client";

/* Resolution Proof Modal — closes the accountability loop between the field
   squad, the admin Command Radar and the citizen's tracker. The "after"
   photo is downscaled client-side (canvas) and written into the report
   ledger together with work notes via PATCH /api/reports;
   resolution telemetry is stamped server-side by the ledger. */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  LoaderCircle,
  PenLine,
  X,
} from "lucide-react";
import type { IncidentReport } from "@/types/civic";
import { readDownscaledDataUrl } from "@/lib/imageDataUrl";
import { slaCountdown, type SquadSession } from "@/lib/squadFields";

const QUICK_TAGS = [
  "Wire Replaced",
  "Debris Cleared",
  "Manhole Covered",
  "Feeder Restored",
];

export default function ResolveTaskModal({
  incident,
  session,
  now,
  onClose,
  onZoom,
  onResolved,
}: {
  incident: IncidentReport;
  session: SquadSession;
  now: number;
  onClose: () => void;
  onZoom: (url: string) => void;
  onResolved: (message: string) => void;
}) {
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Escape dismissal, mirroring the console modals. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  /** Strict validation gate — no "after" proof, no resolution. */
  const canSubmit = afterPhoto !== null && !submitting;

  const handlePhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("The proof must be a photo (image file).");
      return;
    }
    setError(null);
    try {
      const dataUrl = await readDownscaledDataUrl(file, {
        maxSize: 1280,
        square: false,
      });
      setAfterPhoto(dataUrl);
      setPhotoName(file.name);
    } catch {
      setError("Could not read that photo — try the camera again.");
    }
  };

  const appendTag = (tag: string) => {
    setNotes((prev) =>
      prev.trim() === "" ? `${tag}.` : `${prev.replace(/\.\s*$/, "")}. ${tag}.`,
    );
  };

  const submit = async () => {
    if (!afterPhoto) {
      setError("Attach the 'after' photo proof before resolving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: incident.id,
          status: "resolved",
          after_photo_url: afterPhoto,
          resolution_notes: notes.trim(),
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      const data = (await response.json().catch(() => null)) as {
        photo_warning?: string;
      } | null;
      onResolved(
        data?.photo_warning
          ? `Ticket ${incident.id} resolved — but the proof photo was NOT attached: ${data.photo_warning}`
          : `Ticket ${incident.id} resolved and photo proof sent to citizen.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Resolution failed: ${err.message}`
          : "Resolution failed — retry.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolve-modal-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200/90 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="resolve-modal-title"
              className="text-base font-black tracking-tight text-slate-900"
            >
              Complete Ticket{" "}
              <span className="font-mono">{incident.id}</span>
            </h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Upload photo proof and resolution summary. This record updates
              the Admin Command Radar and the citizen&apos;s tracker
              immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resolution form"
            disabled={submitting}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Before / After comparison */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <figure className="min-w-0">
            <figcaption className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              <Camera className="h-3 w-3" /> Before • Citizen
            </figcaption>
            {incident.photo_url ? (
              <button
                type="button"
                onClick={() => onZoom(incident.photo_url as string)}
                className="block w-full overflow-hidden rounded-2xl border border-slate-200/90"
                aria-label="Zoom the citizen's before photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={incident.photo_url}
                  alt={`Citizen report photo for ${incident.id}`}
                  className="h-36 w-full object-cover"
                />
              </button>
            ) : (
              <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-[10px] font-medium text-slate-400">
                No citizen photo on this report
              </div>
            )}
          </figure>
          <figure className="min-w-0">
            <figcaption className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
              <Camera className="h-3 w-3" /> After • Your proof
            </figcaption>
            {afterPhoto ? (
              <button
                type="button"
                onClick={() => onZoom(afterPhoto)}
                className="relative block w-full overflow-hidden rounded-2xl border border-emerald-300/80"
                aria-label="Zoom your after photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={afterPhoto}
                  alt="Captured resolution proof"
                  className="h-36 w-full object-cover"
                />
                <span className="absolute top-1.5 right-1.5 rounded-full bg-emerald-600 p-1 text-white shadow-2xs">
                  <Check className="h-3 w-3" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-400/70 bg-emerald-50/50 px-2 text-center transition-colors hover:bg-emerald-50"
              >
                <Camera className="h-5 w-5 text-emerald-700" />
                <span className="text-[11px] font-bold text-emerald-800">
                  Snap or upload proof
                </span>
                <span className="text-[9px] font-medium text-emerald-700/70">
                  Camera opens on mobile
                </span>
              </button>
            )}
          </figure>
        </div>

        {/* Camera / file input — capture=environment opens the rear camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handlePhotoPicked(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 transition-colors hover:border-emerald-500/60 hover:text-emerald-800"
          >
            <Camera className="h-3.5 w-3.5 text-emerald-700" />
            {afterPhoto ? "Retake / replace photo" : "Take proof photo"}
          </button>
          {afterPhoto && photoName && (
            <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-400">
              {photoName} attached
            </p>
          )}
        </div>

        {/* Resolution summary / work notes */}
        <label className="mt-4 block">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Resolution summary / work notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What was fixed on site, and any hazards left behind…"
            className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 focus:outline-none"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => appendTag(tag)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
            >
              + {tag}
            </button>
          ))}
        </div>

        {/* Lead sign-off — authenticated session officer */}
        <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
          <PenLine className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
          Signed off by {session.leadName} • {session.squadName} (
          {session.agencyCode})
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] font-bold text-rose-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-xs transition-all duration-150 hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Filing resolution proof…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              ✔ Submit Resolution &amp; Notify Citizen
            </>
          )}
        </button>
        {!afterPhoto && !submitting && (
          <p className="mt-2 text-center text-[10px] font-semibold text-rose-600">
            A photo proof is mandatory — submission is blocked without it.
          </p>
        )}
        <p className="mt-2 text-center text-[10px] text-slate-400">
          SLA at resolution:{" "}
          {new Date(incident.sla_deadline).getTime() < now
            ? `overdue by ${slaCountdown(incident.sla_deadline, now)}`
            : `${slaCountdown(incident.sla_deadline, now)} remaining`}
        </p>
      </div>
    </div>
  );
}
