"use client";

import {
  createContext,
  useCallback,
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
import {
  NEUTRAL_CITIZEN_SETTINGS,
  normalizeCitizenSettings,
} from "@/lib/citizenSettings";

/* Public citizen session, backed by a real account.

   The server owns identity: `/api/auth/me` answers with the account's own
   settings document, and every write goes back to that same endpoint with the
   session cookie — so this context can only ever show and edit the profile of
   whoever is actually signed in. (It replaced a shared Neon document that every
   browser read and wrote regardless of who was using it.) */

interface AuthPayload {
  success?: boolean;
  authenticated?: boolean;
  settings?: CitizenProfileSettings;
}

interface UserContextValue {
  /** The signed-in citizen's stored document — the settings dashboard's source
      of truth. Neutral while signed out or still loading. */
  profile: CitizenProfileSettings;
  /** Header-facing projection derived from the stored document. */
  currentUser: CitizenProfile;
  /** The session cookie was verified by the server. */
  authenticated: boolean;
  /** The first `/api/auth/me` roundtrip has settled. */
  hydrated: boolean;
  updateProfile: (patch: Partial<CitizenProfileSettings>) => void;
  /** Restore the neutral preference document for this account. */
  resetProfile: () => void;
  /** Revoke the session server-side and clear the local view. */
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * The signed-in public user. `currentUser` is typed as CitizenProfile
 * (role: "citizen"), so operational surfaces (dispatch suites, command radar)
 * stay type-incompatible with anything rendered from here — they live in the
 * admin console only, gated on an operational role.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CitizenProfileSettings>(
    NEUTRAL_CITIZEN_SETTINGS
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** Bumped to re-run the ledger sync (e.g. after a profile reset). */
  const [ledgerKey, setLedgerKey] = useState(0);

  /* Neon is the only store. A local edit is applied optimistically and pushed
     to the account behind the session cookie; `serverDocRef` holds the last
     document the server acknowledged, so an echo of our own write never re-pushs
     and a failed load can never overwrite the account with neutral defaults. */
  const serverDocRef = useRef("");
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as AuthPayload;
        if (cancelled) return;
        const signedIn = Boolean(data.success && data.authenticated);
        setAuthenticated(signedIn);
        if (signedIn && data.settings) {
          const normalized = normalizeCitizenSettings(data.settings);
          serverDocRef.current = JSON.stringify(normalized);
          setProfile(normalized);
        }
        settledRef.current = signedIn;
      } catch {
        // Server unreachable — surfaces render signed-out.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced push of local edits onto the account.
  useEffect(() => {
    if (!hydrated || !authenticated || !settledRef.current) return;
    const timer = window.setTimeout(() => {
      const json = JSON.stringify(profile);
      if (json === serverDocRef.current) return; // echo of a server apply
      serverDocRef.current = json;
      void fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
      })
        .then((res) => {
          // The session lapsed mid-edit: stop writing and show the signed-out
          // view rather than silently accumulating changes that cannot save.
          if (res.status === 401) {
            serverDocRef.current = "";
            settledRef.current = false;
            setAuthenticated(false);
            setProfile(NEUTRAL_CITIZEN_SETTINGS);
          }
        })
        .catch(() => {
          // Offline — the next edit retries.
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [profile, hydrated, authenticated]);

  /* reports_filed / reports_resolved / upvotes_received are ledger counters,
     not preferences, so they are re-derived per session from the citizen's own
     slice of the ledger (?mine=1 is attributed by account id). */
  useEffect(() => {
    if (!hydrated || !authenticated) return;
    let cancelled = false;
    fetch("/api/reports?mine=1", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) {
          setAuthenticated(false);
          return null;
        }
        return res.ok
          ? res.json()
          : Promise.reject(new Error(`HTTP ${res.status}`));
      })
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const mine = data as IncidentReport[];
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
  }, [hydrated, authenticated, ledgerKey]);

  const updateProfile = useCallback(
    (patch: Partial<CitizenProfileSettings>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const resetProfile = useCallback(() => {
    setProfile((prev) => ({
      ...NEUTRAL_CITIZEN_SETTINGS,
      // Identity and the ledger counters are server-owned; a preference reset
      // must not blank the citizen's own name or contact details.
      name: prev.name,
      phone: prev.phone,
      email: prev.email,
      district: prev.district,
      id: prev.id,
      avatar_url: prev.avatar_url,
      reports_filed: prev.reports_filed,
      reports_resolved: prev.reports_resolved,
      upvotes_received: prev.upvotes_received,
    }));
    setLedgerKey((k) => k + 1);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Even if the revoke call is lost, the local view must clear: a session
      // the user cannot see is worse than one the server has to expire.
    }
    serverDocRef.current = "";
    settledRef.current = false;
    setAuthenticated(false);
    setProfile(NEUTRAL_CITIZEN_SETTINGS);
    setLedgerKey((k) => k + 1);
  }, []);

  // Header identity card projection — derived, never stored separately, so a
  // settings save reflects in the header within the same tick.
  const currentUser = useMemo<CitizenProfile>(
    () => ({
      id: profile.id,
      name: profile.name,
      avatar_initials: initialsFromName(profile.name),
      avatar_url: profile.avatar_url,
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
    () => ({
      profile,
      currentUser,
      authenticated,
      hydrated,
      updateProfile,
      resetProfile,
      signOut,
    }),
    [
      profile,
      currentUser,
      authenticated,
      hydrated,
      updateProfile,
      resetProfile,
      signOut,
    ]
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

/** The citizen's document, session state and mutators (settings dashboard). */
export function useCitizenProfile(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCitizenProfile must be used within a UserProvider");
  }
  return ctx;
}
