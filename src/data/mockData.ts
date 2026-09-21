/* Citizen-facing presentation data: the public agency directory, the card
   shape every report-listing surface renders, and the demo citizen document
   the settings dashboard starts from.

   Nothing here is a ledger — live tickets come from /api/reports and are
   mapped into FeedReport by lib/feedReports. */

import type { CitizenProfileSettings } from "@/types/civic";
import type { CategoryId } from "@/types/report";

/* ---------------------------- Agency directory ---------------------------- */

/** Lucide glyph keys the departments page maps to icon components. */
export type DepartmentIcon =
  | "droplets"
  | "trash"
  | "zap"
  | "traffic"
  | "landmark";

export interface Department {
  /** URL key — `/report?dept=<key>` pre-selects this desk's category. */
  key: string;
  shortName: string;
  fullName: string;
  urduName: string;
  icon: DepartmentIcon;
  /** Tailwind classes for the identity avatar tile. */
  badgeClass: string;
  /** Jurisdiction chips, e.g. "Municipal Limits", "Cantonment". */
  jurisdictionTags: string[];
  avgResponse: string;
  resolutionRate: string;
  helpline: string;
  /** Secondary channels (WhatsApp desk, UAN) shown beside the helpline. */
  contacts?: { label: string; value: string }[];
  /** Officer ladder a stalled complaint climbs. */
  escalationChain: string[];
  hours: string;
  /** Category the reporting wizard opens on when this desk is deep-linked. */
  preselectCategory: CategoryId | null;
}

