/* Seed the Admin Console: schema, then the provincial leadership master account.

   Applies every db/migrations/*.sql in filename order (all of them are
   idempotent, so re-running is safe) against the Neon database named by
   DATABASE_URL.

     npm run seed:admin                       # schema + roster upsert
     npm run seed:admin -- --reset-password   # also reset the password hash

   The plain upsert never overwrites an existing password hash, so re-running
   cannot clobber a rotated credential; --reset-password exists for handing a
   drifted account back to the documented default. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
// Neon serverless driver: the Postgres wire protocol over WebSocket (443),
// so the seed works on networks that block raw TCP 5432.
import { Pool } from "@neondatabase/serverless";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "migrations",
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

const migrationFiles = (await readdir(MIGRATIONS_DIR))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const pool = new Pool({ connectionString: databaseUrl });

try {
  for (const file of migrationFiles) {
    await pool.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    console.log(`Applied ${file}`);
  }
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
