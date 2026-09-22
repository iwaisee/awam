"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Layers, Camera, ClipboardCheck, ChevronLeft, ChevronRight } from "lucide-react";
import StepLocation from "@/components/StepLocation";
import StepCategory from "@/components/StepCategory";
import StepEvidence from "@/components/StepEvidence";
import StepReview from "@/components/StepReview";
import StepConfirmation from "@/components/StepConfirmation";
import { emptyReport } from "@/types/report";
import type { ReportFormData } from "@/types/report";
import { readDownscaledDataUrl } from "@/lib/imageDataUrl";
import { useCoverage } from "@/context/CoverageContext";
import {
  buildReportPayload,
  resolveLocation,
  resolveVisibleCategories,
} from "@/lib/reportSubmit";
import type { CityItem, IncidentReport } from "@/types/civic";

const STEPS = [
  {
    label: "Location",
    urdu: "مقام",
    icon: MapPin,
  },
  {
    label: "Category",
    urdu: "قسم",
    icon: Layers,
  },
  {
    label: "Evidence",
    urdu: "ثبوت",
    icon: Camera,
  },
  {
    label: "Review & Submit",
    urdu: "جائزہ",
    icon: ClipboardCheck,
  },
] as const;

const TOTAL_STEPS = STEPS.length; // 4; step index 4 = confirmation view

/**
 * Landing deep links pass the stable city slug (/report?city=sialkot) while
 * the coverage dataset keys the wizard on name_en — accept either. Cities the
 * coverage data has disabled resolve to "" so the citizen picks one manually.
 */
function resolveCityParam(
  cities: CityItem[],
  param: string | null
): string {
  if (!param) return "";
  const needle = param.trim().toLowerCase();
  const match = cities.find(
    (c) => c.name_en.toLowerCase() === needle || c.id.toLowerCase() === needle
  );
  return match && match.status === "active" ? match.name_en : "";
}

