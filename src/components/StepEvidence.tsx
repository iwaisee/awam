"use client";

import { useRef } from "react";
import { Camera, FileText, X } from "lucide-react";
import {
  AVAILABLE_TAGS,
  SEVERITY_META,
} from "@/types/report";
import type { ReportFormData } from "@/types/report";

interface StepEvidenceProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
}

export default function StepEvidence({ formData, updateForm }: StepEvidenceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTag = (tag: string) => {
    const tags = formData.tags.includes(tag)
      ? formData.tags.filter((t) => t !== tag)
      : [...formData.tags, tag];
    updateForm({ tags });
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    updateForm({ files: [...formData.files, ...Array.from(fileList)] });
  };

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
        <div className="grid grid-cols-3 gap-2">
          {Object.values(SEVERITY_META).map((severity) => {
            const selected = formData.severity === severity.id;
            return (
              <button
                key={severity.id}
                type="button"
                onClick={() => updateForm({ severity: severity.id })}
                aria-pressed={selected}
                className={`rounded-btn border px-3 py-2.5 text-center transition-colors ${
                  selected
                    ? "border-primary bg-primary-tint"
                    : "border-line bg-card hover:border-primary/40"
                }`}
              >
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${severity.pillClass}`}
                >
                  {severity.label}
                </span>
                <span className="urdu mt-1 block text-xs text-ink-soft">
                  {severity.urdu}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          {SEVERITY_META[formData.severity].description}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">
          Tags <span className="urdu text-ink-soft font-normal">ٹیگز</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TAGS.map((tag) => {
            const selected = formData.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selected
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-card text-ink-soft hover:border-primary/40"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">
          Photos <span className="urdu text-ink-soft font-normal">تصاویر</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-btn border-2 border-dashed border-line bg-canvas px-4 py-6 text-sm font-semibold text-ink-soft hover:border-primary/50 hover:text-primary"
        >
          <Camera className="h-5 w-5" />
          Attach photos of the issue
        </button>
        {formData.files.length > 0 && (
          <ul className="mt-2 space-y-2">
            {formData.files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-btn border border-line bg-card px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 truncate text-ink">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    updateForm({
                      files: formData.files.filter((_, i) => i !== index),
                    })
                  }
                  className="rounded-full p-1 text-ink-muted hover:bg-danger-tint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
