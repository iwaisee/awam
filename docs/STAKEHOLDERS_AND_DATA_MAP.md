# Sada-e-Awam — Stakeholders, User Journeys, Flows & Data Mapping

> Companion doc to `DESIGN.md`. Written from a full read of the codebase (2026-09-21).
> Every claim below is traceable to source; file:line references are included throughout.

**Status legend used throughout:** 🟢 real (SQLite-backed via API) · 🟡 partial (real + mock mix) · 🔴 mock/demo (hardcoded, no persistence)

---

## 1. Stakeholders

| # | Stakeholder | Role in system | Where they live in code | Access today |
|---|-------------|----------------|------------------------|--------------|
| S1 | **Citizen (reporter)** | Files civic issues, tracks them, upvotes others' reports, disputes resolutions, builds civic reputation | `/report`, `/feed`, `/track`, `/settings`, `/my-reports`, `/auth` — `src/app/(public)/` | 🟡 "Auth" is client-only demo (`UnifiedCitizenAuth.tsx:39,283` writes `sada_auth_session` to localStorage). Role hard-pinned `role: "citizen"` (`UserContext.tsx:277`, `civic.ts:425`) |
| S2 | **Admin / Municipal operator** | Triages the ledger, reroutes agencies, sets urgency, manages territories, departments, categories, users, system settings | `/admin/*` — `src/app/(console)/admin/` (9 views) | 🔴 **No server-side gate at all.** No `middleware.ts`; admin layout is a plain client component. Anyone who knows the URL has full control |
| S3 | **Field squad officer** | Claims and resolves assigned work orders on-site; uploads after-photo, notes, materials as proof | `/squad` — `SquadSessionGate` → `SquadPortal` | 🟡 PIN verified server-side (`squadAccess.ts:65-125`, timing-safe + 5-fail/60s lockout) but **no token returned**; session is a **global singleton** in `appstate.db` (`squadPortal.ts:16`) — first bind wins for every browser |
| S4 | **Agency / Department / Division** (organizational, not a login) | The receiving hierarchy: Sector → Agency → Division → Squad. Target of dispatch and routing | Registry tree in `departments.db`; edited via `DepartmentManager.tsx` (4,326 lines) | n/a — data entity, not a user |
| S5 | **Public visitor (anonymous)** | Browses landing page, live feed, department directory, sitemap/blueprint docs without reporting | `/`, `/feed`, `/departments`, `/portal` 🔴, `/sitemap`, `/blueprint`, `/flow` | 🟢 Read-only via `GET /api/reports` (returns **all PII** — names/phones — to anyone) |
| S6 | **Platform developer / maintainer** | Operates the app; dev-only registry reset endpoint | `/api/departments` DELETE (dev-only, `departments/route.ts:59-68`) | Local filesystem + SQLite |
| S7 | **Citizen standing overseer** (admin sub-role) | Adjusts citizen badges, score modifiers, blacklist | `/admin/users` → `PATCH /api/citizens` | 🟡 Same ungated admin surface |

> Type-level roles: `UserRole = "citizen" | "field_supervisor" | "admin"` (`src/types/civic.ts:400`), with `OperationalRole = admin | field_supervisor` gating dispatch suites **in the UI only** — never enforced server-side.

---

## 2. User Journeys

### J1 — Citizen: "I see a problem and make it the government's problem" 🟢

The golden path, and the only fully real end-to-end flow in the app.

