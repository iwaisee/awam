"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Compass,
  Construction,
  FileCheck2,
  Lightbulb,
  MapPin,
  Phone,
  Search,
  Trash2,
  TrafficCone,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  DEFAULT_PILOT_CITY_ID,
  pilotBadgeLabel,
  pilotDisplayLabel,
} from "@/data/pilotCities";
import { useCoverage } from "@/context/CoverageContext";
import { appendWaitlistEntry } from "@/lib/cityWaitlist";
import RiverCleanupCompare from "@/components/RiverCleanupCompare";
import type { CityItem, IncidentReport } from "@/types/civic";
import { agencyCode } from "@/lib/feedReports";
import type { CategoryId } from "@/types/report";

const REPORT_CATEGORIES: {
  title: string;
  tag: string;
  description: string;
  icon: typeof CircleDot;
  preselect: CategoryId | null;
}[] = [
  {
    title: "Open Manholes & Sewers",
    tag: "MCS",
    description: "Deep gutters, flooded streets, pipeline bursts.",
    icon: CircleDot,
    preselect: "open_manhole",
  },
  {
    title: "Garbage & Stench",
    tag: "SWMC",
    description: "Overflowing commercial bins, unattended trash dumps.",
    icon: Trash2,
    preselect: "sanitation",
  },
  {
    title: "Electricity Hazards",
    tag: "GEPCO",
    description: "Low-hanging wires, sparking PMT transformers.",
    icon: Zap,
    preselect: "electricity",
  },
  {
    title: "Broken Roads & Craters",
    tag: "MCS / Cantt Board",
    description: "Potholes causing bike accidents, damaged sidewalks.",
    icon: Construction,
    preselect: "broken_road",
  },
  {
    title: "Traffic Bottlenecks",
    tag: "CTP Sialkot",
    description: "Banned peak-hour dumpers, broken signals, gridlock.",
    icon: TrafficCone,
    preselect: "traffic",
  },
  {
    title: "Broken Streetlights",
    tag: "GEPCO / MCS",
    description: "Dark streets, security hazards at night.",
    icon: Lightbulb,
    preselect: "electricity",
  },
];

const STEPS = [
  {
    number: "01",
    icon: Camera,
    title: "Snap & Tag",
    description:
      "Take a photo or leave a 30-second Urdu voice note. The app reads GPS data automatically.",
  },
  {
    number: "02",
    icon: Users,
    title: "Community Upvote",
    description:
      "Neighbors confirm the problem. 25+ votes trigger automated SMS alerts to Assistant Commissioners.",
  },
  {
    number: "03",
    icon: FileCheck2,
    title: "Proof of Resolution",
    description:
      "Field crews must upload an “After” photo on-site before closing any ticket.",
  },
];

interface LiveCard {
  id: string;
  title: string;
  area: string;
  status: string;
  statusClass: string;
  upvotes: number;
}

/** Newest live tickets for the accountability stream — derived from the
    Neon ledger so citizen submissions surface on the landing page. */
