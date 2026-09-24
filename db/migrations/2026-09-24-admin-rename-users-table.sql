-- ============================================================================
-- Sada-e-Awam — Rename the admin identity table (2026-09-24)
-- Neon PostgreSQL. Idempotent: a no-op where the table already carries the new
-- name, and a no-op on a fresh branch that never had the old one.
--
-- The officer table was created as plain `users`, which collided with
-- `citizen_users` in every conversation about the schema. It is now
-- `admin_users`. A rename moves the rows, the primary key and the
-- `admin_sessions` foreign key in place — nothing is copied or recreated, and
-- a rotated password_hash survives untouched.
--
-- Filename order matters: this runs before 2026-09-24-admin-sessions.sql, so
-- that table's REFERENCES always lands on the new name.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN; -- already renamed, or a branch that only ever had admin_users
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    RAISE NOTICE 'Both `users` and `admin_users` exist — skipping; resolve by hand.';
    RETURN;
  END IF;

  ALTER TABLE public.users RENAME TO admin_users;
  ALTER INDEX IF EXISTS idx_users_role_email RENAME TO idx_admin_users_role_email;
  ALTER INDEX IF EXISTS idx_users_email_unique RENAME TO idx_admin_users_email_unique;

  -- A table rename leaves its constraints alone, so the primary key was still
  -- coming back as `users_pkey`.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey'
               AND conrelid = 'public.admin_users'::regclass) THEN
    ALTER TABLE public.admin_users RENAME CONSTRAINT users_pkey TO admin_users_pkey;
  END IF;
END $$;
