"use client";

import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import {
  resolveLocation,
  resolveVisibleCategories,
} from "@/lib/reportSubmit";
import { subIssuesFor } from "@/data/subIssues";
import type { ReportFormData } from "@/types/report";

interface StepIssueDetailProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
}

/* Step 3 — the Suthra-style detailed issue menu. One required choice, written
   into selectedTags[0] so the ledger's existing tag channel, the feed's
   hashtag chip and the admin triage view all classify by it. */

export default function StepIssueDetail({
  formData,
  updateForm,
}: StepIssueDetailProps) {
  const { cities, categories } = useCoverage();

  const rule = useMemo(() => {
    const location = resolveLocation(cities, formData);
    return (
      resolveVisibleCategories(categories, location).find(
        (c) => c.id === formData.category
      ) ?? null
    );
  }, [cities, categories, formData]);

  const options = useMemo(() => (rule ? subIssuesFor(rule) : []), [rule]);
  const selected = formData.selectedTags[0] ?? null;

  const choose = (option: string) => {
    // Single choice; tapping the active tile retracts it (the citizen picks
    // again before Continue unlocks).
    updateForm({
      selectedTags: selected === option ? [] : [option],
    });
  };

  if (!rule) {
    return (
      <div className="rounded-md border border-line bg-canvas px-4 py-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
        <p className="font-heading mt-3 text-base font-semibold text-ink">
          Pick a category first
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-ink-soft">
          Go back one step and choose the department that handles your issue —
          then its detailed issue list appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">
          Which issue is it exactly?
        </h2>
        <p className="urdu mt-0.5 text-sm text-ink-soft">
          قریب ترین مسئلہ چنیں — تفصیلی قسم
        </p>
        <p className="mt-2 rounded-btn bg-canvas px-3 py-2 text-xs leading-5 text-ink-soft">
          Detailed complaint types for{" "}
          <span className="font-bold text-ink">{rule.name_en}</span> — the same
          menu the {rule.default_agency} complaint cell uses, so your report
          lands on the right desk.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((option, index) => {
          const active = selected === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => choose(option)}
              style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}
              className={`animate-card-in flex items-start justify-between gap-2 rounded-md border bg-card p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active
                  ? "border-emerald-600 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-600/25"
                  : "border-line hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)] active:translate-y-0 active:scale-[0.99]"
              }`}
            >
              <span className="min-w-0 text-xs font-semibold leading-5 text-ink">
                {option}
              </span>
              {active && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-ink-muted">
        Not sure? Choose the closest one — the description field carries the
        specifics.
      </p>
    </div>
  );
}
