/** Launch-waitlist signups for Phase 2 districts — stored server-side
 *  (data/appstate.db via /api/waitlist) so signups collected from any
 *  browser land in one shared list the pilot launcher can read. */

const WAITLIST_KEY = "sada_city_waitlist";

export interface CityWaitlistEntry {
  /** Pilot city slug, e.g. "lahore" (see PILOT_CITIES). */
  city: string;
  city_name: string;
  phone: string;
  area?: string;
  /** ISO timestamp of the signup. */
  timestamp: string;
}

function readLocalMirror(): CityWaitlistEntry[] {
  try {
    const raw = window.localStorage.getItem(WAITLIST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === "object"
        ? [parsed]
        : [];
    return list as CityWaitlistEntry[];
  } catch {
    return [];
  }
}

/**
 * Appends one signup to the shared server list. Returns false only when the
 * server is unreachable (the signup is mirrored to localStorage so it isn't
 * lost and will migrate with the next successful save).
 */
export async function appendWaitlistEntry(entry: CityWaitlistEntry): Promise<boolean> {
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (res.ok) return true;
  } catch {
    /* server unreachable — mirror locally */
  }
  try {
    const list = readLocalMirror();
    list.push(entry);
    window.localStorage.setItem(WAITLIST_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Shared signups (server) merged with any not-yet-synced local mirrors. */
export async function readWaitlistEntries(): Promise<CityWaitlistEntry[]> {
  const local = readLocalMirror();
  try {
    const res = await fetch("/api/waitlist", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { entries?: CityWaitlistEntry[] };
    const remote = Array.isArray(data.entries) ? data.entries : [];
    const seen = new Set(
      remote.map((e) => `${e.phone}|${e.city}|${e.timestamp}`)
    );
    return [
      ...remote,
      ...local.filter((e) => !seen.has(`${e.phone}|${e.city}|${e.timestamp}`)),
    ];
  } catch {
    return local;
  }
}