1. **Discover entry point** — Landing page (`/`) with city detector + "Report an issue" CTA; or direct entry via `/report`.
2. **Locate** (Wizard Step 0, `StepLocation`) — province → city → town → area cascades (from `CoverageContext`) + free-text landmark. Coordinates may be attached.
3. **Classify** (Step 1, `StepCategory`) — category cards filtered to the selected jurisdiction (`resolveVisibleCategories`); up to 3 quick-issue tags.
4. **Document** (Step 2, `StepEvidence`) — title, description, severity (`routine | high | emergency` → P3/P2/P1), up to N photos (first photo downscaled to a data URL).
5. **Review & submit** (Step 3, `StepReview`) — anonymous toggle, phone number → `POST /api/reports` (`WizardShell.tsx:147`, `reportSubmit.ts:45`).
6. **System commits instantly** — ticket `#SKT-####` minted (`reports/route.ts:44-53`), SLA deadline computed, status `triage`, and **a squad auto-assigned on the spot** by scoring registry squads: ward match ×100, agency match ×30, on-duty ×10, busy-load +10 (`dispatchAssign.ts:22-`).
7. **Confirm** (Step 4, `StepConfirmation`) — citizen gets the tracking token.
8. **Track** — `/track` with token or phone: a 5-step municipal dossier **synthesized purely from the ledger timestamps** (`trackDossiers.ts:225-346`), never a separate store. Status labels: In Triage → Crew Dispatched → Work In Progress → Resolved (Verified) → Under Citizen Dispute (`trackDossiers.ts:206-213`).
9. **Engage socially** — upvote peers' reports on `/feed` (session-only ⚠️) or `/track` (persisted via PATCH ✅ — inconsistent).
10. **Reputation accrues** — `civic_score = 20·resolved − 15·disputed + admin modifier`, derived on read, grouped by phone (`citizenProfiles.ts:116-162`). Levels surface as "Level N {title}" ("Awaam Champion", etc.).

**Emotional arc:** urgency → guided ease → trust (instant ticket + SLA) → transparency (live dossier) → civic pride (score/badge).

### J2 — Admin: "Keep the ledger honest and moving" 🟢 (auth 🔴)

1. Open `/admin` → `OverviewView`: live KPI tiles + registry grid (`GovernmentServicesCard`); report-count badge polls `/api/reports` every 60s (`admin/layout.tsx:212-235`).
2. `/admin/triage` (`TriageView`): filterable ledger table → PATCH status (`dispatched` stamps `dispatched_at`, may auto-pick a crew — `reports/route.ts:131-145`), reroute `assigned_agency`, escalate urgency, upvote. Charts in `TriageCharts`.
3. `/admin/field-gateway` (`FieldGatewayView`, 2,342 lines): dispatch + squads tabs; manually assign crews (`assigned_unit`).
4. `/admin/sentinel`: flagged queue — ⚠️ flags are **view-local state**, the queue always starts empty (`SentinelView.tsx:64`).
5. `/admin/users` (`UsersView`): citizen registry from `/api/citizens`; badge override, score modifier, standing, blacklist via `PATCH /api/citizens` → `citizen_admin` table.
6. `/admin/territories/{provinces,cities,zones}` (`TerritoriesView`, 4,207 lines): geographic tree workspace, CSV/JSON import-export (`territoryExport.ts`); URL params carry selection state. ⚠️ SLA telemetry shown here is **fake deterministic hash-seeded data** (`territoryTree.ts:90-107`).
7. `/admin/departments` (`DepartmentManager`): edit Sector→Agency→Division→Squad tree → `PUT /api/departments` (whole JSON document).
8. `/admin/categories`: category rules + jurisdiction visibility CRUD (in `coverage` state). `/admin/settings`: admin profile + system prefs (`useSyncExternalStore` over `/api/state/*`).

### J3 — Field squad officer: "Work my queue, prove it" 🟢

1. Open `/squad` → `SquadSessionGate`: pick a real squad from the registry, enter access code (`^[A-Za-z0-9-]{4,12}$`).
2. `POST /api/squad/session` verifies timing-safely, locks out 5-fail/60s, then **binds the global session** (`squadAccess.ts:65-125`).
3. `SquadPortal`: dual 60s sync of session + ledger; task queue = reports where `assigned_unit` = my squad.
4. Advance `dispatched → in_progress` → **Resolve**: status `resolved` + `after_photo_url` + `resolution_notes` + `materials_used` (`SquadPortal` → PATCH; stamping in `reportsDb.ts:283-301`).
5. ⚠️ Codes are issued by anyone via **unauthenticated** `PUT /api/squad/access`; codes stored plaintext.

### J4 — Public visitor: transparency browsing 🟡

