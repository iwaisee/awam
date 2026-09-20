"use client";

import { useMemo, useState } from "react";
import { MapPin, ChevronDown, Check, Building2 } from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { DEFAULT_JURISDICTION, shortJurisdiction } from "@/types/civic";
import type { ReportFormData } from "@/types/report";

/** Province labels for the wizard's province select. The pilot is
    Punjab-only; Islamabad appears in the City list as a Phase-2 district
    (not as a province option). */
const PILOT_PROVINCES: [string, string][] = [
  ["Punjab", "پنجاب"],
];

interface StepLocationProps {
  formData: ReportFormData;
  updateForm: (patch: Partial<ReportFormData>) => void;
}

export default function StepLocation({ formData, updateForm }: StepLocationProps) {
  const { cities, getReportableAreas } = useCoverage();
  const [areaQuery, setAreaQuery] = useState(formData.area);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Same roster as the landing launcher: every pilot district is listed so the
  // roadmap stays visible, but only active cities accept citizen reports.
  // Not filtered by province — coming-soon districts (Lahore, Islamabad) stay
  // visible as disabled rows regardless of their province/territory.
  const rosterCities = cities;
  const areas = getReportableAreas(formData.city);
  const selectedArea =
    areas.find((a) => a.name_en === formData.area) ?? null;

  // Town clusters (e.g. Sialkot → Cantonment, City, Villages). When the city
  // has them, a cascading select narrows the area search before it starts.
  const towns = useMemo(
    () =>
      [
        ...new Set(
          areas.map((a) => a.town).filter((t): t is string => Boolean(t))
        ),
      ].sort(),
    [areas]
  );
  const hasTowns = towns.length > 0;
  const areaPickerReady = !hasTowns || Boolean(formData.town);
  const searchPool =
    hasTowns && formData.town
      ? areas.filter((a) => a.town === formData.town)
      : hasTowns
        ? []
        : areas;
  const filteredAreas = searchPool.filter((area) =>
    area.name_en.toLowerCase().includes(areaQuery.trim().toLowerCase())
  );

  const handleProvinceChange = (province: string) => {
    // Cascading: a new province invalidates the city (and everything below).
    const sameProvince = cities.some(
      (city) => city.province === province && city.name_en === formData.city
    );
    updateForm(
      sameProvince ? { province } : { province, city: "", town: "", area: "" }
    );
    if (!sameProvince) {
      setAreaQuery("");
      setShowSuggestions(false);
    }
  };

  const handleCityChange = (city: string) => {
    updateForm({ city, town: "", area: "" });
    setAreaQuery("");
    setShowSuggestions(false);
  };

  const handleTownChange = (town: string) => {
    updateForm({ town, area: "" });
    setAreaQuery("");
    setShowSuggestions(false);
  };

  const handleAreaSelect = (area: (typeof areas)[number]) => {
    setAreaQuery(area.name_en);
    updateForm({ area: area.name_en });
    setShowSuggestions(false);
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">
          Where is the issue?
        </h2>
        <p className="urdu mt-0.5 text-sm text-ink-soft">
          مسئلہ کہاں ہے؟ اپنا مقام منتخب کریں۔
        </p>
      </div>

      <div>
        <label
          htmlFor="province"
          className="mb-1.5 block text-sm font-bold text-ink"
        >
          Province <span className="urdu text-ink-soft font-normal">صوبہ</span>
        </label>
        <div className="relative">
          <select
            id="province"
            value={formData.province}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className={`${inputClass} appearance-none pr-10`}
          >
            {PILOT_PROVINCES.map(([value, urdu]) => (
              <option key={value} value={value}>
                {value}
                {urdu && ` (${urdu})`}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Phase 1 pilot is live in Sialkot District. Lahore &amp; Islamabad
          open for reporting in Phase 2.
        </p>
      </div>

      <div>
        <label htmlFor="city" className="mb-1.5 block text-sm font-bold text-ink">
          City / District{" "}
          <span className="urdu text-ink-soft font-normal">شہر</span>
        </label>
        <div className="relative">
          <select
            id="city"
            value={formData.city}
            onChange={(e) => handleCityChange(e.target.value)}
            className={`${inputClass} appearance-none pr-10`}
          >
            <option value="">Select a city…</option>
            {rosterCities.map((city) => {
              const pilotLocked = city.status !== "active";
              return (
                <option key={city.id} value={city.name_en} disabled={pilotLocked}>
                  {city.name_en}{" "}
                  {city.name_ur && city.name_ur !== "—" && `(${city.name_ur})`}
                  {pilotLocked && " — Phase 2 Soon"}
                </option>
              );
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        </div>
      </div>

      {hasTowns && (
        <div>
          <label
            htmlFor="town"
            className="mb-1.5 block text-sm font-bold text-ink"
          >
            Town / Locality{" "}
            <span className="urdu text-ink-soft font-normal">ٹاؤن / مقام</span>
          </label>
          <div className="relative">
            <select
              id="town"
              value={formData.town}
              onChange={(e) => handleTownChange(e.target.value)}
              disabled={!formData.city}
              className={`${inputClass} appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-canvas`}
            >
              <option value="">Select a town / locality…</option>
              {towns.map((town) => (
                <option key={town} value={town}>
                  {town}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          </div>
        </div>
      )}

      <div className="relative">
        <label htmlFor="area" className="mb-1.5 block text-sm font-bold text-ink">
          Area / Union Council{" "}
          <span className="urdu text-ink-soft font-normal">علاقہ</span>
        </label>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            id="area"
            type="text"
            value={areaQuery}
            disabled={!formData.city || !areaPickerReady}
            placeholder={
              !formData.city
                ? "Select a city first"
                : !areaPickerReady
                  ? "Select a town / locality first"
                  : "Start typing to search areas…"
            }
            onChange={(e) => {
              setAreaQuery(e.target.value);
              updateForm({ area: "" });
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className={`${inputClass} pl-9 disabled:cursor-not-allowed disabled:bg-canvas`}
            autoComplete="off"
          />
        </div>
        {showSuggestions && formData.city && areaPickerReady && areaQuery.trim() !== "" && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-card shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            {filteredAreas.length > 0 ? (
              filteredAreas.map((area) => (
                <li key={area.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleAreaSelect(area)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-primary-tint"
                  >
                    <span>{area.name_en}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[10px] font-bold text-primary">
                          •{" "}
                          {shortJurisdiction(
                            area.jurisdiction ?? DEFAULT_JURISDICTION
                          )}
                        </span>
                        {formData.area === area.name_en && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </span>
                    </button>
                  </li>
                ))
            ) : (
              <li className="px-3 py-2.5 text-sm text-ink-muted">
                No matching areas in {formData.city}.
              </li>
            )}
          </ul>
        )}
        {showSuggestions && formData.city && areaPickerReady && areaQuery.trim() === "" && (
          <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-line bg-card shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            {filteredAreas.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAreaSelect(area)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-primary-tint"
                >
                  <span>{area.name_en}</span>
                    <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[10px] font-bold text-primary">
                      •{" "}
                      {shortJurisdiction(
                        area.jurisdiction ?? DEFAULT_JURISDICTION
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {selectedArea && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-ink">{selectedArea.name_en}</span>
            {selectedArea.town && (
              <span className="text-ink-muted">{selectedArea.town}</span>
            )}
            <span className="rounded-full bg-primary-tint px-2 py-0.5 font-bold text-primary">
              {selectedArea.jurisdiction}
            </span>
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="landmark"
          className="mb-1.5 block text-sm font-bold text-ink"
        >
          Nearby Landmark{" "}
          <span className="text-ink-muted font-normal">(optional)</span>{" "}
          <span className="urdu text-ink-soft font-normal">قریبی نشان</span>
        </label>
        <input
          id="landmark"
          type="text"
          value={formData.landmark}
          onChange={(e) => updateForm({ landmark: e.target.value })}
          placeholder="e.g. Near Imperial Gate, Cantt"
          className={inputClass}
        />
      </div>
    </div>
  );
}
