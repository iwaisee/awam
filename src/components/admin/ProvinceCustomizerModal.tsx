"use client";

/* Province / Territory creator & editor — the "Add Province / Region" dialog.
   Five validated fields (identity, administrative code, pilot status, default
   administrative model) beside an unclipped live Directory Card preview.
   Persistence stays presentational — the studio validates and hands a
   ProvinceItem back via onSave. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Landmark,
  MapPin,
  Siren,
  Sparkles,
  Trash2,
  Users,
  X,
  Building2,
  type LucideIcon,
} from "lucide-react";
import {
  ADMIN_MODEL_OPTIONS,
  type AdminModel,
  type ProvinceItem,
  type ProvinceLifecycle,
} from "@/types/civic";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-700";
const groupLabelClass =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400";

/** Pilot status choices — the dropdown mirrors the rollout ladder. */
type StatusChoice = "pilot" | "setup" | "planned" | "operational";

const STATUS_OPTIONS: { value: StatusChoice; label: string }[] = [
  { value: "pilot", label: "Phase 1 Active Pilot" },
  { value: "setup", label: "Infrastructure Setup" },
  { value: "planned", label: "Planned Phase 2" },
];

const lifecycleFor = (choice: StatusChoice): ProvinceLifecycle =>
  choice === "operational"
    ? "full_rollout"
    : choice === "setup"
      ? "infrastructure"
      : choice === "planned"
        ? "planned"
        : "phase1_pilot";

const statusForLifecycle = (lifecycle?: ProvinceLifecycle): StatusChoice =>
  lifecycle === "full_rollout"
    ? "operational"
    : lifecycle === "infrastructure"
      ? "setup"
      : lifecycle === "planned"
        ? "planned"
        : "pilot";

