import { neon } from "@neondatabase/serverless";

/* The admin console's dedicated Neon seam.

   Runs on @neondatabase/serverless (stateless HTTP SQL over fetch), so officer
   authentication owns its own database path end-to-end and shares nothing with
   the citizen pg pool in src/lib/pg.ts — same Neon Postgres, zero shared
   connection code. The driver parameterizes everything passed through its
   template; no SQL is ever concatenated.

   Schema bootstrap is idempotent and cached per process, mirroring the
   ensureSchema() pattern: a fresh Neon branch gets the `users` table, its
   indexes and the seeded master account on the first login attempt. The
   canonical DDL + seed live in db/migrations/2026-09-23-admin-rbac.sql
   (apply via `npm run seed:admin`); the seed upsert refreshes roster metadata
   but never overwrites a rotated password hash. */

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: string | null;
  department: string | null;
}

declare global {
  var __sadaAdminSql: ReturnType<typeof neon> | undefined;
  var __sadaAdminBootstrap: Promise<void> | undefined;
}

/** The console's Neon handle — one per process, reused across dev hot-reloads. */
export function adminSql(): ReturnType<typeof neon> {
  if (!globalThis.__sadaAdminSql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set — the admin console cannot reach Neon.",
      );
    }
    globalThis.__sadaAdminSql = neon(url);
  }
  return globalThis.__sadaAdminSql;
}

/** Idempotent DDL + seed, run once per process before any admin query. */
export function ensureAdminSchema(): Promise<void> {
  globalThis.__sadaAdminBootstrap ??= (async () => {
    const sql = adminSql();
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        full_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL DEFAULT '',
        role VARCHAR(30) NOT NULL DEFAULT 'citizen',
        department VARCHAR(100),
        designation VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_role_email ON users(email, role)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(LOWER(email))`;
    await sql`
      INSERT INTO users (full_name, email, password_hash, role, department, designation)
      VALUES (
        'Director General (DG) Local Govt',
        'dg.localgovt@punjab.gov.pk',
        '$2b$12$4c6wEDSve7hGyTerqeCoXOB1YDHmgMekrDILnyIj1Wl0KNpWj3E1O',
        'superadmin',
        'Local Government & Community Development',
        'Provincial Operations Lead'
      )
      ON CONFLICT (LOWER(email)) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        department = EXCLUDED.department,
        designation = EXCLUDED.designation,
        updated_at = now()
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at)`;
  })().catch((error: unknown) => {
    // Don't cache failures — a fixed DATABASE_URL must retry without a restart.
    globalThis.__sadaAdminBootstrap = undefined;
    throw error;
  });
  return globalThis.__sadaAdminBootstrap;
}

/** The officer record for an email (case-insensitive), or undefined. */
export async function getAdminUserByEmail(
  email: string,
): Promise<AdminUserRow | undefined> {
  await ensureAdminSchema();
  const rows = (await adminSql()`
    SELECT id, full_name, email, password_hash, role, department
      FROM users
     WHERE LOWER(email) = LOWER(${email})
     LIMIT 1
  `) as AdminUserRow[];
  return rows[0];
}

/** The officer record for a session's user id, or undefined once the account
    is gone (the FK cascade deletes the session row with it). */
export async function getAdminUserById(
  id: string,
): Promise<AdminUserRow | undefined> {
  await ensureAdminSchema();
  const rows = (await adminSql()`
    SELECT id, full_name, email, password_hash, role, department
      FROM users
     WHERE id = ${id}
     LIMIT 1
  `) as AdminUserRow[];
  return rows[0];
}
