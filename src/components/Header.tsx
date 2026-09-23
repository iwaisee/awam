"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCitizenProfile } from "@/context/UserContext";
import { signInHref } from "@/lib/auth/returnPath";
import {
  Megaphone,
  Rss,
  Building2,
  Search,
  Siren,
  ShieldCheck,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  FileText,
  UserCheck,
  EyeOff,
  MapPin,
  CheckCircle2,
  LogOut,
} from "lucide-react";

const NAV_LINKS = [
  { label: "Live Feed", href: "/feed", icon: Rss },
  { label: "Departments", href: "/departments", icon: Building2 },
  { label: "Track Status", href: "/track", icon: Search },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click or Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  const isActive = (href: string) => pathname.startsWith(href);

  // Public session — typed as CitizenProfile (role: "citizen"), so operational
  // routing can never leak into this menu even if items are ever shared.
  const { currentUser, profile, authenticated, hydrated, signOut } =
    useCitizenProfile();

  /** Sign-out revokes the session row server-side, then leaves the account
      view the citizen was on — it is now a page they cannot open. */
  const handleSignOut = async () => {
    setProfileOpen(false);
    setMenuOpen(false);
    await signOut();
    router.replace("/");
  };

  const activeReports = Math.max(
    0,
    currentUser.reports_filed - currentUser.reports_resolved
  );

  // Citizen menu — reports first, then account views; Sign Out stays last.
  const citizenNavItems: {
    label: string;
    href: string;
    icon: typeof FileText;
    badge?: string;
  }[] = [
    {
      label: "My Reports",
      href: "/settings?tab=reports",
      icon: FileText,
      badge: activeReports > 0 ? `${activeReports} Active` : undefined,
    },
    {
      label: "My Profile",
      href: "/settings?tab=profile",
      icon: UserCheck,
    },
    {
      label: "Privacy Settings",
      href: "/settings?tab=privacy",
      icon: EyeOff,
    },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        {/* Left branding */}
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm shadow-emerald-800/20">
            <Megaphone className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold leading-tight text-slate-900">
              Sada-e-Awam
            </span>
            <span className="block text-xs font-medium text-slate-500">
              <span className="urdu">صدائے عوام</span> • Sialkot Pilot
            </span>
          </span>
        </Link>

        {/* Center pill navigation */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 p-1.5 lg:flex"
        >
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-white font-semibold text-emerald-800 shadow-xs"
                    : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right utility cluster */}
        <div className="flex shrink-0 items-center gap-3">
          <a
            href="tel:1122"
            aria-label="Call Rescue 1122"
            className="hidden whitespace-nowrap rounded-full border border-rose-200/60 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors duration-150 hover:bg-rose-100 md:block"
          >
            <Siren className="mr-1 inline h-3.5 w-3.5" />
            🚨 1122
          </a>

          <Link
            href="/report"
            className="hidden whitespace-nowrap rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-800 sm:block"
          >
            Report an Issue
          </Link>

          {/* Toolbar identity is a session question, not a styling one: a
              signed-out visitor gets the way in, never an empty avatar. */}
          {!hydrated ? (
            <span
              aria-hidden
              className="hidden h-11 w-11 rounded-full border border-slate-200 bg-slate-100 sm:block"
            />
          ) : authenticated ? (
            <div className="relative hidden sm:block" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-label="Open citizen profile menu"
              className="flex cursor-pointer items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1.5 pr-3 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            >
              {currentUser.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatar_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-emerald-800/15"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white shadow-xs">
                  {currentUser.avatar_initials}
                </span>
              )}
              <span className="hidden min-w-0 max-w-[170px] leading-tight md:block">
                <span className="flex items-center gap-1 text-[10px] font-semibold leading-none text-emerald-800">
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {currentUser.home_locality}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-slate-900">
                  {currentUser.name}
                </span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                  profileOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Floating dropdown — the citizen's Civic Identity Card */}
            {profileOpen && (
              <div
                role="menu"
                aria-label="Citizen profile"
                className="absolute right-0 z-50 mt-2 w-80 origin-top-right animate-in overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-2 shadow-2xl shadow-slate-900/10"
              >
                {/* A. Identity header */}
                <div className="mb-2 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold leading-tight text-slate-900">
                      {currentUser.name}
                    </p>
                    <ShieldCheck
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                    />
                    <span className="sr-only">Verified citizen</span>
                  </div>
                  <p className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <span className="truncate">
                      {currentUser.home_locality}, {currentUser.district}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      • {currentUser.jurisdiction}
                    </span>
                  </p>
                </div>

                {/* B. Civic impact micro-strip */}
                <div className="mb-2 grid grid-cols-2 gap-1.5 px-1">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <p className="text-xs font-bold text-slate-800">
                      {currentUser.reports_filed} Filed
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {currentUser.reports_resolved} Resolved
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <p className="text-xs font-bold text-emerald-800">
                      {profile.upvotes_received} Endorsements
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Community Trust
                    </p>
                  </div>
                </div>

                {/* C. Citizen navigation */}
                <div className="space-y-0.5 px-1">
                  {citizenNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href + item.label}
                        role="menuitem"
                        href={item.href}
                        onClick={() => setProfileOpen(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-[13px] font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>

                {/* D. Sign out */}
                <div className="mx-2 my-1.5 border-t border-slate-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
            </div>
          ) : (
            <Link
              href={signInHref("/report")}
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50 sm:flex"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Sign In
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            className="rounded-full border border-slate-200 p-2.5 text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      <div
        className={`overflow-hidden border-slate-200/80 transition-all duration-300 lg:hidden ${
          menuOpen ? "max-h-[28rem] border-t" : "max-h-0"
        }`}
      >
        <nav aria-label="Mobile" className="space-y-1 bg-white px-6 py-4">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-white font-semibold text-emerald-800 shadow-xs ring-1 ring-slate-200/60"
                    : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/report"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800"
          >
            Report an Issue
            <ArrowRight className="h-4 w-4" />
          </Link>
          {/* The desktop toolbar's identity control, in its mobile form. */}
          {hydrated && !authenticated ? (
            <Link
              href={signInHref("/report")}
              onClick={() => setMenuOpen(false)}
              className="mt-2 flex items-center justify-center gap-2 rounded-full border-2 border-emerald-700 px-5 py-2.5 text-sm font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-50"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Sign In • <span className="urdu">لاگ ان</span>
            </Link>
          ) : authenticated ? (
            <>
              <Link
                href="/settings?tab=reports"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950"
              >
                <FileText className="h-4 w-4" />
                My Reports
              </Link>
              <Link
                href="/settings?tab=profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950"
              >
                <UserCheck className="h-4 w-4" />
                My Profile
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </>
          ) : null}
          <a
            href="tel:1122"
            className="flex items-center justify-center gap-2 rounded-full border border-rose-200/60 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 transition-colors duration-150 hover:bg-rose-100"
          >
            <Siren className="h-4 w-4" />
            🚨 1122 Emergency
          </a>
        </nav>
      </div>
    </header>
  );
}
