"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { OperationalRole } from "@/types/civic";

/* --------------------------------- Schema --------------------------------- */

export interface AdminProfile {
  fullName: string;
  designation: string;
  cadre: string;
  serviceNumber: string;
  department: string;
  posting: string;
  email: string;
  hotline: string;
  landline: string;
  staffOfficer: string;
  /** Municipal personnel role — gates dispatch suites & command telemetry. */
  role: OperationalRole;
  /** Portrait data URL (canvas-downscaled to 400×400) or null for initials. */
  avatarUrl: string | null;
  /** Signature stamp data URL (aspect-preserving downscale) or null. */
  signatureUrl: string | null;
  showNameOnProofs: boolean;
  maskPhoneViaIvr: boolean;
  allowWhatsappEscalations: boolean;
}

export const DEFAULT_ADMIN_PROFILE: AdminProfile = {
  fullName: "Municipal Commissioner, Sialkot",
  designation: "Phase 1 Pilot Operations Lead",
  role: "admin",
  cadre: "PAS (Pakistan Administrative Service) - BPS-20",
  serviceNumber: "SK-MCS-89410-E",
  department: "Municipal Corporation Sialkot (MCS)",
  posting: "MCS Complex, Sialkot",
  email: "commissioner.mcs@localgov.punjab.gov.pk",
  hotline: "+92 300 0001122",
  landline: "052-9260271 Ext: 402",
  staffOfficer: "+92 321 5554321 (Staff Officer to Commissioner)",
  avatarUrl: null,
  signatureUrl: null,
  showNameOnProofs: true,
  maskPhoneViaIvr: true,
  allowWhatsappEscalations: false,
};

const STORAGE_KEY = "sada_admin_profile";

/**
 * Merge a stored (possibly stale/partial) profile over the seed defaults so
 * schema drift in older localStorage payloads can never crash the console.
 */
function normalizeProfile(raw: unknown): AdminProfile {
  if (!raw || typeof raw !== "object") return DEFAULT_ADMIN_PROFILE;
  const stored = raw as Partial<AdminProfile>;
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" ? value : fallback;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  const dataUrl = (value: unknown) =>
    typeof value === "string" && value.startsWith("data:image/") ? value : null;
  return {
    fullName: str(stored.fullName, DEFAULT_ADMIN_PROFILE.fullName),
    designation: str(stored.designation, DEFAULT_ADMIN_PROFILE.designation),
    // Pre-role stored profiles are municipal staff by definition — default to admin.
    role:
      stored.role === "field_supervisor"
        ? "field_supervisor"
        : DEFAULT_ADMIN_PROFILE.role,
    cadre: str(stored.cadre, DEFAULT_ADMIN_PROFILE.cadre),
    serviceNumber: str(
      stored.serviceNumber,
      DEFAULT_ADMIN_PROFILE.serviceNumber
    ),
    department: str(stored.department, DEFAULT_ADMIN_PROFILE.department),
    posting: str(stored.posting, DEFAULT_ADMIN_PROFILE.posting),
    email: str(stored.email, DEFAULT_ADMIN_PROFILE.email),
    hotline: str(stored.hotline, DEFAULT_ADMIN_PROFILE.hotline),
    landline: str(stored.landline, DEFAULT_ADMIN_PROFILE.landline),
    staffOfficer: str(stored.staffOfficer, DEFAULT_ADMIN_PROFILE.staffOfficer),
    avatarUrl: dataUrl(stored.avatarUrl),
    signatureUrl: dataUrl(stored.signatureUrl),
    showNameOnProofs: bool(
      stored.showNameOnProofs,
      DEFAULT_ADMIN_PROFILE.showNameOnProofs
    ),
    maskPhoneViaIvr: bool(
      stored.maskPhoneViaIvr,
      DEFAULT_ADMIN_PROFILE.maskPhoneViaIvr
    ),
    allowWhatsappEscalations: bool(
      stored.allowWhatsappEscalations,
      DEFAULT_ADMIN_PROFILE.allowWhatsappEscalations
    ),
  };
}

/* --------------------- External store over localStorage -------------------- */
/*
 * The profile lives in localStorage, so it is modelled as an external store
 * read through useSyncExternalStore: server and hydration renders use the
 * seed snapshot, and every subscriber (header badge, sidebar card, settings
 * form) re-renders in the same tick whenever a save is written. Writes also
 * propagate across browser tabs via the native `storage` event.
 */

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedProfile: AdminProfile = DEFAULT_ADMIN_PROFILE;

function getSnapshot(): AdminProfile {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null; // Corrupt storage — fall back to the seed profile.
      }
    }
    cachedProfile = normalizeProfile(parsed);
  }
  return cachedProfile;
}

function getServerSnapshot(): AdminProfile {
  return DEFAULT_ADMIN_PROFILE;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeProfile(next: AdminProfile) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full (oversized image) — in-memory subscribers still update.
  }
  cachedRaw = null; // Invalidate so the next read re-parses from storage.
  listeners.forEach((listener) => listener());
}

/* ---------------------------------- Hook ----------------------------------- */

/* ------------------ Server sync (shared across browsers) ------------------- */
/*
 * The database is authoritative: on first use the stored document is pulled
 * into the local cache, and when the server has nothing yet (fresh install)
 * the local profile migrates up instead. localStorage stays as the
 * synchronous cache that useSyncExternalStore reads.
 */

let serverSyncStarted = false;

async function syncWithServer(): Promise<void> {
  if (serverSyncStarted) return;
  serverSyncStarted = true;
  try {
    const res = await fetch("/api/state/admin-profile", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      value?: AdminProfile | null;
      seeded?: boolean;
    };
    if (data.seeded && data.value) {
      // Server has the profile — refresh the local cache from it.
      const incoming = JSON.stringify(data.value);
      if (incoming !== JSON.stringify(getSnapshot())) {
        writeProfile(normalizeProfile(data.value));
      }
    } else {
      const local = getSnapshot();
      // Fresh server — migrate the local profile up.
      await fetch("/api/state/admin-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: local }),
      });
    }
  } catch {
    /* server unreachable — the local cache keeps working */
  }
}

export function useAdminProfile() {
  const profile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    void syncWithServer();
  }, []);

  const saveProfile = useCallback((next: AdminProfile) => {
    writeProfile(next);
    // Persist to the shared store — localStorage is the synchronous cache.
    void fetch("/api/state/admin-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: next }),
    }).catch(() => {
      /* offline — the local cache already reflects the change */
    });
  }, []);

  const resetProfile = useCallback(() => {
    writeProfile(DEFAULT_ADMIN_PROFILE);
    void fetch("/api/state/admin-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: DEFAULT_ADMIN_PROFILE }),
    }).catch(() => {
      /* offline — the local cache already reflects the change */
    });
  }, []);

  return { profile, saveProfile, resetProfile };
}

/** Two-letter monogram for avatar fallbacks ("Municipal Commissioner…" → "MC"). */
export function getAdminInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "MC";
  return (
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "MC"
  );
}