export default function WizardShell({
  initialCategory = null,
  initialCity = null,
}: {
  initialCategory?: string | null;
  initialCity?: string | null;
}) {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { getReportableAreas, cities, categories, hydrated: coverageLoaded } = useCoverage();
  const [formData, setFormData] = useState<ReportFormData>(() => ({
    ...emptyReport,
    category: initialCategory,
    city: resolveCityParam(cities, initialCity),
  }));

  /* Re-resolve the deep-linked district once the Neon roster arrives — the
     initial state ran against an empty (pre-fetch) coverage tree. */
  useEffect(() => {
    if (!coverageLoaded) return;
    setFormData((prev) =>
      prev.city
        ? prev
        : { ...prev, city: resolveCityParam(cities, initialCity) }
    );
    // Runs when the roster first arrives; later roster edits must not
    // rewrite the citizen's in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageLoaded]);
  const [referenceId, setReferenceId] = useState("");
  const [submittedReport, setSubmittedReport] = useState<IncidentReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateForm = (patch: Partial<ReportFormData>) => {
    // Cascading state machine: changing the location invalidates the category
    // choice (and its quick-issue pills), because the visible taxonomy
    // depends on city + jurisdiction.
    const locationChanged = "city" in patch || "area" in patch;
    setFormData((prev) => ({
      ...prev,
      ...patch,
      ...(locationChanged ? { category: null, selectedTags: [] } : {}),
    }));
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));
  const goToStep = (target: number) => {
    if (target < 0 || target > TOTAL_STEPS) return;
    // Only allow jumping to steps already completed in this session.
    if (target > step && !isStepReachable(target)) return;
    setStep(target);
  };

  const isStepReachable = (target: number) => {
    if (target <= step) return true;
    return canProceedUpTo(target - 1);
  };

  const canProceedUpTo = (completedStep: number) => {
    if (completedStep >= 0) {
      const validAreas = getReportableAreas(formData.city).map((a) => a.name_en);
      if (!formData.city || !validAreas.includes(formData.area)) return false;
    }
    if (completedStep >= 1) {
      const location = resolveLocation(cities, formData);
      const visible = resolveVisibleCategories(categories, location);
      if (!formData.category || !visible.some((c) => c.id === formData.category))
        return false;
    }
    if (completedStep >= 2) {
      if (!formData.title.trim() || !formData.description.trim()) return false;
      // Proof-of-Presence gate: a verified live capture (GPS fix + stamped
      // photo) is mandatory evidence before review.
      if (!formData.geo || formData.files.length === 0) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    const location = resolveLocation(cities, formData);
    if (!location) {
      setSubmitError("Your selected location is no longer available — please pick it again.");
      return;
    }
    const rule =
      resolveVisibleCategories(categories, location).find(
        (c) => c.id === formData.category
      ) ?? null;
    if (!rule) {
      setSubmitError("That category is no longer available for this area — please pick it again.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // The verified live capture rides along as a downscaled data URL —
      // the GPS/timestamp badge is part of the pixels, so it survives.
      const photoFile = formData.files[0];
      const photo_url = photoFile
        ? await readDownscaledDataUrl(photoFile, { maxSize: 900, square: false })
        : undefined;
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildReportPayload(formData, location, rule),
          photo_url,
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        ticket_id?: string;
        report?: IncidentReport;
        error?: string;
      };
      if (!response.ok || !data.success || !data.ticket_id || !data.report) {
        throw new Error(data.error ?? `Server error (${response.status})`);
      }
      setReferenceId(data.ticket_id);
      setSubmittedReport(data.report);
      setStep(TOTAL_STEPS);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not submit the report — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewReport = () => {
    setFormData(emptyReport);
    setReferenceId("");
    setSubmittedReport(null);
    setSubmitError(null);
    setStep(0);
  };

  const canContinue =
    step < TOTAL_STEPS &&
    (step === 0
      ? !!formData.city &&
        !!formData.area &&
        getReportableAreas(formData.city).some((a) => a.name_en === formData.area)
      : step === 1
        ? formData.category !== null &&
          canProceedUpTo(1)
        : step === 2
          ? formData.title.trim() !== "" &&
            formData.description.trim() !== "" &&
            // Verified live capture required (see canProceedUpTo).
            formData.geo !== null &&
            formData.files.length > 0
          : true);

  return (
    <div className="flex items-start justify-center bg-canvas px-4 py-10 sm:py-14">
      <main className="w-full max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-primary">
            Sada-e-Awam
          </h1>
          <p className="urdu text-lg text-ink-soft">صدائے عوام — آوازِ شہری</p>
        </header>

        <div className="rounded-card-lg border border-line bg-card p-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)] sm:p-8">
          {!coverageLoaded ? (
            <div className="space-y-4">
              <div className="h-10 animate-pulse rounded-xl bg-canvas" />
              <div className="h-24 animate-pulse rounded-xl bg-canvas" />
              <div className="h-12 animate-pulse rounded-xl bg-canvas" />
            </div>
          ) : (
          <>
          {step < TOTAL_STEPS && (
            <nav aria-label="Report progress" className="mb-8">
              <ol className="flex items-start">
                {STEPS.map((s, index) => {
                  const Icon = s.icon;
                  const completed = index < step;
                  const current = index === step;
                  const reachable = isStepReachable(index);
                  return (
                    <li key={s.label} className="flex flex-1 items-start last:flex-none">
                      <button
                        type="button"
                        onClick={() => goToStep(index)}
                        disabled={!reachable}
                        className="group flex w-20 flex-col items-center gap-1.5 disabled:cursor-default sm:w-24"
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                            completed
                              ? "border-primary bg-primary text-white"
                              : current
                                ? "border-primary bg-card text-primary ring-4 ring-primary/15"
                                : "border-line bg-card text-ink-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span
                          className={`text-center text-[11px] font-bold leading-tight sm:text-xs ${
                            completed || current ? "text-primary" : "text-ink-muted"
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="urdu -mt-0.5 text-[11px] leading-none text-ink-soft">
                          {s.urdu}
                        </span>
                      </button>
                      {index < STEPS.length - 1 && (
                        <span
                          aria-hidden
                          className={`mt-[1.125rem] h-0.5 flex-1 ${
                            index < step ? "bg-primary" : "bg-line"
                          }`}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {step === 0 && <StepLocation formData={formData} updateForm={updateForm} />}
          {step === 1 && <StepCategory formData={formData} updateForm={updateForm} />}
          {step === 2 && <StepEvidence formData={formData} updateForm={updateForm} />}
          {step === 3 && (
            <StepReview
              formData={formData}
              updateForm={updateForm}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          )}
          {step === TOTAL_STEPS && (
            <StepConfirmation
              referenceId={referenceId}
              formData={formData}
              report={submittedReport}
              onNewReport={handleNewReport}
              onTrack={() => router.push(`/track?id=${encodeURIComponent(referenceId)}`)}
            />
          )}

          {step < TOTAL_STEPS && (
            <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={prevStep}
                disabled={step === 0}
                className="flex items-center gap-1.5 rounded-btn border-2 border-primary px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary-tint disabled:border-line disabled:text-ink-muted disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {step < TOTAL_STEPS - 1 && (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canContinue}
                  className="flex items-center gap-1.5 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:border disabled:border-line disabled:bg-line disabled:text-ink-muted disabled:hover:bg-line"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          A public-interest civic reporting service — Phase 1 pilot live in
          Sialkot District.
        </p>
      </main>
    </div>
  );
}
