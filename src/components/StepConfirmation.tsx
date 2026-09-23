"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, ClipboardList, Timer, MessageCircle } from "lucide-react";
import { SEVERITY_MAP } from "@/config/severity";
import type { ReportFormData } from "@/types/report";
import type { IncidentReport } from "@/types/civic";

interface StepConfirmationProps {
  referenceId: string;
  formData: ReportFormData;
  report: IncidentReport | null;
  /** Set by the server when the evidence photo could not be attached —
      the ticket still exists, but the citizen must know it went in bare. */
  photoWarning?: string | null;
  onNewReport: () => void;
  onTrack: () => void;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Ticks every second from the client clock — mounts only after submission. */
function SlaCountdown({ deadline }: { deadline: string }) {
  const target = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = target - now;
  const breached = remaining <= 0;

  return (
    <div className="mt-3 rounded-md border border-line bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
        <Timer className="h-3.5 w-3.5 text-primary" />
        Agency Resolution Clock
      </p>
      <p
        className={`font-heading mt-1 text-lg font-bold tabular-nums ${
          breached ? "text-danger" : "text-primary"
        }`}
      >
        {breached ? "SLA window elapsed" : formatCountdown(remaining)}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-ink-soft">
        {breached
          ? "The mandated deadline has passed — the ticket is escalated."
          : "Time the assigned agency has to resolve this report."}
      </p>
    </div>
  );
}

export default function StepConfirmation({
  referenceId,
  formData,
  report,
  photoWarning,
  onNewReport,
  onTrack,
}: StepConfirmationProps) {
  const severity = SEVERITY_MAP[formData.severity];
  const whatsappHref = useMemo(() => {
    const base =
      typeof window === "undefined" ? "https://sada-e-awam.pk" : window.location.origin;
    const text = `Sada-e-Awam — Tracking my civic report ${referenceId}: ${
      formData.title || "Municipal issue"
    } at ${[formData.area, formData.city].filter(Boolean).join(", ")}. Track progress: ${base}/track?id=${encodeURIComponent(
      referenceId.replace("#", "")
    )}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [referenceId, formData.title, formData.area, formData.city]);

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <CheckCircle2 className="h-16 w-16 text-primary" strokeWidth={1.5} />
      <h2 className="font-heading mt-4 text-2xl font-bold text-ink">
        Report Submitted
      </h2>
      <p className="urdu mt-1 text-base text-primary">آپ کی شکایت درج کر لی گئی</p>

      <div className="mt-6 w-full rounded-md border border-line bg-canvas px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Ticket ID
        </p>
        <p className="font-heading mt-0.5 text-xl font-bold tracking-wide text-primary">
          {referenceId}
        </p>
        {report && (
          <p className="mt-1 text-[11px] font-semibold text-ink-soft">
            Token <span className="font-mono">{report.tracking_token}</span> •
            logged {new Date(report.created_at).toLocaleString("en-PK")}
          </p>
        )}
      </div>

      {photoWarning && (
        <div className="mt-4 w-full rounded-md border border-amber-300/80 bg-amber-50 px-4 py-3 text-left">
          <p className="text-[13px] font-semibold leading-5 text-amber-900">
            {photoWarning}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-800">
            Your ticket is valid — but strong evidence helps agencies act
            faster. If the issue persists, you can file again with a smaller
            photo.
          </p>
        </div>
      )}

      {report?.sla_deadline && <SlaCountdown deadline={report.sla_deadline} />}

      <p className="mt-4 max-w-sm text-sm leading-6 text-ink-soft">
        Thank you for raising your voice. Your{" "}
        <span className="font-semibold text-ink">{severity.labelEn.toLowerCase()}</span>{" "}
        report regarding <span className="font-semibold text-ink">{formData.area}</span>,{" "}
        {formData.city} has been forwarded to{" "}
        <span className="font-semibold text-ink">
          {report?.assigned_agency ?? "the relevant department"}
        </span>
        . Keep the ticket ID to track progress.
      </p>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-btn border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary-tint"
      >
        <MessageCircle className="h-4 w-4" />
        Track via WhatsApp
      </a>

      <div className="mt-3 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onNewReport}
          className="flex items-center justify-center gap-2 rounded-btn border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary-tint"
        >
          <RotateCcw className="h-4 w-4" />
          File Another Report
        </button>
        <button
          type="button"
          onClick={onTrack}
          className="flex items-center justify-center gap-2 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark"
        >
          <ClipboardList className="h-4 w-4" />
          Track This Report
        </button>
      </div>
    </div>
  );
}
