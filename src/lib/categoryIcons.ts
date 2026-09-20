import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  Bug,
  Construction,
  Droplets,
  Flame,
  Landmark,
  Layers,
  Lightbulb,
  ShieldAlert,
  TrafficCone,
  Trash2,
  Wind,
  Zap,
} from "lucide-react";

/** icon_name (CategoryRule) → Lucide component. Shared by the admin icon
    picker and the citizen wizard so a name always resolves to the same glyph. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Trash2,
  Construction,
  AlertOctagon,
  Droplets,
  Zap,
  TrafficCone,
  Wind,
  Flame,
  ShieldAlert,
  Lightbulb,
  Bug,
  Landmark,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function categoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Layers;
}
