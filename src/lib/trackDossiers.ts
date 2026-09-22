import type { LucideIcon } from "lucide-react";
import { Camera } from "lucide-react";
import type { IncidentReport } from "@/types/civic";

/* ----------------------------------------------------------------------------
 * Tracking dossier model.
 *
 * A dossier is the full public tracking view for one ticket. Every dossier
 * synthesizes from the live SQLite ledger (/api/reports) — the backend is the
 * single source of truth, so a ticket that is not in the ledger does not
 * resolve.
 * -------------------------------------------------------------------------- */

export interface TrackStep {
  title: string;
  detail?: string;
  timeLabel?: string;
  state: "completed" | "active" | "pending";
}

export interface TrackPhoto {
  label: string;
  /** Overlay stamp shown on the photo frame, e.g. "Uploaded: Yesterday, 3:39 PM". */
  stamp?: string;
  caption: string;
  /** Real uploaded image; when absent the gradient+icon placeholder renders. */
  src?: string;
  icon: LucideIcon;
  gradient: string;
}

export interface TrackDossier {
  /** Token without the leading "#", e.g. "SKT-1042". */
  token: string;
  title: string;
  titleUr?: string;
  /** Citizen-submitted problem narrative shown in the drawer context box. */
  description?: string;
  category: string;
  statusLabel: string;
  statusTone: "amber" | "emerald" | "blue" | "rose" | "purple";
  /** Drives the pulsing radar ring on the status pill. */
  pulse: boolean;
  urgencyLabel: string;
  urgencyTone: "rose" | "amber" | "slate";
  reportedLabel: string;
  location: string;
  jurisdiction: string;
  coordinatesLabel?: string;
  geo?: { lat: number; lng: number };
  landmark?: string;
  agency: string;
  office: string;
  officer: string;
  deskPhone: string;
  deskHours: string;
  /** Citizen-facing desk name for the assignment card, e.g. "GEPCO Cantt Sub-Division". */
  deskShort?: string;
  /** Physical desk location shown beside the supervisor, e.g. "Defense Road Office, Sialkot". */
  deskLocation?: string;
  /** Named field crew currently assigned, e.g. "Bucket Truck Squad #04 (Line Crew)". */
  squad?: string;
  /** Real clock data for the live SLA countdown meter. */
  sla: { createdAtMs: number; deadlineMs: number; resolvedMs?: number } | null;
  steps: TrackStep[];
  citizenPhoto?: TrackPhoto;
  municipalPhoto?: TrackPhoto;
  upvotes: number;
  source: "demo" | "live";
}

