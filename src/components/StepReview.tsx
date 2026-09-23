"use client";

import { Eye, EyeOff, MapPin, Tag, AlertTriangle, Send, ShieldCheck } from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { resolveLocation, resolveVisibleCategories } from "@/lib/reportSubmit";
import { SEVERITY_MAP } from "@/config/severity";
import type { ReportFormData } from "@/types/report";

interface StepReviewProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitError?: string | null;
}

export default function StepReview({
  formData,
  updateForm,
  onSubmit,
  submitting = false,
  submitError = null,
}: StepReviewProps) {
  const { cities, categories } = useCoverage();
  const location = resolveLocation(cities, formData);
  const rule =
    location && formData.category
      ? resolveVisibleCategories(categories, location).find(
          (c) => c.id === formData.category
        ) ?? null
      : null;
  const severity = SEVERITY_MAP[formData.severity];

  const inputClass =
    "w-full rounded-btn border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">
          Review your report
        </h2>
        <p className="urdu mt-0.5 text-sm text-ink-soft">
          جمع کرنے سے پہلے جائزہ لیں۔
        </p>
      </div>

      <section className="rounded-md border border-line bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Location
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
          <MapPin className="h-4 w-4 text-primary" />
          {[formData.area, formData.city, formData.province].filter(Boolean).join(", ")}
        </p>
        {location && (
          <p className="mt-1 pl-6 text-xs text-ink-soft">
            {[location.area.town, location.area.jurisdiction]
              .filter(Boolean)
              .join(" • ")}
          </p>
        )}
        {formData.landmark && (
          <p className="mt-1 pl-6 text-xs text-ink-soft">{formData.landmark}</p>
        )}
      </section>

      <section className="rounded-md border border-line bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Category &amp; Severity
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">
            {rule ? rule.name_en : "Not selected"}
          </span>
          {formData.selectedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-primary/25 bg-[#d0fae5] px-2.5 py-1 text-[10px] font-bold text-primary"
            >
              {tag}
            </span>
          ))}
          <span
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${severity.badgeClass}`}
          >
            <AlertTriangle className="h-3 w-3" />
            {severity.labelEn}
          </span>
        </div>
        {rule && (
          <p className="mt-2.5 rounded-btn bg-canvas px-3 py-2 text-xs leading-5 text-ink-soft">
            <span className="font-bold text-ink">Auto-routing:</span> this report
            will be assigned to{" "}
            <span className="font-bold text-primary">{rule.default_agency}</span>{" "}
            with a {rule.sla_hours}-hour mandated resolution deadline.
          </p>
        )}
        {formData.tags.length > 0 && (
          <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <Tag className="h-3.5 w-3.5 text-primary" />
            {formData.tags.join(" · ")}
          </p>
        )}
      </section>

      <section className="rounded-md border border-line bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Evidence
        </p>
        <p className="mt-1.5 text-sm font-semibold text-ink">
          {formData.title || "Untitled report"}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-soft">
          {formData.description || "No description provided."}
        </p>
        {formData.files.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            {formData.files.length} photo{formData.files.length > 1 ? "s" : ""} attached
          </p>
        )}
        {formData.files.length > 0 && formData.geo && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Presence verified — live capture (±
            {Math.round(formData.geo.accuracyMeters)}m GPS
            {formData.capturedAt
              ? `, ${new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Karachi",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }).format(new Date(formData.capturedAt))} PKT`
              : ""}
            )
          </p>
        )}
      </section>

      <section className="rounded-md border border-line bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Contact & Privacy
        </p>
        <label className="mt-2 flex cursor-pointer items-center gap-3 text-sm text-ink">
          <button
            type="button"
            role="switch"
            aria-checked={formData.isAnonymous}
            onClick={() => updateForm({ isAnonymous: !formData.isAnonymous })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              formData.isAnonymous ? "bg-primary" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                formData.isAnonymous ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
          <span className="flex items-center gap-1.5">
            {formData.isAnonymous ? (
              <EyeOff className="h-4 w-4 text-primary" />
            ) : (
              <Eye className="h-4 w-4 text-primary" />
            )}
            Submit anonymously (صدائے عوام رضاکارانہ ہے)
          </span>
        </label>
        {!formData.isAnonymous && (
          <div className="mt-3">
            <label
              htmlFor="phone"
              className="mb-1.5 block text-sm font-bold text-ink"
            >
              Phone Number{" "}
              <span className="text-ink-muted font-normal">
                (for follow-up)
              </span>
            </label>
            <input
              id="phone"
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => updateForm({ phoneNumber: e.target.value })}
              placeholder="03XX-XXXXXXX"
              className={inputClass}
            />
          </div>
        )}
      </section>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint px-3 py-2.5 text-xs font-semibold leading-5 text-danger"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-primary"
      >
        <Send className="h-4 w-4" />
        {submitting ? "Submitting your report…" : "Submit Report"}
      </button>
    </div>
  );
}
