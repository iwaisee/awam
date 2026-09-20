/* Shared display metadata for the departments console — status pills, squad
   shift labels and sector-aware workforce naming. Used by the agency deck,
   the division desk and their modals so every surface labels identically. */

import { SECTOR_WORKFORCE, SQUAD_SHIFTS } from "@/data/departmentRegistry";
import type { FieldSquad, RegionalAgency } from "@/data/departmentRegistry";

export type AgencyStatus = RegionalAgency["status"];
export type SquadStatus = FieldSquad["status"];
export type SquadShift = (typeof SQUAD_SHIFTS)[number]["value"];

export const AGENCY_STATUS_META: Record<
  AgencyStatus,
  { label: string; dot: string; pill: string }
> = {
  pilot: {
    label: "Active Pilot",
    dot: "bg-amber-500 animate-pulse",
    pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  standby: {
    label: "Standby",
    dot: "bg-slate-300",
    pill: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
  },
};

/** Squad operational status — active fills the dot, on-call is a hollow ○,
    off-duty renders a square ■. */
export const SQUAD_STATUS_META: Record<
  SquadStatus,
  { label: string; pill: string; dot: string }
> = {
  active: {
    label: "Active in Field",
    pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    dot: "h-1.5 w-1.5 rounded-full bg-emerald-500",
  },
  on_call: {
    label: "Standby / On-Call",
    pill: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    dot: "h-1.5 w-1.5 rounded-full ring-1 ring-sky-500",
  },
  off_duty: {
    label: "Off-Duty",
    pill: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
    dot: "h-1.5 w-1.5 rounded-[2px] bg-slate-400",
  },
};

export const workforceLabel = (sectorSlug: string, squad: FieldSquad): string =>
  SECTOR_WORKFORCE[sectorSlug]?.[squad.roleClass ?? "worker"] ?? "Field Workers";

export const shiftLabelOf = (shift: SquadShift): string =>
  SQUAD_SHIFTS.find((s) => s.value === shift)?.label ?? shift;

/* ------------------------- Sector SLA time budgets ------------------------- */

/* Turnaround budget (hours) per sector slug — the SLA target the overview
   velocity scorecard measures each agency's `avgResolutionHours` against.
   Policy config, not telemetry: emergency response is bounded tightly,
   infrastructure sectors get multi-day windows. */
export const SECTOR_SLA_TARGET_HOURS: Record<string, number> = {
  power: 6,
  waste: 12,
  water: 16,
  emergency: 1,
  traffic: 3,
  municipal: 24,
  roads: 72,
  horticulture: 72,
  gas: 8,
};

export const sectorSlaTarget = (slug: string): number =>
  SECTOR_SLA_TARGET_HOURS[slug] ?? 24;

export type SlaBand = "excellent" | "optimal" | "on-target" | "delayed";

/* Health band for an agency's avg resolution vs its sector budget — the
   ±0.5h tolerance keeps display rounding ("16.1h vs 16h") from flagging a
   breach. > budget+0.5 delayed · within ±0.5 on-target · ≥ half budget
   optimal · below that excellent. */
export const slaBandOf = (avgHours: number, targetHours: number): SlaBand => {
  if (avgHours > targetHours + 0.5) return "delayed";
  if (avgHours >= targetHours - 0.5) return "on-target";
  if (avgHours >= targetHours / 2) return "optimal";
  return "excellent";
};

/** Tone dot for the band — emerald on/ahead of pace, amber at the edge. */
export const SLA_BAND_DOT: Record<SlaBand, string> = {
  excellent: "bg-emerald-500",
  optimal: "bg-emerald-500",
  "on-target": "bg-amber-500",
  delayed: "bg-rose-500",
};