/* ------------------------------- Formatting -------------------------------- */

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayLabel(ms: number): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOf(Date.now()) - startOf(ms)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "1h 45m" style remaining window, or null once the deadline has passed. */
export function slaRemainingLabel(msRemaining: number): string | null {
  if (msRemaining <= 0) return null;
  const totalMinutes = Math.floor(msRemaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Elapsed share of an SLA window, clamped to 0–100 for the meter bar. */
export function slaProgressPct(
  createdAtMs: number,
  deadlineMs: number,
  nowMs: number,
): number {
  const span = Math.max(1, deadlineMs - createdAtMs);
  const pct = ((nowMs - createdAtMs) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** "2h 30m" span between two instants, for resolved summaries. */
export function spanLabel(fromMs: number, toMs: number): string {
  const minutes = Math.max(0, Math.floor((toMs - fromMs) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${rest}m`;
}

/* ---------------------------- Agency desk lookup ---------------------------- */

const AGENCY_DESKS: Record<
  string,
  { office: string; officer: string; phone: string; hours: string }
> = {
  WASA: {
    office: "WASA Sub-Division Office",
    officer: "SDO WASA Drainage Cell",
    phone: "1351",
    hours: "24/7 Emergency Line",
  },
  LWMC: {
    office: "LWMC Zonal Office",
    officer: "SDO Sanitation Operations",
    phone: "0800-00596",
    hours: "8 AM – 6 PM",
  },
  LESCO: {
    office: "LESCO Sub-Division Office",
    officer: "SDO LESCO Operations",
    phone: "118",
    hours: "24/7 Emergency Line",
  },
  CTP: {
    office: "City Traffic Police Sector Office",
    officer: "DSP Traffic Sector",
    phone: "15",
    hours: "24/7 Emergency Line",
  },
  Cantonment: {
    office: "Cantonment Board Executive Office",
    officer: "Executive Officer Cantonment Board",
    phone: "052-9250200",
    hours: "9 AM – 5 PM",
  },
  LDA: {
    office: "LDA Urban Planning Wing",
    officer: "Deputy Director LDA",
    phone: "042-99230000",
    hours: "9 AM – 5 PM",
  },
  "Rescue 1122": {
    office: "Rescue 1122 District Headquarters",
    officer: "District Emergency Officer",
    phone: "1122",
    hours: "24/7 Emergency Line",
  },
};

/* --------------------------- Normalizing helpers ---------------------------- */

/** "  skt-1042 " / "#SKT-1042" → "SKT-1042". */
export function normalizeToken(raw: string): string {
  return raw.trim().replace(/^#/, "").toUpperCase();
}

/** "+92 300 1234567" / "0300-1234567" / "923001234567" → "3001234567". */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Canonical 5-step municipal ladder for live dossiers. */
const step = (
  title: string,
  state: TrackStep["state"],
  detail?: string,
  timeLabel?: string,
): TrackStep => ({ title, state, detail, timeLabel });

/* --------------------- Live ledger → dossier synthesis ---------------------- */

const LIVE_STATUS: Record<
  IncidentReport["status"],
  { label: string; tone: TrackDossier["statusTone"]; pulse: boolean }
> = {
  triage: {
    label: "In Triage (Awaiting Assignment)",
    tone: "amber",
    pulse: true,
  },
  dispatched: { label: "Crew Dispatched", tone: "amber", pulse: true },
  in_progress: { label: "Work In Progress", tone: "blue", pulse: true },
  resolved: { label: "Resolved (Verified)", tone: "emerald", pulse: false },
  disputed: { label: "Under Citizen Dispute", tone: "purple", pulse: true },
};

const LIVE_URGENCY: Record<
  IncidentReport["urgency"],
  { label: string; tone: TrackDossier["urgencyTone"] }
> = {
  emergency: { label: "Emergency Hazard (P1)", tone: "rose" },
  high: { label: "High Priority (P2)", tone: "amber" },
  routine: { label: "Routine (P3)", tone: "slate" },
};

export function dossierFromReport(r: IncidentReport): TrackDossier {
  const created = new Date(r.created_at).getTime();
  const deadline = new Date(r.sla_deadline).getTime();
  const dispatchedAt = r.dispatched_at
    ? new Date(r.dispatched_at).getTime()
    : undefined;
  const resolvedAt =
    r.status === "resolved" && r.resolved_at
      ? new Date(r.resolved_at).getTime()
      : undefined;
  const desk = AGENCY_DESKS[r.assigned_agency] ?? {
    office: `${r.assigned_agency} Sub-Division Office`,
    officer: `SDO ${r.assigned_agency} Operations`,
    phone: "052-9250200",
    hours: "9 AM – 5 PM",
  };
  const status = LIVE_STATUS[r.status];
  const urgency = LIVE_URGENCY[r.urgency];
  const reported = `${dayLabel(created)}, ${fmtClock(created)}`;
  const location = [r.area_name, r.city_name].filter(Boolean).join(", ");

  const communityDetail =
    r.upvotes > 0
      ? `${r.upvotes} neighbors upvoted, confirming the hazard`
      : "Awaiting neighbor confirmations";

  const citizenPhoto: TrackPhoto | undefined = r.photo_url
    ? {
        label: "Uploaded by Citizen",
        stamp: `Uploaded: ${reported}`,
        caption: r.description,
        src: r.photo_url,
        icon: Camera,
        gradient: "from-slate-500 via-slate-600 to-slate-800",
      }
    : undefined;

  /* Step clocks come only from real ledger telemetry (created_at,
     dispatched_at, resolved_at). Steps without a backend event stay
     untimed rather than showing interpolated timestamps. */
  const steps: TrackStep[] = [
    step(
      "Incident Logged & GPS Verified",
      "completed",
      "Geotagged citizen report accepted into the municipal ledger",
      fmtClock(created),
    ),
    step(
      "Community Verified",
      r.status === "triage" ? "active" : "completed",
      communityDetail,
    ),
    step(
      "Work Order Issued to Sub-Divisional Officer",
      r.status === "triage" ? "pending" : "completed",
      `${r.assigned_agency} ${r.status === "triage" ? "queue position reserved" : "desk assigned the crew"}`,
    ),
    step(
      "Field Crew Dispatched with Repair Equipment",
      r.status === "dispatched"
        ? "active"
        : ["in_progress", "resolved", "disputed"].includes(r.status)
          ? "completed"
          : "pending",
      r.status === "dispatched" ? "Crew en route with equipment" : undefined,
      dispatchedAt !== undefined ? fmtClock(dispatchedAt) : undefined,
    ),
    step(
      "On-Site Photo Verification & Resolution",
      r.status === "in_progress" || r.status === "disputed"
        ? "active"
        : r.status === "resolved"
          ? "completed"
          : "pending",
      r.status === "in_progress"
        ? "Awaiting dual-angle resolution proof from the field officer"
        : r.status === "resolved"
          ? "Resolution proof verified and ticket closed"
          : r.status === "disputed"
            ? "Resolution contested by the citizen — field re-audit queued"
            : undefined,
      resolvedAt !== undefined ? fmtClock(resolvedAt) : undefined,
    ),
  ];

  return {
    token: normalizeToken(r.tracking_token || r.id),
    title: r.category_title,
    description: r.description,
    category: r.category_title,
    statusLabel: status.label,
    statusTone: status.tone,
    pulse: status.pulse,
    urgencyLabel: urgency.label,
    urgencyTone: urgency.tone,
    reportedLabel: reported,
    location,
    jurisdiction: r.jurisdiction,
    coordinatesLabel: r.coordinates
      ? `${r.coordinates.lat.toFixed(4)}° N, ${r.coordinates.lng.toFixed(4)}° E`
      : undefined,
    geo: r.coordinates ?? undefined,
    landmark: r.description,
    agency: r.assigned_agency,
    office: `${desk.office}, ${r.city_name}`,
    officer: desk.officer,
    deskPhone: desk.phone,
    deskHours: desk.hours,
    deskShort: `${r.assigned_agency} Sub-Division`,
    deskLocation: desk.office,
    squad: r.assigned_unit ?? undefined,
    sla: {
      createdAtMs: created,
      deadlineMs: deadline,
      ...(resolvedAt !== undefined ? { resolvedMs: resolvedAt } : {}),
    },
    steps,
    citizenPhoto,
    upvotes: r.upvotes,
    source: "live",
  };
}

