/* Seed the Admin Console's provincial leadership master account.

   Applies db/migrations/2026-09-23-admin-rbac.sql (idempotent DDL + index
   + upsert) against the Neon database named by DATABASE_URL.

     npm run seed:admin                       # schema + roster upsert
     npm run seed:admin -- --reset-password   # also reset the password hash

   The plain upsert never overwrites an existing password hash, so re-running
   cannot clobber a rotated credential; --reset-password exists for handing a
   drifted account back to the documented default. */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const MIGRATION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "migrations",
  "2026-09-23-admin-rbac.sql",
);

const SEED_EMAIL = "dg.localgovt@punjab.gov.pk";
const DEFAULT_PASSWORD_HASH =
  "$2b$12$4c6wEDSve7hGyTerqeCoXOB1YDHmgMekrDILnyIj1Wl0KNpWj3E1O";

const resetPassword = process.argv.includes("--reset-password");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set — run with: node --env-file=.env.local scripts/seed-admin.mjs",
  );
  process.exit(1);
}

const sql = await readFile(MIGRATION_PATH, "utf8");
const isLocal = /(?:localhost|127\.0\.0\.1)/.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  // Neon endpoints require TLS; local Postgres does not.
  ...(isLocal ? {} : { ssl: true }),
});

try {
  await pool.query(sql);
  if (resetPassword) {
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = now()
       WHERE LOWER(email) = LOWER($2)`,
      [DEFAULT_PASSWORD_HASH, SEED_EMAIL],
    );
  }
  const { rows } = await pool.query(
    `SELECT full_name, email, role, department, designation,
            (password_hash <> '') AS has_password
       FROM users WHERE LOWER(email) = LOWER($1)`,
    [SEED_EMAIL],
  );
  if (rows.length === 0) {
    console.error(`Seed did not land — no row for ${SEED_EMAIL}.`);
    process.exitCode = 1;
  } else {
    console.log(
      `Admin master account ready: ${rows[0].email} (${rows[0].role}) — ${rows[0].department}, ${rows[0].designation}${resetPassword ? " [password reset to default]" : ""}`,
    );
  }
} catch (error) {
  console.error("Admin RBAC seed failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
