"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  BadgeCheck,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { readDownscaledDataUrl } from "@/lib/imageDataUrl";
import {
  DEFAULT_JURISDICTION,
  fullJurisdictionLabel,
  initialsFromName,
  municipalZoneLabel,
  primaryLocalityAnchor,
  type AreaItem,
  type CitizenProfileSettings,
} from "@/types/civic";
import Card from "./Card";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-150 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-700";

function localitySlug(name: string): string {
  return `sk-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export default function ProfileTab({
  draft,
  update,
}: {
  /** Draft document — the saved baseline merged with unsaved edits. */
  draft: CitizenProfileSettings;
  /** Write unsaved edits into the dashboard's dirty overlay. */
  update: (patch: Partial<CitizenProfileSettings>) => void;
}) {
  const { cities } = useCoverage();
  const pilotCity = cities.find((city) => city.id === "sialkot");

  // Compulsory contact channel — the dashboard refuses to save while the
  // email is missing or malformed (render-derived, never effect-driven).
  const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    (draft.email ?? "").trim()
  );

  // Sialkot hierarchy grouped by zone cluster for the locality selector.
  const localityGroups = useMemo(() => {
    const byTown = new Map<string, AreaItem[]>();
    for (const area of pilotCity?.areas ?? []) {
      const town = area.town ?? "Sialkot";
      const bucket = byTown.get(town);
      if (bucket) bucket.push(area);
      else byTown.set(town, [area]);
    }
    return [...byTown.entries()];
  }, [pilotCity]);

  const knownLocality = localityGroups.some(([, areas]) =>
    areas.some((area) => area.name_en === draft.home_locality_name)
  );

  const handleLocalityChange = (name: string) => {
    const area = pilotCity?.areas.find((a) => a.name_en === name);
    update({
      home_locality_name: name,
      home_locality_id: area?.id ?? localitySlug(name),
      // The governing desk is never hand-picked — it follows the mohallah.
      jurisdiction: fullJurisdictionLabel(
        area?.jurisdiction ?? DEFAULT_JURISDICTION,
        draft.district
      ),
    });
  };

  /* Avatar picker (ephemeral — the picked image lands in the dirty draft) */
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState("");
  const handleAvatarFile = async (file: File | null) => {
    setAvatarError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Only JPG, PNG or WEBP images are supported.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image exceeds the 5MB limit.");
      return;
    }
    try {
      // Canvas-downscaled data URL — persists in the Neon profile document like the admin
      // portrait, instead of a blob: URL that dies with the session.
      const dataUrl = await readDownscaledDataUrl(file, {
        maxSize: 400,
        square: true,
      });
      update({ avatar_url: dataUrl });
    } catch {
      setAvatarError("Could not read that image — try another file.");
    }
  };

  /* Phone change modal (ephemeral — the verified number lands in the draft) */
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (!phoneOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhoneOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phoneOpen]);

  const openPhoneModal = () => {
    setPhoneDraft(draft.phone);
    setPhoneError("");
    setPhoneOpen(true);
  };

  const cancelPhoneEdit = () => {
    setPhoneOpen(false);
    setPhoneDraft("");
    setPhoneError("");
  };

  const savePhone = () => {
    const normalized = phoneDraft.replace(/[\s-]/g, "");
    if (!/^(\+92|0)3\d{9}$/.test(normalized)) {
      setPhoneError(
        "Enter a valid Pakistani mobile number, e.g. +92 300 1234567."
      );
      return;
    }
    const formatted = normalized.startsWith("+92")
      ? normalized
      : `+92 ${normalized.slice(1)}`;
    update({ phone: formatted });
    setPhoneOpen(false);
    setPhoneDraft("");
    setOtpSent(true);
    window.setTimeout(() => setOtpSent(false), 6000);
  };

  const fixRate =
    draft.reports_filed > 0
      ? Math.round((draft.reports_resolved / draft.reports_filed) * 100)
      : 0;
  const progressPct = Math.min(
    100,
    Math.round((draft.civic_score / draft.next_tier_target) * 100)
  );

  return (
    <>
      {/* ============ CARD 1: Civic reputation & impact hero banner ============ */}
      <section
        aria-label="Civic reputation and impact"
        className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-[#0F5132] p-6 text-white shadow-md"
      >
        {/* Soft civic watermarks */}
        <ShieldCheck
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 text-emerald-300/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full border-[10px] border-emerald-300/5"
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Change profile photo"
              className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-950 ring-2 ring-emerald-400/50 transition-shadow duration-150 hover:ring-emerald-300/70"
            >
              {draft.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-lg font-bold text-emerald-200">
                  {initialsFromName(draft.name)}
                </span>
              )}
              <span className="absolute inset-0 hidden items-center justify-center bg-emerald-950/60 group-hover:flex">
                <Camera className="h-4 w-4 text-emerald-200" />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Upload profile photo"
              onChange={(e) => {
                void handleAvatarFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">{draft.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-300/30">
                  <BadgeCheck className="h-3 w-3" />✓ Verified Citizen
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-200/90">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {primaryLocalityAnchor(draft.home_locality_name)},{" "}
                  {draft.district} • {municipalZoneLabel(draft.jurisdiction)}
                </span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Award className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="whitespace-nowrap text-xs font-semibold">
              Level {draft.level_tier} {draft.level_title} • {draft.civic_score}{" "}
              pts
            </span>
          </div>
        </div>

        {/* Tier progress */}
        <div className="relative mt-5">
          <p className="text-[11px] font-medium text-emerald-200">
            {Math.max(0, draft.next_tier_target - draft.civic_score)} pts needed
            to unlock Level {draft.level_tier + 1}: {draft.next_tier_title} (
            {draft.next_tier_target} pts)
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Impact telemetry strip */}
        <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-emerald-700/50 pt-4 sm:grid-cols-4">
          <div>
            <p className="text-sm font-bold">{draft.reports_filed}</p>
            <p className="mt-0.5 text-[11px] text-emerald-200/80">
              Reports Filed
            </p>
          </div>
          <div>
            <p className="text-sm font-bold">{draft.reports_resolved}</p>
            <p className="mt-0.5 text-[11px] text-emerald-200/80">
              Resolved ({fixRate}% fix rate)
            </p>
          </div>
          <div>
            <p className="text-sm font-bold">
              {Math.max(0, draft.reports_filed - draft.reports_resolved)}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-200/80">
              Active Tickets
            </p>
          </div>
          <div>
            <p className="text-sm font-bold">{draft.upvotes_received}</p>
            <p className="mt-0.5 text-[11px] text-emerald-200/80">
              Community Upvotes
            </p>
          </div>
        </div>
        {avatarError && (
          <p className="relative mt-3 text-xs font-medium text-rose-200">
            {avatarError}
          </p>
        )}
      </section>

      {/* ============ CARD 2: Contact verification & communication ============ */}
      <Card className="mb-6">
        <h2 className="font-heading text-base font-bold text-slate-900">
          Profile Information
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Manage your personal details, contact preferences, and verified
          citizen identity.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="citizen-name" className={`${labelClass} mb-1.5 block`}>
              Full Name <span className="urdu normal-case">(پورا نام)</span>
            </label>
            <input
              id="citizen-name"
              type="text"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="citizen-name-ur" className={`${labelClass} mb-1.5 block`}>
              Name in Urdu{" "}
              <span className="normal-case text-slate-400">(optional)</span>
            </label>
            <input
              id="citizen-name-ur"
              type="text"
              dir="rtl"
              lang="ur"
              value={draft.name_ur ?? ""}
              onChange={(e) => update({ name_ur: e.target.value })}
              placeholder="محمد عثمان"
              className={`${inputClass} urdu`}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="phone-display" className={`${labelClass} block`}>
              Mobile Number{" "}
              <span className="urdu normal-case">(موبائل نمبر)</span>{" "}
              <span className="text-rose-600">*</span>
            </label>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
              <BadgeCheck className="h-3.5 w-3.5" />
              ✓ WhatsApp Verified
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span
              id="phone-display"
              className="font-mono text-sm font-semibold text-slate-900"
            >
              {draft.phone}
            </span>
            <button
              type="button"
              onClick={openPhoneModal}
              className="ml-auto flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700 underline transition-colors duration-150 hover:text-emerald-800"
            >
              <Pencil className="h-3 w-3" />
              Change Number
            </button>
          </div>
          {otpSent && (
            <div
              role="status"
              className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Verification Code Sent via SMS/WhatsApp — your number updates as
              verified once you confirm the code.
            </div>
          )}
        </div>

        {/* Compulsory email — reads before the optional CNIC panel */}
        <div className="mt-5">
          <label htmlFor="citizen-email" className={`${labelClass} mb-1.5 block`}>
            Email Address <span className="text-rose-600">*</span>
          </label>
          <input
            id="citizen-email"
            type="email"
            required
            aria-invalid={emailInvalid}
            value={draft.email ?? ""}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="citizen@example.com"
            className={`${inputClass} ${
              emailInvalid
                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                : ""
            }`}
          />
          <p
            className={`mt-1.5 text-xs ${
              emailInvalid ? "font-semibold text-rose-600" : "text-slate-400"
            }`}
          >
            {emailInvalid
              ? draft.email
                ? "Enter a valid email address, e.g. citizen@example.com."
                : "Email address is required for weekly progress digests and urgent resolution alerts."
              : "Used for weekly progress digests and urgent resolution alerts."}
          </p>
        </div>

        {/* Official verification — compact identity panel */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="citizen-cnic" className={`${labelClass} block`}>
              CNIC / Identity Number
            </label>
            <span className="shrink-0 rounded-full bg-slate-200/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              Unverified (Optional)
            </span>
          </div>
          <input
            id="citizen-cnic"
            type="text"
            value={draft.cnic}
            onChange={(e) => update({ cnic: e.target.value })}
            placeholder="35201-XXXXXXX-X"
            className={`${inputClass} bg-white`}
          />
          <div className="mt-3 flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <p className="text-xs leading-5 text-slate-600">
              Adding your CNIC awards an official{" "}
              <span className="font-semibold text-emerald-800">
                &apos;Verified Citizen&apos;
              </span>{" "}
              badge to your tickets, escalating emergency reports directly to
              the Assistant Commissioner&apos;s priority desk.
            </p>
          </div>
        </div>

      </Card>
      {/* ============ CARD 3: Primary residence & municipal anchor ============ */}
      <Card className="mb-6">
        <h2 className="font-heading text-base font-bold text-slate-900">
          Home Area &amp; Neighborhood
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Set your primary residence to receive nearby hazard alerts and route
          reports directly to the relevant local team.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className={`${labelClass} mb-1.5 block`}>District / City</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-900">
                {draft.district}
              </span>
              <span className="ml-auto whitespace-nowrap text-[11px] font-bold text-emerald-700">
                Phase 1 Active Pilot
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="home-locality"
              className={`${labelClass} mb-1.5 block`}
            >
              Primary Mohallah / Locality
            </label>
            <div className="relative">
              <select
                id="home-locality"
                value={draft.home_locality_name}
                onChange={(e) => handleLocalityChange(e.target.value)}
                className={`${inputClass} cursor-pointer appearance-none pr-9`}
              >
                {!knownLocality && (
                  <optgroup label="Your current anchor">
                    <option value={draft.home_locality_name}>
                      {draft.home_locality_name}
                    </option>
                  </optgroup>
                )}
                {localityGroups.map(([town, areas]) => (
                  <optgroup key={town} label={town}>
                    {areas.map((area) => (
                      <option key={area.id} value={area.name_en}>
                        {area.name_en}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Reports in this area will appear on your local dashboard.
            </p>
          </div>

          <div className="sm:col-span-2">
            <span className={`${labelClass} mb-1.5 block`}>
              Responsible Municipal Office{" "}
              <span className="normal-case text-slate-400">
                (auto-detected)
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white">
                <Building2 className="h-3.5 w-3.5" />
                {draft.jurisdiction}
              </span>
              <span className="text-xs text-slate-500">
                Automatically detected from your selected mohallah.
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="nearby-landmark"
              className={`${labelClass} mb-1.5 block`}
            >
              Nearby Landmark / Gate{" "}
              <span className="normal-case text-slate-400">(optional)</span>
            </label>
            <input
              id="nearby-landmark"
              type="text"
              value={draft.nearby_landmark ?? ""}
              onChange={(e) => update({ nearby_landmark: e.target.value })}
              placeholder="e.g., Near Main Market, Gate 2, Public Park"
              className={inputClass}
            />
          </div>
        </div>
      </Card>

      {/* Phone change modal */}
      {phoneOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close phone editor"
            onClick={cancelPhoneEdit}
            className="absolute inset-0 animate-overlay-in bg-slate-950/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Change mobile number"
            className="relative w-full max-w-md animate-in rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-base font-bold text-slate-900">
                  Change Mobile Number
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  We&apos;ll text a verification code to confirm the new
                  number.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelPhoneEdit}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white">
              <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 font-mono text-sm font-semibold text-slate-600">
                🇵🇰 +92
              </span>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePhone();
                }}
                placeholder="300 1234567"
                aria-label="New mobile number"
                autoFocus
                className="w-full px-3 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            {phoneError && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                {phoneError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelPhoneEdit}
                className="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePhone}
                className="whitespace-nowrap rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-emerald-900"
              >
                Save &amp; Send OTP
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
