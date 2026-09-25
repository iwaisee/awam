"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Globe,
  ListFilter,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useCoverage } from "@/context/CoverageContext";
import { CATEGORY_ICON_KEYS, categoryIcon } from "@/lib/categoryIcons";
import { SUB_ISSUES } from "@/data/subIssues";
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
  /** Detailed issue menu rows — composed into the category's tags array. */
  subIssues: { en: string; ur: string }[];
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

/* The menu's stored form is one string per issue with the Urdu copy in a
   trailing parenthetical — "Heaps of Garbage (کچرے کے ڈھیر)" — the same
   convention the reference taxonomy renders. The editor splits rows into
   separate English/Urdu inputs and recomposes on save. */
function splitIssue(raw: string): { en: string; ur: string } {
  const match = raw.trim().match(/^(.*?)\s*\(([^()]*)\)$/);
  if (match && match[1].trim()) return { en: match[1].trim(), ur: match[2].trim() };
  return { en: raw.trim(), ur: "" };
}

function composeIssue(issue: { en: string; ur: string }): string {
  const en = issue.en.trim();
  const ur = issue.ur.trim();
  return en && ur ? `${en} (${ur})` : en;
}

/** Tiny section rule for the editor modal — label + hairline. */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
        {children}
      </p>
      <span aria-hidden className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

