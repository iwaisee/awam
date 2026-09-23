import type { SeverityLevel } from "@/config/severity";
import { normalizeUrgency } from "@/config/severity";

/* Shared civic schemas + the cascading rule engine consumed by the citizen
   reporting wizard, the admin taxonomy panels, and the /api/reports backend. */

/* --------------------------------- Enums ---------------------------------- */

export type JurisdictionType =
  | "Municipal Corporation"
  | "Cantonment Board"
  | "Development Authority"
  | "Private Housing";

/** Category urgency uses the canonical severity tiers (config/severity). */
export type UrgencyLevel = SeverityLevel;

/** Coerce a legacy/stored urgency value ("high" → "urgent", junk → "routine"). */
export function toUrgencyLevel(raw: unknown): UrgencyLevel {
  return normalizeUrgency(raw);
}

/** Dispatch desks operating in the Phase-1 pilot district (Sialkot). */
export type AgencyName =
  "MCS" | "SWMC" | "GEPCO" | "CTP Sialkot" | "Cantt Board" | "Rescue 1122";

export const JURISDICTION_TYPES: JurisdictionType[] = [
  "Municipal Corporation",
  "Cantonment Board",
  "Development Authority",
  "Private Housing",
];

export const AGENCY_OPTIONS: AgencyName[] = [
  "MCS",
  "SWMC",
  "GEPCO",
  "CTP Sialkot",
  "Cantt Board",
  "Rescue 1122",
];

/** One-line mandate shown under each agency chip in the wizard. */
export const AGENCY_MANDATE: Record<AgencyName, string> = {
  MCS: "Municipal Corporation Sialkot — water supply, sewerage, roads & building control",
  SWMC: "Sialkot Waste Management Company — collection, sweeping & landfill",
  GEPCO: "GEPCO — poles, wires, transformers, streetlight feeders",
  "CTP Sialkot":
    "City Traffic Police Sialkot — signals, intersections & encroachment",
  "Cantt Board":
    "Sialkot Cantonment Board — municipal services in cantonment areas",
  "Rescue 1122": "Rescue 1122 — health hazards, fogging & emergency response",
};

/* -------------------------------- Entities -------------------------------- */

export const DEFAULT_JURISDICTION: JurisdictionType = "Municipal Corporation";
/** Silent fallback desk for areas added without municipal metadata. */
export const GENERAL_MUNICIPAL_SERVICES = "General Municipal Services";

export interface AreaItem {
  id: string;
  name_en: string;
  name_ur?: string;
  /** Optional parent cluster under the city, e.g. "Cantonment", "City", "Villages". */
  town?: string;
  /** Legacy bureaucracy field — optional; new areas default to "" (no UC requirement). */
  uc_number?: string;
  /** Defaults to "Municipal Corporation" when an area is created without one. */
  jurisdiction?: JurisdictionType;
  /** Dispatch desk label — defaults to "General Municipal Services". */
  sub_division?: string;
  active_tickets?: number;
  /** Paused UCs temporarily stop accepting citizen reports (floods, works). */
  status?: "active" | "paused";
  /** Office routing — assigned officer and public contact for this locality.
      Optional; the governance deck falls back to the parent zone's routing. */
  supervisor?: string;
  contact?: string;
  office?: string;
}

/** Payload accepted when creating an area — only a name is required. */
export type AreaInput = Pick<AreaItem, "name_en"> &
  Partial<Omit<AreaItem, "name_en">>;

/** Fill any missing municipal metadata silently behind the scenes. */
export function normalizeAreaInput(area: AreaInput): Omit<AreaItem, "id"> {
  return {
    name_en: area.name_en,
    name_ur: area.name_ur?.trim() || undefined,
    town: area.town?.trim() || undefined,
    uc_number: area.uc_number?.trim() || "",
    jurisdiction: area.jurisdiction ?? DEFAULT_JURISDICTION,
    sub_division: area.sub_division?.trim() || GENERAL_MUNICIPAL_SERVICES,
    active_tickets: area.active_tickets ?? 0,
    status: area.status ?? "active",
    supervisor: area.supervisor?.trim() || undefined,
    contact: area.contact?.trim() || undefined,
    office: area.office?.trim() || undefined,
  };
}

