-- Sada-e-Awam — Neon (Postgres) schema.
-- This mirrors the idempotent DDL that src/lib/pg.ts ensures at runtime;
-- keep the two in sync. Applied automatically by
-- scripts/migrate-sqlite-to-neon.mjs before data is imported.

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
  -- Verified capture location
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geo_verification JSONB,
  -- Citizen & ledger
  citizen_name TEXT NOT NULL DEFAULT 'Anonymous',
  citizen_phone TEXT NOT NULL DEFAULT '',
  upvotes INTEGER NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
  -- Insertion-order tie-break (SQLite used rowid for this).
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);

CREATE TABLE IF NOT EXISTS citizen_admin (
  key TEXT PRIMARY KEY,
  badge_override BOOLEAN NOT NULL DEFAULT FALSE,
  score_modifier INTEGER NOT NULL DEFAULT 0,
  standing TEXT NOT NULL DEFAULT 'active',
  blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------- Citizen accounts ------------------------------
-- Real credentials: scrypt password hash + database-backed sessions. The
-- browser only ever holds the raw session token in an httpOnly cookie; both
-- tables store a hash, so a leaked row or cookie dump is not replayable and
-- signing out revokes the session server-side.

CREATE TABLE IF NOT EXISTS citizen_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  -- Digits-only local form (3001234567): sign-in identifier + attribution key.
  phone_digits TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  -- Portrait: the Cloudinary CDN URL, or '' for the initials monogram.
  avatar_url TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Per-citizen settings document (CitizenProfileSettings).
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_users_email ON citizen_users (lower(email));
-- Partial: an account without a phone must not collide on ''.
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_users_phone ON citizen_users (phone_digits)
  WHERE phone_digits <> '';
-- Accounts predate the portrait column; this backfills an existing table.
ALTER TABLE citizen_users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
-- Portraits used to live as an inline data URL inside the settings document;
-- move them onto the column and drop the key (both self-disable once run).
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

-- Which account filed the report (NULL for pre-account rows).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT;

-- ---------------- Territories (normalized coverage document) ----------------
-- The client still speaks the whole-document { cities, categories, provinces }
-- contract (see src/lib/territoriesDb.ts); these tables are its store.

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

-- ------------- Departments registry (normalized tree document) --------------
-- The client still speaks the whole-tree CoreSector[] contract (see
-- src/lib/departmentsDb.ts); identity everywhere is the client-minted id.

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
