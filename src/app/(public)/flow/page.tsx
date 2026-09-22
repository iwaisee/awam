import type { Metadata } from "next";
import Link from "next/link";
import {
  Camera,
  ClipboardList,
  Database,
  GitBranch,
  Home,
  ListFilter,
  LogIn,
  MapPinned,
  Navigation,
  Radar,
  Route,
  Search,
  SearchCheck,
  Send,
  Settings,
  ShieldAlert,
  Shuffle,
  ThumbsUp,
  Truck,
  Users,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "User Flow Map | Sada-e-Awam",
};

/* ----------------------------------------------------------------------------
 * Flow — a read-only user-journey map of everything actually built: three
 * lanes (Citizen, Dispatch Supervisor, Executive DG) drawn as
 * clickable flowcharts. Every node deep-links to the real route it
 * represents. Additive page only — no existing file was modified.
 * -------------------------------------------------------------------------- */

type NodeKind = "entry" | "screen" | "decision" | "system";

const KIND_STYLES: Record<
  NodeKind,
  { box: string; title: string; sub: string }
> = {
  entry: {
    box: "bg-emerald-50 ring-1 ring-emerald-200",
    title: "text-emerald-900",
    sub: "text-emerald-800/70",
  },
  screen: {
    box: "bg-white border border-slate-200/80",
    title: "text-slate-900",
    sub: "text-slate-500",
  },
  decision: {
    box: "bg-amber-50 border border-amber-200",
    title: "text-amber-900",
    sub: "text-amber-800/70",
  },
  system: {
    box: "bg-slate-950 border border-slate-800",
    title: "text-emerald-300",
    sub: "text-slate-400",
  },
};

