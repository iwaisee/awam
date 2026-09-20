import type { Metadata } from "next";
import Link from "next/link";
import {
  Droplets,
  Trash2,
  Zap,
  Truck,
  Construction,
  Building2,
  ArrowRight,
  Phone,
  ShieldCheck,
  Lock,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Municipal Operations Gateway | Sada-e-Awam",
  description:
    "Agency access gateway for municipal field operations desks in the Sialkot pilot district.",
};

/** Sialkot pilot operations desks — routes mirror PORTAL_DEPTS keys. */
const AGENCIES = [
  {
    name: "MCS — Water & Sewerage",
    region: "Sialkot / Municipal Limits",
    scope: "Water Supply, Open Gutters, Sewerage & Drainage",
    route: "/portal/mcs",
    stat: "42 Pending Work Orders",
    statTone: "bg-sky-50 text-sky-700 ring-sky-200",
    icon: Droplets,
    iconClass: "bg-sky-100 text-sky-700",
    hotline: "052-9250100",
  },
  {
    name: "SWMC",
    region: "Sialkot",
    scope: "Solid Waste Management & Cleanliness",
    route: "/portal/swmc",
    stat: "18 Overdue Dumps",
    statTone: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: Trash2,
    iconClass: "bg-amber-100 text-amber-700",
    hotline: "1139",
  },
  {
    name: "GEPCO",
    region: "Sialkot District",
    scope: "Power Lines, Transformers, Hazard Wires",
    route: "/portal/gepco",
    stat: "7 Life Hazards",
    statTone: "bg-rose-50 text-rose-700 ring-rose-200",
    icon: Zap,
    iconClass: "bg-rose-100 text-rose-700",
    hotline: "118",
  },
  {
    name: "CTP Sialkot",
    region: "Sialkot District",
    scope: "Congestion, Peak Cargo, Illegal Parking",
    route: "/portal/traffic",
    stat: "12 Active Gridlocks",
    statTone: "bg-violet-50 text-violet-700 ring-violet-200",
    icon: Truck,
    iconClass: "bg-violet-100 text-violet-700",
    hotline: "15",
  },
  {
    name: "MCS — Roads & Infrastructure",
    region: "Sialkot Municipal Limits",
    scope: "Arterial Roads & Major Asphalt Craters",
    route: "/portal/mcs-roads",
    stat: "29 Pending Patchworks",
    statTone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: Construction,
    iconClass: "bg-emerald-100 text-emerald-700",
    hotline: "052-9250100",
  },
  {
    name: "District Administration / DC Office",
    region: "Sialkot District",
    scope: "Inter-Department Escalations",
    route: "/portal/dc-office",
    stat: "9 Escalated Inquiries",
    statTone: "bg-slate-100 text-slate-600 ring-slate-200",
    icon: Building2,
    iconClass: "bg-slate-200 text-slate-700",
    hotline: "052-9260235",
  },
];

export default function PortalGatewayPage() {
  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Hero header */}
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Official Government &amp; Municipal Access Only
          </span>
          <h1 className="font-heading mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Municipal Operations Gateway{" "}
            <span className="urdu text-xl font-semibold text-emerald-700">
              بلدیاتی سروس پورٹل
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            Select your designated agency or division desk to access the
            localized triage queue.
          </p>
        </header>

        {/* Agency selection grid */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AGENCIES.map((agency) => {
            const Icon = agency.icon;
            return (
              <article
                key={agency.route}
                className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${agency.iconClass}`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${agency.statTone}`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                    </span>
                    {agency.stat}
                  </span>
                </div>
                <h2 className="font-heading mt-4 text-base font-bold leading-snug text-slate-900">
                  {agency.name}{" "}
                  <span className="font-medium text-slate-400">
                    / {agency.region}
                  </span>
                </h2>
                <p className="mt-1 flex-1 text-sm leading-6 text-slate-500">
                  {agency.scope}
                </p>

                <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
                  <Link
                    href={agency.route}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800"
                  >
                    Open Agency Queue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Official credentials required
                    </span>
                    <a
                      href={`tel:${agency.hotline.replace(/[^\d+]/g, "")}`}
                      className="flex items-center gap-1 font-semibold text-emerald-700 transition-colors duration-150 hover:text-emerald-800"
                    >
                      <Phone className="h-3 w-3" />
                      Hotline: {agency.hotline}
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-5 text-slate-400">
          Access to operations desks is restricted to authorized municipal
          personnel. All queue actions are logged against staff credentials and
          audited by the Provincial Command Center.
        </p>
      </div>
    </div>
  );
}