`/` landing (⚠️ "3,400+ Issues Logged" hardcoded, `page.tsx:544`) → `/feed` live incidents (🟢 real, from `/api/reports`) → `/departments` directory (🔴 mock `DEPARTMENTS`) → `/portal` + `/portal/[dept]` agency dashboards (🔴 fake stats, in-memory `PORTAL_QUEUE`) → convert to J1.

### J5 — City not covered yet

Landing city detector finds no coverage → **waitlist modal** → `POST /api/waitlist` (`{city, phone}`, dedup by phone+city) → `app_state.waitlist`. ⚠️ Client also keeps a legacy localStorage key `sada_city_waitlist` — two names for one concept.

---

## 3. User Flow Diagrams

### 3.1 Master flow (report lifecycle across stakeholders)

```
CITIZEN                      SYSTEM                        ADMIN                    SQUAD
───────                      ──────                        ─────                    ─────
 /report wizard ──POST──▶ reports.db [status=triage]
                           mint #SKT-####, SLA deadline
                           auto-assign squad ─────────────────────▶ /admin/triage ──PATCH──▶ [dispatched]
                           (dispatchAssign scoring)                  (🔴 no auth)   (reroute/urgency)
                                                                                          │
 /track ◀──dossier synthesized──  timestamps + status ◀───────────────────────────────────┤
 (5-step ladder,                       │                                                   ▼
  trackDossiers.ts)                    ▼                                            /squad queue
                              [in_progress] ◀──PATCH (claim)──────────────────────── SQUAD OFFICER
                                       │                                                   │
                                       ▼                                                   ▼
                              [resolved] ◀──PATCH: after_photo + notes + materials── RESOLVE
                                       │                                        (reopen → triage/dispatched
 /feed upvote ◀──▶ upvotes column      │                                         nulls all proof fields)
                                       ▼
                              [disputed] ◀── citizen dispute
                                       │
                                       ▼
                          civic_score = 20·resolved − 15·disputed ± admin modifier
```

### 3.2 Report wizard (client)

```
Step 0 Location ──▶ Step 1 Category ──▶ Step 2 Evidence ──▶ Step 3 Review ──▶ Step 4 Confirmation
 province           jurisdiction-        title, desc,        anon toggle,      show #SKT-####
 city → town →      filtered cards,      severity,           phone             + token + SLA
 area + landmark    ≤3 tags              ≤N photos                    │
      ▲                                                    POST /api/reports
      └── changing location invalidates                    (buildReportPayload,
          category selection (WizardShell.tsx:84-94)        reportSubmit.ts:45)
```

### 3.3 Squad session flow

```
/squad ─▶ SquadSessionGate: pick squad ─▶ POST /api/squad/session {squadId, pin}
            │  verifySquadAccess (timingSafeEqual, 5-fail/60s lockout)
            ▼
        bindSquadSession → app_state["squad-session"]   ⚠️ GLOBAL singleton
            ▼
        SquadPortal: 60s poll session + ledger → claim / advance / resolve (PATCH /api/reports)
```

---

## 4. Data Mapping

### 4.1 Stores overview

```
CLIENT (browser)                          SERVER (Next.js route handlers)              SQL LITE
────────────────                          ──────────────────────────────              ────────
localStorage keys              fetch +    /api/reports        ─────────────▶  reports.db: reports, citizen_admin
 sada_auth_session      60s     /api/citizens  ─────────────▶  reports.db: citizen_admin
 sada_citizen_profile   poll    /api/departments ─────────────▶ departments.db: registry (1 JSON doc)
 sada_city_waitlist             /api/state/[key] ─────────────▶ appstate.db: app_state KV
 (coverage, registry            /api/waitlist      ─────────────▶ appstate.db (key: waitlist)
  mirrors)                      /api/squad/{access,session} ────▶ appstate.db (squad-access, squad-session)
                                ── all via src/lib/*.ts (node:sqlite DatabaseSync,
                                   globalThis singletons, WAL on reports.db) ──
```

