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

export type SeverityLevel = "routine" | "high" | "emergency";

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
  files: File[];
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

export interface SeverityMeta {
  id: SeverityLevel;
  label: string;
  urdu: string;
  description: string;
  pillClass: string;
}

export const SEVERITY_META: Record<SeverityLevel, SeverityMeta> = {
  routine: {
    id: "routine",
    label: "Routine",
    urdu: "عام",
    description: "Should be fixed within normal maintenance cycles",
    pillClass: "bg-primary-tint text-primary",
  },
  high: {
    id: "high",
    label: "High",
    urdu: "بلند",
    description: "Disrupting daily life for many residents",
    pillClass: "bg-warning-tint text-warning",
  },
  emergency: {
    id: "emergency",
    label: "Emergency",
    urdu: "ہنگامی",
    description: "Immediate danger to life or property",
    pillClass: "bg-danger-tint text-danger",
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
