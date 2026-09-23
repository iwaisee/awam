import type { FieldSquad } from "@/data/departmentRegistry";
import type { IncidentReport, UrgencyLevel } from "@/types/civic";

/* Pure field-console helpers shared by the /squad client components and the
   server-side session store. NOTHING here may import server-only modules
   (the Postgres pool lives behind the squadPortal/reportsDb boundary). */

export type SquadAvailability =
  | "active_field"
  | "en_route"
  | "on_break"
  | "off_duty";

/** Shape of a squad access code (the /squad sign-in credential). Shared by
    the field gate's validation copy and the server-side access store. */
export const ACCESS_CODE_PATTERN = /^[A-Za-z0-9-]{4,12}$/;

export const SQUAD_AVAILABILITY: Record<
  SquadAvailability,
  { label: string; dot: string; pill: string; registry: FieldSquad["status"] }
> = {
  active_field: {
    label: "Active in Field",
    dot: "●",
    pill: "bg-emerald-500 text-white shadow-2xs",
    registry: "active",
  },
  en_route: {
    label: "En Route",
    dot: "●",
    pill: "bg-amber-500 text-white shadow-2xs",
    registry: "on_call",
  },
  on_break: {
    label: "On Break",
    dot: "●",
    pill: "bg-sky-500 text-white shadow-2xs",
    registry: "on_call",
  },
  off_duty: {
    label: "Off Duty",
    dot: "●",
    pill: "bg-slate-800 text-white shadow-2xs",
    registry: "off_duty",
  },
};

export interface SquadSession {
  /** Registry squad id (stable across renames — the binding key). */
  squadId: string;
  squadName: string;
  agencyCode: string;
  agencyName: string;
  sectorSlug: string;
  divisionId: string;
  divisionName: string;
  district: string;
  leadName: string;
  leadPhone: string;
  membersCount: number;
  vehiclePlate?: string;
  shift?: FieldSquad["shift"];
  /** Serving wards — tickets in these wards belong to this crew. */
  wards: string[];
  availability: SquadAvailability;
  boundAt: string;
}

/** P1 = a life-hazard emergency ticket. */
export function isP1(report: IncidentReport): boolean {
  return report.urgency === "emergency";
}

/** Dispatch ordering: P1 life emergencies first, then the nearest SLA cliff. */
export function compareByDispatchPriority(
  a: IncidentReport,
  b: IncidentReport,
): number {
  const p1 = Number(isP1(b)) - Number(isP1(a));
  if (p1 !== 0) return p1;
  return new Date(a.sla_deadline).getTime() - new Date(b.sla_deadline).getTime();
}

/** True when the report belongs to the squad (assigned_unit match, case-free). */
export function isAssignedToSquad(
  report: IncidentReport,
  squadName: string,
): boolean {
  return (
    (report.assigned_unit ?? "").trim().toLowerCase() ===
    squadName.trim().toLowerCase()
  );
}

/** Agency-prefix match, same rule the dispatcher's auto-assignment uses. */
export function agencyMatchesSquad(
  agencyCode: string,
  assignedAgency: string,
): boolean {
  const a = agencyCode.toLowerCase();
  const b = assignedAgency.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Local-midnight check for "resolved today" counters. */
export function isToday(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date(nowMs);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Human SLA delta against a fixed wall clock, e.g. "1h 45m". */
export function slaCountdown(deadlineIso: string, nowMs: number): string {
  const ms = new Date(deadlineIso).getTime() - nowMs;
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** "2h 30m" span between two ISO instants — resolution time vs dispatch. */
export function spanLabel(fromIso: string, toMs: number): string {
  const from = new Date(fromIso).getTime();
  const totalMinutes = Math.max(
    0,
    Math.floor((toMs - from) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** "+92 300 1234567" → "+92 •••••4567" — call button carries the real number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, "");
  if (digits.length < 5) return "••••";
  return `${digits.slice(0, 3)} •••••${digits.slice(-4)}`;
}

/** Google Maps turn-by-turn: real coordinates when geotagged, area fallback. */
export function mapDirectionsUrl(report: IncidentReport): string {
  const destination = report.coordinates
    ? `${report.coordinates.lat},${report.coordinates.lng}`
    : [report.area_name, report.city_name].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function urgencyRank(urgency: UrgencyLevel): number {
  return urgency === "emergency" ? 0 : urgency === "urgent" ? 1 : 2;
}

/** Shift label for the roster badge (matches SQUAD_SHIFTS windows). */
export function shiftLabel(shift: FieldSquad["shift"] | undefined): string {
  switch (shift) {
    case "morning":
      return "Morning Shift • 06:00 – 14:00";
    case "evening":
      return "Evening Shift • 14:00 – 22:00";
    case "night":
      return "Night Emergency Shift";
    default:
      return "Shift roster pending";
  }
}
