"use client";

import { visibleCategories } from "@/types/civic";
import type {
  AreaItem,
  CategoryRule,
  CityItem,
} from "@/types/civic";
import type { ReportFormData } from "@/types/report";
import { isOutsidePilotDistrict } from "@/lib/pilotBoundary";

/* Resolves wizard selections against the coverage + taxonomy state and builds
   the POST body for /api/reports. Single source of truth for the cascade. */

export interface ResolvedLocation {
  city: CityItem;
  area: AreaItem;
}

export function resolveLocation(
  cities: CityItem[],
  formData: ReportFormData
): ResolvedLocation | null {
  const city =
    cities.find(
      (c) => c.name_en === formData.city && c.status === "active"
    ) ?? null;
  if (!city) return null;
  const area =
    city.areas.find(
      (a) => a.name_en === formData.area && a.status !== "paused"
    ) ?? null;
  if (!area) return null;
  return { city, area };
}

export function resolveVisibleCategories(
  categories: CategoryRule[],
  location: ResolvedLocation | null
): CategoryRule[] {
  if (!location) return [];
  return visibleCategories(categories, location.city, location.area);
}

/** Client → API payload; the route handler stamps id/token/SLA deadline. */
export function buildReportPayload(
  formData: ReportFormData,
  { city, area }: ResolvedLocation,
  rule: CategoryRule
) {
  return {
    city_id: city.id,
    city_name: city.name_en,
    area_id: area.id,
    area_name: area.name_en,
    jurisdiction: area.jurisdiction,
    category_id: rule.id,
    category_title: rule.name_en,
    assigned_agency: rule.default_agency,
    sla_hours: rule.sla_hours,
    urgency: formData.severity,
    // Citizen-written headline from step 3 — rendered verbatim in the dossier.
    title: formData.title.trim(),
    description: formData.description.trim(),
    // Quick-issue pills from Step 2 — capped at 3, matching the wizard limit.
    selected_tags: formData.selectedTags.slice(0, 3),
    citizen_name: formData.isAnonymous ? "Anonymous" : "Registered Citizen",
    citizen_phone: formData.isAnonymous ? "" : formData.phoneNumber.trim(),
    // Proof-of-presence telemetry from the live camera flow. Sent only when
    // the citizen completed a verified capture; the API rejects nothing for
    // its absence (rows filed before the flow existed carry no telemetry).
    ...(formData.geo && formData.capturedAt
      ? {
          coordinates: {
            lat: formData.geo.latitude,
            lng: formData.geo.longitude,
          },
          location_accuracy_meters: formData.geo.accuracyMeters,
          captured_at: formData.capturedAt,
          is_live_capture: true as const,
          device_user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
          outside_pilot_district: isOutsidePilotDistrict(
            formData.geo.latitude,
            formData.geo.longitude
          ),
        }
      : {}),
  };
}
