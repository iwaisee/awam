"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  UserCheck,
  BellRing,
  ShieldCheck,
  AlertTriangle,
  BadgeCheck,
  Download,
  ArrowLeft,
  Save,
  LoaderCircle,
  EyeOff,
  Radio,
} from "lucide-react";
import ProfileTab from "@/components/settings/ProfileTab";
import ReportsTab from "@/components/settings/ReportsTab";
import SettingsSidebar, {
  type SidebarTab,
} from "@/components/settings/SettingsSidebar";
import Card from "@/components/settings/Card";
import { useCitizenProfile } from "@/context/UserContext";
import { primaryLocalityAnchor, type IncidentReport } from "@/types/civic";

/* One persistent dashboard: reports live alongside the account views, so the
   sidebar never changes between "My Reports" and profile/privacy. */
const TABS = [
  { key: "reports", label: "My Reports", icon: FileText },
  { key: "profile", label: "My Profile", icon: UserCheck },
  { key: "alerts", label: "Alert Radius", icon: BellRing },
  { key: "privacy", label: "Privacy Settings", icon: ShieldCheck },
  { key: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Tabs backed by the editable citizen document — the only ones that can be
    dirty, so the floating save dock stays hidden on read-only views. */
const EDITABLE_TABS: TabKey[] = ["profile", "alerts", "privacy"];


function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile: savedProfile, updateProfile, resetProfile } =
    useCitizenProfile();
  const initialTab = TABS.some((t) => t.key === searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : "reports";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Unsaved edits overlay the saved document: every control reads
  // currentSettings (baseline merged with the edit overlay), so hydration and
  // saves flow into the form automatically. Discard collapses the overlay.
  const [edits, setEdits] = useState<Partial<typeof savedProfile>>({});

  const currentSettings = useMemo(
    () => ({ ...savedProfile, ...edits }),
    [savedProfile, edits]
  );
  // Both sides share the store's key insertion order, so a stringified deep
  // comparison is stable across renders.
  const isDirty = useMemo(
    () => JSON.stringify(savedProfile) !== JSON.stringify(currentSettings),
    [savedProfile, currentSettings]
  );
  const field = <K extends keyof typeof savedProfile>(key: K) =>
    currentSettings[key];
  const update = (patch: Partial<typeof savedProfile>) =>
    setEdits((prev) => ({ ...prev, ...patch }));

  // Floating "Unsaved Changes" dock — read-only tabs never show it.
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const dockVisible = isDirty && EDITABLE_TABS.includes(tab);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
  };

  // Keep tab in sync when the query parameter changes (e.g. popover links).
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      const key = searchParams.get("tab");
      if (TABS.some((t) => t.key === key)) setTab(key as TabKey);
    })();
  }, [searchParams]);

  // Guard against losing unsaved changes to an accidental refresh.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const selectTab = (key: TabKey) => {
    // Anchor the viewport to the content start BEFORE the tab swaps. The
    // grid's position never changes, so this is a single smooth reposition;
    // when the (shorter) new content collapses the page height, the browser
    // has nothing left to clamp — no second jump, no jerk.
    const grid = document.getElementById("settings-content");
    if (grid) {
      const stickyOffset = 128; // exactly the sidebar's sticky line (top-32)
      const target =
        grid.getBoundingClientRect().top + window.scrollY - stickyOffset;
      if (window.scrollY > target) {
        window.scrollTo(0, target);
      }
    }
    setTab(key);
    // scroll:false — the pre-swap anchor above owns the viewport.
    router.push(`/settings?tab=${key}`, { scroll: false });
  };


  const handleSave = () => {
    // Email and mobile are compulsory contact channels — refuse the save
    // while the email is missing or malformed so alerts stay deliverable.
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((currentSettings.email ?? "").trim())
    ) {
      showToast("⚠ Add a valid email address before saving — it is required.");
      return;
    }
    setIsSaving(true);
    const snapshot = currentSettings;
    window.setTimeout(() => {
      updateProfile(snapshot); // UserContext + Neon push — header updates live
      setEdits({});
      setIsSaving(false);
      showToast("✓ Your profile has been updated.");
    }, 900);
  };

  const handleDiscard = () => {
    // Collapse the overlay — currentSettings folds back onto the saved
    // document, isDirty flips false and the dock slides out of view.
    setEdits({});
  };

  const exportDossier = async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const all = (await res.json()) as IncidentReport[];
      const mine = all.filter((r) => r.citizen_phone === savedProfile.phone);
      const blob = new Blob(
        [
          JSON.stringify(
            { profile: savedProfile, reports: mine, exported_at: new Date().toISOString() },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sada-e-awam-civic-dossier.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export is best-effort in the demo — nothing to recover.
    }
  };

  const radiusLabel =
    field("radius_meters") >= 1000
      ? `${(field("radius_meters") / 1000).toFixed(1)} km`
      : `${field("radius_meters")} meters`;
  const activeCount = Math.max(
    0,
    field("reports_filed") - field("reports_resolved")
  );

  // Sidebar metadata — badges derive from the live citizen document.
  const sidebarTabs: SidebarTab[] = TABS.map((t) => {
    if (t.key === "reports") {
      return {
        ...t,
        badge: activeCount > 0 ? `${activeCount} Active` : undefined,
        badgeStyle: "bg-amber-50 text-amber-800 border-amber-200",
      };
    }
    if (t.key === "alerts") {
      return {
        ...t,
        badge:
          field("radius_meters") >= 1000
            ? `Within ${Math.round(field("radius_meters") / 1000)} km`
            : `Within ${field("radius_meters")} m`,
      };
    }
    if (t.key === "danger") {
      return { ...t, tone: "rose" as const };
    }
    return { ...t };
  });

  // Danger-zone interactions
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  return (
    <div className="bg-slate-50/60">
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-24 sm:px-6 sm:pt-10 lg:px-8">
        {/* Page header */}
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors duration-150 hover:text-emerald-800"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
          Back to Home
        </Link>
        <h1 className="font-heading mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Account &amp; Settings{" "}
          <span className="urdu text-lg font-semibold text-emerald-700">
            اکاؤنٹ اور ترتیبات
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your reported issues, neighborhood hazard alerts, and account
          details in one place.
        </p>

        {/* 12-column dashboard grid */}
        <div id="settings-content" className="mt-12 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left navigation column — ergonomic 4/8 split with the content pane */}
          <aside className="space-y-2 lg:sticky lg:top-32 lg:col-span-4 xl:col-span-4">
            <SettingsSidebar
              tabs={sidebarTabs}
              activeKey={tab}
              onSelect={(key) => selectTab(key as TabKey)}
            />
          </aside>

          {/* Right tab content column — keyed wrapper replays the fade-up
              entrance every time the tab changes */}
          <main className="min-w-0 lg:col-span-8 xl:col-span-8">
            <div key={tab} className="animate-dossier-in space-y-6">
            {/* ========================= TAB: Reports ========================= */}
            {tab === "reports" && (
              <section role="tabpanel" aria-label="My Reports">
                <ReportsTab citizenPhone={field("phone")} />
              </section>
            )}

            {/* ========================= TAB: Profile ========================= */}
            {tab === "profile" && (
              <section role="tabpanel" aria-label="My Profile">
                <ProfileTab draft={currentSettings} update={update} />
              </section>
            )}

            {/* ========================= TAB: Alerts ========================= */}
            {tab === "alerts" && (
              <section
                role="tabpanel"
                aria-label="Neighborhood radius and alerts"
                className="space-y-6"
              >
                <Card>
                  <h2 className="font-heading text-base font-bold text-slate-900">
                    Community Hazard Detection Radius
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Receive real-time alerts whenever neighbors report critical
                    hazards near your residence.
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">
                      Monitoring radius
                    </p>
                    <span className="whitespace-nowrap rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white">
                      {radiusLabel}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={field("radius_meters")}
                    onChange={(e) =>
                      update({ radius_meters: Number(e.target.value) })
                    }
                    aria-label="Hazard watch radius"
                    className="mt-3 w-full accent-emerald-700"
                  />
                  <div className="mt-1 flex justify-between text-[11px] font-medium text-slate-400">
                    <span>500m</span>
                    <span>5km</span>
                  </div>
                  <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl bg-emerald-50/70 px-4 py-3 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
                    <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    Monitoring:{" "}
                    {primaryLocalityAnchor(field("home_locality_name"))},{" "}
                    {field("district")} + {radiusLabel} perimeter (approx.{" "}
                    {Math.max(3, Math.round(field("radius_meters") / 145))}{" "}
                    mohallahs covered)
                  </p>
                </Card>

                <Card>
                  <h2 className="font-heading text-base font-bold text-slate-900">
                    Communication Channels
                  </h2>
                  <div className="mt-4 space-y-3">
                    <ToggleRow
                      title="WhatsApp Emergency Dispatches"
                      description="High-voltage wires, open manholes, collapsed roads — pushed to your WhatsApp instantly."
                      enabled={field("whatsapp_updates")}
                      onToggle={() =>
                        update({
                          whatsapp_updates: !field("whatsapp_updates"),
                        })
                      }
                    />
                    <ToggleRow
                      title="Daily Neighborhood Civic Digest"
                      description="A summary of resolved issues in your zone, every morning."
                      enabled={field("weekly_digest")}
                      onToggle={() =>
                        update({ weekly_digest: !field("weekly_digest") })
                      }
                    />
                    <ToggleRow
                      title="Work Order Resolution Proofs"
                      description="Alerts with photo proofs when your tickets close."
                      enabled={field("resolution_proofs")}
                      onToggle={() =>
                        update({
                          resolution_proofs: !field("resolution_proofs"),
                        })
                      }
                    />
                  </div>
                </Card>
              </section>
            )}

            {/* ========================= TAB: Privacy ========================= */}
            {tab === "privacy" && (
              <section
                role="tabpanel"
                aria-label="Privacy and protections"
                className="space-y-6"
              >
                <Card>
                  <h2 className="font-heading text-base font-bold text-slate-900">
                    Identity Concealment Controls
                  </h2>
                  <div className="mt-4 space-y-3">
                    <ToggleRow
                      title="Anonymous Public Reporting"
                      description="Masks your name as 'Resident of Sialkot' on the public live feed."
                      enabled={field("anonymous_default")}
                      onToggle={() =>
                        update({
                          anonymous_default: !field("anonymous_default"),
                        })
                      }
                    />
                    <ToggleRow
                      title="Hide Phone Number from Municipal Crew"
                      description="Crew can only reach you through the platform proxy / SMS bridge."
                      enabled={field("hide_phone_from_crew")}
                      onToggle={() =>
                        update({
                          hide_phone_from_crew: !field("hide_phone_from_crew"),
                        })
                      }
                    />
                  </div>
                </Card>

                <Card>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                      <EyeOff className="h-5 w-5 text-emerald-700" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-heading text-base font-bold text-slate-900">
                        Data Transparency &amp; Government Audit
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Your reports are audited exclusively by{" "}
                        <span className="font-semibold text-slate-800">
                          MCS Sialkot
                        </span>
                        ,{" "}
                        <span className="font-semibold text-slate-800">
                          GEPCO Cantt Desk
                        </span>
                        , and the{" "}
                        <span className="font-semibold text-slate-800">
                          Punjab Local Govt Sentinel
                        </span>
                        . Every access to your ticket log is recorded against
                        the officer&apos;s service number — no third party ever
                        receives your personal data.
                      </p>
                    </div>
                  </div>
                </Card>
              </section>
            )}

            {/* ========================= TAB: Danger Zone ========================= */}
            {tab === "danger" && (
              <section
                role="tabpanel"
                aria-label="Danger zone"
                className="space-y-6 rounded-3xl border border-rose-200/80 bg-rose-50/50 p-6 sm:p-8"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-heading text-base font-bold text-slate-900">
                      Danger Zone
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Irreversible account and history operations — read each
                      description carefully.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-rose-200/70 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      Export Civic Dossier
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      Download all of your personal reports and upvotes as a
                      portable JSON archive.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void exportDossier()}
                    className="flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </button>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/80 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      Anonymize History
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      Removes your personal name and phone number from all{" "}
                      {field("reports_filed")} historical tickets.
                    </p>
                    {confirmAnonymize && (
                      <p className="mt-2 text-xs font-semibold text-amber-800">
                        This cannot be undone. Continue?
                      </p>
                    )}
                  </div>
                  {confirmAnonymize ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAnonymize(false);
                          showToast(
                            "✓ Identity fields stripped from historical tickets."
                          );
                        }}
                        className="whitespace-nowrap rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-amber-700"
                      >
                        Yes, Anonymize
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAnonymize(false)}
                        className="whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAnonymize(true)}
                      className="flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 transition-colors duration-150 hover:bg-amber-100"
                    >
                      <EyeOff className="h-4 w-4" />
                      Anonymize My History
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      Deactivate Account
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      Permanently detaches your contact details from all public
                      tickets. Your reports remain on the municipal record.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeactivateOpen(true)}
                    className="shrink-0 whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-rose-700"
                  >
                    Deactivate Account
                  </button>
                </div>
              </section>
            )}
          </div>
          </main>
        </div>

        {/* Floating "Unsaved Changes" dock — parked below the viewport and
            sliding up only while the draft differs from the saved document.
            inert keeps the hidden controls out of tab order and the a11y tree. */}
        <div
          aria-hidden={!dockVisible}
          inert={!dockVisible}
          className={`fixed bottom-6 left-1/2 z-50 w-[92%] max-w-4xl -translate-x-1/2 transition-all duration-300 ease-out ${
            dockVisible
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "translate-y-12 opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-md sm:flex-row sm:px-6">
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <span className="h-2 w-2 animate-ping rounded-full bg-amber-500" />
              <span className="font-semibold text-slate-800">
                Unsaved profile changes
              </span>
              <span className="hidden text-slate-400 md:inline">
                • Stored locally in your browser
              </span>
            </div>

            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isSaving ? "Saving…" : "Save Profile Settings"}
              </button>
            </div>
          </div>
        </div>

        {/* Save confirmation toast — floats above the dock slot */}
        <div
          aria-hidden={!toastMsg}
          inert={!toastMsg}
          className={`fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 transition-all duration-300 ease-out ${
            toastMsg ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <p
            role="status"
            className="flex items-center gap-2 whitespace-nowrap rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 shadow-lg shadow-emerald-900/10 animate-toast-rise"
          >
            <BadgeCheck className="h-4.5 w-4.5 shrink-0" />
            {toastMsg}
          </p>
        </div>

        {/* Deactivate confirmation dialog */}
        {deactivateOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setDeactivateOpen(false)}
              className="absolute inset-0 animate-overlay-in bg-slate-950/50 backdrop-blur-sm"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm account deactivation"
              className="relative w-full max-w-md animate-in rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading text-base font-bold text-slate-900">
                    Deactivate your civic account?
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Your name and phone number are detached from all{" "}
                    {field("reports_filed")} public tickets. Reports remain on
                    the municipal record for follow-up. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeactivateOpen(false)}
                  className="whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeactivateOpen(false);
                    setEdits({});
                    resetProfile();
                    showToast("✓ Account deactivated — demo profile restored.");
                  }}
                  className="whitespace-nowrap rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-rose-700"
                >
                  Yes, Deactivate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        onClick={onToggle}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${
          enabled ? "bg-emerald-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-150 ${
            enabled ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-slate-50/60">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          </div>
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
