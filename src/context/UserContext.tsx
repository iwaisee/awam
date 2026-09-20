"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_CITIZEN_SETTINGS } from "@/data/mockData";
import {
  initialsFromName,
  municipalZoneLabel,
  primaryLocalityAnchor,
  type CitizenProfile,
  type CitizenProfileSettings,
  type IncidentReport,
} from "@/types/civic";

const STORAGE_KEY = "sada_citizen_profile";
/** Pre-consolidation settings key — its saved preferences fold into the new
    document once, then the legacy key is retired. */
const LEGACY_SETTINGS_KEY = "sada_citizen_settings";

type LegacySettings = Partial<{
  fullName: string;
  phone: string;
  email: string;
  cnic: string;
  avatarUrl: string | null;
  radiusMeters: number;
  whatsappUpdates: boolean;
  hazardAlerts: boolean;
  weeklyDigest: boolean;
  anonymousDefault: boolean;
  leaderboardVisible: boolean;
}>;

/** Merge a stored (possibly stale/partial) document over the demo seed so
    schema drift can never crash either consuming surface. */
function normalizeProfile(
  raw: unknown,
  legacy?: LegacySettings | null
): CitizenProfileSettings {
  const seed = DEMO_CITIZEN_SETTINGS;
  if (!raw || typeof raw !== "object") {
    return legacy ? { ...seed, ...pickLegacy(legacy) } : seed;
  }
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
    avatar_url:
      typeof stored.avatar_url === "string" &&
      stored.avatar_url.startsWith("data:image/")
        ? stored.avatar_url
        : undefined,
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
    // Legacy stored profiles carry the pre-rename tier titles — migrate them
    // to the city-agnostic names instead of serving stale jargon forever.
    level_title:
      str(stored.level_title, seed.level_title) === "Mohallah Guard"
        ? seed.level_title
        : str(stored.level_title, seed.level_title),
    next_tier_title:
      str(stored.next_tier_title, seed.next_tier_title) === "Mohallah Warden"
        ? seed.next_tier_title
        : str(stored.next_tier_title, seed.next_tier_title),
    next_tier_target: num(stored.next_tier_target, seed.next_tier_target),
    reports_filed: num(stored.reports_filed, seed.reports_filed),
    reports_resolved: num(stored.reports_resolved, seed.reports_resolved),
    impact_percentile: str(stored.impact_percentile, seed.impact_percentile),
    upvotes_received: num(stored.upvotes_received, seed.upvotes_received),
    radius_meters: num(stored.radius_meters, seed.radius_meters),
    whatsapp_updates: bool(stored.whatsapp_updates, seed.whatsapp_updates),
    // Pre-rename documents carried this toggle as `hazard_alerts`.
    resolution_proofs: bool(
      stored.resolution_proofs ??
        (stored as Partial<CitizenProfileSettings> & { hazard_alerts?: boolean })
          .hazard_alerts,
      seed.resolution_proofs
    ),
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
    ...(legacy ? pickLegacy(legacy) : null),
  };
}

/** Translate the pre-consolidation settings document onto the new fields. */
function pickLegacy(legacy: LegacySettings): Partial<CitizenProfileSettings> {
  const patch: Partial<CitizenProfileSettings> = {};
  if (typeof legacy.fullName === "string" && legacy.fullName.trim())
    patch.name = legacy.fullName;
  if (typeof legacy.phone === "string" && legacy.phone.trim())
    patch.phone = legacy.phone;
  if (typeof legacy.email === "string") patch.email = legacy.email;
  if (typeof legacy.cnic === "string") patch.cnic = legacy.cnic;
  if (
    typeof legacy.avatarUrl === "string" &&
    legacy.avatarUrl.startsWith("data:image/")
  )
    patch.avatar_url = legacy.avatarUrl;
  if (typeof legacy.radiusMeters === "number")
    patch.radius_meters = legacy.radiusMeters;
  if (typeof legacy.whatsappUpdates === "boolean")
    patch.whatsapp_updates = legacy.whatsappUpdates;
  if (typeof legacy.hazardAlerts === "boolean")
    patch.resolution_proofs = legacy.hazardAlerts;
  if (typeof legacy.weeklyDigest === "boolean")
    patch.weekly_digest = legacy.weeklyDigest;
  if (typeof legacy.anonymousDefault === "boolean")
    patch.anonymous_default = legacy.anonymousDefault;
  if (typeof legacy.leaderboardVisible === "boolean")
    patch.leaderboard_visible = legacy.leaderboardVisible;
  return patch;
}

