/* Canonical Incident Severity & Priority taxonomy — the single source of
   truth shared by the citizen wizard, admin triage console, field squad
   portal, public feed, API validation, and the database check constraints.

   Legacy terms map as follows (pre-migration rows carry these values):
     "high"     → "urgent"     (بلند is a mistranslation — فوری توجہ)
     "normal"   → "routine"
     "medium"   → "routine"
   normalizeUrgency() below is the gate every legacy value must pass through
   when read from storage or accepted from an old client. */

export type SeverityLevel = "routine" | "urgent" | "emergency";

export type SeverityCode = "P3_ROUTINE" | "P2_URGENT" | "P1_EMERGENCY";

export interface SeverityMeta {
  id: SeverityLevel;
  code: SeverityCode;
  labelEn: string;
  labelUr: string;
  slaHours: number;
  slaDisplay: string;
  slaDisplayUr: string;
  badgeClass: string;
  dotClass: string;
  descriptionEn: string;
  descriptionUr: string;
}

export const SEVERITY_MAP: Record<SeverityLevel, SeverityMeta> = {
  routine: {
    id: "routine",
    code: "P3_ROUTINE",
    labelEn: "Routine",
    labelUr: "عام مسئلہ",
    slaHours: 72,
    slaDisplay: "48–72h",
    slaDisplayUr: "48 سے 72 گھنٹے",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200/80",
    dotClass: "bg-slate-400",
    descriptionEn: "Standard municipal maintenance (48–72 hours)",
    descriptionUr: "معمول کا بلدیاتی کام — 48 سے 72 گھنٹوں میں حل کیا جائے گا",
  },
  urgent: {
    id: "urgent",
    code: "P2_URGENT",
    labelEn: "Urgent",
    labelUr: "فوری توجہ",
    slaHours: 24,
    slaDisplay: "12–24h",
    slaDisplayUr: "12 سے 24 گھنٹے",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300/80",
    dotClass: "bg-amber-500",
    descriptionEn: "Priority issue disrupting traffic or utility (12–24 hours)",
    descriptionUr: "ترجیحی مسئلہ جس پر فوری توجہ درکار ہے (12 سے 24 گھنٹے)",
  },
  emergency: {
    id: "emergency",
    code: "P1_EMERGENCY",
    labelEn: "Emergency",
    labelUr: "شدید خطرہ",
    slaHours: 4,
    slaDisplay: "Immediate (<4h)",
    slaDisplayUr: "فوری کارروائی",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-300/80 animate-pulse",
    dotClass: "bg-rose-600",
    descriptionEn: "Immediate danger to life or property (instant dispatch)",
    descriptionUr: "جان یا مال کو فوری خطرہ — فیلڈ ٹیم کو فوراً روانہ کیا جائے گا",
  },
};

/** Canonical order for pickers: P3 → P2 → P1. */
export const SEVERITY_LEVELS: SeverityLevel[] = [
  "routine",
  "urgent",
  "emergency",
];

/** Legacy/unknown values → canonical tier. Accepts anything read from old
    rows, old clients, or admin JSON so the rest of the app never sees
    "high" / "medium" / "normal" again. */
export function normalizeUrgency(raw: unknown): SeverityLevel {
  if (raw === "emergency") return "emergency";
  if (raw === "urgent" || raw === "high") return "urgent";
  return "routine";
}

/** SLA window in hours for a tier (matches sla_deadline computation). */
export function slaHoursFor(urgency: SeverityLevel): number {
  return SEVERITY_MAP[urgency].slaHours;
}

export type SlaHealth = "ok" | "due-soon" | "breached";

/** SLA health of a ticket: prefers the stored sla_deadline, falls back to
    created_at + the tier's window. "due-soon" fires inside the final 25% of
    the window so queues can flag tickets before they breach. */
export function slaState(
  createdAt: string,
  urgency: SeverityLevel,
  slaDeadline?: string | null
): SlaHealth {
  const createdMs = new Date(createdAt).getTime();
  const windowMs = slaHoursFor(urgency) * 60 * 60 * 1000;
  const deadlineMs = slaDeadline
    ? new Date(slaDeadline).getTime()
    : createdMs + windowMs;
  if (!Number.isFinite(deadlineMs)) return "ok";
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return "breached";
  if (remaining <= windowMs * 0.25) return "due-soon";
  return "ok";
}
