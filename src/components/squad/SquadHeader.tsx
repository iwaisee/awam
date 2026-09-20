"use client";

/* Squad telemetry header — the field console's KPI horizon. Mirrors the
   Admin Command Radar card shell (rounded-3xl, slate borders, mono KPIs)
   compressed into a mobile-first header with a live availability toggle
   wired to PATCH /api/squad/session. */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ClipboardList, Hammer } from "lucide-react";
import {
  SQUAD_AVAILABILITY,
  shiftLabel,
  type SquadAvailability,
  type SquadSession,
} from "@/lib/squadFields";
import type { Tab } from "./SquadPortal";

export interface SquadKpis {
  activeCount: number;
  criticalCount: number;
  resolvedTodayCount: number;
}

const AVAILABILITY_ORDER: SquadAvailability[] = [
  "active_field",
  "en_route",
  "on_break",
  "off_duty",
];

export default function SquadHeader({
  session,
  kpis,
  now,
  tab,
  onTabChange,
  onAvailabilityChange,
  availabilityChanging,
}: {
  session: SquadSession;
  kpis: SquadKpis;
  now: number;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvailabilityChange: (availability: SquadAvailability) => void;
  availabilityChanging: boolean;
}) {
  const status = SQUAD_AVAILABILITY[session.availability];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Outside-click + Escape dismissal for the availability popover. */
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const clock = new Date(now).toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <section className="space-y-3">
      {/* Header card — Admin Command Radar shell */}
      <div className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        {/* Top row: brand identity + live squad status toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-black tracking-tight text-slate-900">
              <span className="urdu text-[15px]">صدائے عوام</span>
              <span aria-hidden> • </span>
              Field Operations
            </p>
            <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-400">
              {clock} PKT • {session.district} District
            </p>
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={availabilityChanging}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-label={`Squad status: ${status.label}. Change status.`}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-emerald-700/40 focus-visible:outline-none disabled:opacity-60 ${status.pill}`}
            >
              <span aria-hidden className="text-[9px]">{status.dot}</span>
              {status.label}
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {menuOpen && (
              <div
                role="listbox"
                aria-label="Set squad availability"
                className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
              >
                {AVAILABILITY_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={key === session.availability}
                    onClick={() => {
                      setMenuOpen(false);
                      if (key !== session.availability)
                        onAvailabilityChange(key);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-emerald-50"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${
                          key === "active_field"
                            ? "bg-emerald-500"
                            : key === "en_route"
                              ? "bg-amber-500"
                              : key === "on_break"
                                ? "bg-sky-500"
                                : "bg-slate-800"
                        }`}
                      />
                      {SQUAD_AVAILABILITY[key].label}
                    </span>
                    {key === session.availability && (
                      <span className="font-mono text-[9px] font-bold text-emerald-600">
                        NOW
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Identity context — real squad + agency + vehicle + shift */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-[11px] leading-4 ring-1 ring-slate-100">
          <span className="font-bold text-slate-900">{session.squadName}</span>
          <span aria-hidden className="text-slate-300">•</span>
          <span className="font-bold text-emerald-800">
            {session.agencyCode}
          </span>
          {session.vehiclePlate && (
            <>
              <span aria-hidden className="text-slate-300">•</span>
              <span
                className="font-mono font-bold text-slate-600"
                title="Assigned vehicle plate"
              >
                {session.vehiclePlate}
              </span>
            </>
          )}
          <span aria-hidden className="text-slate-300">•</span>
          <span className="font-medium text-slate-500">{shiftLabel(session.shift)}</span>
        </div>

        {/* 3 real KPI counters — derived from the live ledger */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 px-3 py-3">
            <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-amber-800 uppercase">
              <ClipboardList className="h-3 w-3 shrink-0" />
              Active
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-700">
              {kpis.activeCount}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200/70 bg-rose-50/50 px-3 py-3">
            <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-rose-700 uppercase">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              P1 Critical
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-black text-rose-700 ${kpis.criticalCount > 0 ? "animate-pulse" : ""}`}
            >
              {kpis.criticalCount}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-3">
            <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-emerald-800 uppercase">
              <Hammer className="h-3 w-3 shrink-0" />
              Resolved
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
              {kpis.resolvedTodayCount}
            </p>
          </div>
        </div>
      </div>

      {/* Desktop / tablet tab strip — mobile uses the sticky bottom bar */}
      <div className="hidden items-center gap-2 rounded-2xl border border-slate-200/60 bg-slate-100/80 p-1 sm:flex" role="tablist">
        <HeaderTab
          active={tab === "tasks"}
          onClick={() => onTabChange("tasks")}
          label="Active Tasks"
          badge={kpis.activeCount}
        />
        <HeaderTab
          active={tab === "history"}
          onClick={() => onTabChange("history")}
          label="Resolved History"
        />
        <HeaderTab
          active={tab === "profile"}
          onClick={() => onTabChange("profile")}
          label="Profile"
        />
      </div>
    </section>
  );
}

function HeaderTab({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all duration-150 ${
        active ? "bg-white text-emerald-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
          {badge}
        </span>
      )}
    </button>
  );
}