const EMPTY_FORM: CatFormState = {
  nameEn: "",
  nameUr: "",
  description: "",
  subIssues: [],
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
  urgent: "bg-amber-100 text-amber-800",
  routine: "bg-slate-100 text-slate-600",
};
const URGENCY_TEXT: Record<UrgencyLevel, string> = {
  emergency: "text-rose-700",
  urgent: "text-amber-700",
  routine: "text-emerald-700",
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
    hydrated: coverageLoaded,
    addCategory,
    updateCategory,
    removeCategory,
    toggleCategoryStatus,
  } = useCoverage();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CatFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The menu list is collapsible — long menus open collapsed so the modal
  // stays scannable; short or empty menus open ready to edit.
  const [menuOpen, setMenuOpen] = useState(false);
  // Two-step delete inside the editor — the warning banner replaces the
  // footer hint, so the destructive action can never fire accidentally.
  const [confirmDeleteInModal, setConfirmDeleteInModal] = useState(false);
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
    setMenuOpen(true);
    setConfirmDeleteInModal(false);
    setModalOpen(true);
  };

  const openEdit = (cat: CategoryRule) => {
    setForm({
      nameEn: cat.name_en,
      nameUr: cat.name_ur === "—" ? "" : cat.name_ur,
      description: cat.description,
      subIssues: cat.tags.map(splitIssue),
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
    setMenuOpen(cat.tags.length <= 6);
    setConfirmDeleteInModal(false);
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

  /* Detailed-issue menu rows */
  const [newIssue, setNewIssue] = useState({ en: "", ur: "" });

  const setIssueRow = (index: number, patch: { en?: string; ur?: string }) => {
    setForm((f) => ({
      ...f,
      subIssues: f.subIssues.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      ),
    }));
  };

  const removeIssueRow = (index: number) => {
    setForm((f) => ({
      ...f,
      subIssues: f.subIssues.filter((_, i) => i !== index),
    }));
  };

  const addIssueRow = () => {
    if (!newIssue.en.trim() && !newIssue.ur.trim()) return;
    setForm((f) => ({ ...f, subIssues: [...f.subIssues, { ...newIssue }] }));
    setNewIssue({ en: "", ur: "" });
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
      tags: form.subIssues
        .map(composeIssue)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 30),
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

  /** The editor's delete path — same persistence as the card list's
      two-step confirm, surfaced where the officer is already working. */
  const deleteFromModal = () => {
    if (!editingId) return;
    const name = form.nameEn.trim() || "this category";
    removeCategory(editingId);
    setConfirmDeleteInModal(false);
    setModalOpen(false);
    setToast(`Category “${name}” deleted`);
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

  // Category rules come from the Neon coverage document — skeleton until it
  // arrives so the table never renders a false "no rules" state.
  if (!coverageLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  /** Live preview icon for the editor's header band. */
  const HeaderIcon = categoryIcon(form.icon);

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
              className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${
                cat.status === "active"
                  ? "border-slate-200/80 bg-white hover:border-emerald-200"
                  : "border-slate-200/60 bg-slate-100/60"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                    cat.status === "active"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : "bg-slate-200/70 text-slate-400 ring-slate-200"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-heading truncate text-base font-bold ${
                        cat.status === "active" ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      {cat.name_en}
                    </h3>
                    <span className="urdu shrink-0 text-sm text-emerald-700">
                      {cat.name_ur}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 line-clamp-1 text-xs ${
                      cat.status === "active" ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    {cat.description}
                  </p>
                  {/* Live status — dot + plain words instead of a pill */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        cat.status === "active" ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    <span
                      className={
                        cat.status === "active" ? "text-emerald-700" : "text-slate-400"
                      }
                    >
                      {cat.status === "active"
                        ? "Live in citizen forms"
                        : "Hidden from citizens"}
                    </span>
                  </div>
                </div>

                {/* Visibility toggle — header corner */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={cat.status === "active"}
                  aria-label={`Toggle ${cat.name_en}`}
                  onClick={() => toggleCategoryStatus(cat.id)}
                  className={`relative ml-2 h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 ${
                    cat.status === "active" ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                      cat.status === "active" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Routing stats — labeled cells replace the chip row */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Routed to
                  </p>
                  <p className="truncate text-xs font-bold text-slate-900">
                    {cat.default_agency}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Resolution
                  </p>
                  <p className="truncate text-xs font-bold text-slate-900">
                    <span className="font-mono">{cat.sla_hours}h</span> SLA
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Priority
                  </p>
                  <p
                    className={`truncate text-xs font-bold capitalize ${URGENCY_TEXT[cat.urgency]}`}
                  >
                    {cat.urgency}
                  </p>
                </div>
              </div>

              {/* Coverage */}
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate" title={`${cityPart} • ${jurPart}`}>
                  {cityPart} • {jurPart}
                </span>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="min-w-0 truncate text-[11px] font-medium text-slate-400">
                  {cat.tags.length} detailed issue{cat.tags.length === 1 ? "" : "s"} in
                  the wizard menu
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    aria-label={`Edit ${cat.name_en}`}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
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
          <div className="absolute inset-x-4 top-1/2 mx-auto max-w-2xl -translate-y-1/2 overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="relative flex max-h-[85vh] flex-col">
              {/* Header band — live category identity */}
              <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-[#0F5132] to-emerald-700 px-6 py-5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
                    <HeaderIcon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-heading truncate text-lg font-bold text-white">
                      {form.nameEn.trim() || (editingId ? "Edit Category" : "Add Category")}
                    </h2>
                    <p className="mt-0.5 text-xs text-emerald-100/80">
                      {editingId ? "Citizen taxonomy & auto-routing rules" : "New citizen-facing hazard category"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                <section className="space-y-4">
                  <SectionLabel>Identity</SectionLabel>
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
                    <p className={`${labelClass} mb-1.5`}>Icon</p>
                    <div
                      role="radiogroup"
                      aria-label="Category icon"
                      className="grid grid-cols-9 gap-1.5"
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
                            className={`flex h-10 items-center justify-center rounded-lg border transition-colors duration-150 ${
                              selected
                                ? "border-emerald-700 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-slate-600"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionLabel>Detailed Issue Menu</SectionLabel>
                <div>
                  {/* Collapsed summary — expand to view & edit the rows */}
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-expanded={menuOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:border-emerald-300"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ListFilter className="h-4 w-4 shrink-0 text-emerald-700" />
                      <span className="min-w-0 truncate">
                        {form.subIssues.length > 0
                          ? `${form.subIssues.length} issues in the citizen menu`
                          : "No detailed issues yet"}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        menuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {menuOpen && (
                    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-canvas/50 p-3">
                  {form.subIssues.length > 0 ? (
                    <div className="space-y-2">
                      {form.subIssues.map((row, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            value={row.en}
                            onChange={(e) =>
                              setIssueRow(index, { en: e.target.value })
                            }
                            placeholder="Issue (English)"
                            aria-label={`Issue ${index + 1} — English`}
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                          <input
                            value={row.ur}
                            onChange={(e) =>
                              setIssueRow(index, { ur: e.target.value })
                            }
                            placeholder="اردو"
                            dir="rtl"
                            aria-label={`Issue ${index + 1} — Urdu`}
                            className={`${inputClass} urdu w-36 shrink-0 sm:w-44`}
                          />
                          <button
                            type="button"
                            onClick={() => removeIssueRow(index)}
                            aria-label={`Remove issue ${index + 1}`}
                            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-btn border border-dashed border-line bg-canvas px-3 py-3 text-center text-xs text-ink-muted">
                      No detailed issues yet — citizens go straight from
                      category to evidence. Add rows below or load the built-in
                      list.
                    </p>
                  )}

                  {/* Append row */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={newIssue.en}
                      onChange={(e) =>
                        setNewIssue((n) => ({ ...n, en: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addIssueRow();
                        }
                      }}
                      placeholder="Add a detailed issue…"
                      aria-label="New issue — English"
                      className={`${inputClass} min-w-0 flex-1`}
                    />
                    <input
                      value={newIssue.ur}
                      onChange={(e) =>
                        setNewIssue((n) => ({ ...n, ur: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addIssueRow();
                        }
                      }}
                      placeholder="اردو"
                      dir="rtl"
                      aria-label="New issue — Urdu"
                      className={`${inputClass} urdu w-36 shrink-0 sm:w-44`}
                    />
                    <button
                      type="button"
                      onClick={addIssueRow}
                      aria-label="Add issue to menu"
                      className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                      </div>
                    </div>
                  )}

                  <p className="mt-1 text-[11px] text-slate-500">
                    Leave empty to use the built-in list. Shown in the
                    reporting wizard, the review step and the ledger's tag
                    column.
                  </p>
                  {!form.subIssues.length && editingId && SUB_ISSUES[editingId] && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          subIssues: SUB_ISSUES[editingId].map(splitIssue),
                        }))
                      }
                      className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      Load built-in list
                    </button>
                  )}
                </div>
                </section>

                <section className="space-y-4">
                  <SectionLabel>Routing &amp; SLA</SectionLabel>
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
                      {(["routine", "urgent", "emergency"] as UrgencyLevel[]).map(
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

                </section>

                <section className="space-y-4">
                  <SectionLabel>Availability</SectionLabel>
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

                {/* Danger zone — delete this category */}
                {editingId && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200/70 bg-rose-50/50 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-rose-900">
                        Delete this category
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-rose-700/80">
                        Removes it from citizen forms and the reporting wizard.
                        This cannot be undone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteInModal(true)}
                      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition-colors duration-150 hover:border-rose-400 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Category
                    </button>
                  </div>
                )}
                </section>
              </div>

              {/* Delete confirmation — overlay dialog: nothing underneath
                  moves, so confirming can never shift the layout */}
              {confirmDeleteInModal && editingId && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-rose-950/25 p-6 backdrop-blur-[2px]">
                  <div className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-5 shadow-xl">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                        <AlertTriangle className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          Delete “{form.nameEn.trim() || "this category"}” permanently?
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          It disappears from citizen forms and the reporting
                          wizard immediately, and its detailed issue menu is
                          removed. Reports already filed keep their stored
                          category name. This cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteInModal(false)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900"
                      >
                        Keep Category
                      </button>
                      <button
                        type="button"
                        onClick={deleteFromModal}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors duration-150 hover:bg-rose-700"
                      >
                        Delete Permanently
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pinned footer */}
              <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                {formError ? (
                  <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{formError}</span>
                  </p>
                ) : (
                  <p className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                    Changes apply to citizen forms immediately after saving.
                  </p>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!form.nameEn.trim()}
                    className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Save Category
                  </button>
                </div>
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
