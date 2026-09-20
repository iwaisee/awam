"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { CATEGORY_ICON_KEYS, categoryIcon } from "@/lib/categoryIcons";
import {
  AGENCY_OPTIONS,
  AGENCY_MANDATE,
  JURISDICTION_TYPES,
  type AgencyName,
  type CategoryRule,
  type JurisdictionType,
  type UrgencyLevel,
} from "@/types/civic";

/* ------------------------------- Form state ------------------------------- */

interface CatFormState {
  nameEn: string;
  nameUr: string;
  description: string;
  tagsInput: string;
  icon: string;
  agency: AgencyName;
  urgency: UrgencyLevel;
  slaHours: number;
  cityScopeAll: boolean;
  cities: string[];
  jurisdictionAll: boolean;
  jurisdictions: JurisdictionType[];
  active: boolean;
}

const EMPTY_FORM: CatFormState = {
  nameEn: "",
  nameUr: "",
  description: "",
  tagsInput: "",
  icon: "AlertOctagon",
  agency: "MCS",
  urgency: "routine",
  slaHours: 24,
  cityScopeAll: true,
  cities: [],
  jurisdictionAll: true,
  jurisdictions: [],
  active: true,
};

const URGENCY_PILLS: Record<UrgencyLevel, string> = {
  emergency: "bg-rose-100 text-rose-700",
  high: "bg-amber-100 text-amber-800",
  routine: "bg-slate-100 text-slate-600",
};

