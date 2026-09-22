"use client";

/* Console shell — sidebar navigation (with the nested territory level tree),
   workspace header, and profile menu. Every nav item is a real route now;
   children are the route pages rendered into the workspace area. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  MapPin,
  Tag,
  Menu,
  Settings,
  Sparkles,
  PanelLeft,
  PanelLeftClose,
  Truck,
  Flag,
  Landmark,
} from "lucide-react";
import { getAdminInitials, useAdminProfile } from "@/lib/adminProfileStore";
import { formatInt } from "@/utils/format";
import { ConsoleNavContext, type ConsoleNav } from "./consoleContext";

/* Plain-language navigation dictionary — no ops/military jargon. */
const CONSOLE_NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  divider?: boolean;
}[] = [
  {
    href: "/admin/overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  /* ── Citizen queues ── */
  {
    href: "/admin/triage",
    label: "Reports & Complaints",
    icon: ClipboardList,
    divider: true,
  },
  {
    href: "/admin/sentinel",
    label: "Flagged & Spam",
    icon: Flag,
  },
  /* ── Response workforce ── */
  {
    href: "/admin/field-gateway",
    label: "Field Teams",
    icon: Truck,
    divider: true,
  },
  {
    href: "/admin/departments",
    label: "Departments & Agencies",
    icon: Landmark,
  },
  /* ── Platform registry ── */
  {
    href: "/admin/territories",
    label: "Areas & Wards",
    icon: MapPin,
    divider: true,
  },
  {
    href: "/admin/categories",
    label: "Issue Types & Deadlines",
    icon: Tag,
  },
  {
    href: "/admin/users",
    label: "Citizens",
    icon: Users,
  },
];

/** Stable no-op for the console-nav context contract. */
const noop = () => {};

/** Stable console-nav context value — the decks still call the no-op
    territory callback, so keep the contract alive without owning state. */
const NAV_CONTEXT: ConsoleNav = { onNodeNavigate: noop };

const BADGE_TONES: Record<"amber" | "emerald" | "rose" | "slate", string> = {
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-800",
  rose: "bg-rose-100 text-rose-800",
  slate: "bg-gray-200 text-gray-600",
};

type NavBadge = { text: string; tone: keyof typeof BADGE_TONES };

/** Longest-prefix workspace metadata — drives the header crumb + title. */
const ROUTE_META: { prefix: string; crumb: string; title: string }[] = [
  {
    prefix: "/admin/overview",
    crumb: "Overview",
    title: "Municipal Operations Overview",
  },
  {
    prefix: "/admin/triage",
    crumb: "Reports & Complaints",
    title: "Reports & Complaints",
  },
  {
    prefix: "/admin/field-gateway",
    crumb: "Operations / Field Teams",
    title: "Field Teams & Mobile Dispatch",
  },
  { prefix: "/admin/users", crumb: "Citizens", title: "Citizens Registry" },
  {
    prefix: "/admin/territories/provinces",
    crumb: "Areas & Wards / Provinces",
    title: "Areas & Wards Controls",
  },
  {
    prefix: "/admin/territories/cities",
    crumb: "Areas & Wards / Districts & Cities",
    title: "Areas & Wards Controls",
  },
  {
    prefix: "/admin/territories/zones",
    crumb: "Areas & Wards / Tehsils & Zones",
    title: "Areas & Wards Controls",
  },
  {
    prefix: "/admin/territories",
    crumb: "Areas & Wards",
    title: "Areas & Wards Controls",
  },
  {
    prefix: "/admin/categories",
    crumb: "Issue Types & Deadlines",
    title: "Issue Types & Deadlines",
  },
  {
    prefix: "/admin/departments",
    crumb: "Departments & Agencies",
    title: "Government Department & Team Manager",
  },
  {
    prefix: "/admin/sentinel",
    crumb: "Flagged & Spam",
    title: "Flagged & Spam Review",
  },
  {
    prefix: "/admin/settings",
    crumb: "System Preferences",
    title: "System Preferences",
  },
  {
    prefix: "/admin",
    crumb: "Overview",
    title: "Municipal Operations Overview",
  },
];

function routeMetaFor(pathname: string) {
  return (
    ROUTE_META.find(
      (route) => pathname === route.prefix || pathname.startsWith(route.prefix + "/")
    ) ?? ROUTE_META[ROUTE_META.length - 1]
  );
}

/* --------------------------------- Shell ---------------------------------- */

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [clock, setClock] = useState("");
  const { profile } = useAdminProfile();

  const onTerritoryRoutes = pathname.startsWith("/admin/territories");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-PK", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Desktop rail state only — the mobile drawer always renders expanded.
  const railCollapsed = collapsed && !mobileNavOpen;

  /* Nav chips show ledger counts only — every value here comes from a real
     data source, never a seed. The report ledger (Neon, starts empty) is the
     only one that exists, so only the Reports & Complaints chip ever
     renders, and only while at least one real report is filed.
     The sentinel review queue and the field-unit roster live in view-local
     state with no shared registry yet — no real count exists to show. */
  const [reportCount, setReportCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      fetch("/api/reports", { cache: "no-store" })
        .then((res) =>
          res.ok
            ? res.json()
            : Promise.reject(new Error(`HTTP ${res.status}`))
        )
        .then((data: unknown) => {
          if (!cancelled) setReportCount(Array.isArray(data) ? data.length : 0);
        })
        .catch(() => {
          // Sync failed — keep the last known count rather than blanking a
          // chip that already settled on real data.
        });
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const navBadges = useMemo<Record<string, NavBadge>>(() => {
    const badges: Record<string, NavBadge> = {};
    if (reportCount !== null && reportCount > 0) {
      badges["/admin/triage"] = {
        text: formatInt(reportCount),
        tone: "amber",
      };
    }
    return badges;
  }, [reportCount]);

  const activeMeta = routeMetaFor(pathname);
  const isSettingsRoute = pathname.startsWith("/admin/settings");

  return (
    <ConsoleNavContext.Provider value={NAV_CONTEXT}>
      <div className="flex h-screen overflow-hidden bg-slate-50/70 font-sans">
        {/* Mobile nav overlay */}
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 select-none flex-col overflow-visible border-r border-gray-200 bg-gray-100 text-gray-600 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:sticky lg:top-0 ${
            railCollapsed ? "w-16" : "w-72"
          } ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          {/* Top header: one persistent toggle (never unmounts) + brand that collapses in sync with the rail width */}
          <div className="flex shrink-0 items-center px-3 pb-2 pt-3">
            <span
              aria-hidden
              className={`overflow-hidden transition-[max-width,padding,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                railCollapsed
                  ? "max-w-0 opacity-0"
                  : "max-w-[42px] pr-2.5 opacity-100"
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary p-1.5 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
            </span>
            <span
              className={`min-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight text-gray-900 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                railCollapsed ? "max-w-0 opacity-0" : "max-w-[170px] opacity-100"
              }`}
            >
              Sada-e-Awam
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={railCollapsed ? "Open sidebar" : "Collapse sidebar"}
              className={`ml-auto shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-200/80 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                // Keeps the toggle dead-center in the 64px rail when collapsed.
                railCollapsed ? "mr-1.5" : ""
              }`}
            >
              {railCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Single-stack navigation — row geometry is identical in both states, only labels collapse */}
          <nav
            aria-label="Console"
            className={`flex-1 space-y-1 px-3 pb-4 pt-2 ${
              railCollapsed
                ? "overflow-visible"
                : "overflow-x-hidden overflow-y-auto scroll-smooth"
            }`}
          >
            {CONSOLE_NAV.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/") ||
                (item.href === "/admin/overview" && pathname === "/admin");
              const isDivider = item.divider === true;
              const badge = navBadges[item.href];
                          return (
                <div key={item.href}>
                  {isDivider && (
                    <div
                      aria-hidden
                      className="mx-3 my-2 border-t border-gray-200"
                    />
                  )}
                  <div className="relative">
                    <Link
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      aria-current={active ? "page" : undefined}
                      aria-label={item.label}
                      className={`group relative flex w-full items-center justify-start gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 transition-all duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 ${
                        active
                          ? "bg-white font-bold text-emerald-900 shadow-sm ring-1 ring-gray-200/80"
                          : "text-gray-600 hover:bg-emerald-50 hover:text-emerald-900"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-all duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 ${
                          active
                            ? "text-emerald-700"
                            : "text-gray-400 group-hover:text-emerald-700"
                        } ${railCollapsed ? "-translate-x-px" : ""}`}
                      />
                      <span
                        className={`min-w-0 truncate text-xs transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                          railCollapsed
                            ? "max-w-0 opacity-0"
                            : "max-w-[184px] opacity-100"
                        }`}
                      >
                        {item.label}
                      </span>
                      {badge && (
                        <span
                          className={`ml-auto overflow-hidden whitespace-nowrap rounded-full font-mono text-[10px] font-bold transition-[max-width,padding,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                            BADGE_TONES[badge.tone]
                          } ${
                            railCollapsed
                              ? "max-w-0 px-0 py-0 opacity-0"
                              : "max-w-[110px] px-2 py-0.5 opacity-100"
                          }`}
                        >
                          {badge.text}
                        </span>
                      )}

                      {/* Collapsed hover tooltip */}
                      {railCollapsed && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Bottom utility & profile anchor — the settings gear sits to the right
              of the profile in the expanded sidebar, and stacks below the avatar
              as a compact centered icon in the collapsed rail. */}
          <div className="shrink-0 space-y-1 px-3 pb-6">
            <div
              className={`flex w-full items-center gap-2.5 rounded-xl py-2 transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                railCollapsed ? "justify-center px-0" : "px-2.5"
              }`}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-emerald-600/30"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  {getAdminInitials(profile.fullName)}
                </span>
              )}
              <span
                className={`min-w-0 flex-1 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  railCollapsed ? "hidden" : "opacity-100"
                }`}
              >
                {/* whitespace-nowrap keeps the collapsed (max-w-0) text on one
                    line — wrapping at zero width stacks every word vertically
                    and inflates the collapsed rail row. */}
                <span className="block truncate text-[11px] font-semibold leading-4 text-gray-900">
                  {profile.fullName}
                </span>
                <span className="block truncate text-[10px] font-medium text-primary">
                  {profile.designation}
                </span>
              </span>
              {!railCollapsed && (
                <Link
                  href="/admin/settings"
                  aria-label="System Preferences"
                  aria-current={isSettingsRoute ? "page" : undefined}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 ${
                    isSettingsRoute
                      ? "border-emerald-600/30 bg-white text-emerald-800 shadow-sm"
                      : "border-transparent text-gray-500 hover:bg-emerald-50 hover:text-emerald-800"
                  }`}
                >
                  <Settings className="h-4 w-4" />
                </Link>
              )}
            </div>

            {railCollapsed && (
              <Link
                href="/admin/settings"
                aria-label="System Preferences"
                aria-current={isSettingsRoute ? "page" : undefined}
                className={`group relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 ${
                  isSettingsRoute
                    ? "border-emerald-600/30 bg-white text-emerald-800 shadow-sm"
                    : "border-transparent text-gray-500 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                >
                  System Preferences
                </span>
              </Link>
            )}
          </div>
        </aside>

        {/* Main workspace */}
        <div className="flex h-screen flex-1 flex-col overflow-hidden">
          {/* Workspace header */}
          <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-8 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {/* Below lg the sidebar is a drawer — trigger lives in the header,
                  so no floating pill ever covers page content. */}
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition-colors duration-150 hover:border-emerald-500/50 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Link href="/" className="hover:text-emerald-700">
                    Admin Console
                  </Link>
                  <span aria-hidden>/</span>
                  <span className="font-semibold text-slate-600">
                    {activeMeta.crumb}
                  </span>
                </p>
                <h1 className="font-heading text-lg font-bold leading-snug tracking-tight text-slate-900">
                  {activeMeta.title}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70 sm:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="font-mono">{clock}</span> PKT
              </span>
            </div>
          </header>

          {/* Route page — territories renders a full-bleed split-pane
              workspace with its own internal scroll regions. */}
          <div
            className={
              onTerritoryRoutes
                ? "flex min-h-0 flex-1 overflow-hidden"
                : "flex-1 overflow-y-auto p-8"
            }
          >
            {children}
          </div>
        </div>
      </div>
    </ConsoleNavContext.Provider>
  );
}
