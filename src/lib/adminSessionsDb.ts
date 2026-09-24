import { createHash, randomBytes } from "node:crypto";
import {
  adminSql,
  ensureAdminSchema,
  getAdminUserById,
  type AdminUserRow,
} from "@/lib/adminUsersDb";

/* Database-backed officer sessions (`admin_sessions`) — the same shape as the
   citizen flow in src/lib/auth/sessionsDb.ts. The browser holds 32 random
   bytes; the table holds only their SHA-256, so a database dump cannot be
   replayed as a cookie, and signing out deletes the row, which ends the
   session on the server rather than asking the browser to forget. */

/** How long a console session lives before the row expires. */
const SESSION_HOURS = 12;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface AdminSession {
  /** The raw token — the only thing that ever leaves the server. */
  token: string;
  expiresAt: Date;
}

export async function createAdminSession(userId: string): Promise<AdminSession> {
  const sql = adminSql();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await ensureAdminSchema();
  /* Opportunistic GC — logins are rare enough that this doubles as the only
     cleanup the table needs. */
  await sql`DELETE FROM admin_sessions WHERE expires_at < now()`;
  await sql`
    INSERT INTO admin_sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})
  `;
  return { token, expiresAt };
}

/** The officer behind a cookie, or undefined for a token that is unknown,
    expired, or whose account has been deleted (the FK cascades the row away). */
export async function getAdminSessionUser(
  rawToken: string,
): Promise<AdminUserRow | undefined> {
  const sql = adminSql();
  const token = rawToken.trim();
  if (!token) return undefined;
  await ensureAdminSchema();
  const rows = (await sql`
    SELECT user_id FROM admin_sessions
     WHERE token_hash = ${hashToken(token)} AND expires_at > now()
     LIMIT 1
  `) as { user_id: string }[];
  const userId = rows[0]?.user_id;
  return userId ? getAdminUserById(userId) : undefined;
}

export async function revokeAdminSession(rawToken: string): Promise<void> {
  const sql = adminSql();
  const token = rawToken.trim();
  if (!token) return;
  await ensureAdminSchema();
  await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(token)}`;
}