**Connection pattern:** lazy open + `globalThis.__sadaReportsDb / __sadaDepartmentsDb / …` to survive dev hot-reload (`reportsDb.ts:84-90`, `appStateDb.ts:30-35`). No ORM; migrations via runtime `ALTER TABLE` (`ensureSchemaUpgrades`, `reportsDb.ts:62-82`).

### 4.2 Entity map — `reports.db.reports` (the ledger; 26+ columns)

| Column | Meaning | Written by | Read by |
|---|---|---|---|
| `id` (`#SKT-####`), `tracking_token` (UNIQUE) | ticket identity | `insertReport` (`reportsDb.ts:154-`) | wizard confirm, `/track` lookup |
| `city_id/name`, `area_id/name`, `uc_number`, `jurisdiction` | geography | wizard payload | dossier, feed filters, territory KPIs |
| `category_id`, `category_title`, `selected_tags` (JSON) | classification | wizard | `/track`, triage |
| `assigned_agency`, `assigned_unit` | routing | auto-assign / admin PATCH | squad queue filter |
| `sla_deadline`, `urgency` (`routine/high/emergency` = P3/P2/P1) | SLA | server on insert | dossier, triage |
| `title`, `description`, `photo_url` (base64 data URL), `coordinates` (JSON) | evidence | wizard | feed cards, drawer, dossier |
| `citizen_name`, `citizen_phone` | PII (`Anonymous` default) | wizard | `/track` by-phone lookup, profile counters, `GET /api/reports` ⚠️ exposes all to anyone |
| `status` (`triage→dispatched→in_progress→resolved`, `disputed`) | lifecycle | POST/PATCH (`reports/route.ts:131-145`) | everything |
| `created_at`, `dispatched_at`, `resolved_at` | timestamps | stamped in `patchReport` (`reportsDb.ts:283-301`) | dossier 5-step ladder — **the only source of tracking truth** |
| `upvotes` | social | PATCH | feed, score inputs |
| `after_photo_url`, `resolution_notes`, `materials_used` | resolution proof | squad resolve PATCH | dossier verification; **nulled on reopen** |

**State machine:** `triage → dispatched → in_progress → resolved`; `resolved → disputed`; `disputed|resolved → reopened → triage|dispatched` (proof fields nulled). No other transitions validated — PATCH accepts any string status ⚠️.

### 4.3 Entity map — `departments.db.registry` (single JSON document, `id=1`)

```
sectors[]                       (e.g. Municipal Services, Health…)
 └─ agencies[]                  name, code, phone…          ── seeds: src/data/departmentRegistry.ts (1,113 lines)
     └─ divisions[]             municipal desks
         └─ squads[]            id, name, ward/area match, duty flag  ── used by dispatchAssign scoring + squad PINs
```
Read/write: `readRegistry/writeRegistry` (`departmentsDb.ts`). Ownership: `DepartmentManager` UI ↔ `PUT /api/departments` (shallow validation only, `departments/route.ts:14-24`).

### 4.4 Entity map — `appstate.db.app_state` (generic KV, JSON values)

| Key | Shape | Producer / consumer |
|---|---|---|
| `coverage` | cities, provinces, category rules | `CoverageContext.tsx:738-962` — localStorage-first, 500ms debounced PUT to `/api/state/coverage`, 8MB cap |
| `admin-profile` | admin identity/prefs | `adminProfileStore.ts` (`useSyncExternalStore`) |
| `system-prefs` | platform toggles | `SettingsView.tsx:223` |
| `waitlist` | `{city, phone}` entries | `/api/waitlist` |
| `squad-access` | squadId → **plaintext code** | `/api/squad/access` ⚠️ unauthenticated PUT/DELETE |
| `squad-session` | one global bound squad | `/api/squad/session` ⚠️ shared across all browsers |

Whitelist enforced at `state/[key]/route.ts:7`.

### 4.5 Derived (no table) — citizen reputation & dossiers

