"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Camera,
  Check,
  Contact,
  Download,
  Eye,
  FileText,
  Info,
  Landmark,
  LoaderCircle,
  Lock,
  Mail,
  PenTool,
  Phone,
  PhoneCall,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  DEFAULT_ADMIN_PROFILE,
  getAdminInitials,
  useAdminProfile,
  type AdminProfile,
} from "@/lib/adminProfileStore";
import { readDownscaledDataUrl } from "@/lib/imageDataUrl";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-700";

const CADRE_OPTIONS = [
  "PAS (Pakistan Administrative Service) - BPS-20",
  "PMS (Provincial Management Service) - BPS-19",
  "Ex-Cadre Executive",
  "Technical Specialist",
];

const POSTING_OPTIONS = [
  "MCS Complex, Sialkot",
  "Sialkot Cantonment Board, Cantt",
  "District Coordination Office, Sialkot",
  "Tehsil Municipal Administration, Daska",
];

const ALERT_CHANNELS = [
  {
    label: "Emergency WhatsApp Dispatch to Sub-Divisional Officer (SDO)",
    defaultOn: true,
  },
  {
    label: "Automated Daily Digest to DC Office (9:00 AM)",
    defaultOn: true,
  },
  {
    label: "Citizen SMS ping when crew is within 500m",
    defaultOn: false,
  },
];

const ABUSE_RULES = [
  "Flag after 3 rejected photos",
  "Immediately suspend on profane voice note",
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/* ------------------------- System preferences store ------------------------ */
/*
 * Dispatch thresholds, alert channels and platform switches persist beside the
 * administrator profile (sada_system_prefs) so Discard/Save can treat the whole
 * System Preferences page as one baseline-vs-draft document. Same external-store
 * pattern as adminProfileStore: server and hydration renders read the factory
 * seed, then the first post-mount read picks up the stored values.
 */

interface SystemPrefs {
  p1Timer: number;
  overdueTimer: number;
  channels: string[];
  mandatoryCnic: boolean;
  endorsementThreshold: number;
  abuseRule: string;
  maintenanceFreeze: boolean;
}

/** The full editable document: identity profile + operational system prefs. */
type SystemSettings = AdminProfile & SystemPrefs;

const FACTORY_SYSTEM_PREFS: SystemPrefs = {
  p1Timer: 4,
  overdueTimer: 48,
  channels: ALERT_CHANNELS.filter((c) => c.defaultOn).map((c) => c.label),
  mandatoryCnic: false,
  endorsementThreshold: 15,
  abuseRule: ABUSE_RULES[0],
  maintenanceFreeze: false,
};

const SYSTEM_PREFS_KEY = "sada_system_prefs";

function normalizeSystemPrefs(raw: unknown): SystemPrefs {
  if (!raw || typeof raw !== "object") return FACTORY_SYSTEM_PREFS;
  const stored = raw as Partial<SystemPrefs>;
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 1
      ? value
      : fallback;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  const labels = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : FACTORY_SYSTEM_PREFS.channels;
  return {
    p1Timer: num(stored.p1Timer, FACTORY_SYSTEM_PREFS.p1Timer),
    overdueTimer: num(stored.overdueTimer, FACTORY_SYSTEM_PREFS.overdueTimer),
    channels: labels(stored.channels),
    mandatoryCnic: bool(
      stored.mandatoryCnic,
      FACTORY_SYSTEM_PREFS.mandatoryCnic
    ),
    endorsementThreshold: num(
      stored.endorsementThreshold,
      FACTORY_SYSTEM_PREFS.endorsementThreshold
    ),
    abuseRule:
      typeof stored.abuseRule === "string"
        ? stored.abuseRule
        : FACTORY_SYSTEM_PREFS.abuseRule,
    maintenanceFreeze: bool(
      stored.maintenanceFreeze,
      FACTORY_SYSTEM_PREFS.maintenanceFreeze
    ),
  };
}

const systemPrefsListeners = new Set<() => void>();
let cachedPrefsRaw: string | null = null;
let cachedPrefs: SystemPrefs = FACTORY_SYSTEM_PREFS;

function getSystemPrefsSnapshot(): SystemPrefs {
  const raw = window.localStorage.getItem(SYSTEM_PREFS_KEY);
  if (raw !== cachedPrefsRaw) {
    cachedPrefsRaw = raw;
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null; // Corrupt storage — fall back to the factory template.
      }
    }
    cachedPrefs = normalizeSystemPrefs(parsed);
  }
  return cachedPrefs;
}

