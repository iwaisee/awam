import { Pool, type QueryResultRow } from "pg";

/* Shared Neon (Postgres) access — one pooled client for the whole console.
   The connection string comes from DATABASE_URL (pooled "-pooler" URL is the
   right one for app traffic; Neon writes it into .env via `neon env pull`).
   The pool is cached on globalThis so dev hot-reloads reuse the same handles,
   and the schema is ensured exactly once per process. */

declare global {
  var __sadaPgPool: Pool | undefined;
  var __sadaPgSchema: Promise<void> | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — link the Neon project and run `neon env pull` (or copy the pooled connection string into .env).",
    );
  }
  const isLocal = /(?:localhost|127\.0\.0\.1)/.test(url);
  return new Pool({
    connectionString: url,
    max: 5,
    // Neon endpoints require TLS; local Postgres does not.
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
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
  urgency TEXT NOT NULL CHECK (urgency IN ('routine', 'high', 'emergency')),
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_urgency_check'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_urgency_check
      CHECK (urgency IN ('routine', 'high', 'emergency'));
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
`;

/** Create every table once per process. A failed attempt is not cached, so a
    bad DATABASE_URL can be fixed without restarting the dev server. */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__sadaPgSchema) {
    globalThis.__sadaPgSchema = getPool()
      .query(SCHEMA_DDL)
      .then(() => undefined)
      .catch((error: unknown) => {
        globalThis.__sadaPgSchema = undefined;
        throw error;
      });
  }
  return globalThis.__sadaPgSchema;
}
