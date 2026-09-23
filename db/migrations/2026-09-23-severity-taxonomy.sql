-- ========================================================================= --
-- Migration: Standardize Incident Severity & Priority taxonomy
-- Applies:   Neon PostgreSQL `reports` table (Sada-e-Awam)
-- Date:      2026-09-23
--
-- Canonical tiers (src/config/severity.ts):
--   routine   (P3_ROUTINE)  SLA 48–72h
--   urgent    (P2_URGENT)   SLA 12–24h   ← replaces legacy 'high' (بلند)
--   emergency (P1_EMERGENCY) SLA <4h
--
-- Safe to re-run: every statement is idempotent. Run inside a transaction
-- (psql: `psql $DATABASE_URL -f migrate-severity-taxonomy.sql`).
-- ========================================================================= --

BEGIN;

-- 1. Fold legacy severity values into the canonical tiers.
--    'high' was the old P2 label (Urdu "بلند" — mistranslated, now
--    "فوری توجہ"); 'normal'/'medium' fold into routine.
UPDATE reports SET urgency = 'urgent'  WHERE urgency = 'high';
UPDATE reports SET urgency = 'routine' WHERE urgency IN ('normal', 'medium');

-- 2. Backfill sla_deadline for rows missing one, using the canonical window
--    per tier anchored on created_at.
UPDATE reports
SET sla_deadline = created_at + (CASE urgency
      WHEN 'emergency' THEN INTERVAL '4 hours'
      WHEN 'urgent'    THEN INTERVAL '24 hours'
      ELSE                  INTERVAL '72 hours'
    END)
WHERE sla_deadline IS NULL;

-- 3. Swap the urgency check constraint to the canonical tiers.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_urgency_check;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_severity_check;

ALTER TABLE reports ADD CONSTRAINT reports_urgency_check
  CHECK (urgency IN ('routine', 'urgent', 'emergency'));

-- 4. If the incidents table from the original blueprint exists, align it too.
UPDATE incidents SET severity = 'urgent' WHERE severity = 'high';
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_severity_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_severity_check
  CHECK (severity IN ('routine', 'urgent', 'emergency'));

COMMIT;

-- Post-migration sanity check:
-- SELECT urgency, COUNT(*) FROM reports GROUP BY urgency ORDER BY 2 DESC;
-- Expected: only 'routine' | 'urgent' | 'emergency' rows.
