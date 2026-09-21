/* The launcher roster — the districts Sada-e-Awam announces on the landing
   page and the same seed CoverageContext builds its reporting coverage from.
   Only Phase-1 Sialkot is "active"; Phase-2 districts ride as coming_soon
   cards that open the waitlist dialog instead of the reporting wizard.

   Localities are intentionally empty here: CoverageContext grafts the scraped
   Sialkot town → mohallah tree onto the active pilot district, so this file
   stays a pure roster. */

import type { CityItem } from "@/types/civic";

/** The district the landing page selects before geo-detection resolves. */
export const DEFAULT_PILOT_CITY_ID = "sialkot";

export const PILOT_CITIES: CityItem[] = [
  {
    id: "sialkot",
    name_en: "Sialkot",
    name_ur: "سیالکوٹ",
    province: "Punjab",
    status: "active",
    active_reports: 0,
    areas: [],
    agencies: ["MCS", "SWMC", "GEPCO", "CTP Sialkot", "Cantt Board", "Rescue 1122"],
    subtext: "🟢 Active Pilot",
    supervisor: "Deputy Commissioner Sialkot",
    contact: "052-9250051",
    office: "District Secretariat, Kutchery Road, Sialkot",
  },
  {
    id: "lahore",
    name_en: "Lahore",
    name_ur: "لاہور",
    province: "Punjab",
    status: "coming_soon",
    active_reports: 0,
    areas: [],
    agencies: ["MCL", "LWMC", "LESCO", "WASA Lahore"],
    subtext: "Phase 2 Soon",
    supervisor: "Deputy Commissioner Lahore",
    contact: "042-99211111",
    office: "DC Office, Civil Secretariat, Lahore",
  },
  {
    id: "islamabad",
    name_en: "Islamabad",
    name_ur: "اسلام آباد",
    province: "Islamabad Capital Territory",
    status: "coming_soon",
    active_reports: 0,
    areas: [],
    agencies: ["MCI", "CDA", "IESCO", "CTP Islamabad"],
    subtext: "Phase 2 Soon",
    supervisor: "Deputy Commissioner Islamabad",
    contact: "051-9108100",
    office: "DC Office, G-11/4, Islamabad",
  },
];

/** Launcher labels — the capital territory is never called a "district". */
const DISPLAY_LABELS: Record<string, string> = {
  sialkot: "Sialkot District",
  lahore: "Lahore District",
  islamabad: "Islamabad Capital Territory",
};

export function findPilotCity(cityId: string): CityItem | undefined {
  return PILOT_CITIES.find((city) => city.id === cityId);
}

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