export const DEPARTMENTS: Department[] = [
  {
    key: "mcs",
    shortName: "MCS",
    fullName: "Municipal Corporation Sialkot",
    urduName: "میونسپل کارپوریشن سیالکوٹ",
    icon: "droplets",
    badgeClass: "bg-sky-50 text-sky-700",
    jurisdictionTags: ["Municipal Limits", "Water & Sewerage", "Roads"],
    avgResponse: "9h 40m",
    resolutionRate: "78%",
    helpline: "1139",
    contacts: [
      { label: "WhatsApp", value: "+92 300 8610011" },
      { label: "UAN", value: "052-9250311" },
    ],
    escalationChain: [
      "Sub-Divisional Officer",
      "Executive Engineer (XEN)",
      "Chief Officer MCS",
      "Deputy Commissioner Sialkot",
    ],
    hours: "Desk open 08:00 – 20:00 · emergency crews 24/7",
    preselectCategory: "water_leak",
  },
  {
    key: "swmc",
    shortName: "SWMC",
    fullName: "Sialkot Waste Management Company",
    urduName: "سیالکوٹ ویسٹ مینجمنٹ کمپنی",
    icon: "trash",
    badgeClass: "bg-emerald-50 text-emerald-700",
    jurisdictionTags: ["Collection", "Street Sweeping", "Landfill"],
    avgResponse: "6h 15m",
    resolutionRate: "84%",
    helpline: "1139",
    contacts: [{ label: "WhatsApp", value: "+92 311 1119762" }],
    escalationChain: [
      "Zonal Sanitary Inspector",
      "Operations Manager SWMC",
      "Chief Executive Officer SWMC",
      "Deputy Commissioner Sialkot",
    ],
    hours: "Lifting 06:00 – 22:00 · complaint desk 24/7",
    preselectCategory: "sanitation",
  },
  {
    key: "gepco",
    shortName: "GEPCO",
    fullName: "Gujranwala Electric Power Company — Sialkot Circle",
    urduName: "گوجرانوالہ الیکٹرک پاور کمپنی",
    icon: "zap",
    badgeClass: "bg-amber-50 text-amber-700",
    jurisdictionTags: ["Poles & Wires", "Transformers", "Feeders"],
    avgResponse: "3h 05m",
    resolutionRate: "88%",
    helpline: "118",
    contacts: [
      { label: "Complaint Cell", value: "052-9250801" },
      { label: "WhatsApp", value: "+92 300 8661118" },
    ],
    escalationChain: [
      "Line Superintendent",
      "Sub-Divisional Officer (SDO)",
      "Executive Engineer (XEN)",
      "Superintending Engineer — Sialkot Circle",
    ],
    hours: "Fault desk 24/7 · HT crews on standby",
    preselectCategory: "electricity",
  },
  {
    key: "ctp",
    shortName: "CTP Sialkot",
    fullName: "City Traffic Police Sialkot",
    urduName: "سٹی ٹریفک پولیس سیالکوٹ",
    icon: "traffic",
    badgeClass: "bg-orange-50 text-orange-700",
    jurisdictionTags: ["Signals", "Intersections", "Encroachment"],
    avgResponse: "1h 50m",
    resolutionRate: "72%",
    helpline: "15",
    contacts: [{ label: "Control Room", value: "052-9250444" }],
    escalationChain: [
      "Sector Warden",
      "Deputy Superintendent (Traffic)",
      "Chief Traffic Officer Sialkot",
      "Regional Police Officer Gujranwala",
    ],
    hours: "Wardens deployed 07:00 – 23:00 · control room 24/7",
    preselectCategory: "traffic",
  },
  {
    key: "cantt",
    shortName: "Cantt Board",
    fullName: "Sialkot Cantonment Board",
    urduName: "سیالکوٹ کنٹونمنٹ بورڈ",
    icon: "landmark",
    badgeClass: "bg-violet-50 text-violet-700",
    jurisdictionTags: ["Cantonment", "Askari Colonies", "Saddar"],
    avgResponse: "12h 30m",
    resolutionRate: "81%",
    helpline: "052-4265001",
    contacts: [{ label: "WhatsApp", value: "+92 321 6110042" }],
    escalationChain: [
      "Sanitary / Works Supervisor",
      "Cantonment Engineer",
      "Cantonment Executive Officer",
      "Station Commander Sialkot",
    ],
    hours: "Office 08:00 – 16:00 · emergency works 24/7",
    preselectCategory: "cantonment_infrastructure",
  },
  {
    key: "rescue",
    shortName: "Rescue 1122",
    fullName: "Punjab Emergency Service — Sialkot District",
    urduName: "ریسکیو ۱۱۲۲ سیالکوٹ",
    icon: "landmark",
    badgeClass: "bg-rose-50 text-rose-700",
    jurisdictionTags: ["Health Hazards", "Fogging", "Emergency Response"],
    avgResponse: "18m",
    resolutionRate: "94%",
    helpline: "1122",
    contacts: [{ label: "District Control", value: "052-9250122" }],
    escalationChain: [
      "Station Officer",
      "District Emergency Officer",
      "Director General Rescue 1122 Punjab",
    ],
    hours: "24/7 — all stations",
    preselectCategory: "dengue",
  },
];

/* ------------------------- Jurisdiction resolver -------------------------- */

export interface JurisdictionMatch {
  /** Echo of what the citizen typed (trimmed). */
  query: string;
  /** False when nothing matched and the municipal default was returned. */
  matched: boolean;
  /** Agency short names governing the area, in escalation order. */
  governing: string[];
  note: string;
}

/** Locality keyword → governing desks. Checked as substrings so
    "Cantt Model Villas", "Askari-II" and "Saddar Bazaar" all land on the
    Cantonment Board without an exhaustive address table. */
const JURISDICTION_RULES: {
  keywords: string[];
  governing: string[];
  note: string;
}[] = [
  {
    keywords: ["cantt", "canton", "askari", "saddar", "lane 2", "lane 6"],
    governing: ["Cantt Board", "GEPCO", "Rescue 1122"],
    note: "Inside Sialkot Cantonment limits the Cantonment Board runs its own water, road and sanitation desks — MCS and SWMC do not operate here. Power still routes to GEPCO.",
  },
  {
    keywords: ["small industrial estate", "industrial", "sialkot export"],
    governing: ["MCS", "SWMC", "GEPCO", "CTP Sialkot"],
    note: "Industrial corridor: municipal roads and drainage sit with MCS, factory scrap lifting with SWMC, and peak-hour dumper control with City Traffic Police.",
  },
  {
    keywords: ["model town", "civil lines", "paris road", "commissioner"],
    governing: ["MCS", "SWMC", "GEPCO", "CTP Sialkot"],
    note: "Core city zone — Municipal Corporation Sialkot is the lead desk, with SWMC on collection and GEPCO on the 11kV feeders.",
  },
  {
    keywords: ["village", "chak", "kotli", "jaurian", "marakiwal", "sahowali"],
    governing: ["MCS", "GEPCO", "Rescue 1122"],
    note: "Rural union councils are serviced by the MCS villages sub-division; waste lifting is scheduled rather than daily.",
  },
];

