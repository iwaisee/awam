#!/usr/bin/env node
/* One-time migration: unpack the legacy JSON documents still stored in Neon
   (app_state key "coverage" and the registry row) into the normalized
   territory/department tables. Idempotent — skips any part whose target
   tables are already populated, and the legacy rows are left untouched as a
   rollback backup.

   Requires the dev server running (the payload is pushed through the app's
   own /api/territories and /api/departments PUT handlers so the exact
   production sync code performs the unpacking):
     npm run dev            # in one terminal
     node scripts/migrate-json-to-tables.mjs
*/

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) continue;
    const match = readFileSync(p, "utf8")
      .split("\n")
      .find((line) => /^\s*DATABASE_URL\s*=/.test(line));
    if (match) return match.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const DATABASE_URL = loadDatabaseUrl();
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found — run `neon env pull` or export it.");
  process.exit(1);
}

const isLocal = /(?:localhost|127\.0\.0\.1)/.test(DATABASE_URL);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

const scalar = (table) =>
  pool.query(`SELECT count(*)::int AS n FROM ${table}`).then((r) => r.rows[0].n);

async function putJson(pathname, body) {
  const res = await fetch(new URL(pathname, APP_URL), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} → HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function migrateCoverage() {
  const [provinces, cities, categories] = await Promise.all([
    scalar("provinces"),
    scalar("cities"),
    scalar("category_rules"),
  ]);
  if (provinces + cities + categories > 0) {
    console.log(`• coverage: tables already populated (provinces ${provinces}, cities ${cities}, categories ${categories}) — skipped`);
    return;
  }
  const legacy = await pool.query("SELECT value FROM app_state WHERE key = 'coverage'");
  if (legacy.rows.length === 0) {
    console.log("• coverage: no legacy app_state row found — skipped");
    return;
  }
  const doc = legacy.rows[0].value;
  const counts = {
    provinces: Array.isArray(doc.provinces) ? doc.provinces.length : 0,
    cities: Array.isArray(doc.cities) ? doc.cities.length : 0,
    areas: (doc.cities ?? []).reduce((n, c) => n + (c?.areas?.length ?? 0), 0),
    categories: Array.isArray(doc.categories) ? doc.categories.length : 0,
  };
  await putJson("/api/territories", { value: doc });
  console.log(`✓ coverage unpacked: ${JSON.stringify(counts)}`);
}

async function migrateRegistry() {
  if ((await scalar("sectors")) > 0) {
    console.log("• registry: sectors table already populated — skipped");
    return;
  }
  const legacy = await pool.query("SELECT data FROM registry WHERE id = 1");
  if (legacy.rows.length === 0) {
    console.log("• registry: no legacy registry row found — skipped (seed stays active until first save)");
    return;
  }
  const sectors = legacy.rows[0].data;
  const counts = {
    sectors: sectors.length,
    agencies: sectors.reduce((n, s) => n + (s?.agencies?.length ?? 0), 0),
    divisions: sectors.reduce(
      (n, s) => n + s.agencies.reduce((m, a) => m + (a?.districtOperations?.length ?? 0), 0),
      0,
    ),
    squads: sectors.reduce(
      (n, s) =>
        n +
        s.agencies.reduce(
          (m, a) =>
            m + a.districtOperations.reduce((k, op) => k + (op?.squads?.length ?? 0), 0),
          0,
        ),
      0,
    ),
  };
  await putJson("/api/departments", { sectors });
  console.log(`✓ registry unpacked: ${JSON.stringify(counts)}`);
}

async function main() {
  console.log(`Unpacking legacy JSON documents into normalized tables (${APP_URL})`);
  // Warm the app first — a cold Next.js route compiles on first hit.
  const health = await fetch(new URL("/api/departments", APP_URL)).catch((error) => {
    throw new Error(`Dev server unreachable at ${APP_URL} — run \`npm run dev\` first. (${error.message})`);
  });
  if (!health.ok) throw new Error(`/api/departments responded HTTP ${health.status}`);
  await health.json();

  await migrateCoverage();
  await migrateRegistry();

  const { rows } = await pool.query(
    `SELECT 'provinces' t, count(*)::int n FROM provinces
     UNION ALL SELECT 'cities', count(*)::int FROM cities
     UNION ALL SELECT 'zones', count(*)::int FROM zones
     UNION ALL SELECT 'areas', count(*)::int FROM areas
     UNION ALL SELECT 'category_rules', count(*)::int FROM category_rules
     UNION ALL SELECT 'sectors', count(*)::int FROM sectors
     UNION ALL SELECT 'agencies', count(*)::int FROM agencies
     UNION ALL SELECT 'divisions', count(*)::int FROM divisions
     UNION ALL SELECT 'squads', count(*)::int FROM squads`,
  );
  console.log("\nNormalized table row counts:");
  for (const { t, n } of rows) console.log(`  ${t}: ${n}`);
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error("Migration failed:", error.message ?? error);
    pool.end().finally(() => process.exit(1));
  });
