import { Pool } from "@neondatabase/serverless";
import type { QueryResultRow } from "pg";

/* Shared Neon (Postgres) access — one pooled client for the whole console.
   The connection string comes from DATABASE_URL (pooled "-pooler" URL is the
   right one for app traffic; Neon writes it into .env via `neon env pull`).
   The pool is cached on globalThis so dev hot-reloads reuse the same handles,
   and the schema is ensured exactly once per process.

   Driver: @neondatabase/serverless speaks the Postgres wire protocol over
   WebSocket (port 443) rather than raw TCP 5432, which corporate and campus
   networks routinely block. The API matches node-postgres (query/connect/
   end), so call sites are unchanged. */

declare global {
  var __sadaPgPool: Pool | undefined;
  var __sadaPgSchema: { ddl: string; promise: Promise<void> } | undefined;
  var __sadaPgKeepalive: ReturnType<typeof setInterval> | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — link the Neon project and run `neon env pull` (or copy the pooled connection string into .env).",
    );
  }
  const pool = new Pool({
    connectionString: url,
    max: 5,
  });

  /* Neon's pooler reaps WebSocket connections after a few idle minutes. A
     reaped socket costs a fresh ~1.3s handshake on the next query, and the
     dying socket can surface as an unhandled ErrorEvent — both land as
     multi-second stalls that make client-router navigations (e.g. the
     post-login redirect) silently abort. A light ping every 4 minutes keeps
     the sockets legitimately open; a warm socket answers in single-digit ms. */
  if (globalThis.__sadaPgKeepalive) clearInterval(globalThis.__sadaPgKeepalive);
  globalThis.__sadaPgKeepalive = setInterval(
    () => void pool.query("SELECT 1").catch(() => undefined),
    4 * 60 * 1000,
  );
  globalThis.__sadaPgKeepalive.unref?.();

  /* Idle-socket errors arrive with no query attached and would otherwise
     bubble as uncaughtExceptions; the pool reconnects on the next query. */
  pool.on("error", (error: unknown) => {
    console.error(
      "[pg] pool client error (pool reconnects on next query)",
      error instanceof Error ? error.message : error,
    );
  });

  return pool;
}

export function getPool(): Pool {
  if (!globalThis.__sadaPgPool) {
    globalThis.__sadaPgPool = createPool();
  }
  return globalThis.__sadaPgPool;
}

/** Parameterized query — server code never builds SQL by string concat. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params as unknown[]);
  return result.rows as T[];
}

/* Mirrors db/schema.sql — keep the two in sync. All statements are
   idempotent so the app can bootstrap an empty Neon branch on first use. */
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registry (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  tracking_token TEXT NOT NULL UNIQUE,
  -- Where the hazard is
  city_id TEXT NOT NULL,
  city_name TEXT NOT NULL,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  -- What the hazard is
  category_id TEXT NOT NULL,
  category_title TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  selected_tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  -- Dispatch lifecycle
  status TEXT NOT NULL DEFAULT 'triage'
    CHECK (status IN ('triage', 'dispatched', 'in_progress', 'resolved', 'disputed')),
  assigned_agency TEXT NOT NULL,
  assigned_unit TEXT,
  sla_deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  -- Evidence & resolution proof
  photo_url TEXT,
  after_photo_url TEXT,
  resolution_notes TEXT,
  -- Verified capture location (JSONB {lat,lng} legacy: migrated to columns)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geo_verification JSONB,
  -- Citizen & ledger
  citizen_name TEXT NOT NULL DEFAULT 'Anonymous',
  citizen_phone TEXT NOT NULL DEFAULT '',
  upvotes INTEGER NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);

/* ---------------------- Reports schema migration ---------------------------
   Brings pre-existing deployments from the TEXT-era reports table up to the
   typed schema above. Idempotent: every statement is a no-op once the column
   already has the target type/shape. ensureSchema() runs it once per process
   right after the CREATE statements. */
ALTER TABLE reports ADD COLUMN IF NOT EXISTS geo_verification JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE reports DROP COLUMN IF EXISTS uc_number;
ALTER TABLE reports DROP COLUMN IF EXISTS materials_used;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE reports ALTER COLUMN created_at SET DEFAULT now();
/* TEXT → TIMESTAMPTZ conversions. Each fires only while the column is still
   textual: on an already-migrated table NULLIF(col, '') would compare a
   timestamptz against the '' literal and fail the whole batch (22007). */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'created_at'
      AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    ALTER TABLE reports ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING NULLIF(created_at, '')::TIMESTAMPTZ;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'sla_deadline'
      AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    ALTER TABLE reports ALTER COLUMN sla_deadline TYPE TIMESTAMPTZ
      USING NULLIF(sla_deadline, '')::TIMESTAMPTZ;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'dispatched_at'
      AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    ALTER TABLE reports ALTER COLUMN dispatched_at TYPE TIMESTAMPTZ
      USING NULLIF(dispatched_at, '')::TIMESTAMPTZ;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'resolved_at'
      AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    ALTER TABLE reports ALTER COLUMN resolved_at TYPE TIMESTAMPTZ
      USING NULLIF(resolved_at, '')::TIMESTAMPTZ;
  END IF;