/** "coming_soon" marks Phase-2 districts announced on the landing launcher but
 *  not yet open for citizen reporting (they fail every status === "active" check). */
export type CityStatus = "active" | "coming_soon" | "disabled";

/** Top-level administrative region (e.g. "Punjab"). Districts reference it by
    name via CityItem.province; standalone entries may exist before any
    district is added under them. */
export interface ProvinceItem {
  name_en: string;
  name_ur?: string;
  /** Province Customizer Studio configuration — optional so provinces created
      before the studio (or via the district form) stay valid. */
  kind?: "province" | "territory" | "region";
  /** Provincial capital / administrative HQ seat. */
  capital?: string;
  /** Registry identifier, e.g. "PROV-PUN" (auto-generated, manual override). */
  code?: string;
  /** ISO-style slug, e.g. "PK-PB". */
  slug?: string;
  boundary?: ProvinceBoundary;
  area_km2?: number;
  population?: number;
  /** Sub-tier hierarchy architecture with per-region nomenclature. */
  tiers?: TerritoryTierConfig[];
  /** Default public-agency mappings for automated routing. */
  agencies?: ProvinceAgencyMap;
  sla_p1_hours?: number;
  sla_p2_hours?: number;
  verification?: "strict" | "standard";
  lifecycle?: ProvinceLifecycle;
  /** Unpublished drafts render with a Draft badge until activated. */
  status?: "draft" | "active";
  /** Default administrative model — which governing desk structure the
      region reports through (set in the province creator modal). */
  admin_model?: AdminModel;
}

/** Default administrative model options for a province / region. */
export type AdminModel =
  | "provincial_lg_dept"
  | "capital_territory_authority"
  | "cantonment_joint_desk";

export const ADMIN_MODEL_OPTIONS: {
  value: AdminModel;
  label: string;
  description: string;
}[] = [
  {
    value: "provincial_lg_dept",
    label: "Provincial LG Dept",
    description: "Local Government & Community Development department",
  },
  {
    value: "capital_territory_authority",
    label: "Capital Territory Authority",
    description: "Metropolitan corporation under the federal capital",
  },
  {
    value: "cantonment_joint_desk",
    label: "Cantonment Joint Desk",
    description: "Civil–military joint municipal board",
  },
];

/** Pilot rollout stage. "planned" marks announced regions whose municipal
    desks are not yet under construction (Phase 2). */
export type ProvinceLifecycle =
  | "phase1_pilot"
  | "full_rollout"
  | "infrastructure"
  | "planned";

/** Shared card metadata for every lifecycle value — one source for the
    province cards, KPI filters and the creator modal preview. */
export const LIFECYCLE_META: Record<
  ProvinceLifecycle,
  { label: string; setupPlanned: boolean }
> = {
  phase1_pilot: { label: "Active Pilot", setupPlanned: false },
  full_rollout: { label: "Fully Operational", setupPlanned: false },
  infrastructure: { label: "Infrastructure Setup", setupPlanned: true },
  planned: { label: "Planned Phase 2", setupPlanned: true },
};

/** Geospatial boundary: quick lat/lon bounding box or an uploaded GeoJSON. */
export interface ProvinceBoundary {
  mode: "bbox" | "geojson";
  bbox?: { north: number; south: number; east: number; west: number };
  /** Raw GeoJSON text (Polygon / MultiPolygon / Feature[Collection]). */
  geojson?: string;
}

/** One sub-tier of the administrative hierarchy chain. */
export interface TerritoryTierConfig {
  level: string;
  /** Local nomenclature, e.g. "Tehsil" vs "Township" vs "Sector". */
  label: string;
  enabled: boolean;
  /** Mandatory tiers cannot be toggled off. */
  mandatory?: boolean;
}

/** Default public-sector bodies bound to a regional jurisdiction. */
export interface ProvinceAgencyMap {
  /** Power distribution utility (DISCO), e.g. GEPCO. */
  disco?: string;
  waste?: string;
  water?: string;
  emergency?: string;
}

