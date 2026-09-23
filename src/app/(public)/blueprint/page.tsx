import type { Metadata } from "next";
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  Database,
  FileCode2,
  KeyRound,
  MapPinned,
  ScrollText,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Production Blueprint & Architectural Audit | Sada-e-Awam",
};

/* ----------------------------------------------------------------------------
 * Blueprint — a read-only engineering document: architectural audit of the
 * current prototype, production persistence schema (PostgreSQL + PostGIS),
 * media pipeline, auth/RBAC design, personas, civic-tech engines and a
 * 3-phase roadmap. Pure server component; no code elsewhere was modified.
 * -------------------------------------------------------------------------- */

/* ============================== SQL: DDL ================================== */

const SQL_EXTENSIONS = `-- ═══ 0. Extensions & enumerations ═══
CREATE EXTENSION IF NOT EXISTS postgis;        -- geospatial queries
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()

CREATE TYPE user_role AS ENUM
  ('citizen', 'field_technician', 'supervisor_sdo', 'super_admin_dg');

CREATE TYPE incident_status AS ENUM
  ('submitted', 'verified', 'work_order_issued', 'dispatched',
   'resolved', 'contested');

CREATE TYPE urgency_level AS ENUM ('routine', 'urgent', 'emergency');
CREATE TYPE unit_status   AS ENUM ('idle', 'en_route', 'on_site', 'off_duty');
CREATE TYPE attachment_kind AS ENUM
  ('citizen_initial', 'crew_before', 'crew_after_proof');`;

const SQL_TERRITORY = `-- ═══ 1. Agencies & territory hierarchy (District → Zone → Locality) ═══
CREATE TABLE agencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,            -- 'MCS' | 'GEPCO' | 'SWMC' | 'CANTT'
  name_en     TEXT NOT NULL,
  name_ur     TEXT,
  hotline     TEXT,
  sla_hours   JSONB NOT NULL DEFAULT '{"routine":72,"urgent":24,"emergency":4}'
);

CREATE TABLE categories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID NOT NULL REFERENCES agencies(id),
  title_en          TEXT NOT NULL,
  title_ur          TEXT,
  icon_key          TEXT,
  urgency_default   urgency_level NOT NULL DEFAULT 'routine'
);

CREATE TABLE territories_districts (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT UNIQUE NOT NULL,              -- 'SKT' → drives #SKT-1042 tokens
  name_en   TEXT NOT NULL,
  name_ur   TEXT
);

CREATE TABLE territories_zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id    UUID NOT NULL REFERENCES territories_districts(id) ON DELETE CASCADE,
  name_en        TEXT NOT NULL,               -- 'Cantonment', 'City Core'
  name_ur        TEXT,
  boundary_geom  GEOGRAPHY(POLYGON, 4326) NOT NULL
);
CREATE INDEX zones_geom_gix ON territories_zones USING GIST (boundary_geom);

CREATE TABLE territories_localities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id            UUID NOT NULL REFERENCES territories_zones(id) ON DELETE CASCADE,
  name_en            TEXT NOT NULL,           -- 'Paris Road', 'Model Town'
  name_ur            TEXT,
  boundary_geom      GEOGRAPHY(POLYGON, 4326) NOT NULL,
  default_agency_id  UUID REFERENCES agencies(id),  -- jurisdiction routing rule
  UNIQUE (zone_id, name_en)
);
CREATE INDEX localities_geom_gix ON territories_localities USING GIST (boundary_geom);`;

const SQL_USERS = `-- ═══ 2. Identity ═══
CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                  TEXT UNIQUE NOT NULL,      -- E.164: '+923001234567'
  full_name_en           TEXT NOT NULL,
  full_name_ur           TEXT,
  role                   user_role NOT NULL DEFAULT 'citizen',
  civic_score            INTEGER NOT NULL DEFAULT 0 CHECK (civic_score >= 0),
  is_verified            BOOLEAN NOT NULL DEFAULT FALSE,
  residence_locality_id  UUID REFERENCES territories_localities(id),
  landmark               TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE admin_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agency_id          UUID NOT NULL REFERENCES agencies(id),
  jurisdiction_scope GEOGRAPHY(POLYGON, 4326),  -- NULL = district-wide (DG)
  badge_number       TEXT UNIQUE NOT NULL,
  clearance_grade    INTEGER NOT NULL CHECK (clearance_grade BETWEEN 16 AND 22),
  totp_secret        TEXT NOT NULL              -- encrypted at rest (TOTP 2FA)
);`;

const SQL_INCIDENTS = `-- ═══ 3. The incident ledger ═══
CREATE SEQUENCE incident_token_seq START 1000;   -- SKT-1000, SKT-1001 …

CREATE TABLE incidents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_token    TEXT UNIQUE NOT NULL
                       DEFAULT ('SKT-' || nextval('incident_token_seq')::text),
  citizen_id         UUID NOT NULL REFERENCES users(id),
  category_id        UUID NOT NULL REFERENCES categories(id),
  selected_tags      TEXT[] NOT NULL DEFAULT '{}',   -- '#OverflowingDumpster'
  description        TEXT NOT NULL
                       CHECK (char_length(description) BETWEEN 10 AND 2000),
  raw_lat            DOUBLE PRECISION NOT NULL,      -- device GPS as-reported
  raw_lng            DOUBLE PRECISION NOT NULL,
  geom               GEOGRAPHY(POINT, 4326) NOT NULL,-- cleaned/validated point
  locality_id        UUID NOT NULL REFERENCES territories_localities(id),
  assigned_agency_id UUID NOT NULL REFERENCES agencies(id),
  assigned_unit_id   UUID,                           -- set at dispatch (FK below)
  current_status     incident_status NOT NULL DEFAULT 'submitted',
  urgency            urgency_level NOT NULL DEFAULT 'routine',
  sla_deadline       TIMESTAMPTZ NOT NULL,
  upvote_count       INTEGER NOT NULL DEFAULT 0,
  upvote_weighted    NUMERIC(8,2) NOT NULL DEFAULT 0,-- reputation-weighted
  image_phash        BYTEA,                          -- 64-bit perceptual hash
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_unit FOREIGN KEY (assigned_unit_id)
    REFERENCES field_units(id) ON DELETE SET NULL
);

-- Spatial: containment, reverse-geofence and 2 km crew-proximity all hit this.
CREATE INDEX incidents_geom_gix    ON incidents USING GIST (geom);
CREATE INDEX incidents_token_idx   ON incidents (reference_token);
-- Only open work in the hot index; closed tickets age out of scans.
CREATE INDEX incidents_open_idx    ON incidents (current_status, sla_deadline)
  WHERE current_status IN ('submitted','verified','work_order_issued','dispatched');
CREATE INDEX incidents_citizen_idx ON incidents (citizen_id, created_at DESC);

-- updated_at maintenance
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER incidents_touch BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();`;