const JURISDICTION_CHECKS: { value: JurisdictionType; label: string }[] = [
  { value: "Municipal Corporation", label: "MCS Municipal" },
  { value: "Cantonment Board", label: "Cantonment Boards" },
  { value: "Development Authority", label: "Development Authority Schemes" },
  { value: "Private Housing", label: "Private Societies" },
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-700";

/* --------------------------------- View ----------------------------------- */

export default function CategoriesView() {
  const {
    cities,
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    toggleCategoryStatus,
  } = useCoverage();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CatFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cityNameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const city of cities) map.set(city.id, city.name_en);
    return map;
  }, [cities]);

  const cityOptions = useMemo(
    () => cities.filter((c) => c.status === "active"),
    [cities]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (cat: CategoryRule) => {
    setForm({
      nameEn: cat.name_en,
      nameUr: cat.name_ur === "—" ? "" : cat.name_ur,
      description: cat.description,
      tagsInput: cat.tags.join(", "),
      icon: cat.icon_name,
      agency: cat.default_agency,
      urgency: cat.urgency,
      slaHours: cat.sla_hours,
      cityScopeAll: cat.supported_cities.includes("all"),
      cities: cat.supported_cities.filter((id) => id !== "all"),
      jurisdictionAll: cat.allowed_jurisdictions.includes("all"),
      jurisdictions: cat.allowed_jurisdictions.filter(
        (j): j is JurisdictionType => j !== "all"
      ),
      active: cat.status === "active",
    });
    setEditingId(cat.id);
    setFormError("");
    setModalOpen(true);
  };

  const toggleCity = (cityId: string) => {
    setForm((f) => ({
      ...f,
      cities: f.cities.includes(cityId)
        ? f.cities.filter((id) => id !== cityId)
        : [...f.cities, cityId],
    }));
  };

  const toggleJurisdiction = (value: JurisdictionType) => {
    setForm((f) => ({
      ...f,
      jurisdictions: f.jurisdictions.includes(value)
        ? f.jurisdictions.filter((j) => j !== value)
        : [...f.jurisdictions, value],
    }));
  };

  const save = () => {
    const name = form.nameEn.trim();
    if (!name) {
      setFormError("Category name is required.");
      return;
    }
    if (!form.cityScopeAll && form.cities.length === 0) {
      setFormError("Pick at least one city, or switch back to All Pilot Cities.");
      return;
    }
    if (!form.jurisdictionAll && form.jurisdictions.length === 0) {
      setFormError("Pick at least one jurisdiction, or switch back to all.");
      return;
    }
    const rule: Omit<CategoryRule, "id"> = {
      name_en: name,
      name_ur: form.nameUr.trim() || "—",
      description: form.description.trim(),
      tags: form.tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 6),
      icon_name: form.icon,
      default_agency: form.agency,
      sla_hours: Math.max(1, Math.round(form.slaHours) || 1),
      urgency: form.urgency,
      status: form.active ? "active" : "disabled",
      supported_cities: form.cityScopeAll ? ["all"] : form.cities,
      allowed_jurisdictions: form.jurisdictionAll
        ? ["all"]
        : form.jurisdictions,
    };
    if (editingId) {
      updateCategory(editingId, rule);
      setToast(`Category “${name}” updated`);
    } else {
      addCategory(rule);
      setToast(`Category “${name}” created`);
    }
    setModalOpen(false);
  };

  const scopeSummary = (cat: CategoryRule) => {
    const cityPart = cat.supported_cities.includes("all")
      ? "All Pilot Cities"
      : cat.supported_cities.length === 0
        ? "No cities"
        : cat.supported_cities
            .map((id) => cityNameOf.get(id) ?? id)
            .join(", ");
    const jurPart = cat.allowed_jurisdictions.includes("all")
      ? "All jurisdictions"
      : cat.allowed_jurisdictions.join(", ");
    return { cityPart, jurPart };
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-heading text-base font-bold text-slate-900">
            Issue Categories &amp; SLA Rules
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            The cascading rule engine — each row below decides which hazards a
            citizen can report in a given city and jurisdiction, and who gets
            auto-routed.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-900"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Catalog grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {categories.map((cat) => {
          const Icon = categoryIcon(cat.icon_name);
          const { cityPart, jurPart } = scopeSummary(cat);
          return (
            <article
              key={cat.id}
              className={`rounded-2xl border p-5 shadow-xs transition-colors duration-150 ${
                cat.status === "active"
                  ? "border-slate-200/80 bg-white"
                  : "border-slate-200/60 bg-slate-100/60"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    cat.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-200/70 text-slate-400"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`font-heading truncate text-sm font-bold ${
                        cat.status === "active" ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      {cat.name_en}
                    </h3>
                    <span className="urdu text-xs text-emerald-700">
                      {cat.name_ur}
                    </span>
                    <span
                      className={`ml-auto whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        cat.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {cat.status === "active"
                        ? "Active — in citizen forms"
                        : "Hidden from citizens"}
                    </span>
                  </div>
                  <p
                    className={`mt-1 line-clamp-1 text-xs ${
                      cat.status === "active" ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    {cat.description}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">
                      {cat.default_agency}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">
                      SLA:{" "}
                      <span className="font-mono font-bold">{cat.sla_hours}h</span>
                    </span>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-bold capitalize ${URGENCY_PILLS[cat.urgency]}`}
                    >
                      {cat.urgency === "emergency" ? "🚨 Emergency" : cat.urgency}
                    </span>
                    <span
                      className="hidden max-w-[220px] truncate whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-100 sm:inline-block"
                      title={`${cityPart} • ${jurPart}`}
                    >
                      {cityPart} • {jurPart}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={cat.status === "active"}
                  aria-label={`Toggle ${cat.name_en}`}
                  onClick={() => toggleCategoryStatus(cat.id)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 ${
                    cat.status === "active" ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                      cat.status === "active" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    aria-label={`Edit ${cat.name_en}`}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Category
                  </button>
                  {confirmDelete === cat.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          removeCategory(cat.id);
                          setConfirmDelete(null);
                          setToast(`Category “${cat.name_en}” deleted`);
                        }}
                        className="whitespace-nowrap rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-rose-700"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        aria-label="Cancel delete"
                        className="rounded-lg border border-slate-200 p-2 text-slate-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(cat.id)}
                      aria-label={`Delete ${cat.name_en}`}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors duration-150 hover:border-rose-300 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {categories.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 xl:col-span-2">
            No categories configured — citizens would see an empty hazard picker.
            Add the first rule above.
          </div>
        )}
      </div>

      {/* ------------------------- Add / Edit modal ------------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close category editor"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-lg -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
            <div className="max-h-[85vh] overflow-y-auto p-6">
              <div className="flex items-start justify-between">
                <h2 className="font-heading text-lg font-bold text-slate-900">
                  {editingId ? "Edit Category" : "Add Category"}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cat-name" className={`${labelClass} mb-1.5 block`}>
                      Category Name (English)
                    </label>
                    <input
                      id="cat-name"
                      type="text"
                      value={form.nameEn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nameEn: e.target.value }))
                      }
                      placeholder="Industrial Smog & Smoke"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="cat-urdu" className={`${labelClass} mb-1.5 block`}>
                      Category Name (Urdu)
                    </label>
                    <input
                      id="cat-urdu"
                      type="text"
                      value={form.nameUr}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nameUr: e.target.value }))
                      }
                      placeholder="دھواں اور فضائی آلودگی"
                      dir="rtl"
                      className={`${inputClass} urdu`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cat-desc" className={`${labelClass} mb-1.5 block`}>
                    Description
                  </label>
                  <textarea
                    id="cat-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Short explanation of the hazard."
                    className={`${inputClass} resize-none`}
                  />
                </div>

                <div>
                  <label htmlFor="cat-tags" className={`${labelClass} mb-1.5 block`}>
                    Quick-Issue Tags
                  </label>
                  <input
                    id="cat-tags"
                    type="text"
                    value={form.tagsInput}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tagsInput: e.target.value }))
                    }
                    placeholder="e.g. Overflowing Dumpster, Dead Animal / Carcass"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Comma-separated one-tap pills shown under this category in
                    the reporting wizard (first 3 selections are kept).
                  </p>
                </div>

                <div>
                  <p className={`${labelClass} mb-1.5`}>Selectable Icon</p>
                  <div
                    role="radiogroup"
                    aria-label="Category icon"
                    className="grid grid-cols-6 gap-2"
                  >
                    {CATEGORY_ICON_KEYS.map((key) => {
                      const Icon = categoryIcon(key);
                      const selected = form.icon === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={key}
                          onClick={() => setForm((f) => ({ ...f, icon: key }))}
                          className={`flex h-11 items-center justify-center rounded-xl border transition-colors duration-150 ${
                            selected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-500 hover:border-emerald-300"
                          }`}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="cat-agency"
                      className={`${labelClass} mb-1.5 block`}
                    >
                      Default Agency (auto-routing)
                    </label>
                    <select
                      id="cat-agency"
                      value={form.agency}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          agency: e.target.value as AgencyName,
                        }))
                      }
                      className={`${inputClass} cursor-pointer`}
                    >
                      {AGENCY_OPTIONS.map((agency) => (
                        <option key={agency} value={agency}>
                          {agency}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] leading-4 text-slate-400">
                      {AGENCY_MANDATE[form.agency]}
                    </p>
                  </div>
                  <div>
                    <p className={`${labelClass} mb-1.5`}>Urgency Level</p>
                    <div
                      role="radiogroup"
                      aria-label="Urgency level"
                      className="flex rounded-xl bg-slate-100 p-1"
                    >
                      {(["routine", "high", "emergency"] as UrgencyLevel[]).map(
                        (u) => (
                          <button
                            key={u}
                            type="button"
                            role="radio"
                            aria-checked={form.urgency === u}
                            onClick={() =>
                              setForm((f) => ({ ...f, urgency: u }))
                            }
                            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors duration-150 ${
                              form.urgency === u
                                ? "bg-white text-emerald-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-900"
                            }`}
                          >
                            {u === "emergency" ? "🚨 Emergency" : u}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="cat-sla" className={`${labelClass} mb-1.5 block`}>
                    Mandated Resolution SLA (Hours)
                  </label>
                  <input
                    id="cat-sla"
                    type="number"
                    min={1}
                    max={720}
                    value={form.slaHours}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        slaHours: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className={inputClass}
                  />
                </div>

                {/* City scope */}
                <div className="rounded-xl border border-slate-200/80 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Building2 className="h-3.5 w-3.5 text-emerald-700" />
                      City Scope
                    </p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.cityScopeAll}
                      aria-label="All Pilot Cities"
                      onClick={() =>
                        setForm((f) => ({ ...f, cityScopeAll: !f.cityScopeAll }))
                      }
                      className={`flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ${
                        form.cityScopeAll
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {form.cityScopeAll ? "All Pilot Cities ✓" : "All Pilot Cities"}
                    </button>
                  </div>
                  {form.cityScopeAll ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Citizens in every active district will see this category.
                    </p>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {cityOptions.map((city) => {
                        const selected = form.cities.includes(city.id);
                        return (
                          <button
                            key={city.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleCity(city.id)}
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                              selected
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {city.name_en}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Jurisdiction compatibility */}
                <div className="rounded-xl border border-slate-200/80 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ShieldAlert className="h-3.5 w-3.5 text-emerald-700" />
                      Jurisdiction Compatibility
                    </p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.jurisdictionAll}
                      aria-label="All jurisdictions"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          jurisdictionAll: !f.jurisdictionAll,
                        }))
                      }
                      className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ${
                        form.jurisdictionAll
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {form.jurisdictionAll ? "All jurisdictions ✓" : "All jurisdictions"}
                    </button>
                  </div>
                  {form.jurisdictionAll ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Every UC type — municipal, cantonment, development
                      authority and private housing — can report this hazard.
                    </p>
                  ) : (
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      {JURISDICTION_CHECKS.map((check) => {
                        const selected = form.jurisdictions.includes(check.value);
                        return (
                          <label
                            key={check.value}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors duration-150 ${
                              selected
                                ? "border-emerald-600 bg-emerald-50/50 text-emerald-800"
                                : "border-slate-200 text-slate-600 hover:border-emerald-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleJurisdiction(check.value)}
                              className="h-3.5 w-3.5 accent-emerald-700"
                            />
                            {check.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Global active toggle */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Active for Citizen Reporting
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Disabling hides this category from every citizen form
                      immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.active}
                    aria-label="Active for citizen reporting"
                    onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 ${
                      form.active ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                        form.active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {formError && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {formError}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!form.nameEn.trim()}
                  className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Save Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {toast}
        </div>
      )}
    </div>
  );
}
