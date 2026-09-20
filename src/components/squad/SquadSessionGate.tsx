"use client";

/* Squad sign-in gate — the /squad console binds to ONE real squad from the
   departments registry (GET /api/departments → POST /api/squad/session).
   No demo squads: only crews actually deployed in the registry appear. */

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Car,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { CoreSector } from "@/data/departmentRegistry";
import type { SquadSession } from "@/lib/squadFields";

interface SquadOption {
  id: string;
  name: string;
  leadTechnician: string;
  phone: string;
  membersCount: number;
  vehiclePlate?: string;
  status: "active" | "on_call" | "off_duty";
  wards: string[];
  agencyCode: string;
  agencyName: string;
  divisionName: string;
  district: string;
}

const STATUS_DOT: Record<SquadOption["status"], string> = {
  active: "bg-emerald-500",
  on_call: "bg-amber-500",
  off_duty: "bg-slate-400",
};

export default function SquadSessionGate({
  onBound,
  onError,
}: {
  onBound: (session: SquadSession) => void;
  onError: (message: string) => void;
}) {
  const [sectors, setSectors] = useState<CoreSector[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [bindingId, setBindingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: unknown) => {
        if (cancelled) return;
        const payload = data as { sectors?: unknown };
        setSectors(
          Array.isArray(payload.sectors) ? (payload.sectors as CoreSector[]) : [],
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const squads = useMemo<SquadOption[]>(() => {
    if (!sectors) return [];
    const out: SquadOption[] = [];
    for (const sector of sectors) {
      for (const agency of sector.agencies) {
        for (const op of agency.districtOperations) {
          for (const squad of op.squads) {
            out.push({
              id: squad.id,
              name: squad.name,
              leadTechnician: squad.leadTechnician,
              phone: squad.phone,
              membersCount: squad.membersCount,
              vehiclePlate: squad.vehiclePlate,
              status: squad.status,
              wards: squad.wards ?? [],
              agencyCode: agency.code,
              agencyName: agency.fullName,
              divisionName: op.divisionName,
              district: op.district,
            });
          }
        }
      }
    }
    return out;
  }, [sectors]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return squads;
    return squads.filter((s) =>
      [s.name, s.leadTechnician, s.agencyCode, s.divisionName, ...s.wards]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [squads, search]);

  const bind = async (squad: SquadOption) => {
    setBindingId(squad.id);
    try {
      const res = await fetch("/api/squad/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadId: squad.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { session: SquadSession };
      onBound(data.session);
    } catch (err) {
      onError(
        err instanceof Error ? `Sign-in failed: ${err.message}` : "Sign-in failed.",
      );
      setBindingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      {/* Brand header */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 text-center shadow-2xs">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F5132] text-white shadow-xs">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-base font-black tracking-tight text-slate-900">
          <span className="urdu text-[15px]">صدائے عوام</span>
          <span aria-hidden> • </span>
          Field Operations
        </h1>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Sign in with your deployed squad to open the live dispatch queue.
          Squads come straight from the Departments &amp; Agencies registry.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find your squad, agency or ward…"
          aria-label="Search squads"
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-3.5 pl-10 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 focus:outline-none"
        />
      </div>

      {/* Squad list — real registry entries only */}
      {sectors === null && !loadError && (
        <p className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200/90 bg-white p-5 text-xs font-semibold text-slate-500 shadow-2xs">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading the squad registry…
        </p>
      )}

      {loadError && (
        <p className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-xs font-semibold text-rose-800">
          The registry is unreachable right now — check the connection and
          retry.
        </p>
      )}

      {sectors !== null && filtered.length === 0 && (
        <p className="rounded-3xl border border-slate-200/90 bg-white p-5 text-xs font-semibold text-slate-500 shadow-2xs">
          No squads match. Squads are deployed from the admin
          Departments &amp; Agencies console.
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((squad) => (
          <article
            key={squad.id}
            className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs transition-all hover:border-slate-300"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {squad.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {squad.agencyCode}
                  <span aria-hidden className="text-slate-300">•</span>
                  <span className="truncate font-medium text-slate-500">
                    {squad.divisionName}
                  </span>
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600 ring-1 ring-slate-200">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[squad.status]}`}
                />
                {squad.status === "active"
                  ? "Active"
                  : squad.status === "on_call"
                    ? "On Call"
                    : "Off Duty"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
              <p className="truncate">
                <span className="font-semibold text-slate-400">Lead: </span>
                {squad.leadTechnician || "—"}
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-400">
                  <Users className="mr-1 inline h-3 w-3" />
                </span>
                {squad.membersCount} personnel
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-400">
                  <Car className="mr-1 inline h-3 w-3" />
                </span>
                {squad.vehiclePlate ?? "No vehicle"}
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-400">
                  <MapPin className="mr-1 inline h-3 w-3" />
                </span>
                {squad.district}
              </p>
            </div>

            {squad.wards.length > 0 && (
              <p className="flex flex-wrap gap-1">
                {squad.wards.map((ward) => (
                  <span
                    key={ward}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500"
                  >
                    {ward}
                  </span>
                ))}
              </p>
            )}

            <button
              type="button"
              onClick={() => void bind(squad)}
              disabled={bindingId !== null}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F5132] text-sm font-black text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900 active:scale-[0.99] disabled:opacity-60"
            >
              {bindingId === squad.id ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Opening console…
                </>
              ) : (
                <>
                  Sign in as this squad
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </>
              )}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
