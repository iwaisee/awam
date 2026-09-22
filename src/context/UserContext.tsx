"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  initialsFromName,
  municipalZoneLabel,
  primaryLocalityAnchor,
  type CitizenProfile,
  type CitizenProfileSettings,
  type IncidentReport,
} from "@/types/civic";

/** Shared Neon document key — the citizen profile lives in app_state behind
    /api/state/citizen-profile, same contract as the admin profile. */
const PROFILE_STATE_KEY = "citizen-profile";

/** Neutral starting document for a fresh browser — no demo identity, no
    invented stats. The counters re-sync from the Neon ledger on mount and
    every identity field is filled in by the citizen via the settings
    dashboard (or the report wizard's contact step). */
const NEUTRAL_PROFILE: CitizenProfileSettings = {
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

/** Merge a stored (possibly stale/partial) document over the neutral defaults
    so schema drift in the shared document can never crash either surface. */
function normalizeProfile(raw: unknown): CitizenProfileSettings {
  const seed = NEUTRAL_PROFILE;
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
    NEUTRAL_PROFILE
  );
  const [hydrated, setHydrated] = useState(false);
  /** Bumped to re-run the ledger sync (e.g. after a profile reset). */
  const [ledgerKey, setLedgerKey] = useState(0);
  /* Neon is the only store: the initial GET adopts the shared document, and
     every local change flows back through the debounced push below. */
  const serverDocRef = useRef("");
  const serverSettledRef = useRef(false);

  // Adopt the shared citizen document from Neon on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/state/${PROFILE_STATE_KEY}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { value?: unknown; seeded?: boolean };
        if (cancelled) return;
        if (data.seeded && data.value) {
          serverDocRef.current = JSON.stringify(data.value);
          setProfile(normalizeProfile(data.value));
        }
        serverSettledRef.current = true;
      } catch {
        // Server unreachable — surfaces render the neutral profile.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced push of local edits into the shared document. Only armed after
  // a successful GET so a failed load can never overwrite the server doc
  // with the neutral default.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      if (!serverSettledRef.current) return;
      const json = JSON.stringify(profile);
      if (json === serverDocRef.current) return; // echo of a server apply
      serverDocRef.current = json;
      void fetch(`/api/state/${PROFILE_STATE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: profile }),
      }).catch(() => {
        // Offline — the next edit retries.
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [profile, hydrated]);

  // reports_filed / reports_resolved / upvotes_received are ledger counters,
  // not preferences — sync them from the Neon report ledger (reports
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
    setProfile((prev) => ({ ...prev, ...patch }));
  };

  const resetProfile = () => {
    setProfile(NEUTRAL_PROFILE);
    setLedgerKey((k) => k + 1); // re-sync counters over the reset document
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
