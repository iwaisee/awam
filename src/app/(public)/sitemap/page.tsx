import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Database,
  Home,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Server,
  TriangleAlert,
  UserRound,
  Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Platform Sitemap | Sada-e-Awam",
};

/* ----------------------------------------------------------------------------
 * Sitemap — an internal developer reference: every route, console view, API
 * method and localStorage store in the Phase-1 Sialkot pilot, annotated with
 * what is wired to the live reports.json ledger and what still runs on demo
 * datasets. Static server component — no client JS.
 * -------------------------------------------------------------------------- */

type Tone = "live" | "demo" | "hybrid";

type RouteEntry = {
  href: string;
  /** Concrete URL to open when `href` is a dynamic route pattern (e.g. /portal/[dept]). */
  exampleHref?: string;
  name: string;
  urdu?: string;
  desc: string;
  tone: Tone;
  toneLabel?: string;
  features: string[];
  params?: string[];
  note?: string;
};

const TONE_STYLES: Record<Tone, { chip: string; dot: string; label: string }> = {
  live: {
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
    label: "Live ledger",
  },
  demo: {
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
    label: "Demo data",
  },
  hybrid: {
    chip: "bg-sky-50 text-sky-800 ring-sky-200",
    dot: "bg-sky-500",
    label: "Hybrid",
  },
};

const PUBLIC_ROUTES: RouteEntry[] = [
  {
    href: "/",
    name: "Home & Pilot Launcher",
    desc: "The pilot's front door — sells the mission, explains the three-step flow and funnels visitors into Report or Track.",
    tone: "hybrid",
    toneLabel: "Showcase + waitlist",
    features: [
      "Six agency-tagged hazard categories that pre-select the wizard",
      "Photo-to-Fixed explainer with a hardcoded showcase strip",
      "Phase-2 waitlist form persisted to sada_city_waitlist",
    ],
  },
  {
    href: "/feed",
    name: "Community Incident Feed",
    urdu: "عوامی شکایات کا لائیو ریکارڈ",
    desc: "Public wall of incidents with search, city & category filters, three sort modes and one-tap upvotes.",
    tone: "demo",
    features: [
      "Severity + status pills on every card",
      "Sorts: Most Upvoted / Newest / Life Hazards",
      "Upvotes are in-memory only — they reset on refresh",
    ],
    note: "Footer deep-links (?status=resolved, ?q=Sialkot) are not consumed by this page yet.",
  },
  {
    href: "/report",
    name: "Report Wizard",
    desc: "Four-step filing flow — Location → Category → Evidence → Review & Submit — that writes straight to the live ledger.",
    tone: "live",
    toneLabel: "Writes ledger",
    params: ["?category=", "?dept=", "?city="],
    features: [
      "Deep-link pre-fill from category cards, agency CTAs and city launcher",
      "Canvas-downscaled photo evidence (localStorage-safe data URLs)",
      "POST /api/reports + sada_my_reports offline cache (max 12)",
    ],
  },
  {
    href: "/track",
    name: "Track Status",
    desc: "Dual-mode lookup — ticket token or citizen mobile number — that resolves into a full resolution dossier.",
    tone: "hybrid",
    toneLabel: "Ledger + demo + cache",
    params: ["?id="],
    features: [
      "SLA countdown meter and five-step progress timeline",
      "Authority card, photographic evidence, OpenStreetMap embed",
      "Resolution order: live ledger → demo dossier → local cache",
    ],
  },
];

const AGENCY_ROUTES: RouteEntry[] = [
  {
    href: "/departments",
    name: "Agencies Directory",
    urdu: "سرکاری محکمے",
    desc: "Who-fixes-what directory of the five pilot agencies with helplines, escalation chains and an area resolver.",
    tone: "demo",
    features: [
      "Jurisdiction resolver: “Who Governs My Area?”",
      "Average response & resolution-rate stats per agency",
      "Per-card CTA deep-links the wizard: /report?dept={key}",
    ],
    note: "Directory keys (incl. cantt-board, ctp) don't map 1:1 to the portal slugs below.",
  },
  {
    href: "/portal",
    name: "Operations Gateway",
    urdu: "بلدیاتی سروس پورٹل",
    desc: "Official-access hub linking every agency verification portal, with a hotline and live stat pill per card.",
    tone: "demo",
    features: ["“Government & Municipal Access Only” badge", "Six agency cards → /portal/{slug}"],
  },
  {
    href: "/portal/[dept]",
    exampleHref: "/portal/mcs",
    name: "Agency Verification Portal",
    desc: "Per-agency triage queue with zone filtering and case actions — the department-facing console.",
    tone: "demo",
    params: ["{dept}"],
    features: [
      "Six prerendered slugs: mcs · swmc · gepco · traffic · mcs-roads · dc-office",
      "Zone filter: Cantonment / City / Villages",
      "Assign / Resolve / Transfer modals (client state only, not persisted)",
      "Unknown slug intentionally renders the 404 page",
    ],
  },
];

