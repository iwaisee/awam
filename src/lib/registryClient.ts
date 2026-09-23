"use client";

/* Client transport for the departments registry. The registry lives
   server-side (Neon, via /api/departments) so every browser shares one copy;
   this module is read/write transport only — no local cache, no seed. */

import type { CoreSector } from "@/data/departmentRegistry";

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

/** Server copy — `seeded: false` means the store has never been saved and
    holds an empty roster. */
export interface RegistrySnapshot {
  sectors: CoreSector[];
  seeded: boolean;
}

/* Several console decks mount the registry at once, so concurrent callers
   await one request rather than each issuing their own. */
let inFlight: Promise<RegistrySnapshot> | null = null;

async function loadRegistry(): Promise<RegistrySnapshot> {
  const res = await fetch("/api/departments", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { sectors?: unknown; seeded?: boolean };
  return {
    sectors: isValidRegistry(data.sectors) ? data.sectors : [],
    seeded: data.seeded === true,
  };
}

export function fetchRegistry(): Promise<RegistrySnapshot> {
  if (inFlight) return inFlight;
  const pending = loadRegistry().finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  inFlight = pending;
  return pending;
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
