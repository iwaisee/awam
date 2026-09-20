"use client";

import {
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
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useCitizenProfile } from "@/context/UserContext";

/* Unified citizen authentication card — sign in & sign up share one surface so
   the incident-reporting flow never loses a half-typed phone number when a
   first-time reporter switches tabs. Ownership is verified over EMAIL (a
   6-digit code): the pilot has no SMS gateway, so phone stays a coordination
   field for municipal teams while email carries the verification burden.
   The Sialkot pilot runs on a client-side session store (no live auth
   backend yet): the handlers below mint a demo token and bind it to the
   UserContext citizen document — exactly the seam a real POST /api/auth/*
   + email-delivery provider call will slot into. */

type AuthMode = "signin" | "signup" | "verify";
type ErrorKey = "phone" | "email" | "password" | "name" | "pledge" | "code";
type Strength = 0 | 1 | 2 | 3;

const SESSION_KEY = "sada_auth_session";
const SESSION_COOKIE = "sada_session";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const THIRTY_DAYS_MS = THIRTY_DAYS_SECONDS * 1000;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 45;
const EMPTY_CODE = Array<string>(CODE_LENGTH).fill("");

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

interface StoredSession {
  token: string;
  phone: string | null;
  email: string | null;
  /** Which identifier the citizen authenticated with. */
  method: "phone" | "email";
  emailVerified: boolean;
  remember: boolean;
  issuedAt: number;
  /** Null = browser-session scope (no "remember" tick). */
  expiresAt: number | null;
}

/** Raw keypad noise → local Pakistani mobile form: digits only, trunk 0
    dropped (citizens habitually type 0300… despite the +92 badge), capped at
    10 digits, grouped "300 1234567" to match the placeholder. */