export interface CityItem {
  id: string;
  name_en: string;
  name_ur: string;
  province: string;
  status: CityStatus;
  active_reports: number;
  areas: AreaItem[];
  /** Parent operational zones (e.g. "Cantonment", "City", "Villages").
      Identity is the zone name — child areas reference it via AreaItem.town.
      Cities stored before zones existed derive them from area towns. */
  zones?: ZoneItem[];
  /** Dispatch desks operating in this district, e.g. ["MCS", "GEPCO"]. */
  agencies?: string[];
  /** Launcher badge subtitle, e.g. "🟢 Active Pilot" / "Phase 2 Soon". */
  subtext?: string;
  /** District secretariat routing shown in the territory governance deck. */
  supervisor?: string;
  contact?: string;
  office?: string;
}

/** Parent zone cluster grouping child localities (AreaItem.town). */
export interface ZoneItem {
  name_en: string;
  name_ur?: string;
  /** Default jurisdiction inherited by new localities added to this zone. */
  jurisdiction: JurisdictionType;
  /** Bound governing desk (e.g. "Municipal Corporation Sialkot (MCS)").
      Derived from jurisdiction when unset; edited in the governance deck. */
  authority?: string;
  /** Zone-level office routing — inherited by localities without overrides. */
  supervisor?: string;
  contact?: string;
  office?: string;
}

export interface CategoryRule {
  id: string;
  name_en: string;
  name_ur: string;
  description: string;
  /** Lucide icon identifier — resolved via CATEGORY_ICONS (lib/categoryIcons). */
  icon_name: string;
  default_agency: AgencyName;
  sla_hours: number;
  urgency: UrgencyLevel;
  status: "active" | "disabled";
  /** ["all"] or explicit city IDs, e.g. ["sialkot", "lahore"]. */
  supported_cities: string[];
  /** ["all"] or explicit JurisdictionType values. */
  allowed_jurisdictions: ("all" | JurisdictionType)[];
  /** Sialkot-specific quick-issue tags offered as one-tap pills in Step 2. */
  tags: string[];
}

export type IncidentStatus =
  "triage" | "dispatched" | "in_progress" | "resolved" | "disputed";

/** Live proof-of-presence telemetry attached to a report by the citizen
    wizard's on-site camera flow. Every field is optional so rows filed
    before the flow (or by older clients) stay valid. */
export interface GeoVerification {
  /** Horizontal accuracy of the GPS fix, ± meters. */
  accuracy_meters?: number;
  /** ISO timestamp of the shutter press. */
  captured_at?: string;
  /** True — the photo came from the enforced live-capture flow, never a
      gallery upload. */
  is_live_capture?: boolean;
  /** Request user agent, stamped server-side from the request header. */
  device_user_agent?: string;
  /** True when the locked coordinates fall outside the pilot district
      (Submission Audit queue flag — informational, not a rejection). */
  outside_pilot_district?: boolean;
}

export interface IncidentReport {
  /** Regional ticket ID, e.g. #SKT-1042. */
  id: string;
  tracking_token: string;
  city_id: string;
  city_name: string;
  area_id: string;
  area_name: string;
  jurisdiction: JurisdictionType;
  category_id: string;
  category_title: string;
  assigned_agency: string;
  sla_deadline: string;
  urgency: UrgencyLevel;
  /** Citizen-written headline from wizard step 3 (may be absent on old rows). */
  title?: string;
  description: string;
  /** Quick-issue tags the citizen tapped in Step 2 (max 3, strictly typed). */
  selected_tags?: string[];
  photo_url?: string;
  coordinates?: { lat: number; lng: number };
  /** Proof-of-presence telemetry from the live camera flow (may be absent on
      rows filed before the flow existed). Stored as JSONB; the device user
      agent is stamped server-side from the request header, not the client. */
  geo_verification?: GeoVerification;
  citizen_name: string;
  citizen_phone: string;
  status: IncidentStatus;
  upvotes: number;
  created_at: string;
  /** Field-dispatch telemetry — set when a squad takes the ticket out of
      triage, cleared when the ticket is reassigned back to the queue. */
  dispatched_at?: string;
  /** Resolution telemetry — stamped by the ledger when status becomes
      "resolved", cleared when the ticket is re-opened. */
  resolved_at?: string;
  assigned_unit?: string;