function subscribeSystemPrefs(listener: () => void) {
  systemPrefsListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    systemPrefsListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

let prefsServerSyncStarted = false;

/** Pull the shared system-prefs document into the local cache, or migrate the
    local copy up when the server store is still empty (fresh install). */
async function syncSystemPrefsFromServer(): Promise<void> {
  if (prefsServerSyncStarted) return;
  prefsServerSyncStarted = true;
  try {
    const res = await fetch("/api/state/system-prefs", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { value?: unknown; seeded?: boolean };
    if (data.seeded) {
      const incoming = normalizeSystemPrefs(data.value);
      if (JSON.stringify(incoming) !== JSON.stringify(getSystemPrefsSnapshot())) {
        try {
          window.localStorage.setItem(SYSTEM_PREFS_KEY, JSON.stringify(incoming));
        } catch {
          /* storage full — the in-memory copy still applies */
        }
        cachedPrefsRaw = null;
        systemPrefsListeners.forEach((listener) => listener());
      }
    } else {
      // Fresh server — migrate the local preferences up.
      await fetch("/api/state/system-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: getSystemPrefsSnapshot() }),
      });
    }
  } catch {
    /* server unreachable — the local cache keeps working */
  }
}

function useSystemPrefs() {
  const prefs = useSyncExternalStore(
    subscribeSystemPrefs,
    getSystemPrefsSnapshot,
    () => FACTORY_SYSTEM_PREFS
  );

  useEffect(() => {
    void syncSystemPrefsFromServer();
  }, []);

  const saveSystemPrefs = useCallback((next: SystemPrefs) => {
    try {
      window.localStorage.setItem(SYSTEM_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Storage full — in-memory subscribers still update.
    }
    cachedPrefsRaw = null; // Invalidate so the next read re-parses from storage.
    systemPrefsListeners.forEach((listener) => listener());
    // Persist to the shared store — localStorage is the synchronous cache.
    void fetch("/api/state/system-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: next }),
    }).catch(() => {
      /* offline — the local cache already reflects the change */
    });
  }, []);

  return { prefs, saveSystemPrefs };
}

/** Split the unified draft into its two persisted documents. */
function splitSettings(
  settings: SystemSettings
): { profile: AdminProfile; system: SystemPrefs } {
  const {
    p1Timer,
    overdueTimer,
    channels,
    mandatoryCnic,
    endorsementThreshold,
    abuseRule,
    maintenanceFreeze,
    ...profile
  } = settings;
  return {
    profile,
    system: {
      p1Timer,
      overdueTimer,
      channels,
      mandatoryCnic,
      endorsementThreshold,
      abuseRule,
      maintenanceFreeze,
    },
  };
}

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8">
      <h2 className="font-heading flex items-center gap-2.5 text-base font-bold text-slate-900">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  badge,
  children,
}: {
  label: string;
  htmlFor: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
        {badge}
      </div>
      {children}
    </div>
  );
}

