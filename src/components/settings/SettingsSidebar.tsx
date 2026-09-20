"use client";

import type { FileText } from "lucide-react";

export interface SidebarTab {
  key: string;
  label: string;
  icon: typeof FileText;
  badge?: string;
  /** Tailwind classes for the badge chip; defaults to a neutral slate chip. */
  badgeStyle?: string;
  /** "rose" renders the destructive-danger styling for the Danger Zone row. */
  tone?: "rose";
}

/**
 * Settings section navigation. Labels are never truncated: the row is a
 * resilient flex pair — the label keeps `whitespace-nowrap` and the badge is
 * `shrink-0`, so the two can't squeeze each other at any viewport width.
 */
export default function SettingsSidebar({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: SidebarTab[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === activeKey;
        const isRose = tab.tone === "rose";
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold transition-all duration-150 ${
              isActive
                ? isRose
                  ? "border-rose-300 bg-rose-100/80 text-rose-950 shadow-2xs"
                  : "border-emerald-200/90 bg-emerald-50 text-emerald-950 shadow-2xs"
                : isRose
                  ? "border-rose-200/70 bg-rose-50/50 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  : "border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {/* Left: active indicator + icon + label */}
            <span className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className={`h-4 w-1.5 shrink-0 rounded-full transition-all duration-150 ${
                  isActive
                    ? isRose
                      ? "bg-rose-600"
                      : "bg-[#0F5132]"
                    : isRose
                      ? "bg-transparent group-hover:bg-rose-300"
                      : "bg-transparent group-hover:bg-slate-300"
                }`}
              />
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
                  isActive
                    ? isRose
                      ? "text-rose-700"
                      : "text-[#0F5132]"
                    : isRose
                      ? "text-rose-400 group-hover:text-rose-600"
                      : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span className="whitespace-nowrap text-xs font-medium text-slate-800">
                {tab.label}
              </span>
            </span>

            {/* Right: anchored badge — shrink-0 keeps it from crushing the label */}
            {tab.badge && (
              <span
                className={`ml-2 shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  tab.badgeStyle || "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
