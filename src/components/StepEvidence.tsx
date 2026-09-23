"use client";

import { X } from "lucide-react";
import LiveReportCapture from "@/components/report/LiveReportCapture";
import { SEVERITY_MAP } from "@/config/severity";
import type { ReportFormData } from "@/types/report";

interface StepEvidenceProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
}

export default function StepEvidence({ formData, updateForm }: StepEvidenceProps) {
  const inputClass =
    "w-full rounded-btn border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">
          Describe the evidence
        </h2>
        <p className="urdu mt-0.5 text-sm text-ink-soft">
          ثبوت فراہم کریں — تصاویر اور تفصیل۔
        </p>
      </div>

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-bold text-ink">
          Report Title{" "}
          <span className="urdu text-ink-soft font-normal">عنوان</span>
        </label>
        <input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e) => updateForm({ title: e.target.value })}
          placeholder="e.g. Open manhole near main gate"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-1.5 block text-sm font-bold text-ink"
        >
          Description{" "}
          <span className="urdu text-ink-soft font-normal">تفصیل</span>
        </label>
        {formData.selectedTags.length > 0 && (
          <div
            aria-label="Tagged issues"
            className="mb-2 flex flex-wrap items-center gap-1.5 rounded-btn border border-primary/20 bg-primary-tint/50 px-3 py-2"
          >
            <span className="text-xs font-bold text-ink">
              Tagged Issues:
            </span>
            {formData.selectedTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-primary/25 bg-white px-2.5 py-0.5 text-xs font-semibold text-ink"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    updateForm({
                      selectedTags: formData.selectedTags.filter(
                        (t) => t !== tag
                      ),
                    })
                  }
                  className="rounded-full p-0.5 text-ink-muted transition-colors hover:bg-danger-tint hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          id="description"
          rows={4}
          value={formData.description}
          onChange={(e) => updateForm({ description: e.target.value })}
          placeholder="Explain what you saw, when it started, and who it affects…"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">
          Severity <span className="urdu text-ink-soft font-normal">شدت</span>
        </p>
        {/* Segmented severity tabs — canonical taxonomy from config/severity.
            Tint fills carry the urgency color; segments stay single-line down
            to 320px screens. */}
        <div
          role="group"
          aria-label="Severity شدت"
          className="grid grid-cols-3 gap-1 rounded-btn bg-canvas p-1"
        >
          {Object.values(SEVERITY_MAP).map((severity) => {
            const selected = formData.severity === severity.id;
            return (
              <button
                key={severity.id}
                type="button"
                onClick={() => updateForm({ severity: severity.id })}
                aria-pressed={selected}
                className={`rounded-btn px-1 py-2 text-center transition-all duration-150 ${
                  selected
                    ? `${severity.badgeClass} shadow-xs`
                    : "text-ink-soft hover:bg-white/70"
                }`}
              >
                <span className="block text-xs font-bold leading-tight">
                  {severity.labelEn}
                </span>
                <span className="urdu mt-0.5 block text-[11px] leading-none opacity-80">
                  {severity.labelUr}
                </span>
              </button>
            );
          })}
        </div>
        {/* Bilingual helper text + SLA promise, synced to the selection. */}
        {(() => {
          const severity = SEVERITY_MAP[formData.severity];
          return (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${severity.badgeClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${severity.dotClass}`} />
                SLA:
                {/* Urdu in its own isolated span so the RTL digits keep their order */}
                <span className="urdu font-bold">{severity.slaDisplayUr}</span>
              </span>
              <p className="text-xs leading-5 text-ink-soft">
                {severity.descriptionEn}
                <span className="urdu text-ink-soft"> — {severity.descriptionUr}</span>
              </p>
            </div>
          );
        })()}
      </div>

      <div>
        <LiveReportCapture
          storedFile={formData.files[0] ?? null}
          storedGeo={formData.geo}
          storedCapturedAt={formData.capturedAt}
          onConfirm={({ file, geo, capturedAt }) =>
            updateForm({ files: [file], geo, capturedAt })
          }
          onRemove={() => updateForm({ files: [], geo: null, capturedAt: null })}
        />
      </div>
    </div>
  );
}