const SQL_ATTACHMENTS = `-- ═══ 4. Evidence attachments (rows only — bytes live in object storage) ═══
CREATE TABLE incident_attachments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  attachment_type    attachment_kind NOT NULL,
  file_url           TEXT NOT NULL,        -- public CDN URL of derived variant
  storage_path       TEXT NOT NULL,        -- object key in R2/S3 bucket
  file_size          INTEGER NOT NULL CHECK (file_size <= 8 * 1024 * 1024),
  mime_type          TEXT NOT NULL CHECK (mime_type IN
                       ('image/jpeg','image/png','image/webp')),
  captured_at        TIMESTAMPTZ,
  exif_lat           DOUBLE PRECISION,
  exif_lng           DOUBLE PRECISION,
  is_geotag_verified BOOLEAN NOT NULL DEFAULT FALSE,  -- EXIF ↔ device GPS ≤ 250 m
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_incident_idx ON incident_attachments (incident_id);

-- ═══ 5. Field units (squads & fleet) ═══
CREATE TABLE field_units (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_name            TEXT NOT NULL,
  agency_id             UUID NOT NULL REFERENCES agencies(id),
  vehicle_type          TEXT NOT NULL,          -- 'Hilux 4x4'
  vehicle_plate         TEXT UNIQUE NOT NULL,   -- 'SLK-8421'
  crew_lead_name        TEXT NOT NULL,
  crew_phone            TEXT NOT NULL,          -- E.164, dispatch alerts
  crew_size             INTEGER NOT NULL DEFAULT 2,
  current_status        unit_status NOT NULL DEFAULT 'idle',
  current_incident_id   UUID REFERENCES incidents(id),  -- single-job lock
  assigned_patrol_zone  TEXT,                   -- 'Paris Road, Model Town'
  shift_capacity        INTEGER NOT NULL DEFAULT 5,
  shift_completed       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX units_available_idx ON field_units (agency_id, current_status)
  WHERE current_status = 'idle';`;

const SQL_AUDIT = `-- ═══ 6. Immutable audit log — append-only, no UPDATE/DELETE grants ═══
CREATE TABLE incident_audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id    UUID NOT NULL REFERENCES incidents(id),
  actor_id       UUID REFERENCES users(id),   -- NULL = system (SLA engine)
  action         TEXT NOT NULL CHECK (action IN
                   ('status_change','assigned_squad','sla_breach',
                    'citizen_upvote','proof_uploaded','reassigned')),
  previous_state JSONB,
  new_state      JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_incident_idx ON incident_audit_log (incident_id, created_at);

-- Every status transition is auto-journaled by the database itself.
CREATE FUNCTION journal_incident() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO incident_audit_log (incident_id, actor_id, action, previous_state, new_state)
  VALUES (NEW.id, current_setting('app.actor_id', true)::uuid,
          CASE WHEN NEW.assigned_unit_id IS DISTINCT FROM OLD.assigned_unit_id
               THEN 'assigned_squad' ELSE 'status_change' END,
          to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER incidents_journal AFTER UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION journal_incident();

REVOKE UPDATE, DELETE ON incident_audit_log FROM PUBLIC; -- append-only by grant`;

const SQL_RACES = `-- ═══ 7. Atomic dispatch — the fix for the #SKT-1042 double-assignment race ═══
BEGIN;

-- Claim the crew: only succeeds if the unit is still unassigned. The WHERE
-- clause IS the lock — no separate read, no window for interleaving.
UPDATE field_units
   SET current_incident_id = :incident_id, current_status = 'en_route'
 WHERE id = :unit_id
   AND current_incident_id IS NULL
   AND current_status = 'idle';

-- 0 rows updated → someone else claimed it first → the API returns 409.
UPDATE incidents
   SET assigned_unit_id = :unit_id,
       current_status   = 'dispatched',
       sla_deadline     = now() + interval '4 hours'
 WHERE id = :incident_id
   AND current_status = 'verified';          -- guard: valid transition only

COMMIT;

-- PostgreSQL row locks serialize the two dispatchers automatically:
-- dispatcher A commits; dispatcher B's UPDATE matches 0 rows → 409 Conflict
-- → the UI re-renders with “Crew B already assigned 3s ago”. No lost writes.`;

