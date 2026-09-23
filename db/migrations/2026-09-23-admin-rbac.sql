-- ============================================================================
-- Sada-e-Awam — Admin RBAC schema patch (2026-09-23)
-- Neon PostgreSQL. Fully idempotent: safe to re-run on any environment.
--
-- Standalone `users` table for the Admin Console. Deliberately separate from
-- `citizen_users`: citizens sign in by mobile number into database-backed
-- session rows; officers sign in by official government email + bcrypt
-- password into a signed JWT cookie scoped to /admin. The two identity
-- stores share nothing.
--
-- Apply with:  npm run seed:admin
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table (CREATE IF NOT EXISTS keeps brand-new and existing branches equal)
-- ---------------------------------------------------------------------------
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
);

-- Legacy deployments whose `users` table predates RBAC.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'citizen';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 2. Indexes — role/email lookups + the case-insensitive uniqueness the
--    login lookup (LOWER(email) = LOWER($1)) and the seed upsert rely on
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role_email ON users(email, role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(LOWER(email));

-- ---------------------------------------------------------------------------
-- 3. Seed — provincial leadership master account.
--    Default password: SadaAdmin@2026  (bcrypt, cost 12 — rotate on first
--    sign-in). Upsert refreshes the roster metadata but NEVER the password
--    hash, so re-running the seed cannot clobber a rotated credential.
-- ---------------------------------------------------------------------------
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
  full_name   = EXCLUDED.full_name,
  role        = EXCLUDED.role,
  department  = EXCLUDED.department,
  designation = EXCLUDED.designation,
  updated_at  = now();
