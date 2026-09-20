"use client";

/* Registry sector icon strings ("Zap", "Droplets", …) → Lucide components for
   department group labels; unmapped sectors fall back to Layers. Shared by
   the province and district governance decks. */

import {
  Construction,
  Droplets,
  Flame,
  Landmark,
  Layers,
  ShieldAlert,
  Siren,
  Trash2,
  Trees,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const SECTOR_ICONS: Record<string, LucideIcon> = {
  Zap,
  Trash2,
  Droplets,
  Siren,
  ShieldAlert,
  Landmark,
  Construction,
  Trees,
  Flame,
};

export const SECTOR_ICON_FALLBACK: LucideIcon = Layers;

export const sectorIcon = (iconId?: string): LucideIcon =>
  (iconId && SECTOR_ICONS[iconId]) || SECTOR_ICON_FALLBACK;

/** Tinted avatar classes per sector id — banners, rows and tree leaves share
    them so one sector reads as the same colour across the console. */
export const SECTOR_ACCENTS: Record<string, string> = {
  power: "bg-amber-50 text-amber-600",
  waste: "bg-emerald-50 text-emerald-600",
  water: "bg-sky-50 text-sky-600",
  emergency: "bg-rose-50 text-rose-600",
  traffic: "bg-orange-50 text-orange-600",
  municipal: "bg-violet-50 text-violet-600",
  roads: "bg-cyan-50 text-cyan-600",
  horticulture: "bg-lime-50 text-lime-600",
  gas: "bg-red-50 text-red-600",
};