export default function ProvinceCustomizerModal({
  province,
  existingNames,
  existingCodes,
  onCancel,
  onDelete,
  onSave,
}: {
  /** When provided the modal opens in edit mode, prefilled from this record;
      omit it for the clean create flow. */
  province?: ProvinceItem;
  existingNames: string[];
  /** Codes AND slugs already assigned to other regions. */
  existingCodes: string[];
  onCancel: () => void;
  /** Edit mode only — opens the type-to-confirm deletion dialog. */
  onDelete?: () => void;
  /** Persist the built province; the parent creates/updates and routes the
      follow-up flow (district setup on create). */
  onSave: (province: ProvinceItem) => void;
}) {
  const isEdit = Boolean(province);
  const [nameEn, setNameEn] = useState(province?.name_en ?? "");
  const [nameUr, setNameUr] = useState(province?.name_ur ?? "");
  const [code, setCode] = useState(province?.slug ?? "");
  const [statusChoice, setStatusChoice] = useState<StatusChoice>(
    statusForLifecycle(province?.lifecycle)
  );
  const [adminModel, setAdminModel] = useState<AdminModel>(
    province?.admin_model ?? "provincial_lg_dept"
  );
  // Stored identifiers are already canonical — renaming the province must
  // not silently rewrite them.
  const [codeDirty, setCodeDirty] = useState(Boolean(province?.slug));
  const nameRef = useRef<HTMLInputElement>(null);

  /* Escape closes the modal — nothing is saved silently. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /* Auto administrative code — derived until the admin overrides it. */
  const autoCode = useMemo(() => {
    const alpha = nameEn.replace(/[^A-Za-z]/g, "");
    return `PK-${(alpha.slice(0, 2) || "XX").toUpperCase()}`;
  }, [nameEn]);
  const effectiveCode = (codeDirty ? code : autoCode).toUpperCase();
  /* Registry code (PROV-…) is kept canonical: preserved on edit, derived on
     create — it stays stable while the ISO-style code stays human-editable. */
  const registryCode = useMemo(() => {
    if (province?.code) return province.code;
    const alpha = nameEn.replace(/[^A-Za-z]/g, "");
    return `PROV-${(alpha.slice(0, 3) || "XXX").toUpperCase()}`;
  }, [province?.code, nameEn]);

  const nameOverlap = existingNames.some(
    (n) => n.toLowerCase() === nameEn.trim().toLowerCase()
  );
  const codeOverlap = existingCodes.some(
    (c) => c.toUpperCase() === effectiveCode
  );
  const codeFormatOk = /^[A-Z0-9-]{3,24}$/.test(effectiveCode);
  const identityOk = nameEn.trim().length > 0 && nameUr.trim().length > 0;
  const canSave = identityOk && codeFormatOk && !nameOverlap && !codeOverlap;

  const buildProvince = (): ProvinceItem => ({
    kind: province?.kind ?? "province",
    name_en: nameEn.trim(),
    name_ur: nameUr.trim() || undefined,
    capital: province?.capital,
    code: registryCode,
    slug: effectiveCode,
    lifecycle: lifecycleFor(statusChoice),
    status: province?.status ?? "active",
    admin_model: adminModel,
  });

  const modelMeta =
    ADMIN_MODEL_OPTIONS.find((o) => o.value === adminModel) ??
    ADMIN_MODEL_OPTIONS[0];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit province or territory" : "Add new province or territory"}
    >
      <button
        type="button"
        aria-label="Close province dialog"
        onClick={onCancel}
        className="fixed inset-0 cursor-default bg-slate-950/50 backdrop-blur-sm"
      />
      <div className="relative mx-auto my-4 w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl sm:my-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200/70 bg-emerald-50 text-[#0F5132]">
              <Landmark className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading truncate text-lg font-black tracking-tight text-slate-900">
                {isEdit ? "Edit Province or Territory" : "Add Province / Region"}
              </h2>
              <p className="urdu truncate text-xs font-semibold text-emerald-800">
                {isEdit ? "صوبہ میں ترمیم کریں" : "نیا صوبہ یا وفاقی علاقہ شامل کریں"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-full p-2 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body split */}
        <div className="grid grid-cols-1 min-h-[460px] lg:grid-cols-12">
          {/* Left: the five validated fields */}
          <form
            className="space-y-5 border-b border-slate-100 bg-white p-6 sm:p-7 lg:col-span-7 lg:border-b-0 lg:border-r"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) onSave(buildProvince());
            }}
          >
            {/* Group 1: Public identity */}
            <div className="space-y-4">
              <p className={groupLabelClass}>Regional Identity — Tier 1 · Province (صوبہ)</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pc-name-en" className={`${labelClass} mb-1.5 block`}>
                    Province / Territory Name (English) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="pc-name-en"
                    ref={nameRef}
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Khyber Pakhtunkhwa"
                    className={`${inputClass} ${
                      nameEn.trim() && nameOverlap
                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                        : ""
                    }`}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="pc-name-ur" className={`${labelClass} mb-1.5 block`}>
                    Province Name in Urdu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="pc-name-ur"
                    type="text"
                    value={nameUr}
                    onChange={(e) => setNameUr(e.target.value)}
                    placeholder="خیبر پختونخوا"
                    dir="rtl"
                    className={`${inputClass} urdu text-right font-medium`}
                  />
                </div>
              </div>
              {nameEn.trim() && nameOverlap && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                  <AlertTriangle className="h-3 w-3" />
                  A province with this name already exists.
                </p>
              )}
            </div>

            {/* Group 2: Codes, status, administrative model */}
            <div className="space-y-4 pt-2">
              <p className={groupLabelClass}>Administrative Configuration</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pc-code" className={`${labelClass} mb-1.5 block`}>
                    Administrative Code{" "}
                    <span className="font-normal normal-case tracking-normal text-slate-400">
                      (auto, override allowed)
                    </span>
                  </label>
                  <input
                    id="pc-code"
                    type="text"
                    value={effectiveCode}
                    onChange={(e) => {
                      setCodeDirty(true);
                      setCode(e.target.value);
                    }}
                    placeholder="PK-KP"
                    className={`${inputClass} font-mono ${
                      codeOverlap
                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                        : ""
                    }`}
                  />
                  {codeOverlap ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                      <AlertTriangle className="h-3 w-3" />
                      Already assigned to another region.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      ISO-style regional key · registry {registryCode}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="pc-status"
                    className={`${labelClass} mb-1.5 block`}
                  >
                    Pilot Status
                  </label>
                  <select
                    id="pc-status"
                    value={statusChoice}
                    onChange={(e) =>
                      setStatusChoice(e.target.value as StatusChoice)
                    }
                    className={`${inputClass} cursor-pointer`}
                  >
                    {/* "Fully Operational" only ever appears in edit mode for
                        regions saved before this ladder existed. */}
                    {(statusChoice === "operational"
                      ? [{ value: "operational" as const, label: "Fully Operational" }, ...STATUS_OPTIONS]
                      : STATUS_OPTIONS
                    ).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Drives the card&apos;s rollout badge
                  </p>
                </div>
              </div>

              <fieldset>
                <legend className={`${labelClass} mb-1.5 block`}>
                  Default Administrative Model
                </legend>
                <div className="space-y-1.5">
                  {ADMIN_MODEL_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-150 ${
                        adminModel === option.value
                          ? "border-emerald-300 bg-emerald-50/70"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pc-admin-model"
                        value={option.value}
                        checked={adminModel === option.value}
                        onChange={() => setAdminModel(option.value)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#0F5132]"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-slate-900">
                          {option.label}
                        </span>
                        <span className="block text-[10px] leading-4 text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {/* Danger zone — sits below the model, kept away from the save
                flow; wired only in edit mode via onDelete. */}
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600 transition-colors duration-150 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Province
              </button>
            )}
          </form>

          {/* Right: live directory card preview */}
          <aside
            aria-label="Live directory card preview"
            className="flex flex-col space-y-3 bg-slate-50/60 p-6 sm:p-7 lg:col-span-5"
          >
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Live Directory Card
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                Real-time representation of how this province card appears on
                the main console.
              </p>
            </div>

            <article className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-100 text-lg font-black text-slate-700"
                  >
                    {(nameEn.trim() || "U").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h4 className="truncate text-lg font-black tracking-tight text-slate-900">
                        {nameEn.trim() || "Untitled Province"}
                      </h4>
                      {nameUr.trim() && (
                        <span className="urdu rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-900">
                          {nameUr.trim()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2x2 telemetry grid — zeros until districts are filed */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    icon: Building2,
                    label: "Total Cities",
                    labelUr: "کل شہر",
                    value: "0 Managed",
                    sub: "0 Active",
                  },
                  {
                    icon: MapPin,
                    label: "Wards & Localities",
                    labelUr: "وارڈ / محلہ",
                    value: "0",
                    sub: "none registered yet",
                  },
                  {
                    icon: Landmark,
                    label: "Departments",
                    labelUr: "محکمے",
                    value: "0 Departments",
                    sub: "none linked yet",
                  },
                  {
                    icon: Users,
                    label: "Squads Active",
                    labelUr: "ٹیمیں",
                    value: "0 Active Squads",
                    sub: "combined on-ground teams",
                  },
                ].map(
                  (tile: {
                    icon: LucideIcon;
                    label: string;
                    labelUr?: string;
                    value: string;
                    sub?: string;
                  }) => {
                  const TileIcon = tile.icon;
                  return (
                    <div
                      key={tile.label}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-2.5"
                    >
                      <p className="flex items-start gap-1 text-[9px] font-semibold uppercase leading-3 tracking-wide text-slate-400">
                        <TileIcon className="h-3 w-3 shrink-0" />
                        {tile.label}
                        {tile.labelUr && (
                          <span className="urdu shrink-0 text-[10px] font-normal normal-case tracking-normal text-slate-400">
                            {tile.labelUr}
                          </span>
                        )}
                      </p>
                      <p className="mt-1.5 text-xs font-semibold text-slate-900">
                        {tile.value}
                      </p>
                      {tile.sub && (
                        <p className="mt-1 text-[10px] font-medium text-slate-500">
                          {tile.sub}
                        </p>
                      )}
                    </div>
                  );
                  }
                )}
              </div>

              {/* Reports & Issues — standalone caseload strip (silent until
                  the province logs its first report) */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-[9px] font-semibold uppercase leading-3 tracking-wide text-slate-400">
                    <Siren className="h-3 w-3 shrink-0" />
                    Reports &amp; Issues
                    <span className="urdu shrink-0 text-[10px] font-normal normal-case tracking-normal text-slate-400">
                      رپورٹس
                    </span>
                  </p>
                  <span className="shrink-0 text-[9px] font-bold text-slate-400">
                    No reports yet
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="text-xs font-black text-slate-900">
                    0
                    <span className="ml-1 text-[9px] font-semibold text-slate-400">
                      Reported
                    </span>
                  </span>
                  <span className="text-xs font-black text-amber-700">
                    0
                    <span className="ml-1 text-[9px] font-semibold text-amber-600/80">
                      Open
                    </span>
                  </span>
                  <span className="text-xs font-black text-emerald-700">
                    0
                    <span className="ml-1 text-[9px] font-semibold text-emerald-700/80">
                      Resolved
                    </span>
                  </span>
                </div>
              </div>

              {/* Administrative model footer */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  Default Administrative Model
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800">
                  {modelMeta.label}
                </p>
              </div>
            </article>
          </aside>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-slate-500 transition-colors duration-150 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (canSave) onSave(buildProvince());
            }}
            className="rounded-xl bg-[#0F5132] px-6 py-2.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100"
          >
            {isEdit ? "Save Changes" : "Save & Open District Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
