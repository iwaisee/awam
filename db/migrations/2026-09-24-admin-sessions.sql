-- ============================================================================
-- Sada-e-Awam — Admin session table (2026-09-24)
-- Neon PostgreSQL. Fully idempotent: safe to re-run on any environment.
--
-- Officer sessions stop being self-describing signed tokens and become rows,
-- mirroring the citizen `citizen_sessions` design: the browser holds 32 random
-- bytes, this table holds only their SHA-256 (so a dump cannot be replayed as
-- a cookie), and signing out deletes the row. There is no signing secret to
-- provision, and a session ends on the server the moment its row goes —
-- through logout, a demotion, or the account being deleted (the FK cascades).
--
-- Apply with:  npm run seed:admin
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