  /* Field-squad resolution proof — written by the squad portal's resolve
     flow (PATCH /api/reports). Cleared when the ticket is re-opened. */
  /** "After" photo proof (downscaled data URL) from the resolving squad. */
  after_photo_url?: string;
  /** Work notes summarising the fix, filed by the squad lead. */
  resolution_notes?: string;
  /** Materials / inventory consumed, e.g. "1x 200kVA fuse, 12m cable". */
}

/* ------------------------------ Rule engine ------------------------------- */

/**
 * The cascade: a category is visible to a citizen only when it is globally
 * active, scoped to the selected city, and compatible with the selected
 * area's jurisdiction. This single function powers StepCategory, the admin
 * preview, and any future consumer — no per-view copies.
 */
export function visibleCategories<T extends CategoryRule>(
  categories: T[],
  city: Pick<CityItem, "id"> | null,
  area: Pick<AreaItem, "jurisdiction"> | null,
): T[] {
  // Areas created without explicit metadata fall back to the provincial default.
  const jurisdiction = area?.jurisdiction ?? DEFAULT_JURISDICTION;
  return categories.filter((cat) => {
    // 1. Must be globally active.
    if (cat.status !== "active") return false;
    // 2. Must be supported in the selected city.
    const supportsCity =
      cat.supported_cities.includes("all") ||
      (city !== null && cat.supported_cities.includes(city.id));
    if (!supportsCity) return false;
    // 3. Must be compatible with the selected area's jurisdiction.
    const supportsJurisdiction =
      cat.allowed_jurisdictions.includes("all") ||
      cat.allowed_jurisdictions.includes(jurisdiction);
    return supportsJurisdiction;
  });
}

/** Compact badge label, e.g. "Model Town • MCS". Legacy rows persisted before
    the pilot retag still carry Lahore-era jurisdiction strings — map them so
    old tickets keep rendering instead of printing a stale label. */
export function shortJurisdiction(j: JurisdictionType | (string & {})): string {
  switch (j) {
    case "Municipal Corporation":
    case "MCL / Provincial":
      return "MCS";
    case "Cantonment Board":
      return "Cantonment Board";
    case "Development Authority":
    case "LDA Scheme":
      return "Dev. Authority";
    case "Private Housing":
      return "Private Housing";
    default:
      return j;
  }
}

/** Best-effort jurisdiction for legacy/CSV rows that only carry a sub-division.
    Development-authority wings map to Development Authority; utility desks
    (GEPCO, SWMC…) are municipal provincial services and fall through to the
    Municipal Corporation. */
export function deriveJurisdiction(subDivision?: string): JurisdictionType {
  const sd = (subDivision ?? "").trim();
  if (/cantonment|\bMES\b/i.test(sd)) return "Cantonment Board";
  if (/private/i.test(sd)) return "Private Housing";
  if (/\b(LDA|TEPA|FDA|RDA|GDA|SDA)\b|C&W/i.test(sd))
    return "Development Authority";
  return "Municipal Corporation";
}

/* ------------------------------- Ticket IDs ------------------------------- */

/** Regional prefixes for the generated ticket IDs (#SKT-4912). */
const CITY_CODES: Record<string, string> = {
  sialkot: "SKT",
  lahore: "LHR",
  islamabad: "ISB",
  // Legacy ids persisted by pre-pilot submissions and stored coverage data.
  "city-sialkot": "SKT",
  "city-lahore": "LHR",
  "city-rawalpindi": "RWP",
  "city-faisalabad": "FSD",
  "city-multan": "MUL",
  "city-gujranwala": "GJW",
};

export function cityCode(cityId: string, cityName: string): string {
  const mapped = CITY_CODES[cityId];
  if (mapped) return mapped;
  const alpha = cityName.replace(/[^a-zA-Z]/g, "");
  return alpha ? alpha.slice(0, 3).toUpperCase() : "PBX";
}

/* ------------------------------ User identity ------------------------------ */