function toLocalMobile(raw: string): string {
  const digits = raw
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, 10);
  return digits.length <= 3
    ? digits
    : `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** Strip +92 / 0 prefixes so stored and freshly-typed numbers compare equal. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("92")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function isValidLocalMobile(localDigits: string): boolean {
  // Local mobile parts run 3XX-XXXXXXX — the leading 3 is load-bearing.
  return localDigits.length === 10 && localDigits.startsWith("3");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Build the demo session document. Module-scope so the impure clock/random
    reads stay out of render scope (react-hooks/purity). */
function mintSession(
  identity: { phone?: string; email?: string },
  isRemembered: boolean,
  method: "phone" | "email",
  emailVerified: boolean
): StoredSession {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const issuedAt = Date.now();
  return {
    token,
    phone: identity.phone ?? null,
    email: identity.email ?? null,
    method,
    emailVerified,
    remember: isRemembered,
    issuedAt,
    expiresAt: isRemembered ? issuedAt + THIRTY_DAYS_MS : null,
  };
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

/** Mirror the session token onto a cookie (session-scope unless remembered)
    so future server components / middleware can recognise the citizen
    without JS stores. Module-scope: global mutation stays out of render. */
function mirrorSessionCookie(token: string, isRemembered: boolean) {
  const maxAge = isRemembered ? `; max-age=${THIRTY_DAYS_SECONDS}` : "";
  document.cookie = `${SESSION_COOKIE}=${token}; path=/; samesite=lax${maxAge}`;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="text-xs font-semibold text-rose-600">
      {msg}
    </p>
  );
}

export default function UnifiedCitizenAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, updateProfile } = useCitizenProfile();

  // ?redirect=/report keeps the reporting funnel intact — but a citizen never
  // leaves the portal via a query param, so only same-origin paths pass.
  const redirectUrl = useMemo(() => {
    const raw = searchParams.get("redirect") || "/report";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/report";
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

  // Email verification step (signup step 2).
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(EMPTY_CODE);
  const [resendIn, setResendIn] = useState(0);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
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

  /* Resend cooldown countdown while the verification step is on screen. */
  useEffect(() => {
    if (mode !== "verify" || resendIn <= 0) return;
    const tick = window.setInterval(
      () => setResendIn((seconds) => seconds - 1),
      1000
    );
    return () => window.clearInterval(tick);
  }, [mode, resendIn]);

  function clearError(key: ErrorKey) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** Tab switch keeps ?mode= shareable for deep links (e.g. from the report
      wizard's gate) without a router navigation — replaceState keeps the URL
      and useSearchParams in sync client-side. */
  function switchMode(next: Exclude<AuthMode, "verify">) {
    if (next === mode || submitting) return;
    setMode(next);
    setErrors({});
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

  function persistSession(
    identity: { phone?: string; email?: string },
    isRemembered: boolean,
    method: "phone" | "email",
    emailVerified: boolean
  ) {
    const session = mintSession(identity, isRemembered, method, emailVerified);
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage quota hit — the in-memory UserContext session still stands.
    }
    mirrorSessionCookie(session.token, isRemembered);
  }

  /** Post-auth handoff. A pending incident draft outranks any ?redirect=
      target: the citizen mid-report must land back in the wizard. */
  function finishAuth(displayName: string) {
    let hasDraft = false;
    try {
      hasDraft = Boolean(
        window.sessionStorage.getItem("pending_incident_draft")
      );
    } catch {
      hasDraft = false;
    }
    const target = hasDraft ? "/report" : redirectUrl;
    if (hasDraft) {
      setToast(
        `Welcome back, ${displayName}. Resuming your incident report.`
      );
    }
    navigateTimer.current = window.setTimeout(
      () => router.replace(target),
      hasDraft ? 1500 : 400
    );
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<ErrorKey, string>> = {};

    if (signInWith === "phone") {
      const localDigits = phoneNumber.replace(/\s/g, "");
      if (!isValidLocalMobile(localDigits)) {
        nextErrors.phone =
          "Enter your 10-digit mobile number (e.g. 300 1234567).";
      }
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email — e.g. name@gmail.com.";
    }
    if (!password) {
      nextErrors.password = "Enter your password.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    // Pilot stand-in for POST /api/auth/login.
    await new Promise((resolve) => setTimeout(resolve, 700));

    if (signInWith === "phone") {
      const fullPhone = `+92 ${phoneNumber}`;
      const returningCitizen =
        normalizePhone(profile.phone) === normalizePhone(fullPhone);
      // A phone the ledger has never seen gets a neutral header identity
      // until the citizen edits their profile — never silently reuse the
      // demo name.
      const displayName = returningCitizen
        ? profile.name
        : `Citizen ${phoneNumber.replace(/\s/g, "").slice(-4)}`;

      persistSession({ phone: fullPhone }, remember, "phone", false);
      updateProfile({
        name: displayName,
        phone: fullPhone,
        is_phone_verified: true,
      });
      finishAuth(displayName);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const returningCitizen = (profile.email ?? "").toLowerCase() === trimmedEmail;
    const displayName = returningCitizen ? profile.name : "Citizen";

    persistSession({ email: trimmedEmail }, remember, "email", true);
    updateProfile({ email: trimmedEmail });
    finishAuth(displayName);
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localDigits = phoneNumber.replace(/\s/g, "");
    const nextErrors: Partial<Record<ErrorKey, string>> = {};
    if (fullName.trim().length < 3) {
      nextErrors.name = "Enter your full name as printed on your CNIC.";
    }
    if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email — e.g. name@gmail.com.";
    }
    if (!isValidLocalMobile(localDigits)) {
      nextErrors.phone = "Enter a valid mobile number (e.g. 300 1234567).";
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

    setSubmitting(true);
    setErrors({});
    // Pilot stand-in for POST /api/auth/send-code (email delivery provider).
    await new Promise((resolve) => setTimeout(resolve, 800));

    const freshCode = generateOtp();
    setDemoCode(freshCode);
    setCode(EMPTY_CODE);
    setResendIn(RESEND_SECONDS);
    setSubmitting(false);
    setMode("verify");
  }

  async function verifyCode(codeValue: string) {
    if (submitting) return;
    if (codeValue.length < CODE_LENGTH) {
      setErrors({ code: "Enter all 6 digits of the verification code." });
      return;
    }
    setSubmitting(true);
    setErrors({});
    // Pilot stand-in for POST /api/auth/verify-code.
    await new Promise((resolve) => setTimeout(resolve, 700));

    if (codeValue !== demoCode) {
      setSubmitting(false);
      setErrors({
        code: "That code doesn't match — check the digits and try again.",
      });
      return;
    }

    const fullPhone = `+92 ${phoneNumber}`;
    persistSession(
      { phone: fullPhone, email: email.trim().toLowerCase() },
      true,
      "email",
      true
    );
    updateProfile({
      name: fullName.trim(),
      phone: fullPhone,
      email: email.trim().toLowerCase(),
      district,
      is_phone_verified: true,
    });
    finishAuth(fullName.trim());
  }

  function handleResend() {
    if (resendIn > 0 || submitting) return;
    setDemoCode(generateOtp());
    setCode(EMPTY_CODE);
    setErrors({});
    setResendIn(RESEND_SECONDS);
    setToast(`A fresh code is on its way to ${email.trim()}.`);
    codeRefs.current[0]?.focus();
  }

  function backToSignup() {
    setMode("signup");
    setCode(EMPTY_CODE);
    setErrors({});
  }

  /** Keystroke into one OTP box: write the digit, advance focus, and
      auto-submit once the sixth box completes the code. */
  function setDigit(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(0, 1);
    const next = code.map((value, position) =>
      position === index ? digit : value
    );
    setCode(next);
    if (digit && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
    const joined = next.join("");
    if (!next.includes("") && joined.length === CODE_LENGTH) {
      void verifyCode(joined);
    }
  }

  function handleCodePaste(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH - index);
    if (!digits) return;
    const next = [...code];
    digits.split("").forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    setCode(next);
    codeRefs.current[
      Math.min(index + digits.length, CODE_LENGTH - 1)
    ]?.focus();
    const joined = next.join("");
    if (!next.includes("") && joined.length === CODE_LENGTH) {
      void verifyCode(joined);
    }
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
      }}
      className="text-xs font-semibold text-emerald-700 hover:underline"
    >
      {target === "email" ? "Use email instead" : "Use phone instead"}
    </button>
  );

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
                <strong className="font-bold text-white">Verified identity.</strong>{" "}
                Email-confirmed accounts keep every report authentic.
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

        {mode === "verify" ? (
          /* ── Signup step 2: email verification ── */
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verifyCode(code.join(""));
            }}
            noValidate
            className="animate-fade-rise space-y-3.5"
          >
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Step 2 of 2 • Email Verification
              </p>
              <h2 className="text-lg font-black text-slate-900">
                One last check
              </h2>
              <p className="text-[13px] leading-snug text-slate-500">
                We sent a 6-digit code to{" "}
                <span className="font-bold text-slate-700">{email.trim()}</span>
                . Enter it below to activate your citizen account.
              </p>
            </div>

            {demoCode ? (
              <button
                type="button"
                onClick={() => {
                  setCode(demoCode.split(""));
                  codeRefs.current[CODE_LENGTH - 1]?.focus();
                  void verifyCode(demoCode);
                }}
                className="flex w-full items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-left text-xs font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
              >
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Pilot demo — email delivery isn&apos;t wired yet. Your code
                  is{" "}
                  <span className="font-black tracking-[0.2em]">{demoCode}</span>{" "}
                  (tap to autofill).
                </span>
              </button>
            ) : null}

            <div className="flex gap-2">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    codeRefs.current[index] = node;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  aria-label={`Verification digit ${index + 1}`}
                  value={digit}
                  onChange={(event) => setDigit(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Backspace" &&
                      !code[index] &&
                      index > 0
                    ) {
                      codeRefs.current[index - 1]?.focus();
                      setCode((prev) =>
                        prev.map((value, position) =>
                          position === index - 1 ? "" : value
                        )
                      );
                    } else if (event.key === "ArrowLeft" && index > 0) {
                      codeRefs.current[index - 1]?.focus();
                    } else if (
                      event.key === "ArrowRight" &&
                      index < CODE_LENGTH - 1
                    ) {
                      codeRefs.current[index + 1]?.focus();
                    }
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    handleCodePaste(
                      index,
                      event.clipboardData.getData("text")
                    );
                  }}
                  onFocus={(event) => event.target.select()}
                  className={`h-11 w-full rounded-xl border bg-white text-center text-lg font-black text-slate-900 transition-colors duration-150 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                    errors.code
                      ? "border-rose-300"
                      : digit
                        ? "border-emerald-600/60"
                        : "border-slate-200"
                  }`}
                />
              ))}
            </div>
            <FieldError msg={errors.code} />

            {primaryButton("Verify & Create Account", "Verifying your code…")}

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={backToSignup}
                className="font-semibold text-slate-500 hover:text-slate-700 hover:underline"
              >
                Wrong email? Edit details
              </button>
              {resendIn > 0 ? (
                <span className="font-medium text-slate-400">
                  Resend code in {resendIn}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  Resend code
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
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
                    ? "Enter your registered phone number to track your reports."
                    : "Enter your registered email address to track your reports."}
                </p>

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

                  {emailField(
                    "signup-email",
                    "For verification and updates."
                  )}
                </div>

                <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                  {phoneField(
                    "signup-phone",
                    "Used to verify incident coordinates."
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
                  "Sending your verification code…"
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
          </>
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