function useLiveCards(): LiveCard[] {
  const [cards, setCards] = useState<LiveCard[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)),
      )
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const ledger = data as IncidentReport[];
        setCards(
          ledger.slice(0, 3).map((r) => {
            const status =
              r.status === "resolved"
                ? { label: "Resolved & Verified", cls: "bg-emerald-100 text-emerald-800" }
                : r.status === "disputed"
                  ? { label: "Disputed by Citizens", cls: "bg-rose-100 text-rose-700" }
                  : r.status === "triage"
                    ? { label: `Under ${agencyCode(r.assigned_agency)} Review`, cls: "bg-blue-100 text-blue-800" }
                    : { label: `${agencyCode(r.assigned_agency)} Crew Dispatched`, cls: "bg-amber-100 text-amber-800" };
            return {
              id: r.tracking_token,
              title: r.description.split(/[.\u2014]/)[0].trim(),
              area: `${r.area_name}, ${r.city_name}`,
              status: status.label,
              statusClass: status.cls,
              upvotes: r.upvotes,
            };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return cards;
}

/* ----------------------- Smart city detection engine ---------------------- */

const CITY_CACHE_KEY = "sada_detected_city";
const CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CityCacheEntry {
  city: string;
  ts: number;
}

/** Accepts rows written by this page (city id) and legacy rows (name_en). */
function readCityCache(): string | null {
  try {
    const raw = window.localStorage.getItem(CITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CityCacheEntry;
    if (!parsed.city || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > CITY_CACHE_TTL_MS) return null;
    return parsed.city;
  } catch {
    return null;
  }
}

function writeCityCache(cityId: string): void {
  try {
    const entry: CityCacheEntry = { city: cityId, ts: Date.now() };
    window.localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage unavailable — detection still works for this session.
  }
}

function isLocalhostHost(): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(
    window.location.hostname
  );
}

export default function LandingPage() {
  const [selectedCityId, setSelectedCityId] = useState<string>(
    DEFAULT_PILOT_CITY_ID
  );
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [waitlistCity, setWaitlistCity] = useState<CityItem | null>(null);
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistArea, setWaitlistArea] = useState("");
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const liveCards = useLiveCards();
  /* The district roster is the Neon coverage document — no static seed. */
  const { cities: pilotCities, hydrated: rosterLoaded } = useCoverage();

  const selectedCity =
    pilotCities.find((c) => c.id === selectedCityId) ??
    pilotCities.find((c) => c.id === DEFAULT_PILOT_CITY_ID);
  const sialkotPilot = pilotCities.find((c) => c.id === DEFAULT_PILOT_CITY_ID);

  const cityMenuRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const detectionStarted = useRef(false);

  /* Tier 1 + Tier 2: cached city first, then a silent IP lookup — production
     only. Development (localhost) skips the external service entirely because
     ipapi.co rate-limits repeated local reloads, so the Sialkot pilot default
     stands immediately. City state is applied after a microtask so the
     hydration render is never diverged from the server markup. Runs after the
     Neon roster has loaded so cache matches resolve against real districts. */
  useEffect(() => {
    if (!rosterLoaded || detectionStarted.current) return;
    detectionStarted.current = true;

    void (async () => {
      // Tier 1 — instant localStorage hydration (< 24h old). Accepts rows
      // written by this page (city id) and legacy rows (name_en).
      await Promise.resolve();
      const cached = readCityCache();
      if (cached) {
        const match = pilotCities.find(
          (c) =>
            c.id === cached || c.name_en.toLowerCase() === cached.toLowerCase()
        );
        if (match) {
          setSelectedCityId(match.id);
          return;
        }
      }

      if (process.env.NODE_ENV !== "production" || isLocalhostHost()) return;

      // Tier 2 — silent IP lookup; every failure path keeps the default.
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch("https://ipapi.co/json/", {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return;
        const data = (await res.json()) as { city?: string };
        const detected = data.city?.trim().toLowerCase();
        if (!detected) return;
        const match = pilotCities.find(
          (c) => c.name_en.toLowerCase() === detected
        );
        if (match) {
          setSelectedCityId(match.id);
          writeCityCache(match.id);
        }
      } catch {
        // Ad-blockers, timeouts and offline mode all fail silently.
      }
    })();
    // The lookup reads the roster exactly once, when it first arrives; later
    // roster edits must not re-run geodetection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterLoaded]);

  /* Close the city menu on outside clicks / Escape while it is open. */
  useEffect(() => {
    if (!cityMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        cityMenuRef.current &&
        !cityMenuRef.current.contains(event.target as Node)
      ) {
        setCityMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCityMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cityMenuOpen]);

  /* Waitlist dialog: Escape to close, scroll lock, and an initial focus on
     the phone field. Focused directly in the effect — rAF callbacks are
     throttled for backgrounded tabs and the focus never landed. */
  useEffect(() => {
    if (!waitlistCity) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWaitlistCity(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    phoneInputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [waitlistCity]);

  /* Success toasts auto-dismiss so nothing ever sticks on screen. */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleCitySelect = (city: CityItem) => {
    setSelectedCityId(city.id);
    setCityMenuOpen(false);
    writeCityCache(city.id);
  };

  const openWaitlist = (city: CityItem) => {
    setWaitlistCity(city);
    setWaitlistPhone("");
    setWaitlistArea("");
    setWaitlistError(null);
  };

  /** Roadmap teaser entry point — pre-focuses the dialog on the selected
      district, unless that district is already live (Sialkot); then the ask
      defaults to the first Phase 2 city. */
  const requestDistrictAccess = () => {
    const target =
      selectedCity?.status === "coming_soon"
        ? selectedCity
        : (pilotCities.find((c) => c.status === "coming_soon") ??
          selectedCity ??
          sialkotPilot);
    if (target) openWaitlist(target);
  };

  const submitWaitlist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!waitlistCity) return;
    const digits = waitlistPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setWaitlistError(
        "Please enter a valid mobile number, e.g. +92 300 1234567."
      );
      return;
    }
    const ok = await appendWaitlistEntry({
      city: waitlistCity.id,
      city_name: waitlistCity.name_en,
      phone: waitlistPhone.trim(),
      ...(waitlistArea.trim() ? { area: waitlistArea.trim() } : {}),
      timestamp: new Date().toISOString(),
    });
    if (!ok) {
      setWaitlistError(
        "Could not reach the server — please try again in a moment."
      );
      return;
    }
    setToast(
      `You're on the priority notification list for ${waitlistCity.name_en}.`
    );
    setWaitlistCity(null);
  };

  return (
    <div className="bg-white">
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="bg-gradient-to-b from-emerald-50/40 via-white to-slate-50">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
          {/* Pilot indicator pill */}
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-800 shadow-xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Phase 1 Municipal Pilot Live across Sialkot District
          </span>

          <h1 className="font-heading mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            See an infrastructure hazard in Sialkot?
            <span className="block text-emerald-700">
              Get it fixed by the teams on the ground.
            </span>
          </h1>
          <p
            className="urdu mx-auto mt-5 max-w-2xl text-lg font-semibold text-emerald-800"
            dir="rtl"
          >
            سیالکوٹ میں سڑک، سیوریج یا بجلی کا مسئلہ چند سیکنڈ میں رپورٹ کریں
          </p>
          <p className="mx-auto mt-5 max-w-[650px] text-base leading-7 text-slate-600">
            Direct digital routing to Municipal Corporation Sialkot (MCS),
            Sialkot Cantonment Board, and GEPCO. Verified with live photo
            proofs and trackable work orders.
          </p>

          {/* Hero action card */}
          <div className="mx-auto mt-10 max-w-xl">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-lg shadow-emerald-950/5 sm:flex-row">
              {/* City selector group */}
              <div
                ref={cityMenuRef}
                className="relative flex w-full flex-1 items-center gap-2.5 rounded-xl border border-slate-200/60 bg-slate-50 px-3.5 py-2.5 transition-colors duration-150 hover:bg-slate-100/80"
              >
                <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={cityMenuOpen}
                  aria-label="Select your city"
                  onClick={() => setCityMenuOpen((open) => !open)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {selectedCity
                      ? pilotDisplayLabel(selectedCity)
                      : rosterLoaded
                        ? "Select a district"
                        : "Loading districts…"}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${
                      cityMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {cityMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Sada-e-Awam cities"
                    className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-emerald-950/5"
                  >
                    {pilotCities.map((city) => {
                      const isActive = city.status === "active";
                      const isSelected = city.id === selectedCity?.id;
                      return (
                        <button
                          key={city.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleCitySelect(city)}
                          className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors duration-100 ${
                            isSelected ? "bg-emerald-50/70" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                              {pilotDisplayLabel(city)}
                              {isSelected && (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              )}
                            </span>
                            {city.agencies && (
                              <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                {city.agencies.join(" • ")}
                              </span>
                            )}
                          </span>
                          {isActive ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {pilotBadgeLabel(city)}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200/80">
                              {pilotBadgeLabel(city)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic primary CTA */}
              {selectedCity?.status === "active" ? (
                <Link
                  href={`/report?city=${selectedCity.id}`}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#0F5132] px-6 py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/40 sm:w-auto"
                >
                  Report Problem in {selectedCity.name_en}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => selectedCity && openWaitlist(selectedCity)}
                  disabled={!selectedCity}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  Notify Me When Live in {selectedCity?.name_en ?? "…"} 🔔
                </button>
              )}
            </div>

            {/* Dynamic trust ticker */}
            <div aria-live="polite" className="mt-3">
              {selectedCity?.status === "active" ? (
                <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  <span>
                    8 Sialkot Hubs Active{" "}
                    <span className="text-slate-300">•</span> Direct Dispatch:
                    MCS, Cantt Board &amp; GEPCO{" "}
                    <span className="text-slate-300">•</span> 48h Resolution
                    Target
                  </span>
                </p>
              ) : (
                <p className="inline-flex flex-wrap items-center justify-center gap-x-1 rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200/70">
                  ⚠️ Municipal dispatch for {selectedCity?.name_en} begins in
                  Phase 2.{" "}
                  <button
                    type="button"
                    onClick={() => sialkotPilot && handleCitySelect(sialkotPilot)}
                    className="font-bold underline decoration-amber-300 underline-offset-2 transition-colors hover:text-amber-900"
                  >
                    Select Sialkot
                  </button>{" "}
                  to test reporting.
                </p>
              )}
            </div>

            <Link
              href="/track"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors duration-150 hover:text-emerald-700"
            >
              <Search className="h-3.5 w-3.5" />
              or Track an Existing Complaint with Tracking ID
            </Link>
          </div>

          {/* Social proof counters */}
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-slate-500">
            <span>
              <span className="font-heading font-bold text-slate-900">
                3,400+
              </span>{" "}
              Issues Logged
            </span>
            <span aria-hidden className="text-slate-300">
              •
            </span>
            <span>
              <span className="font-heading font-bold text-slate-900">48h</span>{" "}
              Resolution Target
            </span>
            <span aria-hidden className="text-slate-300">
              •
            </span>
            <span>
              <span className="font-heading font-bold text-slate-900">8</span>{" "}
              Pilot Hubs in Sialkot
            </span>
          </div>

          {/* Expansion roadmap teaser */}
          <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-xs backdrop-blur-xs">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Compass className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Bring Sada-e-Awam to your district
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Pilot expansion to Lahore and Islamabad begins after Phase
                    1 field testing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={requestDistrictAccess}
                className="shrink-0 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-xs transition-colors duration-150 hover:bg-emerald-50"
              >
                Request District Access
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------- What you can report grid ---------------------- */}
      <section className="border-t border-slate-100 bg-slate-50/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-heading text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            One Platform. Every Municipal Agency.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-base text-slate-600">
            MCS, Sialkot Cantt Board, GEPCO and SWMC are wired in. You
            don&apos;t need to know which department handles what — just tap
            the issue.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.title}
                  href={
                    category.preselect
                      ? `/report?category=${category.preselect}&city=${DEFAULT_PILOT_CITY_ID}`
                      : `/report?city=${DEFAULT_PILOT_CITY_ID}`
                  }
                  className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors duration-200 group-hover:bg-emerald-700 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors duration-200 group-hover:bg-emerald-50 group-hover:text-emerald-700">
                      {category.tag}
                    </span>
                  </div>
                  <h3 className="font-heading mt-4 text-base font-bold text-slate-900">
                    {category.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">
                    {category.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 opacity-0 transition-all duration-200 group-hover:opacity-100">
                    Report this
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------- 3-step journey ----------------------------- */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-heading text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            From Photo to Fixed. In Three Steps.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="relative text-center">
                  <span className="font-heading text-sm font-bold tracking-widest text-emerald-600">
                    {step.number}
                  </span>
                  <span className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
                    <Icon className="h-6 w-6 text-emerald-700" />
                  </span>
                  <h3 className="font-heading mt-4 text-lg font-bold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------- Live accountability stream --------------------- */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Recent Public Issues in Sialkot
            </h2>
            <Link
              href="/feed"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-emerald-700 transition-colors duration-150 hover:text-emerald-800"
            >
              View all live reports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {liveCards.length === 0 && (
            <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No live reports yet — file the first one and it will appear here
              instantly.
            </p>
          )}
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {liveCards.map((card) => (
              <Link
                key={card.id}
                href={`/track?id=${encodeURIComponent(card.id)}`}
                className="group rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">
                    {card.id}
                  </span>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${card.statusClass}`}
                  >
                    {card.status}
                  </span>
                </div>
                <h3 className="font-heading mt-3 text-base font-bold leading-snug text-slate-900 group-hover:text-emerald-800">
                  {card.title}
                </h3>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-emerald-600" />
                    {card.area}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    {card.upvotes}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------- Before & After showcase ---------------------- */}
      <RiverCleanupCompare />

      {/* ---------------------- Bottom action strip ------------------------- */}
      <section className="mx-auto mb-16 max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-emerald-900 p-12 text-center text-white">
          <div
            aria-hidden
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-800/50 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-emerald-700/40 blur-3xl"
          />
          <div className="relative">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Make your neighborhood safer today.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base text-emerald-100/90">
              Takes less than 60 seconds. No bureaucratic paperwork required.
            </p>
            <Link
              href={`/report?city=${DEFAULT_PILOT_CITY_ID}`}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-emerald-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-50"
            >
              Start a Report{" "}
              <span className="urdu font-semibold">(مسئلہ درج کریں)</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------- City waitlist modal -------------------------- */}
      {waitlistCity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            aria-hidden
            onClick={() => setWaitlistCity(null)}
            className="animate-overlay-in absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
            className="animate-in fade-in zoom-in-95 duration-200 relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-8"
          >
            <button
              type="button"
              onClick={() => setWaitlistCity(null)}
              aria-label="Close dialog"
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <BellRing className="h-6 w-6" />
            </div>
            <h2
              id="waitlist-title"
              className="font-heading text-xl font-bold tracking-tight text-slate-900"
            >
              Sada-e-Awam is expanding to {waitlistCity.name_en}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Municipal integration for {waitlistCity.name_en} is scheduled for
              Phase 2. Leave your WhatsApp or phone number to be notified the
              day report submissions open in your district.
            </p>

            <form onSubmit={submitWaitlist} className="mt-6 space-y-3.5">
              <div>
                <label
                  htmlFor="waitlist-phone"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  WhatsApp / Phone Number
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={phoneInputRef}
                    id="waitlist-phone"
                    type="tel"
                    autoComplete="tel"
                    value={waitlistPhone}
                    onChange={(e) => {
                      setWaitlistPhone(e.target.value);
                      setWaitlistError(null);
                    }}
                    placeholder="+92 3XX XXXXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="waitlist-area"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Neighborhood / Area{" "}
                  <span className="font-medium text-slate-400">(optional)</span>
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="waitlist-area"
                    type="text"
                    value={waitlistArea}
                    onChange={(e) => setWaitlistArea(e.target.value)}
                    placeholder="e.g. Gulberg, DHA, F-7, Saddar"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
              </div>
              {waitlistError && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {waitlistError}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-[#0F5132] py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
              >
                Join {waitlistCity.name_en} Launch Waitlist
              </button>
              <p className="text-center text-[11px] leading-4 text-slate-400">
                Saved on this device only — used solely to notify you about the{" "}
                {waitlistCity.name_en} launch.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------- Success toast -------------------------- */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <p
            role="status"
            className="animate-toast-rise inline-flex items-center gap-2 rounded-full bg-[#0F5132] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}