const CITIZEN_ROUTES: RouteEntry[] = [
  {
    href: "/settings?tab=reports",
    name: "My Reports",
    desc: "The citizen's filing cabinet inside Account & Settings — every filed report with filters, search and work-order dossiers.",
    tone: "demo",
    features: [
      "Status filters: all / in-progress / resolved / contested",
      "“View Status Timeline” → /track?id={token}",
      "Contest Fix button (UI only — no handler yet)",
    ],
    note: "Renders the live SQLite ledger keyed to the signed-in citizen's phone.",
  },
  {
    href: "/settings",
    name: "Citizen Settings",
    desc: "Civic identity hub with six tabs and the floating Unsaved-Changes dock (discard, save, beforeunload guard).",
    tone: "live",
    toneLabel: "Persisted",
    params: ["?tab="],
    features: [
      "Tabs: reports · profile · alerts · privacy · danger",
      "Profile persisted to sada_citizen_profile via UserContext",
      "Every tab is deep-linkable for the header avatar menu",
    ],
  },
];

type AdminView = { key: string; label: string; desc: string };

const ADMIN_VIEWS: AdminView[] = [
  { key: "overview", label: "Command Radar & Demographics", desc: "District radar, demographics, SLA scorecard and accident blackspots (demo ops datasets)." },
  { key: "triage", label: "Live Incident Triage", desc: "Ledger-backed queue with validated status transitions — dispatching stamps unit + time onto the report." },
  { key: "field-gateway", label: "Field Dispatch", desc: "KPI dock + two sub-tabs (Work Orders / Squads & Fleet) with smart unit matching; dispatches sync triage & /track." },
  { key: "users", label: "Citizen Management", desc: "Console table of citizens backed by the demo console datasets." },
  { key: "territories", label: "Territories & Coverage", desc: "City / zone / area coverage editor persisted to sada_coverage_data (CoverageContext)." },
  { key: "categories", label: "Categories & SLA Rules", desc: "Taxonomy + SLA editor persisted to sada_category_rules." },
  { key: "sentinel", label: "Fraud & Spam Sentinel", desc: "Fraud & abuse signal queue — sidebar badge shows open cases." },
  { key: "settings", label: "System Preferences", desc: "Gear-only view (not in the sidebar nav): admin profile + system prefs with factory defaults." },
];

const API_METHODS = [
  {
    method: "GET",
    cls: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    desc: "Returns the full incident ledger (newest first) — feeds /track, triage and Field Dispatch.",
  },
  {
    method: "POST",
    cls: "bg-sky-100 text-sky-900 ring-sky-200",
    desc: "Validated wizard submission → ticket #CITY-XXXX, status triage, SLA deadline stamped.",
  },
  {
    method: "PATCH",
    cls: "bg-amber-100 text-amber-900 ring-amber-200",
    desc: "Validated status transition by id or tracking token; stamps/clears dispatched_at + assigned_unit.",
  },
];

const LOCAL_STORES = [
  { key: "sada_admin_profile", note: "Admin identity on the console — header chip, profile popover, Settings view." },
  { key: "sada_system_prefs", note: "System Preferences toggles saved from Admin → Settings." },
  { key: "sada_citizen_profile", note: "Citizen identity & preferences (UserContext); migrates legacy sada_citizen_settings." },
  { key: "sada_my_reports", note: "Offline cache of the last 12 wizard filings — /track's fallback source." },
  { key: "sada_city_waitlist", note: "Phase-2 city waitlist signups from the home page." },
  { key: "sada_coverage_data", note: "Cities / zones / areas behind CoverageContext and the Territories editor." },
  { key: "sada_category_rules", note: "Category taxonomy & SLA rule overrides." },
];

const GAPS = [
  {
    title: "Feed deep-links no-op",
    detail: "The footer links /feed?status=resolved and ?q=Sialkot, but the feed page reads no query params — filters stay untouched.",
  },
  {
    title: "My Reports is demo-only",
    detail: "It reads the live SQLite ledger; the wizard's sada_my_reports cache is also read by /track's fallback.",
  },
  {
    title: "Invalid settings tab link",
    detail: "The Citizen Workspace sidebar links /settings?tab=reputation, which is not a valid tab (valid: reports, profile, alerts, privacy, danger) — it silently falls back to profile.",
  },
  {
    title: "Directory ↔ portal mismatch",
    detail: "/departments lists cantt-board & ctp (no portal slugs), while /portal ships traffic, mcs-roads & dc-office (no directory cards).",
  },
  {
    title: "In-memory upvotes",
    detail: "Upvotes on /feed live in component state only — they reset on refresh and are never persisted.",
  },
  {
    title: "Placeholder legal links",
    detail: "Footer's Privacy Policy / Terms of Use / Report Fraud are href=\"#\" stubs.",
  },
];

