import type { LucideIcon } from "lucide-react";
import {
  Trash2,
  Construction,
  CircleDot,
  Droplets,
  Zap,
  TrafficCone,
  Lightbulb,
  Bug,
  Landmark,
} from "lucide-react";
import type { SeverityLevel } from "@/config/severity";

/* Canonical severity taxonomy lives in @/config/severity — re-exported here
   so existing `@/types/report` imports keep resolving. */
export type { SeverityLevel };

export type CategoryId =
  | "sanitation"
  | "broken_road"
  | "open_manhole"
  | "water_leak"
  | "electricity"
  | "traffic"
  | "cantonment_infrastructure"
  | "streetlight"
  | "dengue";

/** Live proof-of-presence telemetry locked by the report wizard's camera
    flow (LiveReportCapture). The fix is captured fresh at shutter time —
    never cached, never hand-entered. */
export interface LiveGeoLock {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy of the GPS fix, ± meters. */
  accuracyMeters: number;
  /** Epoch ms when the position was locked. */
  lockedAt: number;
}

export interface ReportFormData {
  province: string;
  city: string;
  /** Town / locality cluster (e.g. "Cantonment") — only for cities that have them. */
  town: string;
  area: string;
  landmark: string;
  /** Selected CategoryRule id (seed ids match CategoryId). */
  category: string | null;
  /** Quick-issue pills tapped in Step 2, scoped to the selected category (max 3). */
  selectedTags: string[];
  tags: string[];
  title: string;
  description: string;
  /** Verified live captures only (gallery uploads are disabled) — exactly one. */
  files: File[];
  /** GPS fix locked while capturing the evidence photo; null until the
      live-capture flow completes. */
  geo: LiveGeoLock | null;
  /** ISO timestamp of the shutter press that produced files[0]. */
  capturedAt: string | null;
  severity: SeverityLevel;
  isAnonymous: boolean;
  phoneNumber: string;
}

export const emptyReport: ReportFormData = {
  province: "Punjab",
  city: "",
  town: "",
  area: "",
  landmark: "",
  category: null,
  selectedTags: [],
  tags: [],
  title: "",
  description: "",
  files: [],
  geo: null,
  capturedAt: null,
  severity: "routine",
  isAnonymous: false,
  phoneNumber: "",
};

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  urdu: string;
  icon: LucideIcon;
  description: string;
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  sanitation: {
    id: "sanitation",
    label: "Sanitation & Waste",
    urdu: "صفائی",
    icon: Trash2,
    description: "Garbage piles, overflowing bins, missed commercial waste pickups",
  },
  broken_road: {
    id: "broken_road",
    label: "Broken Road & Potholes",
    urdu: "ٹوٹی سڑک",
    icon: Construction,
    description:
      "Potholes, asphalt collapse, damaged footpaths, industrial corridor damage",
  },
  open_manhole: {
    id: "open_manhole",
    label: "Open Manhole & Drains",
    urdu: "کھلا گٹر / نالی",
    icon: CircleDot,
    description: "Uncovered sewer chambers, collapsed drain slabs, stormwater choking",
  },
  water_leak: {
    id: "water_leak",
    label: "Water Leak & Supply Failure",
    urdu: "پانی کا رساؤ",
    icon: Droplets,
    description: "Burst municipal supply lines, contamination, low pressure",
  },
  electricity: {
    id: "electricity",
    label: "Electricity Hazard",
    urdu: "بجلی کا خطرہ",
    icon: Zap,
    description:
      "Loose 11kV wires, sparking transformers, leaning poles, blackout faults",
  },
  traffic: {
    id: "traffic",
    label: "Traffic & Encroachment Bottleneck",
    urdu: "ٹریفک اور تجاوزات",
    icon: TrafficCone,
    description:
      "Broken traffic signals, illegal market encroachment, choked intersections",
  },
  cantonment_infrastructure: {
    id: "cantonment_infrastructure",
    label: "Cantonment Infrastructure",
    urdu: "کینٹ بلدیاتی مسائل",
    icon: Landmark,
    description: "Water, road, or sanitation issues within Sialkot Cantonment limits",
  },
  streetlight: {
    id: "streetlight",
    label: "Streetlight Outage",
    urdu: "اسٹریٹ لائٹ",
    icon: Lightbulb,
    description: "Dark streets and dead lamp poles",
  },
  dengue: {
    id: "dengue",
    label: "Dengue Breeding Spots",
    urdu: "ڈینگی",
    icon: Bug,
    description: "Standing sewage, larvae hotspots, fogging needed",
  },
};

export const AVAILABLE_TAGS: string[] = [
  "Blocked Drain",
  "Overflowing Bin",
  "Night Hazard",
  "School Zone",
  "Hospital Nearby",
  "Recurring Issue",
  "Market Area",
  "Monsoon Damage",
];

/* ------------------------------- Feed cards ------------------------------- */

export type FeedStatus = "action_required" | "in_progress" | "resolved";
export type FeedSeverity = "routine" | "urgent" | "emergency";

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
