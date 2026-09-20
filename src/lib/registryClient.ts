"use client";

/* Client transport + localStorage migration for the departments registry.
   The registry itself lives server-side (data/departments.db via
   /api/departments) so every browser shares one copy. localStorage is only
   read once during migration — pre-existing divisions/squads a browser saved
   before the server store existed are pushed up on first load. */

import type { CoreSector } from "@/data/departmentRegistry";

const SECTORS_STORAGE_KEY = "sada_departments_registry";
const SECTORS_SCHEMA_KEY = "sada_departments_schema";
const SECTORS_SCHEMA_VERSION = "v3";

/** Fired on the window after a successful save — same-tab listeners
    (overview, field gateway) re-sync immediately. */
export const REGISTRY_UPDATED_EVENT = "sada-registry-updated";

function isValidRegistry(value: unknown): value is CoreSector[] {
  return (
    Array.isArray(value) &&
    value.every(
      (sec) =>
        typeof (sec as { id?: unknown })?.id === "string" &&
        typeof (sec as { name?: unknown })?.name === "string" &&
        Array.isArray((sec as { agencies?: unknown })?.agencies)
    )
  );
}

/** Validated localStorage registry from before the server store existed —
    the migration source. Returns null when absent or unreadable. */
export function readLocalRegistry(): CoreSector[] | null {
  try {
    if (window.localStorage.getItem(SECTORS_SCHEMA_KEY) !== SECTORS_SCHEMA_VERSION)
      return null;
    const raw = window.localStorage.getItem(SECTORS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidRegistry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLocalRegistry(): void {
  try {
    window.localStorage.removeItem(SECTORS_STORAGE_KEY);
    window.localStorage.removeItem(SECTORS_SCHEMA_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Server copy — `seeded: false` means the store has never been saved and is
    serving the built-in seed (a localStorage migration may still run). */
export async function fetchRegistry(): Promise<{
  sectors: CoreSector[];
  seeded: boolean;
}> {
  const res = await fetch("/api/departments", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { sectors?: unknown; seeded?: boolean };
  return {
    sectors: isValidRegistry(data.sectors) ? data.sectors : [],
    seeded: data.seeded === true,
  };
}

export async function pushRegistry(sectors: CoreSector[]): Promise<boolean> {
  try {
    const res = await fetch("/api/departments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectors }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function announceRegistryUpdate(): void {
  window.dispatchEvent(new Event(REGISTRY_UPDATED_EVENT));
}
