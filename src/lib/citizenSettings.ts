import type { CitizenProfileSettings } from "@/types/civic";

/* The citizen settings document — the shape the settings dashboard, the header
   identity card and the report wizard all read. Used on both sides of the
   wire: the server normalises the stored JSONB through here before handing it
   to the client, and the client keeps its debounced edits in the same shape. */

/** Neutral starting document — no demo identity and no invented stats. Every
    identity field is filled in by the citizen (signup, the settings dashboard,
    or the wizard's contact step); the counters re-sync from the report ledger. */
export const NEUTRAL_CITIZEN_SETTINGS: CitizenProfileSettings = {
  id: "citizen-local",
  name: "",
  phone: "",
  is_phone_verified: false,

  district: "",
  home_locality_id: "",
  home_locality_name: "",
  jurisdiction: "",

  civic_score: 0,
  level_tier: 1,
  level_title: "",
  next_tier_title: "",
  next_tier_target: 250,
  reports_filed: 0,
  reports_resolved: 0,
  impact_percentile: "",
  upvotes_received: 0,

  radius_meters: 1500,
  whatsapp_updates: true,
  resolution_proofs: true,
  weekly_digest: false,
  anonymous_default: false,
  hide_phone_from_crew: true,
  leaderboard_visible: true,
  cnic: "",
};

/** Only an inline portrait or an https CDN URL may reach an <img> — a stray
    word, an http:// remote or a javascript: string is treated as no photo. */
export function renderableAvatarUrl(value: unknown): string | undefined {
  return typeof value === "string" &&
    (value.startsWith("data:image/") || value.startsWith("https://"))
    ? value
    : undefined;
}

/** Merge a stored (possibly older or partial) document over the defaults, so
    schema drift can never crash a surface or drop a preference silently. */
export function normalizeCitizenSettings(
  raw: unknown,
): CitizenProfileSettings {
  const seed = NEUTRAL_CITIZEN_SETTINGS;
  if (!raw || typeof raw !== "object") return seed;
  const stored = raw as Partial<CitizenProfileSettings>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" ? value : fallback;
  const optStr = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value : undefined;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    id: str(stored.id, seed.id),
    name: str(stored.name, seed.name),
    name_ur: optStr(stored.name_ur),
    phone: str(stored.phone, seed.phone),
    is_phone_verified: bool(stored.is_phone_verified, seed.is_phone_verified),
    email: optStr(stored.email),
    /* Either the Cloudinary CDN URL off the column or the picker's inline
       preview — both go through the same render guard. */
    avatar_url: renderableAvatarUrl(stored.avatar_url),
    district: str(stored.district, seed.district),
    home_locality_id: str(stored.home_locality_id, seed.home_locality_id),
    home_locality_name: str(
      stored.home_locality_name,
      seed.home_locality_name
    ),
    jurisdiction: str(stored.jurisdiction, seed.jurisdiction),
    nearby_landmark: optStr(stored.nearby_landmark),
    civic_score: num(stored.civic_score, seed.civic_score),
    level_tier: num(stored.level_tier, seed.level_tier),
    level_title: str(stored.level_title, seed.level_title),
    next_tier_title: str(stored.next_tier_title, seed.next_tier_title),
    next_tier_target: num(stored.next_tier_target, seed.next_tier_target),
    reports_filed: num(stored.reports_filed, seed.reports_filed),
    reports_resolved: num(stored.reports_resolved, seed.reports_resolved),
    impact_percentile: str(stored.impact_percentile, seed.impact_percentile),
    upvotes_received: num(stored.upvotes_received, seed.upvotes_received),
    radius_meters: num(stored.radius_meters, seed.radius_meters),
    whatsapp_updates: bool(stored.whatsapp_updates, seed.whatsapp_updates),
    resolution_proofs: bool(stored.resolution_proofs, seed.resolution_proofs),
    weekly_digest: bool(stored.weekly_digest, seed.weekly_digest),
    anonymous_default: bool(stored.anonymous_default, seed.anonymous_default),
    hide_phone_from_crew: bool(
      stored.hide_phone_from_crew,
      seed.hide_phone_from_crew
    ),
    leaderboard_visible: bool(
      stored.leaderboard_visible,
      seed.leaderboard_visible
    ),
    cnic: str(stored.cnic, seed.cnic),
  };
}