const SQL_RLS = `-- ═══ 8. Row-Level Security — agency isolation at the database layer ═══
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Citizens: full control of their own rows only.
CREATE POLICY incidents_owner_all ON incidents
  FOR ALL USING (citizen_id = auth_uid());

-- Everyone may read (public feed is anonymous by design).
CREATE POLICY incidents_public_read ON incidents
  FOR SELECT USING (true);

-- Agency staff: only their agency's tickets. A GEPCO officer physically
-- cannot SELECT or UPDATE an SWMC waste ticket — enforced by Postgres,
-- not by the frontend.
CREATE POLICY incidents_agency_scope ON incidents
  FOR ALL USING (
    assigned_agency_id = (
      SELECT agency_id FROM admin_profiles WHERE user_id = auth_uid()
    )
  );

-- Field crews: only the single job currently assigned to their unit.
CREATE POLICY incidents_crew_scope ON incidents
  FOR UPDATE USING (
    assigned_unit_id IN (
      SELECT id FROM field_units WHERE crew_user_id = auth_uid()
    )
  );

-- Same pattern for PII tables, attachments and audit log.
ALTER TABLE admin_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_audit_log ENABLE ROW LEVEL SECURITY;`;

/* ============================ CODE: presign =============================== */

const CODE_PRESIGN = `POST /api/uploads/presign          ← Next.js Route Handler (session-checked)
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "referenceToken": "SKT-1042",
  "kind": "crew_after_proof",          // citizen_initial | crew_before | crew_after_proof
  "mime": "image/jpeg",                // allow-list: jpeg / png / webp
  "bytes": 2400000                     // reject > 8 MB with 413
}

→ 201 Created
{
  "uploadUrl":  "https://sada-e-awam-uploads.r2.example.com/raw-uploads/2026/09/SKT-1042/9f3c.jpeg?X-Amz-Signature=…",
  "objectKey":  "raw-uploads/2026/09/SKT-1042/9f3c.jpeg",
  "expiresIn":  60                     // seconds — upload must start immediately
}

// Browser then PUTs the raw camera file STRAIGHT to R2 — zero bytes through
// the Next.js server. A storage webhook (or the confirm call) inserts the
// incident_attachments row and enqueues variant generation.`;

/* ============================== data arrays =============================== */

const AUDIT_ROWS: Array<[string, string, string]> = [
  [
    "Incident ledger",
    "Neon Postgres ledger — read/appended/updated by GET/POST/PATCH in src/app/api/reports/route.ts",
    "500-row cap, newest-first; every write rewrites the entire file",
  ],
  [
    "Citizen profile & identity",
    "Neon app_state citizen-profile document (React UserContext)",
    "Per-device only; dies with browser data; migrates legacy sada_citizen_settings",
  ],
  [
    "Admin identity",
    "Neon app_state admin-profile document (useSyncExternalStore)",
    "Anyone can edit devtools → instant fake 'DG' identity",
  ],
  [
    "System preferences",
    "Neon app_state system-prefs document (admin Settings view)",
    "Per-browser; not shared across the department",
  ],
  [
    "Territories & SLA taxonomy",
    "Neon coverage document behind /api/territories, edited in console views",
    "Each admin edits a private copy — admins drift apart",
  ],
  [
    "Offline filing cache",
    "Neon report ledger (/api/reports) — the only store",
    "Read only as /track fallback; not read by /my-reports",
  ],
  [
    "Feed / portal / radar datasets",
    "Neon ledger behind /api/reports — mapped per surface",
    "Every card is a live submission; actions persist across devices",
  ],
  [
    "Photos",
    "Canvas-downscaled base64 data URLs stored inline in localStorage rows",
    "~5 MB quota explosion; no EXIF survives canvas; zero cross-device",
  ],
  [
    "Sessions",
    "None. /admin is URL-obscure; /api/reports PATCH accepts any caller",
    "No tokens, no signatures, no authorization — full spoof surface",
  ],
];

const RACES_ROWS: Array<[string, string]> = [
  [
    "1,000 simultaneous submissions",
    "Each POST inserts a row into Neon Postgres — concurrent writers serialize safely and the ledger is shared across every deployment.",
  ],
  [
    "Data loss & cache eviction",
    "One cleared browser (or an Android WebView's isolated storage) deletes a citizen's profile, filing history and residency anchor. Nothing syncs across phone ↔ laptop. iOS Safari can evict localStorage under memory pressure without warning.",
  ],
  [
    "Lost-update race",
    "Two dispatchers PATCH #SKT-1042: handler A reads the array, handler B reads the same array, A writes 'SWMC Crew B', B writes 'GEPCO Squad 1' over it. A's assignment silently vanishes — no conflict, no audit trail, no 409.",
  ],
  [
    "Unauthenticated mutations",
    "curl -X PATCH /api/reports -d '{\"id\":\"…\",\"status\":\"resolved\"}' resolves any ticket from anywhere — no session, no rate limit. /admin/* views render fraud queues and citizen rows for anyone who knows the URL.",
  ],
];

const RBAC_MATRIX: Array<{ capability: string; perms: [boolean, boolean, boolean, boolean] }> = [
  { capability: "Read public feed & agencies directory", perms: [true, true, true, true] },
  { capability: "File incidents / attach photo evidence", perms: [true, false, false, false] },
  { capability: "Track own tickets (full dossier)", perms: [true, false, true, true] },
  { capability: "Upvote (reputation-weighted)", perms: [true, false, false, false] },
  { capability: "See assigned work orders only", perms: [false, true, false, false] },
  { capability: "Update unit status (en-route / on-site)", perms: [false, true, false, false] },
  { capability: "Upload crew before/after proof photos", perms: [false, true, false, false] },
  { capability: "Read all agency incidents (scoped)", perms: [false, false, true, true] },
  { capability: "Assign / reassign work orders to squads", perms: [false, false, true, false] },
  { capability: "Override SLA / reject fraudulent ticket", perms: [false, false, true, false] },
  { capability: "Edit zones, localities & jurisdiction polygons", perms: [false, false, false, true] },
  { capability: "Configure SLAs, hotlines, categories; export CSV", perms: [false, false, false, true] },
];

