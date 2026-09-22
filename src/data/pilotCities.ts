/* Launcher label helpers for the district roster. The roster itself lives in
   the Neon coverage document (provinces/cities behind /api/territories) —
   there is no static seed; the landing page renders whatever the database
   announces. */

import type { CityItem } from "@/types/civic";

/** The district the landing page selects before geo-detection resolves. */
export const DEFAULT_PILOT_CITY_ID = "sialkot";

/** Launcher labels — the capital territory is never called a "district". */
const DISPLAY_LABELS: Record<string, string> = {
  sialkot: "Sialkot District",
  lahore: "Lahore District",
  islamabad: "Islamabad Capital Territory",
};

/** Long-form name for the city selector, e.g. "Sialkot District". */
export function pilotDisplayLabel(city: CityItem): string {
  return DISPLAY_LABELS[city.id] ?? `${city.name_en} District`;
}

/** Short rollout badge — the stored subtext minus its status emoji. */
export function pilotBadgeLabel(city: CityItem): string {
  const stripped = city.subtext?.replace(/^[^\p{L}]+/u, "").trim();
  if (stripped) return stripped;
  return city.status === "active"
    ? "Active Pilot"
    : city.status === "coming_soon"
      ? "Phase 2 Soon"
      : "Paused";
}
