import Link from "next/link";
import {
  Megaphone,
  ShieldCheck,
  Scale,
  Lock,
  Phone,
  CheckCircle2,
} from "lucide-react";

const NAV = [
  { label: "Report a Hazard", href: "/report" },
  { label: "Live Incident Feed", href: "/feed" },
  { label: "Agencies Directory", href: "/departments" },
  { label: "Track Complaint Status", href: "/track" },
  { label: "Resolution Audit Log", href: "/feed?status=resolved" },
  { label: "Platform Sitemap", href: "/sitemap" },
];

const AGENCIES = [
  { name: "MCS", detail: "Municipal Corporation Sialkot" },
  { name: "Sialkot Cantt Board", detail: "Cantonment Areas" },
  { name: "GEPCO", detail: "Electricity Infrastructure" },
  { name: "SWMC", detail: "Sialkot Waste Management" },
];

const HELPLINES = [
  {
    label: "Rescue 1122",
    detail: "Ambulance, Fire & Life Safety",
    number: "1122",
  },
  {
    label: "MCS Helpline",
    detail: "Drainage & Pipeline Bursts",
    number: "052-9250100",
  },
  {
    label: "SWMC Helpline",
    detail: "Waste Dumps & Street Sweeping",
    number: "1139",
  },
];

const VALUE_PROPS = [
  {
    icon: ShieldCheck,
    title: "Tamper-Proof EXIF Verification",
    description:
      "All submitted photo evidence is validated for accurate time and GPS coordinates.",
  },
  {
    icon: Scale,
    title: "Open Civic Transparency",
    description:
      "Public upvotes and resolution timers prevent complaints from being quietly dismissed.",
  },
  {
    icon: Lock,
    title: "Citizen Privacy First",
    description:
      "Optional anonymous posting protects your identity from local friction.",
  },
];

const COVERAGE_ROADMAP = [
  { city: "Sialkot", tag: "Live", live: true },
  { city: "Lahore", tag: "Phase 2", live: false },
  { city: "Islamabad", tag: "Phase 2", live: false },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white text-slate-600">
      {/* Civic Transparency & Trust Ribbon */}
      <div className="border-b border-emerald-100/60 bg-emerald-50/60 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 md:flex-row md:items-center md:justify-between md:gap-8">
          {VALUE_PROPS.map((prop) => {
            const Icon = prop.icon;
            return (
              <div
                key={prop.title}
                className="flex shrink-0 items-start gap-3 md:flex-1"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm shadow-emerald-800/10 ring-1 ring-emerald-100">
                  <Icon className="h-4.5 w-4.5 text-emerald-700" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {prop.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {prop.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main footer grid */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.4fr_1.3fr]">
        {/* Column 1: Identity & civic mission */}
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-sm shadow-emerald-800/20">
              <Megaphone className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="font-heading block text-lg font-bold text-slate-900">
                Sada-e-Awam
              </span>
              <span className="urdu block text-xs font-medium text-slate-500">
                صدائے عوام • سیالکوٹ پائلٹ
              </span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">
            A citizen-led municipal accountability platform bridging the gap
            between residents and their city&apos;s field agencies — live now
            in Sialkot District.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/60 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
            </span>
            Phase 1 Pilot Live in Sialkot District
          </span>
        </div>

        {/* Column 2: Platform navigation */}
        <nav aria-label="Footer">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Platform
          </h3>
          <ul className="mt-4 space-y-2.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-emerald-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Column 3: Connected agencies */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pilot Agencies — Sialkot
          </h3>
          <ul className="mt-4 space-y-2.5">
            {AGENCIES.map((agency) => (
              <li key={agency.name} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-sm font-medium text-slate-600">
                  {agency.name}
                </span>
                <span className="text-xs text-slate-400">
                  — {agency.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 4: Emergency quick-dial cards */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Emergency Hotlines
          </h3>
          <div className="mt-4 space-y-2">
            {HELPLINES.map((line) => (
              <a
                key={line.number}
                href={`tel:${line.number}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 transition-all duration-150 hover:border-emerald-200 hover:bg-slate-100"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {line.label}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {line.detail}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">
                  {line.number}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Coverage roadmap bar */}
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Coverage Roadmap:
          </span>
          {COVERAGE_ROADMAP.map((zone) => (
            <Link
              key={zone.city}
              href={`/feed?q=${encodeURIComponent(zone.city)}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150 ${
                zone.live
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                  : "border-slate-200/80 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-800"
              }`}
            >
              {zone.live && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                </span>
              )}
              {zone.city}
              <span
                className={
                  zone.live
                    ? "text-[10px] font-bold uppercase text-emerald-600"
                    : "text-[10px] font-bold uppercase text-slate-400"
                }
              >
                {zone.tag}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom legal & attribution bar */}
      <div className="mx-auto mt-8 max-w-7xl border-t border-slate-200/80 px-6 pt-6 pb-8">
        <div className="flex flex-col items-center justify-between gap-3 text-center md:flex-row md:text-left">
          <p className="text-xs text-slate-500">
            © 2026 Sada-e-Awam. Independent Civic Tech Initiative for Punjab,
            Pakistan.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Data published under Pakistan Open Government Data principles.
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          >
            <a
              href="#"
              className="text-xs font-medium text-slate-500 transition-colors duration-150 hover:text-emerald-800"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-xs font-medium text-slate-500 transition-colors duration-150 hover:text-emerald-800"
            >
              Terms of Use
            </a>
            <a
              href="#"
              className="text-xs font-medium text-slate-500 transition-colors duration-150 hover:text-emerald-800"
            >
              Report Fraud
            </a>
            <span className="urdu text-xs font-medium text-emerald-700">
              بہتر پنجاب، محفوظ عوام
            </span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
