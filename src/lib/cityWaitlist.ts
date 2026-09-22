/** Launch-waitlist signups for Phase 2 districts — stored server-side
 *  (Neon app_state via /api/waitlist) so signups collected from any
 *  browser land in one shared list the pilot launcher can read. */

export interface CityWaitlistEntry {
  /** Pilot city slug, e.g. "lahore" (the Neon coverage roster). */
  city: string;
  city_name: string;
  phone: string;
  area?: string;
  /** ISO timestamp of the signup. */
  timestamp: string;
}

/**
 * Appends one signup to the shared server list. Returns false only when the
 * server is unreachable — there is no local fallback store; the caller
 * surfaces the failure so the citizen can retry.
 */
export async function appendWaitlistEntry(
  entry: CityWaitlistEntry
): Promise<boolean> {
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The shared signup list. Empty when the server is unreachable. */
export async function readWaitlistEntries(): Promise<CityWaitlistEntry[]> {
  try {
    const res = await fetch("/api/waitlist", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: CityWaitlistEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}
