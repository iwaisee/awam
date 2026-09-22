/* Pilot-district geofence for proof-of-presence checks. Reports whose locked
   GPS coordinates fall outside the active pilot's bounding box are still
   accepted, but flagged for the Submission Audit queue before dispatch. */

/** Sialkot District (Phase-1 pilot) bounding box, degrees. Deliberately a
    district-wide box rather than city limits so cantonment and peri-urban
    UCs don't raise false flags; slightly padded at the edges. */
export const PILOT_DISTRICT_BBOX = {
  name: "Sialkot",
  north: 32.75,
  south: 32.0,
  east: 74.85,
  west: 74.0,
} as const;

export function isOutsidePilotDistrict(
  latitude: number,
  longitude: number
): boolean {
  return (
    latitude < PILOT_DISTRICT_BBOX.south ||
    latitude > PILOT_DISTRICT_BBOX.north ||
    longitude < PILOT_DISTRICT_BBOX.west ||
    longitude > PILOT_DISTRICT_BBOX.east
  );
}
