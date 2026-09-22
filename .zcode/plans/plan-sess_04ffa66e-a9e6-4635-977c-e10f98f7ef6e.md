## Fix `reports` table data types (names unchanged, zero data loss)

**Current problems in the `reports` table (Neon):** all 4 timestamps are `TEXT`, `status`/`urgency` accept any string, coordinates hide inside a JSONB blob (not queryable), `selected_tags` is JSONB instead of a native array, and `geo_verification` was bolted on with an out-of-band ALTER.

### Target schema (same column names, correct types)
- `created_at`, `sla_deadline`, `dispatched_at`, `resolved_at` → **TIMESTAMPTZ** (+ `created_at DEFAULT now()`)
- `status` → CHECK `(triage | dispatched | in_progress | resolved | disputed)`; `urgency` → CHECK `(routine | high | emergency)`
- `selected_tags` → **TEXT[]**
- `coordinates` JSONB → **`latitude` + `longitude` DOUBLE PRECISION** (values copied over, JSONB column dropped)
- `geo_verification` folded into the main DDL; `upvotes CHECK (>= 0)`

### Migration (matches the existing ensureSchema pattern in `src/lib/pg.ts`)
1. **Backup first**: dump the 3 current rows (via `/api/reports` + a SQL copy) to a local JSON file as a safety net.
2. Add idempotent migration statements to `pg.ts` (`ALTER ... USING` casts, once-per-process), and rewrite the main CREATE TABLE to the target shape for fresh databases. Existing pattern already does this (`ADD COLUMN IF NOT EXISTS geo_verification`).
3. Sync the mirror in `db/schema.sql`.

### Code updates (explored every consumer — impact is contained)
- `src/lib/reportsDb.ts`: `rowToReport` normalizes timestamps Date|string → ISO string (node-pg returns JS Date for timestamptz); reconstructs `{lat, lng}` from the two numeric columns; tags pass through as arrays. INSERT: 30→31 params (lat/lng split, tags as array — drops the `::jsonb` casts).
- `src/app/api/reports/route.ts`: POST passes the tags array and lat/lng numbers directly (no JSON.stringify). **API request/response JSON shapes stay exactly the same** — no client changes.
- Three string-sort fixes (`localeCompare` breaks on Date values): `FieldGatewayView.tsx:536-538`, `SquadPortal.tsx:127`, `squadFields.ts:81` → epoch-ms comparison. All other date math (`new Date(...)`, `getTime()`) is already safe.
- Keep in sync: `scripts/migrate-sqlite-to-neon.mjs` INSERT + `prisma/schema.prisma` model (Prisma is unused at runtime but documents the schema).

### Verification
- `tsc` clean; GET `/api/reports` returns the identical JSON shape as before (diffed).
- POST one test report → confirm row lands with proper types → delete it.
- Browser: feed (3 tickets), `/track` dossier (geo + SLA clock), field-gateway dispatch timestamps, squad queue.
- Row count + tokens/statuses identical before/after.

**Later steps (your one-by-one series):** territories tables, registry tables, app_state keys, and dropping the two unused tables (`registry`, `citizen_admin`).