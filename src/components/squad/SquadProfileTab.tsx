"use client";

/* Profile tab — the bound squad's identity card and duty controls. Every
   field is resolved from the live departments registry via the session. */

import { useState } from "react";
import {
  Building2,
  CalendarClock,
  Car,
  Check,
  LogOut,
  MapPin,
  Phone,
  Truck,
  Users,
} from "lucide-react";
import {
  SQUAD_AVAILABILITY,
  shiftLabel,
  type SquadAvailability,
  type SquadSession,
} from "@/lib/squadFields";

const AVAILABILITY_ORDER: SquadAvailability[] = [
  "active_field",
  "en_route",
  "on_break",
  "off_duty",
];

export default function SquadProfileTab({
  session,
  activeCount,
  resolvedTodayCount,
  onAvailabilityChange,
  availabilityChanging,
  onSwitchSquad,
}: {
  session: SquadSession;
  activeCount: number;
  resolvedTodayCount: number;
  onAvailabilityChange: (availability: SquadAvailability) => void;
  availabilityChanging: boolean;
  onSwitchSquad: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="space-y-4" aria-label="Squad profile">
      {/* Identity card */}
      <div className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0F5132] text-sm font-black text-white">
            {session.leadName
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">
              {session.leadName}
            </p>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              Squad Lead • {session.squadName}
            </p>
          </div>
          <span
            className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${SQUAD_AVAILABILITY[session.availability].pill}`}
          >
            {SQUAD_AVAILABILITY[session.availability].label}
          </span>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70">
          <ProfileRow icon={Building2} label="Agency">
            <span className="font-bold text-emerald-800">
              {session.agencyCode}
            </span>
            {" — "}
            {session.agencyName}
          </ProfileRow>
          <ProfileRow icon={Truck} label="Division desk">
            {session.divisionName}
          </ProfileRow>
          <ProfileRow icon={Car} label="Vehicle">
            {session.vehiclePlate ? (
              <span className="font-mono font-bold">{session.vehiclePlate}</span>
            ) : (
              <span className="text-slate-400">Unassigned</span>
            )}
          </ProfileRow>
          <ProfileRow icon={CalendarClock} label="Shift">
            {shiftLabel(session.shift)}
          </ProfileRow>
          <ProfileRow icon={Users} label="Crew">
            {session.membersCount} personnel
          </ProfileRow>
          <ProfileRow icon={MapPin} label="Serving wards">
            {session.wards.length > 0
              ? session.wards.join(", ")
              : `District-wide • ${session.district}`}
          </ProfileRow>
          {session.leadPhone && (
            <ProfileRow icon={Phone} label="Lead radio">
              <a
                href={`tel:${session.leadPhone.replace(/\s+/g, "")}`}
                className="font-mono font-bold text-emerald-800"
              >
                {session.leadPhone}
              </a>
            </ProfileRow>
          )}
        </div>

        <p className="text-center text-[10px] font-medium text-slate-400">
          On duty since{" "}
          {new Date(session.boundAt).toLocaleString("en-PK", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}{" "}
          • {activeCount} active • {resolvedTodayCount} resolved today
        </p>
      </div>

      {/* Duty status control */}
      <div className="space-y-2.5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Duty status
        </p>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABILITY_ORDER.map((key) => {
            const active = key === session.availability;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onAvailabilityChange(key)}
                disabled={availabilityChanging || active}
                aria-pressed={active}
                className={`flex h-12 items-center justify-center gap-2 rounded-2xl text-xs font-bold transition-all duration-150 disabled:opacity-90 ${
                  active
                    ? SQUAD_AVAILABILITY[key].pill
                    : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                }`}
              >
                {active && <Check className="h-3.5 w-3.5" />}
                {SQUAD_AVAILABILITY[key].label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400">
          Status changes sync to the control room&apos;s Field Teams board
          instantly.
        </p>
      </div>

      {/* Sign-off / switch squad */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        {confirming ? (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-700">
              Unbind this device from{" "}
              <span className="font-bold">{session.squadName}</span>? Your open
              tickets stay in the ledger — another device can sign straight
              back in.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSwitchSquad}
                className="h-11 flex-1 rounded-xl bg-rose-600 text-xs font-bold text-white transition-colors hover:bg-rose-700"
              >
                Yes, sign off
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Sign off / switch squad
          </button>
        )}
      </div>
    </section>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="min-w-0 text-right text-[11px] text-slate-700">
        {children}
      </span>
    </div>
  );
}
