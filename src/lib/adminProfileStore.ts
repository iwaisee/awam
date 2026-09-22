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

/** Neutral starting document — no fabricated persona. The real profile lives
    in the Neon app_state doc behind /api/state/admin-profile. */
export const DEFAULT_ADMIN_PROFILE: AdminProfile = {
  fullName: "",
  designation: "",
  role: "admin",
  cadre: "",
  serviceNumber: "",
  department: "",
  posting: "",
  email: "",
  hotline: "",
  landline: "",
  staffOfficer: "",
  avatarUrl: null,
  signatureUrl: null,
  showNameOnProofs: true,
  maskPhoneViaIvr: true,
  allowWhatsappEscalations: false,
};

/**
 * Merge a stored (possibly stale/partial) profile over the seed defaults so
 * schema drift in older shared documents can never crash the console.
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

/* ---------------------- External store over memory ------------------------ */
/*
 * Neon is the only store. The in-memory document is modelled as an external
 * store read through useSyncExternalStore: server and hydration renders use
 * the neutral snapshot, and every subscriber (header badge, sidebar card,
 * settings form) re-renders in the same tick whenever the Neon document is
 * adopted or a save is written.
 */

const listeners = new Set<() => void>();

let cachedProfile: AdminProfile = DEFAULT_ADMIN_PROFILE;

function getSnapshot(): AdminProfile {
  return cachedProfile;
}

function getServerSnapshot(): AdminProfile {
  return DEFAULT_ADMIN_PROFILE;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeProfile(next: AdminProfile) {
  cachedProfile = normalizeProfile(next);
  listeners.forEach((listener) => listener());
}

/* ---------------------------------- Hook ----------------------------------- */

/* ------------------ Server sync (shared across browsers) ------------------- */
/*
 * The database is authoritative: on first use the stored document is pulled
 * into the local cache, and when the server has nothing yet (fresh install)
 * the console renders the neutral document until an admin fills it in.
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
      // Server has the profile — adopt the shared document.
      if (JSON.stringify(data.value) !== JSON.stringify(getSnapshot())) {
        writeProfile(data.value);
      }
    }
  } catch {
    /* server unreachable — surfaces render the neutral profile */
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
    // Persist to the shared Neon store.
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