function VerifiedBadge({ text }: { text: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
      <BadgeCheck className="h-3.5 w-3.5" />
      {text}
    </span>
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

function ThresholdField({
  label,
  value,
  onChange,
  subtext,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  subtext: string;
  id: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-bold text-slate-900">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <input
            id={id}
            type="number"
            min={1}
            value={value}
            onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
            aria-label={label}
            className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center font-mono text-sm font-bold text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
          <span className="text-xs font-semibold text-slate-500">Hours</span>
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{subtext}</p>
    </div>
  );
}

export default function SettingsView() {
  const { profile: savedProfile, saveProfile } = useAdminProfile();
  const { prefs: savedSystemPrefs, saveSystemPrefs } = useSystemPrefs();

  // Unsaved edits overlay the committed baseline: every control reads
  // currentSettings (baseline merged with the edit overlays), so hydration and
  // external saves flow into the form automatically — no synchronization
  // effect needed, and Discard simply collapses the overlays.
  const [profileEdits, setProfileEdits] = useState<Partial<AdminProfile>>({});
  const [systemEdits, setSystemEdits] = useState<Partial<SystemPrefs>>({});

  const initialSettings = useMemo<SystemSettings>(
    () => ({ ...savedProfile, ...savedSystemPrefs }),
    [savedProfile, savedSystemPrefs]
  );
  const currentSettings = useMemo<SystemSettings>(
    () => ({
      ...savedProfile,
      ...profileEdits,
      ...savedSystemPrefs,
      ...systemEdits,
    }),
    [savedProfile, profileEdits, savedSystemPrefs, systemEdits]
  );
  // Both sides spread the same stores in the same order, so key insertion
  // order is deterministic and a stringified deep comparison is stable.
  const isDirty = useMemo(
    () => JSON.stringify(initialSettings) !== JSON.stringify(currentSettings),
    [initialSettings, currentSettings]
  );

  const field = <K extends keyof AdminProfile>(key: K): AdminProfile[K] =>
    currentSettings[key];
  const sys = <K extends keyof SystemPrefs>(key: K): SystemPrefs[K] =>
    currentSettings[key];
  const updateProfile = (patch: Partial<AdminProfile>) =>
    setProfileEdits((prev) => ({ ...prev, ...patch }));
  const updateSystem = (patch: Partial<SystemPrefs>) =>
    setSystemEdits((prev) => ({ ...prev, ...patch }));

  const avatarUrl = field("avatarUrl");
  const signatureUrl = field("signatureUrl");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const [portraitError, setPortraitError] = useState("");
  const [stampError, setStampError] = useState("");

  // Floating "Unsaved Changes" dock
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [syncToast, setSyncToast] = useState(false);
  const dockVisible = isDirty || justSaved;

  // Guard against losing unsaved configuration to an accidental refresh.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const toggleChannel = (label: string) => {
    const channels = sys("channels");
    updateSystem({
      channels: channels.includes(label)
        ? channels.filter((c) => c !== label)
        : [...channels, label],
    });
  };

  const handlePortraitPicked = async (file: File | undefined) => {
    if (!file) return;
    setPortraitError("");
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setPortraitError("Unsupported format — use JPG, PNG or WEBP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setPortraitError("That file exceeds the 5MB limit — pick a smaller one.");
      return;
    }
    try {
      const dataUrl = await readDownscaledDataUrl(file, {
        maxSize: 400,
        square: true,
      });
      updateProfile({ avatarUrl: dataUrl });
    } catch {
      setPortraitError("Could not read that image — try another file.");
    }
  };

  const handleStampPicked = async (file: File | undefined) => {
    if (!file) return;
    setStampError("");
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setStampError("Unsupported format — use JPG, PNG or WEBP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStampError("That file exceeds the 5MB limit — pick a smaller one.");
      return;
    }
    try {
      const dataUrl = await readDownscaledDataUrl(file, {
        maxSize: 640,
        square: false,
      });
      updateProfile({ signatureUrl: dataUrl });
    } catch {
      setStampError("Could not read that image — try another file.");
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    const snapshot = currentSettings;
    window.setTimeout(() => {
      // Commit the draft — the header badge and sidebar card subscribe to the
      // same profile store, so they re-render in the same tick (two-way sync).
      const { profile, system } = splitSettings(snapshot);
      saveProfile(profile); // localStorage 'sada_admin_profile'
      saveSystemPrefs(system); // localStorage 'sada_system_prefs'
      setProfileEdits({});
      setSystemEdits({});
      setIsSaving(false);
      // isDirty is now false; keep the dock up for a one-second saved flash,
      // then let it slide out of view.
      setJustSaved(true);
      setSyncToast(true);
      window.setTimeout(() => setJustSaved(false), 1000);
      window.setTimeout(() => setSyncToast(false), 4500);
    }, 900);
  };

  const handleDiscard = () => {
    // Collapse both overlays — currentSettings folds back onto the saved
    // baseline, isDirty flips false and the dock slides out of view.
    setProfileEdits({});
    setSystemEdits({});
    setPortraitError("");
    setStampError("");
  };

  const resetDefaults = () => {
    // Fill the form with factory template values; the user still saves to
    // commit. Dirty state emerges naturally iff the template differs from the
    // currently saved baseline.
    setProfileEdits({ ...DEFAULT_ADMIN_PROFILE });
    setSystemEdits({ ...FACTORY_SYSTEM_PREFS });
    setPortraitError("");
    setStampError("");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      {/* Section: Administrator Identity & Official Desk (Cards 1A–1D) */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] text-white shadow-xs">
            <UserRound className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-bold text-slate-900">
              Administrator Identity &amp; Official Desk
            </h2>
            <p className="text-xs text-slate-500">
              Executive profile studio — visual seals, credentials, hotlines and
              transparency shields.
            </p>
          </div>
        </div>

        {/* Card 1A: Visual identity, avatar & official digital seal */}
        <Card
          icon={<Contact className="h-4 w-4" />}
          title="Official Visual Identity & Seals"
          subtitle="Manage your profile portrait, initials styling, and the official digital signature stamp applied to dispatched work orders."
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Portrait uploader */}
            <div className="flex items-center gap-5">
              <div className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-600/30 bg-slate-100 shadow-sm">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Administrator portrait preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-[#0F5132] text-xl font-bold tracking-wide text-white">
                    {getAdminInitials(field("fullName"))}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change profile portrait"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-slate-950/55 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">Change</span>
                </button>
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-900"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateProfile({ avatarUrl: null });
                      setPortraitError("");
                    }}
                    disabled={!avatarUrl}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-slate-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Photo
                  </button>
                </div>
                <p className="text-[11px] leading-4 text-slate-400">
                  Recommended: 400x400px. JPG, PNG or WEBP up to 5MB.
                </p>
                {portraitError && (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {portraitError}
                  </p>
                )}
              </div>
            </div>

            {/* Official digital signature stamp */}
            <div className="w-full sm:w-64">
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload official signature stamp"
                onClick={() => stampInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    stampInputRef.current?.click();
                  }
                }}
                className="group relative flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-3 transition-colors hover:border-emerald-500/50"
              >
                {signatureUrl ? (
                  <>
                    <img
                      src={signatureUrl}
                      alt="Official signature stamp preview"
                      className="max-h-14 w-auto max-w-full object-contain"
                    />
                    <span className="mt-1 text-[10px] font-medium text-slate-400">
                      Click to replace
                    </span>
                    <button
                      type="button"
                      aria-label="Remove signature stamp"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateProfile({ signatureUrl: null });
                        setStampError("");
                      }}
                      className="absolute right-2 top-2 rounded-lg bg-white/90 p-1 text-slate-400 shadow-xs ring-1 ring-slate-200 transition-colors hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <PenTool className="h-5 w-5 text-slate-400 transition-colors group-hover:text-emerald-600" />
                    <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">
                      Upload Official Signature Stamp
                    </p>
                  </>
                )}
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Automatically embedded onto PDF executive digests and MCS/SWMC
                field work orders.
              </p>
              {stampError && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {stampError}
                </p>
              )}
            </div>
          </div>

          {/* Hidden file inputs — triggered by the uploader controls above */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
            onChange={(e) => {
              void handlePortraitPicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={stampInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
            onChange={(e) => {
              void handleStampPicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </Card>

        {/* Card 1B: Civil service credentials & secretariat desk */}
        <Card
          icon={<Landmark className="h-4 w-4" />}
          title="Civil Service Credentials & Hierarchy"
          subtitle="Designation parameters and secretariat wing assignments."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full Official Name" htmlFor="sp-full-name">
              <input
                id="sp-full-name"
                type="text"
                value={field("fullName")}
                onChange={(e) => updateProfile({ fullName: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Official Designation" htmlFor="sp-designation">
              <input
                id="sp-designation"
                type="text"
                value={field("designation")}
                onChange={(e) => updateProfile({ designation: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Civil Service Cadre / Grade" htmlFor="sp-cadre">
              <select
                id="sp-cadre"
                value={field("cadre")}
                onChange={(e) => updateProfile({ cadre: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                {CADRE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Official Service Number" htmlFor="sp-service-number">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="sp-service-number"
                  type="text"
                  value={field("serviceNumber")}
                  onChange={(e) =>
                    updateProfile({ serviceNumber: e.target.value })
                  }
                  className={`${inputClass} pl-10 font-mono text-xs tracking-wide`}
                />
              </div>
            </Field>
            <Field label="Parent Department" htmlFor="sp-department">
              <input
                id="sp-department"
                type="text"
                value={field("department")}
                onChange={(e) => updateProfile({ department: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Headquarters Posting" htmlFor="sp-posting">
              <select
                id="sp-posting"
                value={field("posting")}
                onChange={(e) => updateProfile({ posting: e.target.value })}
                className={`${inputClass} cursor-pointer`}
              >
                {POSTING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {/* Card 1C: Direct hotlines & secure gateway channels */}
        <Card
          icon={<PhoneCall className="h-4 w-4" />}
          title="Operational Hotlines & Dispatch Channels"
          subtitle="Direct emergency endpoints used for automated high-priority life hazard escalations."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Official Government Email"
              htmlFor="sp-email"
              badge={<VerifiedBadge text="✓ Verified Gov Domain" />}
            >
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="sp-email"
                  type="email"
                  value={field("email")}
                  onChange={(e) => updateProfile({ email: e.target.value })}
                  className={`${inputClass} pl-10`}
                />
              </div>
            </Field>
            <Field
              label="Emergency Direct Hotline"
              htmlFor="sp-hotline"
              badge={<VerifiedBadge text="✓ Verified Government Gateway" />}
            >
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="sp-hotline"
                  type="tel"
                  value={field("hotline")}
                  onChange={(e) => updateProfile({ hotline: e.target.value })}
                  className={`${inputClass} pl-10`}
                />
              </div>
            </Field>
            <Field
              label="Secretariat Green Phone / Intercom"
              htmlFor="sp-landline"
            >
              <input
                id="sp-landline"
                type="text"
                value={field("landline")}
                onChange={(e) => updateProfile({ landline: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field
              label="Staff Officer (SO) Direct Contact"
              htmlFor="sp-staff-officer"
            >
              <input
                id="sp-staff-officer"
                type="text"
                value={field("staffOfficer")}
                onChange={(e) =>
                  updateProfile({ staffOfficer: e.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        {/* Card 1D: Public transparency & authority privacy */}
        <Card
          icon={<Eye className="h-4 w-4" />}
          title="Public Transparency & Privacy Shields"
          subtitle="Govern how your identity and authority are displayed to the public."
        >
          <ToggleRow
            title="Show Official Name on Public Resolution Proofs"
            description="Displays 'Signed off by DG Local Govt' on verified completed tickets in the public live feed."
            enabled={field("showNameOnProofs")}
            onToggle={() =>
              updateProfile({ showNameOnProofs: !field("showNameOnProofs") })
            }
          />
          <ToggleRow
            title="Mask Direct Phone via Government Dispatch IVR"
            description="When calling citizens or field SDOs, mask your personal number with official 1122 / Local Govt caller ID."
            enabled={field("maskPhoneViaIvr")}
            onToggle={() =>
              updateProfile({ maskPhoneViaIvr: !field("maskPhoneViaIvr") })
            }
          />
          <ToggleRow
            title="Allow Direct WhatsApp Escalations from Civic Champions (>200 score)"
            description="Permits high-trust citizens to ping the executive desk directly for Priority 1 life hazards."
            enabled={field("allowWhatsappEscalations")}
            onToggle={() =>
              updateProfile({
                allowWhatsappEscalations: !field("allowWhatsappEscalations"),
              })
            }
          />
        </Card>
      </section>

      {/* Card 2: Automation & escalation thresholds */}
      <Card
        icon={<BellRing className="h-4 w-4" />}
        title="Automated Escalation & Dispatch Thresholds"
        subtitle="Set automated rules for how urgent issues escalate to high-ranking provincial officials."
      >
        <ThresholdField
          id="sp-p1-timer"
          label="Priority 1 Emergency Hazard Timer"
          value={sys("p1Timer")}
          onChange={(v) => updateSystem({ p1Timer: v })}
          subtext="If MCS or GEPCO do not dispatch a crew within the timer, auto-alert the Assistant Commissioner via SMS."
        />
        <ThresholdField
          id="sp-overdue-timer"
          label="Overdue Auto-Escalation Threshold"
          value={sys("overdueTimer")}
          onChange={(v) => updateSystem({ overdueTimer: v })}
          subtext="Auto-escalate overdue tickets to the Deputy Commissioner's weekly audit log."
        />
        <div>
          <p className="mb-2 text-sm font-bold text-slate-900">
            Auto-Alert Notification Channels
          </p>
          <div className="space-y-2">
            {ALERT_CHANNELS.map((channel) => {
              const enabled = sys("channels").includes(channel.label);
              return (
                <button
                  key={channel.label}
                  type="button"
                  onClick={() => toggleChannel(channel.label)}
                  aria-pressed={enabled}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${
                    enabled
                      ? "border-emerald-700 bg-emerald-50/70 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
                      enabled
                        ? "border-emerald-700 bg-emerald-700"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {enabled && (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    )}
                  </span>
                  {channel.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Card 3: Triage & abuse sentinel */}
      <Card
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Civic Safeguards & Anti-Spam Governance"
      >
        <ToggleRow
          title="Mandatory CNIC for Priority 1 Hazards"
          description="Default OFF — ensures anyone can report life hazards without friction."
          enabled={sys("mandatoryCnic")}
          onToggle={() => updateSystem({ mandatoryCnic: !sys("mandatoryCnic") })}
        />
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="sp-endorse"
              className="text-sm font-bold text-slate-900"
            >
              Community Endorsement Auto-Dispatch Threshold
            </label>
            <span className="shrink-0 rounded-full bg-emerald-700 px-3 py-1 font-mono text-xs font-bold text-white">
              {sys("endorsementThreshold")} Upvotes
            </span>
          </div>
          <input
            id="sp-endorse"
            type="range"
            min={5}
            max={50}
            step={5}
            value={sys("endorsementThreshold")}
            onChange={(e) =>
              updateSystem({ endorsementThreshold: Number(e.target.value) })
            }
            aria-label="Community endorsement auto-dispatch threshold"
            className="mt-3 w-full accent-emerald-700"
          />
          <p className="mt-1.5 text-xs leading-5 text-slate-500">
            When {sys("endorsementThreshold")} nearby residents confirm an issue,
            the ticket is automatically prioritized without manual admin triage.
          </p>
        </div>
        <div>
          <label
            htmlFor="sp-abuse"
            className={`${labelClass} mb-1.5 block`}
          >
            Abuse Auto-Blacklist Rule
          </label>
          <select
            id="sp-abuse"
            value={sys("abuseRule")}
            onChange={(e) => updateSystem({ abuseRule: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {ABUSE_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {rule}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Card 4: Platform availability & export */}
      <Card
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Platform Availability & Data Export"
      >
        <ToggleRow
          title="Emergency Maintenance Freeze"
          description="Temporarily pauses citizen submissions while leaving tracking active."
          enabled={sys("maintenanceFreeze")}
          onToggle={() =>
            updateSystem({ maintenanceFreeze: !sys("maintenanceFreeze") })
          }
        />
        {sys("maintenanceFreeze") && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Reporting is frozen across the pilot district while maintenance mode is active.
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800"
          >
            <Download className="h-4 w-4" />
            Export Provincial Incident Ledger (.CSV)
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:border-emerald-300 hover:text-emerald-800"
          >
            <FileText className="h-4 w-4" />
            Export Agency SLA Scorecard (.PDF)
          </button>
        </div>
      </Card>

      {/* Workspace utilities — factory reset must stay reachable while the
          unsaved-changes dock is hidden */}
      <div className="flex justify-end px-1">
        <button
          type="button"
          onClick={resetDefaults}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors duration-150 hover:text-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restore Factory Defaults
        </button>
      </div>

      {/* Floating "Unsaved Changes" dock — parked below the viewport and
          sliding up only while the draft differs from the saved baseline.
          inert keeps the hidden controls out of tab order and the a11y tree. */}
      <div
        aria-hidden={!dockVisible}
        inert={!dockVisible}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-4xl transition-all duration-300 ease-out ${
          dockVisible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-12 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-md sm:flex-row sm:px-6">
          {justSaved ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm font-semibold text-emerald-700"
            >
              <BadgeCheck className="h-4.5 w-4.5" />
              Preferences Saved
            </p>
          ) : (
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <span className="h-2 w-2 animate-ping rounded-full bg-amber-500" />
              <span className="font-semibold text-slate-800">
                Unsaved configuration changes detected.
              </span>
              <span className="hidden text-slate-400 md:inline">
                • Applies across all desk endpoints
              </span>
            </div>
          )}

          <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
            {!justSaved && (
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || justSaved}
              className="flex items-center gap-2 rounded-xl bg-[#0F5132] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 active:scale-95 disabled:opacity-50"
            >
              {justSaved ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : isSaving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {justSaved
                ? "Saved"
                : isSaving
                  ? "Saving…"
                  : "Save System Preferences"}
            </button>
          </div>
        </div>
      </div>

      {/* Floating sync toast */}
      {syncToast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-toast-rise fixed bottom-6 right-6 z-[70] flex max-w-sm items-start gap-3 rounded-2xl border border-emerald-200/80 bg-white px-5 py-4 shadow-[0_16px_48px_rgba(15,81,50,0.22)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d0fae5] text-[#0F5132]">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              Admin profile and system credentials synchronized successfully.
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Header badge, sidebar card and public proofs now reflect the saved
              identity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(false)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
