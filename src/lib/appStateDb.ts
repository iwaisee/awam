import { ensureSchema, query } from "@/lib/pg";

/* Generic key/value store for shared application state that used to live in
   per-browser localStorage (system preferences, admin profile, coverage
   roster, …). One JSONB row per key in the Neon `app_state` table so every
   browser reads the same values. */

/** The stored JSON value for `key`, or null when nothing was saved yet. */
export async function readState(key: string): Promise<unknown | null> {
  await ensureSchema();
  const rows = await query<{ value: unknown }>(
    "SELECT value FROM app_state WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function writeState(key: string, value: unknown): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