function StatusChip({ tone, label }: { tone: Tone; label?: string }) {
  const s = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}

function RouteCard({ r }: { r: RouteEntry }) {
  const openHref = r.exampleHref ?? r.href;
  return (
    <article className="group relative flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-colors duration-150 hover:border-emerald-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Link
              href={openHref}
              className="rounded-lg bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-900 transition-colors duration-150 hover:bg-emerald-200"
            >
              {r.href}
            </Link>
            <h3 className="text-sm font-bold text-slate-900">{r.name}</h3>
            {r.urdu && (
              <span className="text-xs font-semibold text-slate-400">{r.urdu}</span>
            )}
            <StatusChip tone={r.tone} label={r.toneLabel} />
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-600">{r.desc}</p>
        </div>
        <Link
          href={openHref}
          aria-label={`Open ${r.href}`}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      {r.params && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {r.params.map((p) => (
            <span
              key={p}
              className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 ring-1 ring-slate-200"
            >
              {p}
            </span>
          ))}
        </div>
      )}
      <ul className="mt-2.5 space-y-1">
        {r.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
            <span className="min-w-0">{f}</span>
          </li>
        ))}
      </ul>
      {r.note && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[11px] font-medium leading-4 text-amber-800 ring-1 ring-amber-100">
          <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
          <span className="min-w-0">{r.note}</span>
        </p>
      )}
    </article>
  );
}

function SectionHead({
  id,
  icon,
  title,
  urdu,
  blurb,
  count,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  urdu: string;
  blurb: string;
  count: number;
}) {
  return (
    <div id={id} className="mb-5 flex scroll-mt-28 items-start gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] text-emerald-100 shadow-2xs">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-lg font-extrabold tracking-tight text-slate-900">
          {title}
          <span className="text-sm font-bold text-emerald-800/70">{urdu}</span>
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-500">{blurb}</p>
      </div>
      <span className="mt-1 shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
        {count}
      </span>
    </div>
  );
}