const REDIS_ROWS: Array<[string, string, string]> = [
  ["OTP rate limiting & codes", "STRING otp:{phone} = 6-digit hash", "TTL 5 min; 3 tries, then lockout key"],
  ["API rate limiting", "Sliding-window INCR rate:{ip|phone}", "TTL 60 s window"],
  ["SLA countdown timers", "ZSET sla:deadlines scored by epoch ms", "Poll due members → breach events"],
  ["Live radar pins", "GEOADD radar:sialkot lng lat incident_id", "TTL / removal on resolve"],
  ["Dispatch deduplication lock", "SET lock:dispatch:{incident} NX", "EX 10 s — blocks double-click dispatch"],
  ["Duplicate-photo ring", "SET phash:{band} members of recent hashes", "30-day window"],
];

const PERSONAS = [
  {
    tag: "Persona A",
    name: "Muhammad Usman",
    role: "Vigilant Citizen — Paris Road, Sialkot",
    icon: Users,
    accent: "bg-emerald-600",
    profile: "Mobile-first commuter on 4G. Zero patience for forms; will abandon anything past 60 seconds or two screens of typing.",
    steps: [
      "Opens the platform → one tap on “Report an Issue” → GPS auto-detects locality inside the Paris Road polygon (PostGIS containment); manual locality picker only as fallback.",
      "Taps a category card, then quick-tags (#OverflowingDumpster) — zero typing. Snaps a photo; upload goes straight to R2 via pre-signed URL in the background.",
      "Server verifies EXIF geotag ≤ 250 m of device GPS → incident INSERT returns token #SKT-1042; transactional WhatsApp lands instantly with the tracking deep link.",
      "Tracks the live SLA countdown on /track (Supabase Realtime push, no refresh). Gets a WhatsApp ping the moment a crew is dispatched — with crew name and ETA.",
      "Opens the “After” proof photo from the resolution notification → replies YES to confirm → earns +15 civic points toward Level 3 Mohallah Warden.",
    ],
  },
  {
    tag: "Persona B",
    name: "Engr. Tariq Mehmood",
    role: "SDO / Dispatch Supervisor — MCS Sialkot",
    icon: ClipboardCheck,
    accent: "bg-sky-700",
    profile: "Desktop/tablet operator accountable for 3 repair vehicles. Needs the queue, the map and proof photos on one screen — and an audit trail that protects him in inquiries.",
    steps: [
      "Signs in at /admin with email + password + TOTP; middleware + RLS scope him to MCS tickets only — GEPCO and SWMC queues are invisible at the database level.",
      "Field Dispatch console shows one unassigned emergency ticket and a proximity recommendation: “SWMC Compactor Crew B — 1.2 km away” (ST_DWithin 2 km query on PostGIS).",
      "Clicks 1-Click Dispatch → the atomic UPDATE claims the crew row; Redis dedup lock absorbs his double-click; crew phone gets the dispatch alert (WhatsApp template).",
      "Watches unit status flip En Route → On-Site live over WebSocket; SLA countdown recalculated from dispatch time.",
      "Reviews crew-uploaded before/after proof photos in the work-order drawer → approves → resolution transition fires the citizen notification automatically. Every step is already journaled in incident_audit_log.",
    ],
  },
  {
    tag: "Persona C",
    name: "Director General, Local Government",
    role: "Executive DG — District Oversight",
    icon: ShieldCheck,
    accent: "bg-[#0F5132]",
    profile: "Read-only executive authority. Monitors compliance, briefs the Deputy Commissioner weekly, tunes citywide policy — never touches individual tickets.",
    steps: [
      "Opens Command Radar → live heatmap of Sialkot pins (Redis GEOSET mirrored from PostGIS) with per-zone SLA compliance: 94.2%.",
      "Spots delinquency flags: 3 drain repairs breaching SLA in Cantonment — drills into the immutable audit log to see exactly where the 28-hour chain stalled.",
      "Exports the district territory + incident dataset as CSV for the DC's weekly briefing (DG-only export capability).",
      "Adjusts monsoon emergency hotlines and SLA hour-sets in System Preferences — changes persist centrally for every operator, not per-browser.",
      "Reviews agency scorecards to chair the monthly MCS vs SWMC performance meeting.",
    ],
  },
];

const PHASES = [
  {
    tag: "Phase 1",
    title: "Pilot Hardening",
    weeks: "Weeks 1–3",
    tone: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    items: [
      "Stabilize client flows; eradicate mobile clipping; keep the floating dirty-state save docks (already shipped) as the interaction standard.",
      "Report storage now runs on Neon; all mock/seed registries are deleted — every surface (feed, portal, radar, registries) reads the shared ledger behind typed interfaces.",
      "Ship the revamped Citizen Dashboard (/my-reports reading the live ledger) and the Field Dispatch console.",
      "Client-side JSON/CSV territory import-export in the Territories editor; feed page starts consuming ?q= / ?status= deep links.",
    ],
    exit: "Demo runs end-to-end from a single source of typed truth; zero dead UI paths in the sitemap audit's Loose Ends list.",
  },
  {
    tag: "Phase 2",
    title: "Production Backend & Media Engine",
    weeks: "Weeks 4–7",
    tone: "bg-sky-100 text-sky-900 ring-sky-200",
    items: [
      "Stand up PostgreSQL 16 + PostGIS (Supabase/Neon), run the DDL in this blueprint with migrations; backfill pilot data from reports.json.",
      "Cloudflare R2 buckets + pre-signed upload route + EXIF verification worker + 3-variant WebP pipeline (thumb / card / full).",
      "WhatsApp OTP auth for citizens (JWT httpOnly cookies); admin email+TOTP with Next.js middleware guarding /admin/* and every mutating API route.",
      "Postgres RLS policies live; dispatch/route mutations moved into transactions; Supabase Realtime (or Pusher) pushes status changes to /track and the triage desk.",
    ],
    exit: "A curl without a session cookie gets 401 on every mutation; two simultaneous dispatches produce one assignment + one 409.",
  },
  {
    tag: "Phase 3",
    title: "Field Testing & Multi-City Expansion",
    weeks: "Weeks 8–12",
    tone: "bg-amber-100 text-amber-900 ring-amber-200",
    items: [
      "PWA offline mode for field squads: Workbox service worker, IndexedDB work-order outbox, Background Sync upload retry with 409-aware conflict handling.",
      "30-day live pilot across Sialkot's 8 zones with real MCS / SWMC / GEPCO crews; fraud sentinel (pHash + EXIF delta + weighted upvotes) tuned on live data.",
      "WhatsApp bidirectional loop (YES/NO resolution confirmations) in Urdu templates; SLA breach escalation engine on Redis timers.",
      "Multi-tenancy provisioning (district_id on every row + RLS) for Lahore (MCL/LWMC) and Islamabad (CDA); activate the city waitlist engine for onboarding.",
    ],
    exit: "Sialkot pilot metrics green (SLA compliance, fraud-flag precision), and city #2 is a data migration — not a code fork.",
  },
];