- **`CitizenProfile`** — derived on read by `deriveCitizenProfiles` (`citizenProfiles.ts:116`): group ledger by phone → `civic_score = 20·resolved − 15·disputed + score_modifier`; overridable via `citizen_admin` (`badge_override`, `standing`, `blacklisted`) (`citizensDb.ts:19-28`).
- **`TrackDossier`** — synthesized per report by `dossierFromReport` (`trackDossiers.ts:225-346`) from timestamps + status only. Includes hardcoded desk directory + fallback phone `052-9250200` (`trackDossiers.ts:128-174,235-240`).
- **Territory SLA telemetry** — fake, hash-seeded deterministic (`territoryTree.ts:90-107`) ⚠️ presented as real data in admin UI.

### 4.6 API → dataflow map

| Route | Methods | Touches | Auth | Notes |
|---|---|---|---|---|
| `/api/reports` | GET/POST/PATCH | reports table | none | GET returns full PII; POST accepts arbitrary city/agency strings ⚠️; `mintToken` uses non-crypto `Math.random` (`reports/route.ts:49`) |
| `/api/departments` | GET/PUT/DELETE | registry doc | none | DELETE dev-only reset |
| `/api/citizens` | GET/PATCH | derived + citizen_admin | none | admin override surface |
| `/api/state/[key]` | GET/PUT | app_state | none | key-whitelisted, 8MB |
| `/api/waitlist` | GET/POST | app_state.waitlist | none | dedup by phone+city |
| `/api/squad/access` | GET/PUT/DELETE | app_state.squad-access | none ⚠️ | anyone can issue/rotate/revoke crew codes |
| `/api/squad/session` | GET/POST/PATCH/DELETE | app_state.squad-session | PIN on POST | lockout is per-process in-memory |

### 4.7 Client state → server mapping

| Client store | Local key | Server sync | File |
|---|---|---|---|
| Coverage (cities/provinces/categories + ~350 hardcoded Sialkot localities, `CoverageContext.tsx:37-359`) | localStorage | `/api/state/coverage`, debounce 500ms, schema-version drops (`:624`, `:744-840`) | `CoverageContext.tsx` |
| Citizen profile | `sada_citizen_profile` (+legacy key migration) | counters re-derived from `GET /api/reports` filtered by phone (`UserContext.tsx:211`) | `UserContext.tsx` |
| Auth session | `sada_auth_session` | **none** — client-only 🔴 | `UnifiedCitizenAuth.tsx:39` |
| Department registry | mirror | `useDepartmentRegistry` 60s poll + `REGISTRY_UPDATED_EVENT` | `registryClient.ts`, `hooks/useDepartmentRegistry.ts:14` |
| Waitlist | `sada_city_waitlist` ⚠️ name diverges from server key | `/api/waitlist` | `cityWaitlist.ts` |
| Admin profile / prefs | localStorage | `/api/state/*` via `useSyncExternalStore` | `adminProfileStore.ts` |
| Feed upvotes | `votedIds` Set (session) ⚠️ | `/track` upvotes DO persist via PATCH — inconsistent | `feed/page.tsx` |

### 4.8 PII inventory (for any future compliance pass)

| Data | Location | Exposure today |
|---|---|---|
| Citizen name + phone | `reports.citizen_name/phone`, base64 photos in same rows | `GET /api/reports` → any visitor |
| Squad access codes | `app_state["squad-access"]`, plaintext | `PUT/DELETE /api/squad/access` unauthenticated |
| Waitlist phone+city | `app_state.waitlist` | `GET /api/waitlist` open |
| Citizen standing/blacklist | `citizen_admin` | `PATCH /api/citizens` open |

---

## 5. Known gaps (journey-relevant)

1. **No authentication/authorization on any server surface** — the stakeholder model (S1/S2/S3) exists in types only (`civic.ts:400-432`).
2. Global squad session singleton breaks multi-squad reality (`squadPortal.ts:16`).
3. Two realities between pages: upvotes, Sentinel flags, portal/departments data, territory telemetry.
4. Oversized client components (`track/page.tsx` 1,595 lines) hold flow logic that arguably belongs in the server layer.
5. Duplicated domain logic: `isValidRegistry`, `agencyMatches`, `spanLabel` (2 impls each), 4 variants of the 60s poll.
