# Command Radar — "#1 Dashboard" Upgrade Plan

**Goal:** Turn `/admin/overview` (Command Radar) into the definitive at-a-glance command center for the Sada-e-Awam pilot: real live data surfaced, trend visuals, an operations funnel, and a live citizen feed — all inside the existing design system (emerald primary, white cards, `rounded-2xl`, Hanken Grotesk headings, pill badges).

## What exists today
`OverviewView.tsx` (1,160 lines) already has: scope bar, 4 KPI cards, district caseload matrix + UC drill-down, hazard heatmap, agency bottlenecks, and a static risk pulse. Citizen-filed reports (`useLiveReports` → `/api/reports`) are only *counted*, never shown. No trend visuals, no funnel, no live feed, no refresh.

## New page structure (top → bottom)
1. **Command bar strip** — greeting + live date, "Phase-1 Pilot · Sialkot Division" badge, last-updated tick, actions: **Refresh** (re-fetches live ledger), **Export CSV** (district intel, UTF-8 BOM — reusing the `territoryExport.ts` Excel-safe pattern), quick jump to Triage.
2. **KPI row (4 cards, upgraded)** — same cards, each now with an inline **SVG sparkline** (7-pt deterministic series) and a colored **delta chip** (▲/▼ vs last week) alongside the existing trend chips and context footers.
3. **14-Day Intake & Resolution trend** (≈2/3 width) + **Live category composition donut** (≈1/3) — both hand-rolled SVG (no new deps): gradient area chart with grid, hover read-out, Filed vs Resolved toggle; donut fed by real live reports + hazard volumes with a legend and % shares.
4. **District Comparative Caseload Matrix** — kept (incl. focus/drill-down + UC panel), polished with per-district trend arrows in the Total column.
5. **Response Pipeline funnel (new)** — Filed → In Triage → Dispatched → In Field → Resolved → Verified: stage bars with counts, % of intake and drop-off conversion, tones matching the status system. Counts derive from the caseload splits + real live statuses.
6. **Hazard heatmap + Departmental bottlenecks** — kept as-is.
7. **Real-Time Risk Pulse (kept) + Live Citizen Feed (new)** — the feed lists actual citizen reports (severity pill, category, area/UC, age, upvotes, status), scoped to the district focus, "NEW" pulse for <15 min items, click-through to `/admin/triage`, graceful empty state. Auto-refresh every 60s.

## Code organization
Split the monolith into `src/components/overview/`: `Sparkline.tsx`, `TrendChart.tsx`, `DonutChart.tsx`, `ResponseFunnel.tsx`, `LiveFeed.tsx`, `CommandBar.tsx` — `OverviewView.tsx` becomes the composer (~500 lines) retaining the district-scope state machine. All synthetic series are **deterministic seeded arrays** (no `Math.random()` → no hydration mismatches). No new dependencies.

## Details that make it #1
- Bilingual accents: Urdu sublabels on section headers via the existing `.urdu` class (design-system requirement).
- A11y: `aria-pressed` toggles, chart `role="img"` + descriptions, focus rings everywhere (matches existing patterns).
- Fully responsive (1-col → 2-col → 4-col), consistent `tabular-nums`/`font-mono` numerics, 4px spacing rhythm.

## Verification
`npm run lint` + `npm run build`, then render the page in the browser and run the visual judge on desktop + a narrow-viewport screenshot before handing back.