export default function SitemapPage() {
  const routeCount =
    PUBLIC_ROUTES.length + AGENCY_ROUTES.length + CITIZEN_ROUTES.length + 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      {/* ------------------------------- Hero ------------------------------- */}
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F5132] via-emerald-800 to-emerald-950 p-7 text-white shadow-2xs sm:p-9">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-white/20">
          <ScrollText className="h-3 w-3" />
          Internal Reference · Every route on one page
        </span>
        <h1 className="mt-4 flex flex-wrap items-baseline gap-x-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Platform Sitemap
          <span className="text-lg font-bold text-emerald-200/80 sm:text-xl">
            پلیٹ فارم کا نقشہ
          </span>
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-emerald-50/85">
          What Sada-e-Awam ships today — every public page, console view, API
          method and data store in the Phase-1 Sialkot pilot, annotated with
          what is wired to the live ledger and what still runs on demo data.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { n: routeCount, l: "Pages" },
            { n: ADMIN_VIEWS.length, l: "Console Views" },
            { n: API_METHODS.length, l: "API Methods" },
            { n: LOCAL_STORES.length, l: "Local Stores" },
          ].map((s) => (
            <span
              key={s.l}
              className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white ring-1 ring-white/15"
            >
              <span className="mr-1.5 font-mono text-base font-extrabold text-emerald-200">
                {s.n}
              </span>
              {s.l}
            </span>
          ))}
        </div>
        <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Sitemap sections">
          {[
            { h: "#public", l: "Citizen Experience" },
            { h: "#agencies", l: "Agencies & Portals" },
            { h: "#citizen", l: "Citizen Workspace" },
            { h: "#admin", l: "Admin Console" },
            { h: "#plumbing", l: "Data & Storage" },
            { h: "#gaps", l: "Loose Ends" },
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

      {/* ------------------------ Citizen experience ------------------------ */}
      <section className="mt-12">
        <SectionHead
          id="public"
          icon={<Home className="h-5 w-5" />}
          title="Citizen Experience"
          urdu="عوامی صفحات"
          blurb="The citizen-facing journey: discover the pilot → report a hazard → follow it to resolution."
          count={PUBLIC_ROUTES.length}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {PUBLIC_ROUTES.map((r) => (
            <RouteCard key={r.href} r={r} />
          ))}
        </div>
      </section>

      {/* ------------------------- Agencies & portals ----------------------- */}
      <section className="mt-12">
        <SectionHead
          id="agencies"
          icon={<Building2 className="h-5 w-5" />}
          title="Agencies & Portals"
          urdu="محکمے اور پورٹلز"
          blurb="The informational agency layer plus department-facing portals (demo queues — client state only)."
          count={AGENCY_ROUTES.length}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {AGENCY_ROUTES.map((r) => (
            <RouteCard key={r.href} r={r} />
          ))}
        </div>
      </section>

      {/* -------------------------- Citizen workspace ----------------------- */}
      <section className="mt-12">
        <SectionHead
          id="citizen"
          icon={<UserRound className="h-5 w-5" />}
          title="Citizen Workspace"
          urdu="شہری ورک اسپیس"
          blurb="Both pages share the (citizen) shell — a back-to-home rail with four quick workspace tabs, on top of the public header/footer."
          count={CITIZEN_ROUTES.length}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {CITIZEN_ROUTES.map((r) => (
            <RouteCard key={r.href} r={r} />
          ))}
        </div>
      </section>

      {/* ---------------------------- Admin console ------------------------- */}
      <section className="mt-12">
        <SectionHead
          id="admin"
          icon={<LayoutDashboard className="h-5 w-5" />}
          title="Admin Console"
          urdu="ایڈمن کنسول"
          blurb="Standalone chrome (no public header/footer) at /admin — every section is its own route (/admin/overview, /admin/territories/...) rendered inside a shared sidebar layout."
          count={ADMIN_VIEWS.length}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ADMIN_VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/admin/${v.key}`}
              className="group flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-colors duration-150 hover:border-emerald-300"
            >
              <span className="w-fit rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 transition-colors duration-150 group-hover:bg-emerald-100 group-hover:text-emerald-900">
                ?nodeId={v.key}
              </span>
              <h3 className="mt-2 text-[13px] font-bold leading-5 text-slate-900">
                {v.label}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{v.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* --------------------------- Under the hood ------------------------- */}
      <section className="mt-12">
        <SectionHead
          id="plumbing"
          icon={<Database className="h-5 w-5" />}
          title="Data & Storage"
          urdu="ڈیٹا اور ذخیرہ"
          blurb="One file-backed API, one JSON ledger, and a handful of localStorage stores hold the whole pilot together."
          count={LOCAL_STORES.length}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* API */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                <Server className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-mono text-sm font-bold text-slate-900">/api/reports</h3>
                <p className="text-[11px] font-medium text-slate-400">
                  SQLite at data/reports.db · force-dynamic · nodejs runtime
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {API_METHODS.map((m) => (
                <div key={m.method} className="flex items-start gap-2.5">
                  <span
                    className={`mt-px w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] font-extrabold ring-1 ${m.cls}`}
                  >
                    {m.method}
                  </span>
                  <p className="min-w-0 text-xs leading-5 text-slate-600">{m.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-500 ring-1 ring-slate-100">
              The ledger is the single source of truth: newest-first, capped at
              500 reports, shared by triage, Field Dispatch and /track dossiers.
            </p>
          </div>
          {/* Local stores */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">localStorage stores</h3>
                <p className="text-[11px] font-medium text-slate-400">
                  All preferences & caches are local-only — no accounts, no server profile storage.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {LOCAL_STORES.map((s) => (
                <li key={s.key} className="min-w-0">
                  <code className="font-mono text-[11px] font-bold text-emerald-900">
                    {s.key}
                  </code>
                  <p className="text-xs leading-5 text-slate-500">{s.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Live vs demo */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Wired to the live ledger
            </p>
            <p className="mt-1.5 text-xs leading-5 text-emerald-800/80">
              /report writes · /track reads · Admin Triage & Field Dispatch read + PATCH.
              A dispatch in the console updates the public tracking dossier instantly.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Running on demo datasets
            </p>
            <p className="mt-1.5 text-xs leading-5 text-amber-800/80">
              /feed cards · /settings?tab=reports · portal queues · home showcase · radar,
              sentinel & citizen-management datasets in src/data/operationsData.ts.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------ Loose ends -------------------------- */}
      <section className="mt-12">
        <SectionHead
          id="gaps"
          icon={<Wrench className="h-5 w-5" />}
          title="Loose Ends"
          urdu="باقی کام"
          blurb="Honest wiring notes — small gaps noticed during the route audit. None block the demo flow."
          count={GAPS.length}
        />
        <ol className="grid gap-2.5 md:grid-cols-2">
          {GAPS.map((g, i) => (
            <li
              key={g.title}
              className="flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-amber-50/40 p-3.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-[10px] font-extrabold text-amber-950">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-900">{g.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-amber-800/80">{g.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 text-center text-[11px] font-medium text-slate-400">
        /sitemap · static developer reference generated from the route audit ·
        Sada-e-Awam Phase-1 Sialkot Pilot
      </p>
    </div>
  );
}