/**
 * Platform roles. Citizens (the public reporting audience) can never hold an
 * operational role — dispatch suites and command telemetry render only for
 * municipal personnel, and the citizen profile type hard-pins `role: "citizen"`
 * so a reporting session is type-incompatible with government routing.
 */
export type UserRole = "citizen" | "field_supervisor" | "admin";

/** Roles allowed to see dispatch suites and the command radar. */
export type OperationalRole = Extract<UserRole, "admin" | "field_supervisor">;

/** The signed-in public user: strictly a reporting citizen. */
export interface CitizenProfile {
  id: string;
  name: string;
  /** Two-letter monogram for the header avatar circle ("Muhammad Usman" → "MU"). */
  avatar_initials: string;
  /** Primary neighborhood anchor — shown instead of raw contact details. */
  home_locality: string;
  district: string;
  /** Municipal desk whose jurisdiction covers the home locality. */
  jurisdiction: string;
  civic_score: number;
  level_title: string;
  level_tier: number;
  reports_filed: number;
  reports_resolved: number;
  role: "citizen";
}

export function isOperationalRole(role: UserRole): role is OperationalRole {
  return role === "admin" || role === "field_supervisor";
}

/**
 * The full citizen document: the settings dashboard's editable record and the
 * single source of truth the header menu projects from (see CitizenProfile).
 * Surfaces compose tier labels as "Level {level_tier} {level_title}", so
 * level_title stores the base title ("Mohallah Guard"), never "Level 2 …".
 */
export interface CitizenProfileSettings {
  id: string;
  name: string;
  name_ur?: string;
  phone: string;
  is_phone_verified: boolean;
  email?: string;
  /** Portrait data URL (canvas-downscaled) or undefined for the initials fallback. */
  avatar_url?: string;

  /* Geographic & municipal anchor */
  district: string;
  home_locality_id: string;
  home_locality_name: string;
  /** Full governing-desk label, e.g. "Municipal Corporation Sialkot (MCS)". */
  jurisdiction: string;
  nearby_landmark?: string;

  /* Civic reputation & gamification */
  civic_score: number;
  level_tier: number;
  level_title: string;
  /** Title of the next tier, e.g. "Mohallah Warden". */
  next_tier_title: string;
  /** Points required to reach the next tier, e.g. 250. */
  next_tier_target: number;
  reports_filed: number;
  reports_resolved: number;
  impact_percentile: string;
  upvotes_received: number;

  /* Service preferences (alerts / privacy tabs) */
  radius_meters: number;
  whatsapp_updates: boolean;
  /** Alerts with photo proofs when a citizen's work orders close. */
  resolution_proofs: boolean;
  weekly_digest: boolean;
  anonymous_default: boolean;
  /** Crew contact flows through the platform proxy instead of the raw number. */
  hide_phone_from_crew: boolean;
  leaderboard_visible: boolean;
  cnic: string;
}

/** "Muhammad Usman" → "MU" — the monogram for avatar fallbacks. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "CU"
  );
}

/** Short header anchor: "Paris Road & Commissioner Rd" → "Paris Road". */
export function primaryLocalityAnchor(homeLocalityName: string): string {
  const primary = homeLocalityName.split(" & ")[0].trim();
  return primary || homeLocalityName;
}

/** Header zone label: "Municipal Corporation Sialkot (MCS)" → "MCS Municipal Zone". */
export function municipalZoneLabel(jurisdiction: string): string {
  const acronym = jurisdiction.match(/\(([^)]+)\)\s*$/);
  return acronym ? `${acronym[1]} Municipal Zone` : jurisdiction;
}

/** Full governing-desk label for a jurisdiction covering a pilot district.
    The "(MCS)" desk code is the Phase 1 Sialkot pilot's municipal desk. */
export function fullJurisdictionLabel(
  jurisdiction: JurisdictionType,
  district: string,
): string {
  switch (jurisdiction) {
    case "Municipal Corporation":
      return `Municipal Corporation ${district} (MCS)`;
    case "Cantonment Board":
      return `${district} Cantonment Board`;
    case "Development Authority":
      return `${district} Development Authority`;
    case "Private Housing":
      return "Private Housing Scheme Management";
  }
}