/** Map a typed locality onto the desks that govern it. Unknown areas fall
    through to the municipal default rather than returning nothing. */
export function resolveJurisdiction(query: string): JurisdictionMatch {
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  if (needle) {
    const rule = JURISDICTION_RULES.find((r) =>
      r.keywords.some((keyword) => needle.includes(keyword))
    );
    if (rule) {
      return {
        query: trimmed,
        matched: true,
        governing: rule.governing,
        note: rule.note,
      };
    }
  }
  return {
    query: trimmed,
    matched: false,
    governing: ["MCS", "SWMC", "GEPCO"],
    note: "We could not match that name to a registered locality, so the report defaults to Municipal Corporation Sialkot. Pick your exact area in the reporting wizard and the routing corrects itself.",
  };
}

/* ------------------------------- Feed cards ------------------------------- */

export type FeedStatus = "action_required" | "in_progress" | "resolved";
export type FeedSeverity = "normal" | "high" | "emergency";

/** The card shape every report-listing surface renders — the community feed,
    the settings "My Reports" tab and the citizen workspace. Produced from a
    live IncidentReport by lib/feedReports.toFeedReport. */
export interface FeedReport {
  /** Public tracking token, e.g. "SKT-1042". */
  id: string;
  title: string;
  description: string;
  /** Nearest anchor shown in the geo strip. */
  landmark: string;
  city: string;
  area: string;
  category: CategoryId;
  /** Hashtag chip, e.g. "#OverflowingDumpster". */
  categoryTag: string;
  /** Short agency code for the authority pill, e.g. "GEPCO". */
  agency: string;
  status: FeedStatus;
  statusLabel: string;
  severity: FeedSeverity;
  upvotes: number;
  hoursAgo: number;
  reportedBy: string;
  gpsVerified: boolean;
  /** Tailwind gradient stops behind the photo tile. */
  thumbnailTint: string;
  imageUrl?: string;
  /** Full authority name for the dispatch ribbon. */
  assignedAuthority?: string;
  assignedSquad?: string;
  /** Pre-computed SLA countdown, e.g. "3h 12m remaining". */
  slaLabel?: string;
  resolvedLabel?: string;
}

/* --------------------------- Demo citizen record --------------------------- */

/** The seed the settings dashboard and header identity card start from; a
    stored document merges over it (see UserContext.normalizeProfile). */
export const DEMO_CITIZEN_SETTINGS: CitizenProfileSettings = {
  id: "citizen-demo-001",
  name: "Muhammad Usman",
  name_ur: "محمد عثمان",
  phone: "+92 300 8641255",
  is_phone_verified: true,
  email: "usman.sialkot@example.com",

  district: "Sialkot",
  home_locality_id: "sialkot-city-41",
  home_locality_name: "Paris Road & Commissioner Rd",
  jurisdiction: "Municipal Corporation Sialkot (MCS)",
  nearby_landmark: "Opposite Allama Iqbal Library",

  civic_score: 1180,
  level_tier: 2,
  level_title: "Neighbourhood Guard",
  next_tier_title: "Neighbourhood Warden",
  next_tier_target: 1500,
  reports_filed: 14,
  reports_resolved: 9,
  impact_percentile: "Top 8% in Sialkot",
  upvotes_received: 326,

  radius_meters: 1500,
  whatsapp_updates: true,
  resolution_proofs: true,
  weekly_digest: false,
  anonymous_default: false,
  hide_phone_from_crew: true,
  leaderboard_visible: true,
  cnic: "34603-1122334-5",
};
