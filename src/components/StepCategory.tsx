"use client";

import { useMemo } from "react";
import { AlertTriangle, Check, Layers } from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { categoryIcon } from "@/lib/categoryIcons";
import { DEFAULT_JURISDICTION, shortJurisdiction } from "@/types/civic";
import {
  resolveLocation,
  resolveVisibleCategories,
} from "@/lib/reportSubmit";
import type { ReportFormData } from "@/types/report";

interface StepCategoryProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
}

const URGENCY_CHIP: Record<string, string> = {
  emergency: "bg-danger-tint text-danger",
  high: "bg-warning-tint text-warning",
  routine: "bg-primary-tint text-primary",
};

export default function StepCategory({ formData, updateForm }: StepCategoryProps) {
  const { cities, categories } = useCoverage();

  const location = useMemo(() => resolveLocation(cities, formData), [cities, formData]);
  const visibleCategories = useMemo(
    () => resolveVisibleCategories(categories, location),
    [categories, location]
  );
  const hiddenCount = categories.filter((c) => c.status === "active").length - visibleCategories.length;

  const jurisdiction = location?.area.jurisdiction;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">
          What kind of issue is it?
        </h2>
        <p className="urdu mt-0.5 text-sm text-ink-soft">
          مسئلے کی قسم منتخب کریں۔
        </p>
        {location && (
          <p className="mt-2 rounded-btn bg-canvas px-3 py-2 text-xs leading-5 text-ink-soft">
            Showing categories activated for{" "}
            <span className="font-bold text-ink">
              {location.area.name_en}, {location.city.name_en}
            </span>
            . Each card shows the local authority that will automatically
            receive your report.
          </p>
        )}
      </div>

      {visibleCategories.length === 0 ? (
        <div className="rounded-md border border-line bg-canvas px-4 py-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
          <p className="font-heading mt-3 text-base font-semibold text-ink">
            No categories available here yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-ink-soft">
            {categories.some((c) => c.status === "active")
              ? `The administration has not activated any hazard category for ${formData.city || "this city"}${jurisdiction ? ` — ${jurisdiction} areas` : ""}. Please go back and pick another area, or check again later.`
              : "The report taxonomy is currently disabled. Please check again later."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleCategories.map((category, index) => {
            const Icon = categoryIcon(category.icon_name);
            const selected = formData.category === category.id;
            const toggleCategory = () => {
              // Tapping the active card deselects it; switching cards always
              // resets the detailed-issue choice so it can never mismatch the
              // routing category.
              updateForm(
                selected
                  ? { category: null, selectedTags: [] }
                  : { category: category.id, selectedTags: [] }
              );
            };
            return (
              <div
                key={category.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={toggleCategory}
                onKeyDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    (e.key === "Enter" || e.key === " ")
                  ) {
                    e.preventDefault();
                    toggleCategory();
                  }
                }}
                style={{ animationDelay: `${index * 70}ms` }}
                className={`animate-card-in cursor-pointer rounded-md border bg-card p-4 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  selected
                    ? "border-emerald-600 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-600/25"
                    : "border-line hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] active:translate-y-0 active:scale-[0.99]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <Icon className="h-6 w-6 text-primary" strokeWidth={2} />
                  {selected && (
                    <span className="animate-in flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="font-heading mt-3 text-base font-semibold text-ink">
                  {category.name_en}
                </p>
                <p className="urdu text-sm text-primary">{category.name_ur}</p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  {category.description}
                </p>
                {/* Auto-routing indicator */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <Layers className="h-3 w-3" />
                    Handled by {category.default_agency}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${URGENCY_CHIP[category.urgency]}`}
                  >
                    {category.urgency}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                    SLA {category.sla_hours}h
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {visibleCategories.length > 0 && hiddenCount > 0 && (
        <p className="text-center text-[11px] text-ink-muted">
          {hiddenCount} other categor{hiddenCount === 1 ? "y is" : "ies are"} not
          available for {location?.area.name_en} (
          {shortJurisdiction(jurisdiction ?? DEFAULT_JURISDICTION)}) under
          the current admin rules.
        </p>
      )}
    </div>
  );
}
