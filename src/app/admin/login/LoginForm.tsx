"use client";

import { useActionState, useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Landmark,
  Loader2,
  Lock,
  Mail,
  Radar,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { adminLoginAction, type AdminLoginState } from "./actions";

/* Tactical command console sign-in — visually and structurally isolated from
   the citizen auth card. Split layout: a branded briefing panel and a focused
   credential form. No shared layout, no shared form components. */

const CONSOLE_FEATURES = [
  {
    icon: Radar,
    title: "Live District Radar",
    body: "Every citizen report streams into one operational picture.",
  },
  {
    icon: Landmark,
    title: "Departmental Dispatch",
    body: "Route complaints to MCS, GEPCO, WASA & SWMC desks with SLA clocks.",
  },
  {
    icon: Fingerprint,
    title: "Verified Resolution",
    body: "Before-and-after photo proof closes the accountability loop.",
  },
];

/** Fine film-grain texture — breaks up the flat darks without any image asset. */
const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

export default function LoginForm({ redirect }: { redirect: string | null }) {
  const [state, formAction, isPending] = useActionState<AdminLoginState, FormData>(
    adminLoginAction,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-PK", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      );
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ── Briefing panel ─────────────────────────────────────────────── */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden border-r border-white/[0.06] p-10 lg:flex xl:p-14">
        {/* Ambient glows */}
        <div
          aria-hidden
          className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/[0.13] blur-[100px]"
        />
        <div
          aria-hidden
          className="absolute -bottom-28 right-10 h-96 w-96 rounded-full bg-teal-400/10 blur-[90px]"
        />
        {/* Dot survey grid, faded at the edges */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:22px_22px] opacity-35 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_78%)]"
        />
        {/* Film grain */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: NOISE_URI }}
        />

        {/* Radar rings */}
        <div aria-hidden className="absolute -bottom-44 -right-44 h-[30rem] w-[30rem] opacity-30">
          <span className="absolute inset-0 rounded-full border border-emerald-500/25" />
          <span className="absolute inset-[18%] rounded-full border border-emerald-500/20" />
          <span className="absolute inset-[36%] rounded-full border border-emerald-500/15" />
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/70" />
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
        />

        <header className="relative z-10 flex items-center gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-black tracking-tight text-white">
              Sada-e-Awam
            </p>
            <p className="font-mono text-[10px] font-semibold tracking-[0.22em] text-emerald-500/90">
              GOVERNMENT OF PUNJAB
            </p>
          </div>
        </header>

        <div className="relative z-10 max-w-md space-y-9">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/50 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-emerald-400 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              MUNICIPAL COMMAND CONSOLE
            </span>
            <h2 className="text-3xl font-black leading-[1.15] tracking-tight text-white xl:text-[2.6rem]">
              The province&rsquo;s complaints,{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                dispatched &amp; closed
              </span>{" "}
              — from one desk.
            </h2>
          </div>

          <ul className="space-y-5">
            {CONSOLE_FEATURES.map((feature) => (
              <li key={feature.title} className="group flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-emerald-400 backdrop-blur-sm transition-colors duration-300 group-hover:border-emerald-500/40 group-hover:text-emerald-300">
                  <feature.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-100">
                    {feature.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-400">
                    {feature.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="relative z-10 font-mono text-[10px] font-medium tracking-[0.2em] text-slate-600">
          SECURE OFFICER PORTAL • SIALKOT PILOT • PK
        </footer>
      </aside>

      {/* ── Credential form ────────────────────────────────────────────── */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6 sm:p-10">
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 h-[26rem] w-[38rem] max-w-[120vw] -translate-x-1/2 rounded-full bg-emerald-500/[0.09] blur-[110px]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,#131c2b_1px,transparent_1px),linear-gradient(to_bottom,#131c2b_1px,transparent_1px)] [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{ backgroundImage: NOISE_URI }}
        />

        <div className="relative z-10 w-full max-w-[400px]">
          {/* HUD corner ticks floating just off the glass card */}
          {[
            "-left-2.5 -top-2.5 border-l border-t",
            "-right-2.5 -top-2.5 border-r border-t",
            "-bottom-2.5 -left-2.5 border-b border-l",
            "-bottom-2.5 -right-2.5 border-b border-r",
          ].map((position) => (
            <span
              aria-hidden
              key={position}
              className={`pointer-events-none absolute h-4 w-4 border-emerald-500/50 ${position}`}
            />
          ))}

          <div className="relative space-y-6 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03] p-7 shadow-[0_0_90px_-24px_rgba(16,185,129,0.28)] backdrop-blur-xl sm:p-8">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
            />

            <header className="space-y-2.5">
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-slate-400">
                RESTRICTED • OFFICER ACCESS ONLY
              </span>
              <h1 className="text-[26px] font-black leading-tight tracking-tight text-white">
                Admin Console{" "}
                <span lang="ur" dir="rtl" className="font-bold text-slate-400">
                  انتظامی لاگ ان
                </span>
              </h1>
              <p className="text-sm leading-relaxed text-slate-400">
                Restricted access for Municipal Officers, Utility XENs &amp;
                Provincial Directors.
              </p>
            </header>

            {state?.error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-[13px] leading-relaxed text-rose-300 backdrop-blur-sm"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            <form action={formAction} className="space-y-4" noValidate>
              <input type="hidden" name="redirect" value={redirect ?? ""} />

              {/* Official email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-email"
                  className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"
                >
                  Official Govt Email / ID
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-emerald-400" />
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    defaultValue="dg.localgovt@punjab.gov.pk"
                    placeholder="officer@punjab.gov.pk"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-11 pr-3 text-sm text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-white/[0.16] focus:border-emerald-400/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-emerald-400/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-password"
                  className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"
                >
                  Administrative Password
                </label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-emerald-400" />
                  <input
                    id="admin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-11 pr-12 text-sm text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-white/[0.16] focus:border-emerald-400/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-emerald-400/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="group relative flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-950/50 transition-all duration-200 hover:shadow-emerald-900/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying clearance…
                  </>
                ) : (
                  <>
                    Authenticate &amp; Access Radar
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Statutory notice */}
            <p className="border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-slate-500">
              All unauthorized login attempts are tracked and logged with client
              IP address and hardware telemetry pursuant to Section 14 of the
              Prevention of Electronic Crimes Act (PECA).
            </p>
          </div>

          {/* Console status bar */}
          <div className="mt-5 flex items-center justify-between px-1 font-mono text-[10px] font-medium tracking-[0.16em] text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
              SADA-OS • BUILD 2026.09
            </span>
            {clock && <span>SIALKOT • {clock} PKT</span>}
          </div>
        </div>
      </main>
    </div>
  );
}
