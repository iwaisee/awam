"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useCitizenProfile } from "@/context/UserContext";
import {
  formatDisplayPhone,
  isValidMobileDigits,
  toLocalMobile,
} from "@/lib/auth/identifiers";
import { isSafeReturnPath } from "@/lib/auth/returnPath";

/* Unified citizen authentication card — sign in & sign up share one surface so
   the incident-reporting flow never loses a half-typed phone number when a
   first-time reporter switches tabs.

   Both tabs talk to the real endpoints (POST /api/auth/signin and
   /api/auth/signup), which verify the password against the stored scrypt hash
   and answer by setting an httpOnly session cookie. The session belongs to the
   server: this component never stores a token, and what it can read afterwards
   is only what /api/auth/me says about the account behind that cookie.

   Ownership of an account is proven by the password. Email ownership is NOT
   proven yet — `citizen_users.email_verified` stays false until an email
   delivery provider is wired, so the card says what will arrive rather than
   pretending a code was sent. */

type AuthMode = "signin" | "signup";
type ErrorKey = "identifier" | "phone" | "email" | "password" | "name" | "district" | "pledge";
type Strength = 0 | 1 | 2 | 3;

const DISTRICTS = [
  "Sialkot (Pilot)",
  "Lahore",
  "Gujranwala",
  "Rawalpindi",
  "Faisalabad",
  "Other",
] as const;

/** House input chrome (matches settings/ProfileTab) — shared by every field. */
const INPUT_BASE =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-150 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

const INPUT_INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20";

interface AuthResponse {
  success?: boolean;
  error?: string;
  field_errors?: Record<string, string>;
  retry_after_seconds?: number;
}

/** 4 signals (length 8+, mixed case, digit, symbol) → Weak / Good / Strong. */
function passwordStrength(pw: string): Strength {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 2) return 1;
  return score === 3 ? 2 : 3;
}

const STRENGTH_META: Record<1 | 2 | 3, { label: string; bar: string; text: string }> = {
  1: { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
  2: { label: "Good", bar: "bg-amber-500", text: "text-amber-600" },
  3: { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
};

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="text-xs font-semibold text-rose-600">
      {msg}
    </p>
  );
}

/** Server-side field rejections arrive keyed by the request shape; the card
    names its inputs after the same fields, except sign-in's single identifier
    box, which the server answers as `identifier`. */
function errorsForMode(
  fieldErrors: Record<string, string> | undefined,
  mode: AuthMode,
  signInWith: "phone" | "email"
): Partial<Record<ErrorKey, string>> {
  if (!fieldErrors) return {};
  const out: Partial<Record<ErrorKey, string>> = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    if (key === "identifier") {
      out[mode === "signin" && signInWith === "phone" ? "phone" : "email"] = message;
      continue;
    }
    if (key === "phone" && mode === "signin" && signInWith === "phone") {
      out.phone = message;
      continue;
    }
    if (key === "email" || key === "phone" || key === "password" || key === "name" || key === "district") {
      out[key as ErrorKey] = message;
    }
  }
  return out;
}

