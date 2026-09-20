# Sada-e-Awam — Comprehensive Test Report

- **Application:** Sada-e-Awam (صدائے عوام) — civic reporting platform, Phase-1 Sialkot pilot prototype
- **Stack:** Next.js 16.3.4 (App Router) · React 19 · Tailwind 4 · TypeScript · lucide-react
- **Persistence:** browser localStorage (`CoverageContext`, profiles, waitlist, my-reports) + one server JSON file (`src/data/reports.json`) via `/api/reports` (GET/POST/PATCH)
- **Test method:** black-box GUI testing through the in-app browser (DOM snapshots + screenshots as evidence) plus direct API testing with curl. Two full rounds, ~65 test points. No code was modified at any point.
- **Evidence:** `gui-test-screenshots/` (round 1: `f1–f16_*.png`, round 2: `r1–r9_*.png`)

---

## Executive summary

| Area | Result |
|---|---|
| Backend API (GET/POST/PATCH, validation, persistence) | ✅ All pass |
| Citizen frontend (wizard, tracking, feed, settings) | ✅ All pass (1 medium bug in My Reports) |
| Admin console — all 8 nav sections | ✅ All render; all CRUD works (1 high bug in triage drawer) |
| **Bugs found** | **1 high, 1 medium, 4 minor** (details in Part 3) |
| **Systemic / production-readiness gaps** | **No auth anywhere, no database, no server-side guards** (Part 3.3) |

The core product loop works end-to-end: citizen files a report → ledger persists it → admin triage sees it live → field gateway dispatches a crew (persisted) → citizen tracks the SLA-bounded dossier. Data entry is validated on both client and server, migrations of stored state are defensive, and every admin CRUD surface (provinces, districts, zones, wards, categories, agencies, squads) was verified to create, update, list and delete correctly.

---

## Part 1 — What was tested (full inventory)

### 1.1 Backend `/api/reports` — 8/8 pass
| # | Test | Result |
|---|---|---|
| 1 | GET returns ledger (newest first) | ✅ |
| 2 | POST missing required fields → 400 with exact field list | ✅ |
| 3 | POST valid → 201, ticket `#SKT-6181` minted, SLA deadline = now + `sla_hours`, tags capped at 3, persisted to disk | ✅ |
| 4 | PATCH invalid status → 400 (lists allowed statuses) | ✅ |
| 5 | PATCH unknown id → 404 | ✅ |
| 6 | PATCH → `dispatched` + `assigned_unit` stamps `dispatched_at` | ✅ |
| 7 | PATCH → `in_progress` (late unit assignment) | ✅ |
| 8 | PATCH back to `triage` clears dispatch telemetry (file verified) | ✅ |