const STATUS_MAP: Array<[string, string, string]> = [
  ["triage (today)", "submitted → verified", "submitted on POST; verified after EXIF/fraud checks clear"],
  ["dispatched (today)", "work_order_issued → dispatched", "split: work order issued vs crew physically en route"],
  ["in_progress (today)", "dispatched + unit_status = on_site", "progress moves to field_units, not the incident"],
  ["resolved (today)", "resolved", "requires crew_after_proof attachment"],
  ["disputed (today)", "contested", "citizen replied NO / contest flow"],
];

/* ============================ small components ============================ */

function Section({
  id,
  num,
  icon: Icon,
  title,
  blurb,
  children,
}: {
  id: string;
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] font-mono text-sm font-extrabold text-emerald-100 shadow-2xs">
          {num}
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {title}
            <Icon className="h-5 w-5 text-emerald-700/70" />
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{blurb}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Panel({
  title,
  tone = "default",
  children,
}: {
  title?: string;
  tone?: "default" | "risk" | "ok";
  children: React.ReactNode;
}) {
  const border =
    tone === "risk"
      ? "border-amber-200/70 bg-amber-50/40"
      : tone === "ok"
        ? "border-emerald-200/70 bg-emerald-50/40"
        : "border-slate-200/80 bg-white";
  return (
    <div className={`rounded-2xl border p-5 shadow-2xs ${border}`}>
      {title && (
        <h3 className="mb-2.5 text-sm font-extrabold tracking-tight text-slate-900">
          {title}
        </h3>
      )}
      <div className="space-y-2.5 text-[13px] leading-6 text-slate-600">{children}</div>
    </div>
  );
}

function Code({ title, children }: { title: string; children: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xs">
      <figcaption className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono text-[11px] font-bold tracking-wide text-emerald-300">
          {title}
        </span>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-[1.55] text-slate-300">
        {children}
      </pre>
    </figure>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 align-top leading-5 text-slate-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Strong = ({ children }: { children: React.ReactNode }) => (
  <span className="font-bold text-slate-800">{children}</span>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
    {children}
  </code>
);

/* ================================= page =================================== */

export default function BlueprintPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6">
      {/* ------------------------------- Hero ------------------------------- */}
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F5132] via-emerald-800 to-emerald-950 p-7 text-white shadow-2xs sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-white/20">
          <ScrollText className="h-3 w-3" />
          Architectural Audit · Storage Blueprint · RBAC · Roadmap
        </span>
        <h1 className="font-heading mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Sada-e-Awam Production Blueprint
          <span className="mt-1 block text-lg font-bold text-emerald-200/80 sm:text-xl">
            منصوبۂ کاروبار — Sialkot Pilot → Production
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/85">
          An honest engineering audit of today&apos;s prototype — where every
          byte actually lives, how it fails under load — and the concrete
          target architecture: PostgreSQL + PostGIS, S3-compatible media,
          WhatsApp-first auth, database-enforced RBAC, and a 12-week roadmap.
          Read-only document: nothing in the codebase was modified to publish it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            "8 core tables",
            "3 storage tiers",
            "4 RBAC roles",
            "3 phases · 12 weeks",
          ].map((s) => (
            <span
              key={s}
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white ring-1 ring-white/15"
            >
              {s}
            </span>
          ))}
        </div>
        <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Blueprint sections">
          {[
            { h: "#audit", l: "1 · Prototype Audit" },
            { h: "#stack", l: "2 · Persistence & Infra" },
            { h: "#media", l: "3 · Media Pipeline" },
            { h: "#rbac", l: "4 · Auth & RBAC" },
            { h: "#personas", l: "5 · Personas" },
            { h: "#engines", l: "6 · Civic Engines" },
            { h: "#roadmap", l: "7 · Roadmap" },
          ].map((t) => (
            <a
              key={t.h}
              href={t.h}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-emerald-50 transition-colors duration-150 hover:bg-white/20"
            >
              {t.l}
            </a>
          ))}
        </nav>
      </header>

      <div className="mt-14 space-y-16">
        {/* ================================================================ */}
        {/* 1. AUDIT                                                         */}
        {/* ================================================================ */}
        <Section
          id="audit"
          num="01"
          icon={AlertTriangle}
          title="Current Prototype Audit & Immediate Bottlenecks"
          blurb="Ground truth of the running pilot: every piece of state, where it physically lives, and the exact way it breaks at scale."
        >
          <Table
            head={["Concern", "Where it actually lives today", "Hard limit / risk"]}
            rows={AUDIT_ROWS.map(([a, b, c]) => [
              <Strong key="a">{a}</Strong>,
              b,
              <span key="c" className="text-amber-800">
                {c}
              </span>,
            ])}
          />

          <Panel title="Media handling today — the base64 trap" tone="risk">
            <p>
              The report wizard runs every phone photo through a canvas
              downscaler (<Mono>src/lib/imageDataUrl.ts</Mono>) and stores it as
              a base64 <Mono>data:</Mono> URL inside localStorage rows. Three
              consequences: (1) base64 inflates bytes by ~33% against a 5 MB
              localStorage quota — a handful of photo tickets evicts the
              citizen&apos;s entire profile; (2) each data URL is held as a JS
              string and decoded on render, bloating main-thread memory on
              low-end Androids; (3) canvas re-encoding <Strong>destroys all
              EXIF</Strong> — there is no GPS or timestamp left to verify
              anything, and nothing persists to a second device.
            </p>
          </Panel>

          <Panel title="Sessions today — simulated, not secured" tone="risk">
            <p>
              There are no sessions at all: no tokens, no signatures, no
              server-side authorization. The admin console is
              URL-obscure (<Mono>/admin/…</Mono> is public; my own sitemap
              page enumerates every view). Identity — including the
              &ldquo;DG&rdquo; badge — is whatever string sits in{" "}
              <Mono>admin-profile</Mono> in Neon. Every mutating API call is
              anonymous. This is fine for a clickable demo; it is the single
              biggest gap between the demo and anything a government agency
              can touch.
            </p>
          </Panel>

          <Table
            head={["Failure point", "Exact mechanics"]}
            rows={RACES_ROWS.map(([a, b]) => [<Strong key="a">{a}</Strong>, b])}
          />

          <Code title="The lost-update race, concretely — src/app/api/reports/route.ts PATCH path">
            {`// every mutation does this:
const reports = await readReports();          // ← shared snapshot
const index = reports.findIndex(...);          // both dispatchers find #SKT-1042
reports[index] = { ...reports[index], status }; // A: SWMC Crew B
await writeReports(reports);                   // B writes second → A is erased

// No transaction. No version column. No conflict signal. The JSON file is
// the database, the cache and the audit log — all three fail together.`}
          </Code>
        </Section>

        {/* ================================================================ */}
        {/* 2. PERSISTENCE & INFRASTRUCTURE                                  */}
        {/* ================================================================ */}
        <Section
          id="stack"
          num="02"
          icon={Database}
          title="Production Persistence & Infrastructure Architecture"
          blurb="A budget-conscious stack sized for Pakistani civic traffic: high mobile share, patchy connectivity, government-grade auditability."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Managed stack (recommended)">
              <p>
                <Strong>Vercel</Strong> (Next.js app + route handlers) ·{" "}
                <Strong>Supabase or Neon</Strong> PostgreSQL 16 + PostGIS ·{" "}
                <Strong>Upstash Redis</Strong> (per-request billing, no idle
                cost) · <Strong>Cloudflare R2</Strong> (zero egress fees —
                citizens&apos; photo traffic is the biggest bandwidth line item)
                · <Strong>Supabase Realtime</Strong> or Pusher for WebSocket
                pushes. Pilot-month estimate: under $50/month combined at
                free/entry tiers.
              </p>
            </Panel>
            <Panel title="Why PostGIS is non-negotiable for Sialkot">
              <p>
                Three production queries are spatial, not relational: (1){" "}
                <Strong>Jurisdiction containment</Strong> — a pin near the
                cantonment line must resolve to MCS *or* Sialkot Cantonment
                Board via <Mono>ST_Contains(boundary_geom, pin)</Mono> on
                polygons, never by string-matching area names; (2){" "}
                <Strong>Reverse geofencing</Strong> — GPS → locality/zone for
                routing and Urdu addressing; (3) <Strong>Crew proximity</Strong>
                — “nearest idle squad within 2 km” is one{" "}
                <Mono>ST_DWithin(geom, unit_geom, 2000)</Mono> with a GIST
                index. Plain SQL would need full-table scans of hand-computed
                distances; PostGIS makes them index-backed millisecond queries.
              </p>
            </Panel>
          </div>

          <Code title="DDL — extensions, enums">{SQL_EXTENSIONS}</Code>
          <Code title="DDL — agencies, categories & territory hierarchy">{SQL_TERRITORY}</Code>
          <Code title="DDL — users & admin profiles">{SQL_USERS}</Code>
          <Code title="DDL — incidents (ledger)">{SQL_INCIDENTS}</Code>
          <Code title="DDL — attachments, field units">{SQL_ATTACHMENTS}</Code>
          <Code title="DDL — immutable audit log + auto-journal trigger">{SQL_AUDIT}</Code>

          <Panel title="Prisma note">
            <p>
              Prisma has no native PostGIS column type — model{" "}
              <Mono>geom</Mono> as <Mono>Unsupported(&quot;geography(Point,4326)&quot;)</Mono>{" "}
              and keep spatial writes/reads in raw SQL (
              <Mono>$queryRaw</Mono>). Many teams run plain SQL migrations
              (dbmate/sqitch) for the geo layer and Prisma for everything else.
            </p>
          </Panel>

          <Code title="Race-condition kill: atomic dispatch in one transaction">{SQL_RACES}</Code>

          <Panel title="Caching & realtime layer (Upstash Redis + Supabase Realtime)">
            <Table
              head={["Concern", "Redis structure", "Policy"]}
              rows={REDIS_ROWS.map(([a, b, c]) => [<Strong key="a">{a}</Strong>, <code key="b" className="font-mono text-[11px]">{b}</code>, c])}
            />
            <p className="pt-1">
              <Strong>Realtime:</Strong> a Postgres→Realtime subscription on{" "}
              <Mono>incidents</Mono> drives the /track dossier and the triage
              desk without refreshes; SSE is the fallback for locked-down
              corporate networks. The browser never polls the ledger again.
            </p>
          </Panel>

          <Panel title="Status model: current → target" tone="ok">
            <Table
              head={["Prototype status", "Production enum", "Why it splits"]}
              rows={STATUS_MAP.map(([a, b, c]) => [
                <Mono key="a">{a}</Mono>,
                <Strong key="b">{b}</Strong>,
                c,
              ])}
            />
          </Panel>
        </Section>

        {/* ================================================================ */}
        {/* 3. MEDIA PIPELINE                                                */}
        {/* ================================================================ */}
        <Section
          id="media"
          num="03"
          icon={Camera}
          title="Media Storage & Image Processing Pipeline"
          blurb="Citizen photos are evidence. They must live in object storage, never in a database row, and never as base64 in a browser quota."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Panel title="Bucket: /raw-uploads/">
              <p>Temporary staging. 24-hour lifecycle rule deletes orphans that never got confirmed. Never publicly readable.</p>
            </Panel>
            <Panel title="Bucket: /incidents/citizen/">
              <p>Public evidence (derived WebP variants only). Served via Cloudflare CDN with immutable cache headers.</p>
            </Panel>
            <Panel title="Bucket: /incidents/proofs/">
              <p>Field-crew before/after resolution photos — the output of the /track dossier and dispatch drawer.</p>
            </Panel>
          </div>

          <Panel title="Secure upload flow — zero server bottleneck">
            <ol className="ml-4 list-decimal space-y-1.5">
              <li>
                <Strong>Presign:</Strong> client calls{" "}
                <Mono>/api/uploads/presign</Mono> with ticket context; the
                route verifies the JWT session, the ticket state machine, MIME
                allow-list and size cap.
              </li>
              <li>
                <Strong>Direct PUT:</Strong> the phone uploads the raw camera
                file straight to R2 with a 60-second signed URL — no photo
                bytes ever touch the Next.js server or its bandwidth bill.
              </li>
              <li>
                <Strong>Confirm/webhook:</Strong> R2 event or client confirm
                creates the <Mono>incident_attachments</Mono> row and enqueues
                processing.
              </li>
              <li>
                <Strong>Process:</Strong> a worker extracts EXIF, verifies
                geotag, scrubs metadata, generates variants, writes{" "}
                <Mono>image_phash</Mono> for the fraud engine.
              </li>
            </ol>
          </Panel>

          <Code title="Pre-signed upload contract">{CODE_PRESIGN}</Code>

          <div className="grid gap-4 sm:grid-cols-3">
            <Panel title="EXIF geotag verification">
              <p>
                Worker reads <Mono>exif_lat/lng</Mono> +{" "}
                <Mono>captured_at</Mono> (exifr/sharp) and compares against
                the reported device GPS: Haversine delta ≤{" "}
                <Strong>250 m</Strong> sets{" "}
                <Mono>is_geotag_verified = true</Mono>; larger deltas flag the
                ticket for the Fraud Sentinel rather than rejecting outright
                (device GPS can be noisy in bazaars).
              </p>
            </Panel>
            <Panel title="Privacy scrubbing">
              <p>
                Re-encode strips camera serial, owner name, phone model and
                precise capture GPS before anything is public. The public sees
                only derived variants — the raw upload is retained privately
                purely as evidentiary original.
              </p>
            </Panel>
            <Panel title="Variants & CDN">
              <p>
                <Mono>thumb</Mono> 120×120 WebP (triage rows) ·{" "}
                <Mono>card</Mono> 600×400 WebP (feed/track cards) ·{" "}
                <Mono>full</Mono> 1200px WebP q85 (audit drawer). Served with
                immutable, content-hashed URLs from R2+Cloudflare — egress is
                free, so a viral feed month doesn&apos;t hurt.
              </p>
            </Panel>
          </div>
        </Section>

        {/* ================================================================ */}
        {/* 4. AUTH & RBAC                                                   */}
        {/* ================================================================ */}
        <Section
          id="rbac"
          num="04"
          icon={KeyRound}
          title="Authentication, Access Control & Data Isolation"
          blurb="Citizens get zero-friction phone OTP; officials get hardened email+TOTP. Authorization is enforced by the database, not by hiding buttons."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Citizens — passwordless WhatsApp/SMS OTP">
              <p>
                <Mono>POST /api/auth/otp/request</Mono> (rate-limited in Redis)
                → 6-digit code over WhatsApp Business API with SMS fallback
                (Jazz/Zong gateway or Twilio). Verify → JWT access token +
                30-day rotating refresh, both in{" "}
                <Strong>HTTP-only, Secure, SameSite=Lax cookies</Strong>. No
                passwords ever exist for citizens — the phone number is the
                identity, E.164-normalized.
              </p>
            </Panel>
            <Panel title="Officials — email + TOTP 2FA">
              <p>
                Admins and field crews authenticate with email + Argon2id
                password + mandatory TOTP (authenticator app). Registration is
                invite-only with government-domain allow-lists;{" "}
                <Mono>admin_profiles</Mono> binds each account to an agency,
                badge number, clearance grade and optional jurisdiction
                polygon. Sessions are short-lived (8h) with refresh.
              </p>
            </Panel>
          </div>

          <Panel title="RBAC matrix">
            <Table
              head={["Capability", "Citizen", "Field Crew", "SDO / Dispatcher", "DG / Admin"]}
              rows={RBAC_MATRIX.map((r) => [
                <Strong key="c">{r.capability}</Strong>,
                ...r.perms.map((p, i) => (
                  <span
                    key={i}
                    className={
                      p
                        ? "font-bold text-emerald-700"
                        : "text-slate-300"
                    }
                  >
                    {p ? "● allowed" : "—"}
                  </span>
                )),
              ])}
            />
          </Panel>

          <Code title="Row-Level Security — agency isolation enforced by Postgres">{SQL_RLS}</Code>

          <Panel title="Server-side route guards (Next.js middleware)">
            <p>
              Middleware verifies the JWT on every{" "}
              <Mono>/admin/*</Mono> request and every mutating{" "}
              <Mono>/api/*</Mono> route (401 anonymous, 403 wrong-role){" "}
              <Strong>before</Strong> any view or handler executes. URL
              manipulation like <Mono>/admin/settings</Mono> becomes harmless:
              the page renders, the data layer refuses. RLS is the backstop —
              even an application bug cannot leak another agency&apos;s
              tickets.
            </p>
          </Panel>
        </Section>

        {/* ================================================================ */}
        {/* 5. PERSONAS                                                      */}
        {/* ================================================================ */}
        <Section
          id="personas"
          num="05"
          icon={Users}
          title="User Personas & End-to-End Journeys"
          blurb="Three archetypes the upgraded architecture must serve — mapped table-by-table onto what was designed above."
        >
          <div className="space-y-5">
            {PERSONAS.map((p) => {
              const Icon = p.icon;
              return (
                <article
                  key={p.tag}
                  className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${p.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                        {p.tag}
                      </p>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {p.name}
                        <span className="ml-2 text-xs font-semibold text-slate-500">
                          — {p.role}
                        </span>
                      </h3>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] italic leading-6 text-slate-500">
                    {p.profile}
                  </p>
                  <ol className="mt-4 space-y-2.5">
                    {p.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-extrabold text-slate-600">
                          {i + 1}
                        </span>
                        <span className="min-w-0 text-[13px] leading-6 text-slate-600">
                          {s}
                        </span>
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
          </div>
        </Section>

        {/* ================================================================ */}
        {/* 6. CIVIC ENGINES                                                 */}
        {/* ================================================================ */}
        <Section
          id="engines"
          num="06"
          icon={Workflow}
          title="Civic-Tech Integrations & Advanced Capabilities"
          blurb="The three engines that turn a complaint box into an accountability system: fraud detection, offline field ops, and WhatsApp feedback loops."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Fraud Sentinel & image anti-spam">
              <p>
                <Strong>Perceptual hash (pHash):</Strong> every submission gets
                a 64-bit hash stored on the incident row + a 30-day Redis ring.
                Hamming distance ≤ 10 against recent submissions = recycled
                image → auto-flag, not auto-reject (citizens legitimately
                re-report). <Strong>Geofence check:</Strong> EXIF↔GPS delta
                over 250 m flags re-parked complaints.{" "}
                <Strong>Weighted upvotes:</Strong> vote weight scales with
                civic level (verified Level-2 Mohallah Guard ≈ 3× an
                unverified account); crossing a weighted threshold in 6 h
                auto-escalates urgency and shortens SLA.
              </p>
            </Panel>
            <Panel title="PWA & offline field mode">
              <p>
                Workbox service worker: app shell precached; ticket dossiers
                cached stale-while-revalidate for the dead zones in Sialkot&apos;s
                bazaar alleys. Crew completions and proof photos queue in{" "}
                <Strong>IndexedDB outbox</Strong> and flush via the{" "}
                <Strong>Background Sync API</Strong> when 4G returns, with
                retry/backoff; server conflicts (409 — job already closed) turn
                into a friendly re-sync, never data loss.
              </p>
            </Panel>
            <Panel title="WhatsApp Business API & SMS">
              <p>
                <Strong>Outbound:</Strong> status transitions fire approved
                Urdu templates — Ticket Logged → Crew Dispatched (crew name +
                ETA) → Resolved with Proof (after-photo attachment).{" "}
                <Strong>Inbound:</Strong> citizen replies YES / NO to the
                resolution message; the webhook closes the ticket or flips it
                to <Mono>contested</Mono> and notifies the SDO. Opt-in is
                captured at first report; SMS fallback covers non-WhatsApp
                handsets.
              </p>
            </Panel>
          </div>
        </Section>

        {/* ================================================================ */}
        {/* 7. ROADMAP                                                       */}
        {/* ================================================================ */}
        <Section
          id="roadmap"
          num="07"
          icon={MapPinned}
          title="Tactical 3-Phase Implementation Roadmap"
          blurb="Twelve weeks from prototype to a defensible, multi-city production platform. Each phase has a hard exit criterion."
        >
          <div className="space-y-5">
            {PHASES.map((p) => (
              <article
                key={p.tag}
                className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-extrabold ring-1 ${p.tone}`}
                  >
                    {p.tag}
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {p.title}
                  </h3>
                  <span className="ml-auto font-mono text-xs font-bold text-slate-400">
                    {p.weeks}
                  </span>
                </div>
                <ul className="mt-4 space-y-2">
                  {p.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="min-w-0 text-[13px] leading-6 text-slate-600">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-100">
                  <span className="font-extrabold text-emerald-800">
                    Exit criterion —{" "}
                  </span>
                  {p.exit}
                </p>
              </article>
            ))}
          </div>

          <Panel tone="ok" title="Closing note from the audit">
            <p>
              The prototype&apos;s fundamentals — the ledger-backed dispatch
              flow, the SLA/timeline dossier design, the dirty-state save docks,
              the bilingual UX system — are the right bones. Nothing above
              throws them away; it re-hosts them on infrastructure that can
              survive 1,000 simultaneous citizens, a government audit, and a
              phone dropped in the Ravi flood channel.
            </p>
          </Panel>
        </Section>
      </div>

      <p className="mt-14 text-center text-[11px] font-medium text-slate-400">
        /blueprint · architectural audit & production roadmap · generated
        read-only from the actual codebase · Sada-e-Awam Phase-1 Sialkot Pilot
      </p>
    </div>
  );
}