function persistProfile(profile: CitizenProfileSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // Storage full (oversized image) — in-memory state still updates.
  }
}

interface UserContextValue {
  /** The stored citizen document — settings dashboard's source of truth. */
  profile: CitizenProfileSettings;
  /** Header-facing projection derived from the stored document. */
  currentUser: CitizenProfile;
  updateProfile: (patch: Partial<CitizenProfileSettings>) => void;
  resetProfile: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Public citizen session. The stored document is typed as
 * CitizenProfileSettings and the header projection hard-pins `role: "citizen"`,
 * so operational surfaces (dispatch suites, command radar) are type-incompatible
 * with anything rendered from this context — they live in the admin console
 * only, gated on an operational role.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CitizenProfileSettings>(
    DEMO_CITIZEN_SETTINGS
  );
  const [hydrated, setHydrated] = useState(false);
  /** Bumped to re-run the ledger sync (e.g. after a profile reset). */
  const [ledgerKey, setLedgerKey] = useState(0);

  // Hydrate the saved document after mount (server + first client render share
  // the seed, so hydration is stable). Deferred in a microtask to satisfy the
  // set-state-in-effect rule, matching the CoverageContext pattern.
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      let legacy: LegacySettings | null = null;
      try {
        const legacyRaw = window.localStorage.getItem(LEGACY_SETTINGS_KEY);
        if (legacyRaw) legacy = JSON.parse(legacyRaw) as LegacySettings;
      } catch {
        legacy = null;
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        setProfile(normalizeProfile(raw ? JSON.parse(raw) : null, legacy));
      } catch {
        setProfile(normalizeProfile(null, legacy));
      }
      setHydrated(true);
    })();
  }, []);

  // reports_filed / reports_resolved / upvotes_received are ledger counters,
  // not preferences — sync them from the SQLite report ledger (reports
  // attributed by the citizen's phone) so badges and stat strips show the
  // real ticket counts instead of the demo seed.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(new Error(`HTTP ${res.status}`))
      )
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const mine = (data as IncidentReport[]).filter(
          (r) => r.citizen_phone === profile.phone
        );
        const resolved = mine.filter((r) => r.status === "resolved").length;
        const upvotes = mine.reduce((sum, r) => sum + r.upvotes, 0);
        setProfile((prev) =>
          prev.reports_filed === mine.length &&
          prev.reports_resolved === resolved &&
          prev.upvotes_received === upvotes
            ? prev
            : {
                ...prev,
                reports_filed: mine.length,
                reports_resolved: resolved,
                upvotes_received: upvotes,
              }
        );
      })
      .catch(() => {
        // Ledger unavailable — keep the counters the document carries.
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, profile.phone, ledgerKey]);

  const updateProfile = (patch: Partial<CitizenProfileSettings>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      persistProfile(next);
      return next;
    });
  };

  const resetProfile = () => {
    setProfile(DEMO_CITIZEN_SETTINGS);
    persistProfile(DEMO_CITIZEN_SETTINGS);
    setLedgerKey((k) => k + 1); // re-sync counters over the restored seed
  };

  // Header identity card projection — derived, never stored separately, so a
  // settings save reflects in the header within the same tick.
  const currentUser = useMemo<CitizenProfile>(
    () => ({
      id: profile.id,
      name: profile.name,
      avatar_initials: initialsFromName(profile.name),
      home_locality: primaryLocalityAnchor(profile.home_locality_name),
      district: profile.district,
      jurisdiction: municipalZoneLabel(profile.jurisdiction),
      civic_score: profile.civic_score,
      level_title: profile.level_title,
      level_tier: profile.level_tier,
      reports_filed: profile.reports_filed,
      reports_resolved: profile.reports_resolved,
      role: "citizen",
    }),
    [profile]
  );

  const value = useMemo<UserContextValue>(
    () => ({ profile, currentUser, updateProfile, resetProfile }),
    [profile, currentUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/** The signed-in public user (header projection). Must be inside <UserProvider>. */
export function useCitizen(): CitizenProfile {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCitizen must be used within a UserProvider");
  }
  return ctx.currentUser;
}

/** The full citizen document + mutators (settings dashboard). */
export function useCitizenProfile(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCitizenProfile must be used within a UserProvider");
  }
  return ctx;
}
