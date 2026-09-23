import { PILOT_DISTRICT_BBOX } from "@/lib/pilotBoundary";

/* Fast, offline locality lookup for the camera HUD badge and the watermark
   burned into captured evidence. Runs on every GPS fix (no network, no
   rate limits, no citizen coordinates leaving the device — same posture as
   pilotBoundary).

   The boxes below are a coarse gazetteer of well-known Sialkot localities,
   tuned for a display badge — NOT legal ward boundaries. The authoritative
   evidence is always the raw lat/lng burned right beside the locality name.
   When a fix misses every box but stays inside the pilot district we show
   "Sialkot District"; the data team can extend the gazetteer as areas ship. */

interface LocalityBox {
  /** Display name, e.g. "Model Town" — rendered as "Model Town, Sialkot". */
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Ordered — smaller / more specific central-city boxes win over district
    towns, so first match is the match. */
const SIALKOT_LOCALITIES: LocalityBox[] = [
  { name: "Cantt Division", north: 32.545, south: 32.5, east: 74.575, west: 74.515 },
  { name: "Kashmiri Mohallah", north: 32.512, south: 32.49, east: 74.548, west: 74.522 },
  { name: "Model Town", north: 32.502, south: 32.48, east: 74.538, west: 74.505 },
  { name: "Haji Pura", north: 32.532, south: 32.505, east: 74.52, west: 74.488 },
  { name: "Rangpura", north: 32.484, south: 32.462, east: 74.548, west: 74.515 },
  { name: "Ugoki", north: 32.465, south: 32.43, east: 74.595, west: 74.545 },
  { name: "Head Marala", north: 32.645, south: 32.6, east: 74.585, west: 74.52 },
  { name: "Sambrial", north: 32.515, south: 32.45, east: 74.43, west: 74.33 },
  { name: "Daska", north: 32.73, south: 32.69, east: 74.38, west: 74.33 },
];

/** "Model Town, Sialkot" · "Sialkot District" · "Outside pilot area" */
export function lookupLocality(latitude: number, longitude: number): string {
  for (const box of SIALKOT_LOCALITIES) {
    if (
      latitude >= box.south &&
      latitude <= box.north &&
      longitude >= box.west &&
      longitude <= box.east
    ) {
      return `${box.name}, Sialkot`;
    }
  }
  const insidePilot =
    latitude >= PILOT_DISTRICT_BBOX.south &&
    latitude <= PILOT_DISTRICT_BBOX.north &&
    longitude >= PILOT_DISTRICT_BBOX.west &&
    longitude <= PILOT_DISTRICT_BBOX.east;
  return insidePilot ? "Sialkot District" : "Outside pilot area";
}