END $$;
-- JSONB array → TEXT[] (USING can't host a subquery, so rebuild the column).
DO $$
DECLARE tags_type TEXT;
BEGIN
  SELECT data_type INTO tags_type FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'selected_tags';
  IF tags_type = 'jsonb' THEN
    ALTER TABLE reports RENAME COLUMN selected_tags TO selected_tags_legacy;
    ALTER TABLE reports ADD COLUMN selected_tags TEXT[] NOT NULL DEFAULT '{}';
    UPDATE reports
      SET selected_tags = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(selected_tags_legacy)),
        '{}'::text[]
      );
    ALTER TABLE reports DROP COLUMN selected_tags_legacy;
  END IF;
END $$;
-- Copy the legacy JSONB {lat,lng} into the numeric columns, then drop it.
-- Guarded: on a migrated table the coordinates column no longer exists and
-- the bare UPDATE would fail with 42703.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'coordinates'
  ) THEN
    UPDATE reports SET latitude = (coordinates->>'lat')::DOUBLE PRECISION,
                        longitude = (coordinates->>'lng')::DOUBLE PRECISION
      WHERE coordinates IS NOT NULL
        AND latitude IS NULL AND longitude IS NULL;
    ALTER TABLE reports DROP COLUMN coordinates;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_status_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_status_check
      CHECK (status IN ('triage', 'dispatched', 'in_progress', 'resolved', 'disputed'));
  END IF;
  -- Canonical severity taxonomy: fold legacy "high" rows into "urgent",
  -- then make sure the check constraint matches the canonical tiers.
  UPDATE reports SET urgency = 'urgent' WHERE urgency = 'high';
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_urgency_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%''urgent''%'
  ) THEN
    ALTER TABLE reports DROP CONSTRAINT reports_urgency_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_urgency_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_urgency_check
      CHECK (urgency IN ('routine', 'urgent', 'emergency'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_upvotes_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_upvotes_check
      CHECK (upvotes >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS citizen_admin (
  key TEXT PRIMARY KEY,
  badge_override BOOLEAN NOT NULL DEFAULT FALSE,
  score_modifier INTEGER NOT NULL DEFAULT 0,
  standing TEXT NOT NULL DEFAULT 'active',
  blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

/* -------------------------- Citizen accounts & sessions --------------------
   Real credentials. The browser only ever holds the raw session token in an
   httpOnly cookie; both tables store a hash of it/them, so a leaked row (or a
   leaked cookie dump) is not directly replayable, and signing out revokes the
   session server-side rather than trusting a client-side store. */

CREATE TABLE IF NOT EXISTS citizen_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  -- Digits-only local form (3001234567): the sign-in identifier and the
  -- attribution key, kept separate from the display-formatted phone.
  phone_digits TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  -- Portrait: the Cloudinary CDN URL, or '' for the initials monogram.
  avatar_url TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  /* Per-citizen settings document (CitizenProfileSettings). Replaces the
     shared app_state 'citizen-profile' doc, which every browser overwrote. */
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_users_email ON citizen_users (lower(email));
/* Partial: the pilot allows an account without a phone, and '' must not
   collide across those rows. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_users_phone ON citizen_users (phone_digits)
  WHERE phone_digits <> '';
/* Accounts predate the portrait column, and CREATE TABLE IF NOT EXISTS is a
   no-op for them — the ALTER is what backfills an existing table. */
ALTER TABLE citizen_users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
/* Portraits used to be stored as an inline data URL inside the settings
   document. Move any of those onto the column, then drop the key so the column
   is the only portrait source. Both statements self-disable once run. */
UPDATE citizen_users SET avatar_url = settings->>'avatar_url'
  WHERE avatar_url = '' AND settings->>'avatar_url' LIKE 'data:image/%';
UPDATE citizen_users SET settings = settings - 'avatar_url'
  WHERE settings ? 'avatar_url';

CREATE TABLE IF NOT EXISTS citizen_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES citizen_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citizen_sessions_user ON citizen_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_citizen_sessions_expiry ON citizen_sessions (expires_at);

/* Ledger attribution: which account filed the report. Nullable — every row
   filed before accounts existed, and every row filed through the squad or
   admin surfaces, stays unattributed. */
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT;

/* ------------------------------ Citizen votes ------------------------------
   One confirmation per account per ticket — the ledger's anti-inflation rule.
   The PRIMARY KEY is the constraint that makes a second vote impossible; the
   FKs retire a ticket's votes with the ticket, and an account's votes with
   the account. */
CREATE TABLE IF NOT EXISTS report_votes (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES citizen_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_report_votes_user ON report_votes (user_id);

/* ------------------------- Resolution email alerts -------------------------
   Per-account "email me when this ticket is resolved" switches. Separate from
   votes: a citizen can watch a ticket they never confirmed. */
CREATE TABLE IF NOT EXISTS report_alerts (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES citizen_users(id) ON DELETE CASCADE,
  email_on_resolve BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

/* ---------------- Territories (normalized coverage document) ----------------
   The client still speaks the whole-document { cities, categories, provinces }
   contract (see territoriesDb.ts); these tables are its normalized store. */

CREATE TABLE IF NOT EXISTS provinces (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  kind TEXT,
  capital TEXT,
  code TEXT,
  slug TEXT,
  boundary JSONB,
  area_km2 NUMERIC,
  population BIGINT,
  tiers JSONB,
  agencies JSONB,
  sla_p1_hours INTEGER,
  sla_p2_hours INTEGER,
  verification TEXT,
  lifecycle TEXT,
  status TEXT,
  admin_model TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provinces_name ON provinces (lower(name_en));

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  province_id BIGINT NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  status TEXT NOT NULL DEFAULT 'coming_soon',
  active_reports INTEGER NOT NULL DEFAULT 0,
  agencies JSONB,
  subtext TEXT,
  supervisor TEXT,
  contact TEXT,
  office TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_name ON cities (lower(name_en));

CREATE TABLE IF NOT EXISTS zones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'Municipal Corporation',
  authority TEXT,
  supervisor TEXT,
  contact TEXT,
  office TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_city_name ON zones (city_id, lower(name_en));

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  zone_id BIGINT REFERENCES zones(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  uc_number TEXT,
  jurisdiction TEXT,
  sub_division TEXT,
  active_tickets INTEGER,
  status TEXT,
  supervisor TEXT,
  contact TEXT,
  office TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_areas_city_name ON areas (city_id, lower(name_en));

CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  description TEXT,
  icon_name TEXT,
  default_agency TEXT NOT NULL DEFAULT 'MCS',
  sla_hours INTEGER NOT NULL DEFAULT 24,
  urgency TEXT NOT NULL DEFAULT 'routine',
  status TEXT NOT NULL DEFAULT 'active',
  supported_cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_jurisdictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort INTEGER NOT NULL DEFAULT 0
);

/* ------------- Departments registry (normalized tree document) --------------
   The client still speaks the whole-tree CoreSector[] contract (see
   departmentsDb.ts); identity everywhere is the client-minted string id. */

CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  name_urdu TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  unit TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  sector_id TEXT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  headquarters TEXT NOT NULL DEFAULT '',
  hq_address TEXT,
  descriptor TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT 'Punjab',
  jurisdiction_districts JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  control_hotline TEXT,
  dispatch_email TEXT,
  webhook_url TEXT,
  reports_enabled BOOLEAN,
  maintenance BOOLEAN,
  avg_resolution_hours NUMERIC,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  district TEXT NOT NULL DEFAULT '',
  division_name TEXT NOT NULL DEFAULT '',
  division_name_urdu TEXT,
  manager_name TEXT NOT NULL DEFAULT '',
  manager_designation TEXT NOT NULL DEFAULT '',
  official_phone TEXT NOT NULL DEFAULT '',
  official_extension TEXT,
  control_room_hotline TEXT NOT NULL DEFAULT '',
  coverage JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_tickets INTEGER NOT NULL DEFAULT 0,
  resolved_tickets INTEGER NOT NULL DEFAULT 0,
  total_squads_deployed INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS squads (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  lead_technician TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  members_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  role_class TEXT,
  shift TEXT,
  vehicle_plate TEXT,
  wards JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_tickets INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);

/* --------------------- Registry JSONB array repair -------------------------
   An earlier registry write path JSON.stringify'd the array payloads before
   the jsonb_to_recordset insert, so jurisdiction_districts / coverage / wards
   were stored as JSON string scalars ('"[...]"') instead of arrays — every
   reader then saw empty rosters (agency "N Cities" bubbles stuck at 0).
   Unwrap any string-encoded array once. The LIKE guard keeps non-array
   strings (free-text values) safe from the ::jsonb cast; both statements
   self-disable once the data is normalized. */
DO $$
BEGIN
  UPDATE agencies SET jurisdiction_districts = (jurisdiction_districts #>> '{}')::jsonb
   WHERE jsonb_typeof(jurisdiction_districts) = 'string'
     AND (jurisdiction_districts #>> '{}') LIKE '[%';
  UPDATE divisions SET coverage = (coverage #>> '{}')::jsonb
   WHERE jsonb_typeof(coverage) = 'string'
     AND (coverage #>> '{}') LIKE '[%';
  UPDATE squads SET wards = (wards #>> '{}')::jsonb
   WHERE jsonb_typeof(wards) = 'string'
     AND (wards #>> '{}') LIKE '[%';
END $$;
`;

/** Create every table, keyed by the DDL text that was applied. A long-lived dev
    server therefore picks up a table added to SCHEMA_DDL without a restart; a
    failed attempt is not cached, so a bad DATABASE_URL can be fixed without
    restarting either. */
export function ensureSchema(): Promise<void> {
  const applied = globalThis.__sadaPgSchema;
  if (applied?.ddl === SCHEMA_DDL) return applied.promise;
  const promise = getPool()
    .query(SCHEMA_DDL)
    .then(() => undefined)
    .catch((error: unknown) => {
      globalThis.__sadaPgSchema = undefined;
      throw error;
    });
  globalThis.__sadaPgSchema = { ddl: SCHEMA_DDL, promise };
  return promise;
}
