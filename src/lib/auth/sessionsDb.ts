import { createHash, randomBytes } from "node:crypto";
import { ensureSchema, query } from "@/lib/pg";
import { getCitizenUserById, type CitizenUser } from "@/lib/auth/usersDb";

/* Database-backed citizen sessions (`citizen_sessions`).

   The browser gets 32 random bytes as an httpOnly cookie; the table stores
   only its SHA-256, so a database dump cannot be replayed as a cookie, and
   signing out deletes the row — which revokes the session on the server
   instead of asking the browser to forget. */

/** "Remember this device" — the window the citizen is offered on the form. */
const REMEMBER_DAYS = 30;
/** Without "remember", the cookie dies with the browser, so the row does too
    (well before it would have expired). */
const UNTICKED_HOURS = 12;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CitizenSession {
  /** The raw token — the only thing that ever leaves the server. */
  token: string;
  expiresAt: Date;
  remember: boolean;
}

export async function createCitizenSession(
  userId: string,
  remember: boolean,
): Promise<CitizenSession> {
  const token = randomBytes(32).toString("base64url");
  const lifetimeMs = remember
    ? REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : UNTICKED_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await ensureSchema();
  /* Opportunistic GC — logins are rare enough that this doubles as the only
     cleanup the table needs, and it keeps expired rows out of every join. */
  await query("DELETE FROM citizen_sessions WHERE expires_at < now()");
  await query(
    "INSERT INTO citizen_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt.toISOString()],
  );
  return { token, expiresAt, remember };
}

/** The account behind a cookie, or null for a token that is unknown, expired,
    or whose account has been deleted (the FK cascades the row away). */
export async function getCitizenSessionUser(
  rawToken: string,
): Promise<CitizenUser | null> {
  const token = rawToken.trim();
  if (!token) return null;
  await ensureSchema();
  const rows = await query<{ user_id: string }>(
    "SELECT user_id FROM citizen_sessions WHERE token_hash = $1 AND expires_at > now() LIMIT 1",
    [hashToken(token)],
  );
  const userId = rows[0]?.user_id;
  return userId ? getCitizenUserById(userId) : null;
}

export async function revokeCitizenSession(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) return;
  await ensureSchema();
  await query("DELETE FROM citizen_sessions WHERE token_hash = $1", [
    hashToken(token),
  ]);
}