export default function UnifiedCitizenAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated } = useCitizenProfile();

  // ?redirect=/report keeps the reporting funnel intact — but a citizen never
  // leaves the portal via a query param, so only same-origin paths pass.
  const redirectUrl = useMemo(() => {
    const raw = searchParams.get("redirect");
    return raw && isSafeReturnPath(raw) ? raw : "/report";
  }, [searchParams]);

  // Hydrate from ?mode=signup after mount (server render is always "signin",
  // so the prerendered HTML and first client render stay identical).
  const [mode, setMode] = useState<AuthMode>("signin");

  // Shared across both tabs — switching must never wipe a typed identifier.
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [signInWith, setSignInWith] = useState<"phone" | "email">("phone");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const [fullName, setFullName] = useState("");
  const [district, setDistrict] = useState<string>(DISTRICTS[0]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pledge, setPledge] = useState(false);

  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  /** Anything the server said that has no field to point at (wrong password,
      a taken email, a lockout) — shown once above the form. */
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const navigateTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (navigateTimer.current !== null) window.clearTimeout(navigateTimer.current);
  }, []);

  // Read once post-mount, deferred in a microtask to satisfy the
  // set-state-in-effect rule (matches the UserContext/CoverageContext pattern).
  // Effects are client-only, so this deep-link read is hydration-safe.
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      try {
        const initialMode = new URLSearchParams(window.location.search).get(
          "mode"
        );
        if (initialMode === "signup") setMode("signup");
      } catch {
        // No URL — default to sign in.
      }
    })();
  }, []);

  /* Toast auto-dismiss (same cadence as the feed page's reward toast). */
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* A citizen who signs in in another tab is signed in here too; leaving the
     form on screen would offer an action that no longer applies. */
  useEffect(() => {
    if (authenticated && !submitting) router.replace(redirectUrl);
  }, [authenticated, submitting, router, redirectUrl]);

  function clearError(key: ErrorKey) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** Tab switch keeps ?mode= shareable for deep links (e.g. from the report
      wizard's gate) without a router navigation — replaceState keeps the URL
      and useSearchParams in sync client-side. */
  function switchMode(next: AuthMode) {
    if (next === mode || submitting) return;
    setMode(next);
    setErrors({});
    setFormError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      if (next === "signup") params.set("mode", "signup");
      else params.delete("mode");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `?${qs}` : window.location.pathname
      );
    } catch {
      // URL sync is cosmetic — the tab switch itself must never throw.
    }
  }

  /** Post-auth handoff: the cookie is already set by the response, so the only
      thing left is to land the citizen where they were headed. UserContext
      re-reads /api/auth/me on that navigation and the whole portal follows. */
  const finishAuth = useCallback(
    (displayName: string) => {
      setToast(`Welcome, ${displayName}.`);
      navigateTimer.current = window.setTimeout(
        () => router.replace(redirectUrl),
        400
      );
    },
    [redirectUrl, router]
  );

  /** Shared submit path for both tabs. Returns nothing; every failure lands in
      `formError` or the field chips, exactly as the server described it. */
  async function submitAuth(
    endpoint: "/api/auth/signin" | "/api/auth/signup",
    payload: Record<string, unknown>,
    displayName: string
  ) {
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as AuthResponse | null;
      if (!res.ok || !data?.success) {
        setErrors(errorsForMode(data?.field_errors, mode, signInWith));
        setFormError(
          data?.error ?? "Something went wrong. Please try again."
        );
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      finishAuth(displayName);
    } catch {
      // No response at all — the session was not created, so say so plainly
      // rather than redirecting into a page that will bounce back here.
      setFormError("Could not reach Sada-e-Awam. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localDigits = phoneNumber.replace(/\s/g, "");
    const nextErrors: Partial<Record<ErrorKey, string>> = {};
    let identifier = "";

    if (signInWith === "phone") {
      if (!isValidMobileDigits(localDigits)) {
        nextErrors.phone =
          "Enter your 10-digit mobile number (e.g. 300 1234567).";
      } else {
        identifier = formatDisplayPhone(localDigits);
      }
    } else {
      identifier = email.trim();
      if (!identifier) {
        nextErrors.email = "Enter the email you signed up with.";
      }
    }
    if (!password) {
      nextErrors.password = "Enter your password.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    void submitAuth(
      "/api/auth/signin",
      { identifier, password, remember },
      signInWith === "email"
        ? email.trim().split("@")[0]
        : `Citizen ${localDigits.slice(-4)}`
    );
  }

  function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<ErrorKey, string>> = {};
    if (fullName.trim().length < 3) {
      nextErrors.name = "Enter your full name as printed on your CNIC.";
    }
    if (!email.trim()) {
      nextErrors.email = "Enter a valid email — e.g. name@gmail.com.";
    }
    if (!isValidMobileDigits(phoneNumber.replace(/\s/g, ""))) {
      nextErrors.phone = "Enter a valid mobile number (e.g. 300 1234567).";
    }
    if (!district) {
      nextErrors.district = "Pick your city or district.";
    }
    if (newPassword.length < 8) {
      nextErrors.password = "Choose a password of at least 8 characters.";
    }
    if (!pledge) {
      nextErrors.pledge =
        "Please tick the box to confirm you'll report only genuine hazards.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    void submitAuth(
      "/api/auth/signup",
      {
        name: fullName.trim(),
        email: email.trim(),
        phone: phoneNumber,
        district,
        password: newPassword,
      },
      fullName.trim().split(" ")[0]
    );
  }

  const strength = passwordStrength(newPassword);
  const strengthMeta = strength === 0 ? null : STRENGTH_META[strength];

  const phoneInputClasses = `flex items-stretch overflow-hidden rounded-xl border bg-white transition-colors duration-150 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/20 ${
    errors.phone
      ? "border-rose-300 focus-within:border-rose-500 focus-within:ring-rose-500/20"
      : "border-slate-200"
  }`;

  const phoneField = (id: string, helper?: string, labelExtra?: ReactNode) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-slate-700">
          Mobile Number
        </label>
        {labelExtra}
      </div>
      <div className={phoneInputClasses}>
        <span className="flex select-none items-center rounded-l-xl bg-slate-100 px-3.5 text-sm font-bold text-slate-600">
          +92
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="300 1234567"
          value={phoneNumber}
          onChange={(event) => {
            setPhoneNumber(toLocalMobile(event.target.value));
            clearError("phone");
          }}
          aria-invalid={Boolean(errors.phone)}
          className="w-full rounded-r-xl bg-transparent px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      {helper && !errors.phone ? (
        <p className="text-xs text-slate-400">{helper}</p>
      ) : null}
      <FieldError msg={errors.phone} />
    </div>
  );

  const emailField = (
    id: string,
    helper?: string,
    labelExtra?: ReactNode
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-slate-700">
          Email Address
        </label>
        {labelExtra}
      </div>
      <input
        id={id}
        type="email"
        autoComplete="email"
        placeholder="name@gmail.com"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          clearError("email");
        }}
        aria-invalid={Boolean(errors.email)}
        className={`${INPUT_BASE} ${errors.email ? INPUT_INVALID : ""}`}
      />
      {helper && !errors.email ? (
        <p className="text-xs text-slate-400">{helper}</p>
      ) : null}
      <FieldError msg={errors.email} />
    </div>
  );

  const primaryButton = (label: string, busyText: string) => (
    <button
      type="submit"
      disabled={submitting}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-2.5 font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
    >
      {submitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {busyText}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </>
      )}
    </button>
  );

  const switchIdentifierLink = (target: "phone" | "email") => (
    <button
      type="button"
      onClick={() => {
        setSignInWith(target);
        setErrors({});
        setFormError(null);
      }}
      className="text-xs font-semibold text-emerald-700 hover:underline"
    >
      {target === "email" ? "Use email instead" : "Use phone instead"}
    </button>
  );

  /** One place for the server's answer, so a wrong password and a taken email
      are both impossible to miss and both sit above the fields they concern. */
  const formErrorBanner = formError ? (
    <p
      role="alert"
      className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-rose-700 ring-1 ring-rose-200"
    >
      {formError}
    </p>
  ) : null;

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — desktop only, carries the bilingual identity so the
          form card can stay lean */}
      <aside
        aria-label="About Sada-e-Awam"
        className="relative hidden flex-col justify-between overflow-hidden bg-emerald-950 p-10 text-white lg:flex xl:p-14"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl"
        />

        <div className="relative space-y-1">
          <div className="flex items-center gap-2.5 text-xl font-black">
            <ShieldCheck className="h-7 w-7 shrink-0 text-emerald-400" aria-hidden />
            <span>Sada-e-Awam</span>
            <span className="urdu text-base font-bold text-emerald-200">
              صدائے عوام
            </span>
          </div>
          <p className="text-xs font-medium text-emerald-200/80">
            Government of Punjab • Digital Civic Portal •{" "}
            <span className="urdu">شہری پورٹل</span>
          </p>
        </div>

        <div className="relative space-y-6 py-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-black leading-tight xl:text-4xl">
              Spot it. Report it.
              <br />
              Track it till it&apos;s fixed.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-emerald-100/80">
              Punjab&apos;s citizen voice channel — file a verified civic
              complaint in under a minute and follow every step your municipal
              crew takes.
            </p>
          </div>

          <figure className="overflow-hidden rounded-2xl ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/feed/street.svg"
              alt="Illustration of a monitored neighbourhood street"
              className="h-40 w-full object-cover xl:h-48"
            />
            <figcaption className="flex items-center justify-between bg-emerald-900/80 px-4 py-2.5 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                Live pilot — Sialkot
              </span>
              <span className="urdu text-emerald-200">سیالکوٹ</span>
            </figcaption>
          </figure>

          <ul className="space-y-2.5 text-sm text-emerald-100/90">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span>
                <strong className="font-bold text-white">One verified account.</strong>{" "}
                Your reports, score and resolution proofs stay with you.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span>
                <strong className="font-bold text-white">GPS-anchored incidents.</strong>{" "}
                Crews find the hazard the first time.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span>
                <strong className="font-bold text-white">Closed-loop tracking.</strong>{" "}
                Filed → dispatched → resolved, out in the open.
              </span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs font-medium text-emerald-200/70">
          Phase 1 • Sialkot <span className="urdu">(سیالکوٹ)</span> — Lahore
          &amp; Islamabad opening soon
        </p>
      </aside>

      {/* Form column */}
      <div className="flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <section className="relative w-full max-w-md space-y-4 overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7">
        {/* Civic branding — mobile only; the desktop panel carries it */}
        <header className="space-y-0.5 lg:hidden">
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-900">
            <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
            <span className="urdu">صدائے عوام</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">
            Government of Punjab Digital Civic Portal •{" "}
            <span className="urdu">شہری پورٹل</span>
          </p>
        </header>

        {/* Sliding dual-segment switcher */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="relative flex w-full items-center rounded-2xl bg-slate-100 p-1"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-white shadow-2xs transition-transform duration-300 ease-out"
            style={{
              transform:
                mode === "signup" ? "translateX(100%)" : "translateX(0)",
            }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => switchMode("signin")}
            className={`relative z-10 flex-1 rounded-xl py-1.5 text-sm transition-colors duration-150 ${
              mode === "signin"
                ? "font-bold text-slate-900"
                : "font-medium text-slate-500 hover:text-slate-700"
            }`}
          >
            Sign In • <span className="urdu">لاگ ان</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => switchMode("signup")}
            className={`relative z-10 flex-1 rounded-xl py-1.5 text-sm transition-colors duration-150 ${
              mode === "signup"
                ? "font-bold text-slate-900"
                : "font-medium text-slate-500 hover:text-slate-700"
            }`}
          >
            Sign Up • <span className="urdu">نیا اکاؤنٹ</span>
          </button>
        </div>

        {mode === "signin" ? (
          <form
            key="signin"
            onSubmit={handleSignIn}
            noValidate
            className="animate-fade-rise space-y-3.5"
          >
            <p className="text-[13px] leading-snug text-slate-500">
              {signInWith === "phone"
                ? "Enter your registered mobile number to file and track reports."
                : "Enter your registered email address to file and track reports."}
            </p>

            {formErrorBanner}

            {signInWith === "phone"
              ? phoneField("signin-phone", undefined, switchIdentifierLink("email"))
              : emailField("signin-email", undefined, switchIdentifierLink("phone"))}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="signin-password"
                  className="text-xs font-bold text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setToast(
                      "Password reset opens with the Phase 2 rollout — helpline 135 can unlock your account today."
                    )
                  }
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError("password");
                  }}
                  aria-invalid={Boolean(errors.password)}
                  className={`${INPUT_BASE} pr-11 ${errors.password ? INPUT_INVALID : ""}`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              <FieldError msg={errors.password} />
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2.5">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              />
              <span className="text-xs font-semibold text-slate-600">
                Remember this device for 30 days
              </span>
            </label>

            {primaryButton("Log In & Continue", "Securing your session…")}

            <p className="text-center text-xs font-medium text-slate-500">
              Don&rsquo;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-bold text-emerald-700 hover:underline"
              >
                Switch to Sign Up
              </button>{" "}
              above.
            </p>
          </form>
        ) : (
          <form
            key="signup"
            onSubmit={handleSignUp}
            noValidate
            className="animate-fade-rise space-y-3.5"
          >
            <p className="text-[13px] leading-snug text-slate-500">
              Create a citizen account in 30 seconds to submit verified
              complaints.
            </p>

            {formErrorBanner}

            <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="signup-name"
                  className="text-xs font-bold text-slate-700"
                >
                  Full Name (as per CNIC)
                </label>
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Tariq Mehmood"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    clearError("name");
                  }}
                  aria-invalid={Boolean(errors.name)}
                  className={`${INPUT_BASE} ${errors.name ? INPUT_INVALID : ""}`}
                />
                <FieldError msg={errors.name} />
              </div>

              {emailField("signup-email", "For updates about your reports.")}
            </div>

            <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
              {phoneField(
                "signup-phone",
                "So crews can reach you about a hazard."
              )}

              <div className="space-y-1">
                <label
                  htmlFor="signup-district"
                  className="text-xs font-bold text-slate-700"
                >
                  Your City / District
                </label>
                <div className="relative">
                  <select
                    id="signup-district"
                    value={district}
                    onChange={(event) => setDistrict(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-10 text-sm text-slate-900 transition-colors duration-150 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                  >
                    {DISTRICTS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                </div>
                <FieldError msg={errors.district} />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="signup-password"
                className="text-xs font-bold text-slate-700"
              >
                Create Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters, e.g. Civic#2026"
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    clearError("password");
                  }}
                  aria-invalid={Boolean(errors.password)}
                  className={`${INPUT_BASE} pr-11 ${errors.password ? INPUT_INVALID : ""}`}
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              {newPassword && strengthMeta ? (
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="flex flex-1 gap-1.5" aria-hidden>
                    {[1, 2, 3].map((bar) => (
                      <span
                        key={bar}
                        className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                          bar <= strength ? strengthMeta.bar : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-bold ${strengthMeta.text}`}>
                    {strengthMeta.label}
                  </span>
                </div>
              ) : null}
              <FieldError msg={errors.password} />
            </div>

            <div className="space-y-1">
              <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={pledge}
                  onChange={(event) => {
                    setPledge(event.target.checked);
                    clearError("pledge");
                  }}
                  aria-invalid={Boolean(errors.pledge)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                <span className="text-xs font-semibold leading-relaxed text-slate-600">
                  I confirm I&apos;ll only report genuine hazards I&apos;ve
                  seen myself — false reports can lower my civic score.
                </span>
              </label>
              <FieldError msg={errors.pledge} />
            </div>

            {primaryButton(
              "Create Citizen Account",
              "Creating your account…"
            )}

            <p className="text-center text-xs font-medium text-slate-500">
              Already registered?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-bold text-emerald-700 hover:underline"
              >
                Switch to Sign In
              </button>{" "}
              above.
            </p>
          </form>
        )}

        {/* Pilot trust strip */}
        <p className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-1 text-center text-xs font-medium text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600/70" aria-hidden />
          Verified by the Municipal Corporation Sialkot (MCS)
        </p>
        </section>
      </div>

      {toast ? (
        <div
          role="status"
          className="animate-toast-rise fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