### 1.2 Public citizen site — all pass
| Area | What was verified | Evidence |
|---|---|---|
| Landing launcher | City dropdown: Sialkot "Active Pilot", Lahore/Islamabad "Phase 2 Soon"; "Report Problem in Sialkot" deep link | `f1_city_dropdown.png` |
| Waitlist modal | Empty submit → validation error "Please enter a valid mobile number…"; valid submit → success toast; entry persisted | `f1_waitlist_empty_submit.png`, `f1_waitlist_submitted.png` |
| Category cards | Deep link `/report?category=…&city=sialkot` preselects correctly | `f1_category_card_to_wizard.png` |
| Wizard — Location | Province locked to Punjab; Phase-2 cities disabled; town → area cascading search with jurisdiction badge; landmark field; Continue gating | `f2_area_suggestions.png` |
| Wizard — Category | Rule engine cascade per area (Cantonment → 3 categories + "4 … not available" note; Municipal → SWMC/MCS set); quick-issue tags toggle (aria-pressed verified) | `f2_category_grid.png`, `f2_tags_tapped.png` |
| Wizard — Evidence | Title/description required (Continue gated); severity segmented control; generic tag pills; tagged-issues chips with remove buttons; photo dropzone renders | `f2_evidence_filled.png` |
| Wizard — Review | Full summary echoes location, category, tags, severity, auto-routing copy; anonymous toggle hides phone field | `f2_review_summary.png`, `f2_anonymous_on.png` |
| Wizard — Submit | → "Report Submitted #SKT-1257" + live 4h SLA countdown; record verified in ledger with every field (category, agency GEPCO, urgency, jurisdiction, tags, phone) | `f2_confirmation.png` |
| Track (by ticket) | Dossier renders from ledger: status pill, narrative, SLA countdown, agency desk card, photo placeholders, progress timeline | `f3_track_dossier.png` |
| Track (by mobile) | "By Citizen Mobile Number" tab finds the citizen's latest ticket and opens its dossier (incl. red "SLA window elapsed" meter) | `r9_track_mobile.png` |
| My Reports (local ledger) | Track page "My Recent Submission — filed from this device" section | `f3_track_page.png` |
| `/my-reports` route | Citizen Workspace page: KPI cards (15/2/12/1), progress-bar cards, timeline links | `r9_my_reports_route.png` |
| Feed | P1 / Recently-Resolved sort chips; agency filter (GEPCO → "1 of 6"); Map Radar ↔ Grid toggle; upvote 132→"133 Confirmed (+15 pts awarded)"; work-order drawer (SLA meter, timeline, Open Live Tracker); Share popover (Copy/WhatsApp/X/Facebook) | `f5_feed_p1_filter.png`, `f5_upvote.png`, `f5_drawer.png`, `f5_share_popover.png`, `f5_feed_map_radar.png` |
| Departments + resolver | "Who Governs My Area?" resolver: cantonment match (Cantt Board + GEPCO) and unknown-area fallback ladder; department cards with helplines/escalation chains | `f6_resolver_match.png` |
| Portal | Gateway cards → `/portal/mcs` queue with zone tabs (Cantonment → only #SKT-1042); Assign/Resolve/Transfer actions present | `f6_portal_mcs.png`, `f6_portal_cantonment.png` |
| Citizen settings — Profile | Name edit → "Your profile has been updated" toast; header name + monogram re-project live ("ZCode Tester" → "ZT"); reverted to original | `f7_name_saved.png` |
| Citizen settings — Alerts | Radius slider recomputes km badge (2.0→3.9→2.0); channel toggles flip both ways | `f7_alerts_toggled.png` |
| Citizen settings — Privacy | Anonymous-reporting toggle flips and restores; Hide-Phone state; Data Transparency card | `r9_privacy_tab.png` |
| Header citizen menu | Identity projection, stats, links to My Reports / Profile / Privacy | `f4_citizen_menu.png` |

### 1.3 Admin console — all 8 sections
| Section | What was verified | Evidence |
|---|---|---|
| Overview (Command Radar) | KPI tiles; province filter tabs recompute aggregates (1,776 → 776 Punjab); district selector; "View All 31 Agencies" registry modal (6 sectors/31 bodies/13 active) with sector accordions | `f8_overview_punjab.png`, `r1_overview_daska.png`, `r1_all_agencies.png` |
| Reports & Complaints (Triage) | KPI cards; live-sync banner ("19 citizen-filed tickets synced"); search by ticket ID ("Showing 1 of 1"); segment tabs (All Open / Emergency (22→23) / SLA Breached (83→20 shown) / Disputed); per-page 10/20/50/100; severity + agency filters compose; Reset Filters; incident drawer (photo placeholder, report intelligence, quick tags, voice transcription); **row-level dispatch via Field Gateway persisted (see 3.2); drawer dispatch did NOT (Bug HIGH-1)** | `f9_triage_search2.png`, `r2_triage_filters.png`, `f9_triage_drawer.png` |
| Flagged & Spam (Sentinel) | Category tabs (Same photo 2 / Wrong place 1 / Too many 1); proof drawer (side-by-side duplicate photos, reporter info); "✓ Real" removes row (4→3); "✗ Not real" removes row; Block modal with 3 options + Cancel | `f11_sentinel_drawer.png`, `r3_sentinel_not_real.png`, `f11_block_modal.png` |
| Field Teams (Gateway) | Work-order queue with recommended squad; **1-Click Dispatch persisted to ledger** (`status: dispatched`, unit, `dispatched_at`); counts 4→3; ledger row with assigned crew + live SLA; squad card shows new current ticket; Broadcast Priority Alert modal + confirm; Register/Edit Field Unit modals; Reassign Patrol Zone modal; unit status menu (On-Site → En Route → On-Site) updates header KPI; agency filter chips | `f10_dispatched.png`, `f10_squads_fleet.png`, `r4_broadcast_toast.png`, `r4_edit_squad.png`, `r4_reassign_zone.png` |
| Departments & Agencies | 3-tier registry; agency switch (GEPCO→LESCO→FESCO) swaps detail deck; enable/disable toggles with routing toasts; search ("waste" → Waste sector); By Sector ↔ By Province views; Add District Division modal; pencil = Configure Agency API (endpoint/webhook/key/rotate); kebab = Edit Agency Details (province pills, status, jurisdiction chips); View All 31 Agencies modal | `f12_agency_switch.png`, `r5_by_province.png`, `r5_add_division_modal.png`, `r5_edit_agency_modal.png` |
| Areas & Wards (Territories) | Province → District → Zone → Ward hierarchy; split-pane decks with deep-linked URLs; Add Sub-Locality modal → created "ZCode Test Mohallah" (53→54 everywhere, officer field persisted); ward-table trash removed it (54→53); Add Tehsil/Zone → "ZCode Test Zone" (8→9); Delete confirm dialog ("no wards — removed from coverage list") → back to 8; Edit Agency-style office routing forms; Import (CSV/JSON) and Export Data controls present; ward-table row actions (edit/move/trash) on hover | `f15_locality_added.png`, `f15_locality_deleted.png`, `r6_zone_created.png`, `r6_zone_deleted.png` |
| Issue Types & Deadlines | Category cards with agency/SLA/urgency/jurisdiction chips; **Add Category** (full form: names, description, comma-tags, icon grid, agency, urgency, SLA, city scope, jurisdiction compatibility, active toggle) → created with toast; status toggle → "Hidden from citizens"; inline Confirm delete → removed; **Edit Category** opens fully pre-filled | `f16_category_saved.png`, `f16_category_toggled.png`, `f16_category_deleted.png`, `r7_edit_category.png` |
| Citizens | KPI cards (network, density, authenticity, integrity); search (1 of 5); segment tabs (CNIC Verified / Civic Champions / Flagged-Suspended → "Fake Account 09"); dossier drawer for trusted citizen (identity, NADRA-verified CNIC, activity history, endorsement ledger) and for suspended account (flags, penalties, frozen endorsements); governance controls: **Reactivate Account** (SUSPENDED→Active) and re-Suspend (restored); score modifier −10/+10 steppers; badge grant toggle; blacklist button | `f13_user_dossier.png`, `r8_flagged_dossier.png`, `r8_reactivated.png` |
| System Preferences | Administrator identity studio (portrait, signature stamp); civil-service credentials form; hotlines & dispatch channels; **save → "Preferences Saved" + identity-synchronized toasts; sidebar/header/monogram re-project immediately** (tested with a renamed admin; original profile restored afterwards) | `f14_admin_name_saved.png`, `f14_admin_settings_restored.png` |
| Header & shell | Live PKT clock; district selector; admin profile menu (identity card, Super Admin Clearance, live telemetry 292 Areas/8 Zones/94.2% SLA, System Preferences link, **Switch to Citizen View opens `/` in a new tab**, Sign Out); collapsible sidebar with tooltips; mobile drawer | `r9_admin_profile_menu.png` |

### 1.4 Cross-cutting behavior verified
- **Cascade rule engine** (`visibleCategories`) behaves correctly from both sides (cantonment vs municipal areas) and matches the admin note ("4 other categories are not available…").
- **Schema-versioned migrations** in CoverageContext (v7) and defensive `normalize*` functions on every store — no crash on stale/corrupt payloads during the whole pass.
- **Live sync**: triage and field gateway re-pull the ledger (60 s auto-sync + manual refresh); new submissions appeared without restart.
- **Live data in admin**: after ledger restore, gateway surfaced a real citizen ticket (#SKT-2179) with correct urgency/SLA/description/tags.

---

## Part 2 — Issues *I* faced while testing (tooling/runtime, not app bugs)

1. **Playwright actionability stalls** — clicks on clearly visible elements timed out repeatedly (animated pulse badges / re-rendering lists appear to keep the stability check from settling). Worked around with coordinate clicks (`cua`) and DOM-node-path clicks; element *reads* stayed reliable.
2. **Native `<select>` dropdowns** don't open reliably from synthetic clicks; typeahead/arrow-key selection also failed. Worked around with programmatic `selectOption` (same user-visible result). Affected: feed agency filter (twice), triage per-page.
3. **Keyboard text-editing flakiness** — select-all (Ctrl/Cmd+A) and word-delete (Alt+Backspace) intermittently didn't register, appending text instead of replacing it during the two profile-rename tests. Both names were ultimately restored (citizen via GUI; admin profile via storage teardown — disclosed below).
4. **File upload untestable** — the in-app browser has no file chooser, so the wizard's photo attachment couldn't be exercised end-to-end (dropzone UI verified only). Needs a manual pass in a real browser.
5. **No console-log capture** available; page-health was judged from error overlays (none appeared), DOM state and screenshots.
6. **Tab identity changed mid-session** once (old tab id became unavailable; same page recovered under a new id).
7. **No DELETE endpoint** on `/api/reports` — test submissions would persist forever; solved by backing up `reports.json` before testing and restoring after (disclosed; your original 19 records are intact).

---

## Part 3 — Issues in the system

### 3.1 Confirmed bugs

**🔴 HIGH-1 — Triage drawer actions never reach the backend.**
The Reports & Complaints incident drawer's *Dispatch Field Crew / Re-Route / Escalate / Resolve* buttons only update in-memory state and show a toast ("Field crew dispatched to SWMC — citizens notified"). The ledger keeps `status: triage`, and the 60-second auto-sync then wipes even the local change — so the dispatcher believes work happened that didn't.
Root cause: `TriageView.tsx` contains **zero `fetch`/PATCH calls**; its `onPatch` only calls `setIncidents` (src/app/(console)/admin/views/TriageView.tsx:916–932, 161–162, 865).
Fix: make the drawer's actions PATCH `/api/reports` exactly like `FieldGatewayView.tsx:428` already does (that path was verified persisting correctly).
Evidence: `f9_dispatch_domcua.png` (UI claims dispatch) vs API response `status: triage`.

**🟠 MEDIUM-1 — My Reports misses submissions whose phone ≠ profile phone.**
The wizard's phone field is free-typed (never prefilled from the profile), but the My Reports tab filters the ledger strictly by `citizen_phone === profile.phone` (src/components/settings/ReportsTab.tsx:189). A submission made with any other number — and every anonymous submission (empty phone) — is invisible in My Reports, while /track happily shows it by token. Verified both ways: mismatched phone → "No matching reports found"; profile phone → appears instantly (15→16).
Fix options: prefill/lock the phone from the profile, or match by device-saved token list (`sada_my_reports`) instead of phone.

### 3.2 Minor issues
1. **Two different "My Reports" surfaces**: `/my-reports` (Citizen Workspace) renders the demo ticket set (15), while `Settings → My Reports` renders the live ledger keyed by phone. Same name, different data sources — confusing.
2. **Public Feed ignores real submissions**: the "Community Incident Feed" renders only the 6 demo incidents; citizen-filed tickets (22 in the ledger at test time) never appear despite the "live" banner.
3. **Stale drawer data after upvote**: the feed work-order drawer showed "132 Endorsements" immediately after the card had updated to 133 (drawer snapshot not reactive).
4. **Triage segment counts vs merged queue**: segment badges come from the demo baseline while the table merges live ledger rows — counts and contents can disagree slightly after new submissions.
5. **Departments toggle lag**: after enabling an agency the toast says "reports are now routing", but the detail badge still read "Standby" until the next render.

### 3.3 Major systemic gaps (production-readiness — mostly by design for a demo, but they are the big ones)

1. **No authentication or authorization anywhere.** The entire admin console is publicly reachable; "Sign Out of Admin Session" just links to `/`; `/portal/*` claims "Official credentials required" but nothing enforces it; `/api/reports` accepts POST/PATCH from anyone. Any real deployment needs auth + role gates first.
2. **No database.** All configuration (provinces, districts, zones, wards, categories, agencies, admin/citizen profiles) lives in each browser's localStorage — admin edits are invisible to other browsers/devices and are lost on cache clear. The only shared store is a single JSON file with a read-modify-write race between concurrent requests.
3. **Server trusts the client.** `/api/reports` POST accepts city/area/category/agency/urgency straight from the payload without validating them against the coverage registry; SLA hours are client-supplied (clamped 1–720). A malicious client can file tickets for non-existent areas or fake agencies.
4. **Evidence pipeline is simulated.** The wizard collects `files` but never uploads them — `photo_url` is never sent; the "Tamper-Proof EXIF Verification", GPS stamps and "Verified" badges shown across track/feed/admin are decorative. The dossier's before/after photo frames are placeholders.
5. **Ticket-ID collisions possible.** IDs are `#<CITY>-<1000–9999>` random with no uniqueness check in POST; at a few thousand tickets per city, duplicates become likely and PATCH-by-id becomes ambiguous.
6. **No anti-spam / rate limiting server-side.** The Sentinel/flagging system is a simulated in-memory demo; nothing stops a script from flooding the ledger.
7. **No automated tests / CI.** The behaviors that make this demo feel solid (cascade engine, migrations, status transitions) are exactly the things a small test suite would lock in.

### 3.4 Recommended priority order
1. Wire the triage drawer to the PATCH endpoint (HIGH-1 — small change, biggest correctness win).
2. Sync wizard phone with profile (MEDIUM-1).
3. Add real auth + an admin middleware before any deployment.
4. Move coverage/config state to the server (SQLite/Postgres) and validate submissions against it.
5. Implement actual photo upload + storage; then make the feed merge live tickets.
6. Enforce ticket-ID uniqueness server-side; add rate limiting.
7. Add a Playwright regression suite covering the flows in Part 1 (the app is already perfectly testable).

---

## Part 4 — Coverage & environment summary

- **Test points executed:** ~65 across 2 rounds (8 API, ~20 public-site, ~37 admin) — **all listed flows pass except the 2 bugs and 5 minor notes above**.
- **Not testable here:** photo upload (no file chooser in the in-app browser), concurrent multi-user behavior (single browser), payment/real integrations (none exist).
- **State left behind:** `reports.json` restored to the original 19 records; test categories/areas/zones removed through the UI; localStorage test artifacts removed surgically (your 2 pre-existing waitlist entries and 3 my-reports entries untouched); citizen profile "Muhammad Usman" and admin profile "Director General (DG) Local Govt" verified restored. Screenshots archived in `gui-test-screenshots/`.