function NodeTag({ tag }: { tag: string }) {
  const tone = tag.startsWith("?") || tag.startsWith("{")
    ? "bg-slate-100 text-slate-500 ring-slate-200"
    : tag === "demo"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-sky-50 text-sky-700 ring-sky-200";
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ring-1 ${tone}`}
    >
      {tag}
    </span>
  );
}

function Node({
  kind = "screen",
  href,
  icon: Icon,
  title,
  sub,
  tags,
}: {
  kind?: NodeKind;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  tags?: string[];
}) {
  const s = KIND_STYLES[kind];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {kind === "decision" && (
            <span aria-hidden className="text-[10px] text-amber-500">
              ◆
            </span>
          )}
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${
              kind === "system"
                ? "text-emerald-400"
                : kind === "decision"
                  ? "text-amber-500"
                  : "text-emerald-700"
            }`}
          />
          <span className={`text-[12.5px] font-extrabold leading-tight ${s.title}`}>
            {title}
          </span>
        </span>
        {tags && tags.length > 0 && (
          <span className="flex shrink-0 flex-wrap justify-end gap-1">
            {tags.map((t) => (
              <NodeTag key={t} tag={t} />
            ))}
          </span>
        )}
      </div>
      {sub && (
        <p className={`mt-1 text-[10.5px] font-medium leading-4 ${s.sub}`}>
          {sub}
        </p>
      )}
    </>
  );
  const cls = `w-full rounded-xl px-3.5 py-2.5 text-left shadow-2xs transition-shadow duration-150 ${
    href ? "hover:shadow-md" : ""
  } ${s.box}`;
  return href ? (
    <Link href={href} className={`block ${cls}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function VArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden>
      <span className="h-4 w-px bg-slate-300" />
      <span className="h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-slate-300" />
      {label && (
        <span className="mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
    </div>
  );
}

function Lane({
  id,
  num,
  icon: Icon,
  title,
  urdu,
  blurb,
  children,
}: {
  id: string;
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  urdu: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] font-mono text-sm font-extrabold text-emerald-100 shadow-2xs">
          {num}
        </span>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-xl font-extrabold tracking-tight text-slate-900">
            {title}
            <span className="text-sm font-bold text-emerald-800/70">{urdu}</span>
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-slate-500">
            {blurb}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center">{children}</div>
    </section>
  );
}

function BranchPair({
  leftLabel,
  rightLabel,
  left,
  right,
}: {
  leftLabel: string;
  rightLabel: string;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="grid w-full gap-4 pt-1 sm:grid-cols-2">
      <div className="flex flex-col items-center">
        <span className="mb-2 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-emerald-800">
          {leftLabel}
        </span>
        <div className="flex w-full max-w-[300px] flex-col items-center">{left}</div>
      </div>
      <div className="flex flex-col items-center">
        <span className="mb-2 rounded-full bg-sky-100 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-sky-800">
          {rightLabel}
        </span>
        <div className="flex w-full max-w-[300px] flex-col items-center">{right}</div>
      </div>
    </div>
  );
}

/* ================================= page =================================== */

export default function FlowPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6">
      {/* ------------------------------- Hero ------------------------------- */}
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F5132] via-emerald-800 to-emerald-950 p-7 text-white shadow-2xs sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-white/20">
          <Workflow className="h-3 w-3" />
          Every journey · Clickable · Grounded in the real build
        </span>
        <h1 className="font-heading mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          User Flow Map
          <span className="mt-1 block text-lg font-bold text-emerald-200/80 sm:text-xl">
            نقشۂ سفر — صارف کا مکمل سفر
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/85">
          How every persona moves through Sada-e-Awam as it is actually built
          today — from a citizen spotting an open manhole to the DG tuning SLA
          policy. Every node is clickable and lands on the real page it
          describes. Dashed-sky tags mark what arrives in Phase 2; amber tags
          flag demo-backed screens.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-bold">
          {[
            { c: "bg-emerald-400/20 text-emerald-100 ring-emerald-300/30", l: "Entry point" },
            { c: "bg-white/10 text-white ring-white/20", l: "Screen / route" },
            { c: "bg-amber-400/20 text-amber-100 ring-amber-300/30", l: "◆ Decision" },
            { c: "bg-slate-900/60 text-emerald-200 ring-slate-500/40", l: "System event" },
          ].map((k) => (
            <span key={k.l} className={`rounded-full px-3 py-1.5 ring-1 ${k.c}`}>
              {k.l}
            </span>
          ))}
        </div>
      </header>

      <div className="mt-14 space-y-16">
        {/* ===================== Lane 1 — Citizen ====================== */}
        <Lane
          id="citizen"
          num="01"
          icon={Users}
          title="Citizen Journey"
          urdu="عوامی سفر"
          blurb="Muhammad Usman, Paris Road — from spotting a hazard to rating the fix. The complete public loop."
        >
          <div className="w-full max-w-[380px]">
            <Node
              kind="entry"
              href="/"
              icon={Home}
              title="Home — the front door"
              sub="Hero · agency-tagged categories · Photo-to-Fixed explainer · Phase-2 city launcher"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[340px]">
            <Node
              kind="decision"
              icon={Shuffle}
              title="Spotted a hazard nearby?"
              sub="Two paths — file it now, or watch the city feed first"
            />
          </div>
          <BranchPair
            leftLabel="Yes — report it"
            rightLabel="No — browse first"
            left={
              <>
                <Node
                  href="/report"
                  icon={ClipboardList}
                  title="/report — filing wizard"
                  sub="Location → Category → Evidence → Review & Submit"
                  tags={["?category=", "?dept=", "?city="]}
                />
                <VArrow />
                <Node
                  icon={Camera}
                  title="Step 3 — Evidence"
                  sub="Phone camera → canvas downscale → inline data URL (R2 pre-signed pipeline arrives in Phase 2)"
                />
                <VArrow />
                <Node
                  kind="system"
                  icon={Database}
                  title="POST /api/reports"
                  sub="Validates payload → status: triage → issues token #SKT-XXXX → stored in the Neon ledger"
                />
                <VArrow label="ticket issued" />
                <Node
                  href="/track?id=SKT-1042"
                  icon={MapPinned}
                  title="Track the ticket"
                  sub="SLA countdown · 5-step timeline · authority card · OSM map · photo evidence"
                  tags={["?id="]}
                />
              </>
            }
            right={
              <>
                <Node
                  href="/feed"
                  icon={Search}
                  title="/feed — community incident feed"
                  sub="Search · city & category filters · Most-Upvoted / Newest / Life-Hazards sorts"
                  tags={["demo"]}
                />
                <VArrow />
                <Node
                  href="/track"
                  icon={SearchCheck}
                  title="Track — lookup hub"
                  sub="By ticket token or citizen mobile · sample chips #SKT-1042 · #SKT-1040 · #SKT-1044"
                />
              </>
            }
          />
          <VArrow label="both paths converge" />
          <div className="w-full max-w-[420px]">
            <Node
              kind="system"
              icon={GitBranch}
              title="Incident state machine — the shared ledger"
              sub="triage → dispatched (assigned_unit + dispatched_at) → in_progress → resolved · disputed — one SQLite row drives every screen"
            />
          </div>
          <VArrow label="dispatch acts (lane 02)" />
          <div className="w-full max-w-[360px]">
            <Node
              href="/track?id=SKT-1042"
              icon={MapPinned}
              title="Live dossier updates"
              sub="Crew name appears, SLA recalculates from dispatch, timeline advances — no refresh needed"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[320px]">
            <Node
              kind="decision"
              icon={Shuffle}
              title="Was the fix done properly?"
              sub="Proof photo is attached at resolution"
            />
          </div>
          <BranchPair
            leftLabel="Yes — confirm"
            rightLabel="No — contest it"
            left={
              <>
                <Node
                  icon={ThumbsUp}
                  title="Upvote & endorse"
                  sub="Community endorsement on the public feed"
                  tags={["demo"]}
                />
              </>
            }
            right={
              <>
                <Node
                  icon={ShieldAlert}
                  title="Contest the fix"
                  sub="status → disputed — the ticket re-enters the agency queue for re-inspection"
                />
              </>
            }
          />
          <VArrow label="meanwhile" />
          <div className="w-full max-w-[380px]">
            <Node
              href="/my-reports"
              icon={ClipboardList}
              title="My Reports — the filing cabinet"
              sub="Every own filing · status filters · progress dots · deep-links into /track timelines"
              tags={["demo"]}
            />
          </div>
        </Lane>

        {/* ===================== Lane 2 — Dispatch ===================== */}
        <Lane
          id="dispatch"
          num="02"
          icon={Truck}
          title="Dispatch Supervisor Journey"
          urdu="ڈسپیچ سپر وائزر"
          blurb="Engr. Tariq Mehmood, SDO — from district queue to 1-Click Dispatch to live fleet control. The console's operational heart."
        >
          <div className="w-full max-w-[380px]">
            <Node
              kind="entry"
              href="/admin"
              icon={LogIn}
              title="/admin — open the console"
              sub="Standalone chrome · sidebar switches views in-page"
              tags={["no session today", "P2"]}
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/overview"
              icon={Radar}
              title="Command Radar — default view"
              sub="District KPI dock · demographics · SLA scorecard · accident blackspots"
              tags={["?nodeId="]}
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/triage"
              icon={ClipboardList}
              title="Live Incident Triage"
              sub="Ledger-backed queue · verify, escalate, hand off to dispatch"
              tags={["live ledger"]}
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[400px]">
            <Node
              href="/admin/field-gateway"
              icon={Truck}
              title="Field Dispatch — Work Orders tab"
              sub="Urgency + SLA badges · smart recommendation: “SWMC Compactor Crew B — 1.2 km away”"
              tags={["live ledger"]}
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[330px]">
            <Node
              kind="decision"
              icon={Shuffle}
              title="Accept the recommended squad?"
              sub="Matching scores agency fit, zone overlap, distance & availability"
            />
          </div>
          <BranchPair
            leftLabel="Yes — fastest path"
            rightLabel="No — pick manually"
            left={
              <Node
                kind="system"
                icon={Send}
                title="1-Click Dispatch"
                sub="Dispatches with the pre-selected recommended unit"
              />
            }
            right={
              <Node
                icon={ListFilter}
                title="Squad combobox"
                sub="Browse all units by agency → Assign to this work order"
              />
            }
          />
          <VArrow />
          <div className="w-full max-w-[420px]">
            <Node
              kind="system"
              icon={Database}
              title="PATCH /api/reports"
              sub="status → dispatched · stamps assigned_unit + dispatched_at · crew claim is atomic in Phase 2 (409 on double-assign)"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              icon={Truck}
              title="Crew status lifecycle"
              sub="Status pill menu on the squad card: idle → en route → on site → off duty"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[360px]">
            <Node
              kind="decision"
              icon={Shuffle}
              title="Wrong crew mid-job?"
              sub="Reassign action on the dispatches table"
            />
          </div>
          <BranchPair
            leftLabel="Yes — requeue"
            rightLabel="No — monitor"
            left={
              <Node
                kind="system"
                icon={Route}
                title="Reassign → back to triage"
                sub="Clears assigned_unit + dispatched_at — ticket re-enters the queue"
              />
            }
            right={
              <>
                <Node
                  href="/admin/field-gateway"
                  icon={ClipboardList}
                  title="Active dispatches table"
                  sub="Live SLA pills · View dossier · Reassign actions"
                />
                <VArrow />
                <Node
                  href="/admin/field-gateway"
                  icon={Truck}
                  title="Mobile Squads & Fleet tab"
                  sub="Register/edit units · crew telemetry · capacity bars · reassign zone · priority broadcast"
                />
              </>
            }
          />
          <VArrow label="one ledger" />
          <div className="w-full max-w-[420px]">
            <Node
              kind="system"
              icon={GitBranch}
              title="Same PATCH → public /track updates"
              sub="Field console, triage table and the citizen dossier all read the single SQLite row"
            />
          </div>
        </Lane>

        {/* ===================== Lane 3 — Executive ==================== */}
        <Lane
          id="executive"
          num="03"
          icon={Users}
          title="Executive DG Journey"
          urdu="نگران ڈائریکٹر جنرل"
          blurb="Director General Local Government — oversight, policy and data governance. Read-first, edit-last."
        >
          <div className="w-full max-w-[380px]">
            <Node
              kind="entry"
              href="/admin/overview"
              icon={Radar}
              title="Command Radar & Demographics"
              sub="Aggregated executive KPI header · district telemetry"
              tags={["?nodeId="]}
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/sentinel"
              icon={ShieldAlert}
              title="Fraud & Spam Sentinel"
              sub="Abuse-signal queue · sidebar badge shows open cases"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/territories"
              icon={MapPinned}
              title="Territories & Coverage"
              sub="City → zone → area editor · persisted to the Neon coverage document"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/categories"
              icon={Settings}
              title="Categories & SLA Rules"
              sub="Taxonomy + SLA hour editor · persisted to the Neon coverage document"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/settings"
              icon={Settings}
              title="System Preferences"
              sub="Admin profile + hotlines · floating dirty-state dock: Discard · Restore defaults · Save"
            />
          </div>
          <VArrow />
          <div className="w-full max-w-[380px]">
            <Node
              href="/admin/users"
              icon={Users}
              title="Citizen Management"
              sub="Console table of citizens · demo datasets today"
              tags={["demo"]}
            />
          </div>
        </Lane>

        {/* ================== Cross-navigation strip ==================== */}
        <section id="hops" className="scroll-mt-24">
          <div className="mb-5 flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] shadow-2xs">
              <Navigation className="h-5 w-5 text-emerald-100" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                How worlds connect
                <span className="ml-2.5 text-sm font-bold text-emerald-800/70">
                  بین لنکس
                </span>
              </h2>
              <p className="mt-1 text-[13px] leading-6 text-slate-500">
                Fixed jumps that carry users between the public site and the
                console.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { l: "Footer Platform column", h: "/", d: "Report · Feed · Departments · Track · Audit log · Sitemap" },
              { l: "Header avatar menu", h: "/settings?tab=reports", d: "My reports · profile · alerts · privacy" },
              { l: "Reference pages", h: "/sitemap", d: "Route directory · this flow map · /blueprint" },
            ].map((x) => (
              <Link
                key={x.l}
                href={x.h}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-colors duration-150 hover:border-emerald-300"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-slate-900">
                    {x.l}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {x.d}
                  </span>
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-400 transition-colors group-hover:text-emerald-700">
                  {x.h}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <p className="mt-14 text-center text-[11px] font-medium text-slate-400">
        /flow · user journey map of the build as it stands · Sada-e-Awam
        Phase-1 Sialkot Pilot
      </p>
    </div>
  );
}
