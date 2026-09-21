"use client";

/* Squad sign-in gate — the login portal for the /squad field console.
   Step 1: pick your squad (real departments-registry entries only).
   Step 2: enter the squad access code issued by the control room — verified
   server-side by POST /api/squad/session (wrong codes 401, repeat failures
   lock the squad for 60s). Squads without an issued code cannot sign in. */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Car,
  Eye,
  EyeOff,
  KeyRound,
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
  const [selected, setSelected] = useState<SquadOption | null>(null);
  const [hasCodeMap, setHasCodeMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data: unknown) => {
        if (cancelled) return;
        const payload = data as { sectors?: unknown };
        const tree = Array.isArray(payload.sectors)
          ? (payload.sectors as CoreSector[])
          : [];
        setSectors(tree);
        // Which of these squads hold an issued access code? The API returns
        // booleans only — codes themselves never leave the server.
        const ids: string[] = [];
        for (const sector of tree) {
          for (const agency of sector.agencies) {
            for (const op of agency.districtOperations) {
              for (const squad of op.squads) ids.push(squad.id);
            }
          }
        }
        if (ids.length === 0) return;
        return fetch(`/api/squad/access?ids=${encodeURIComponent(ids.join(","))}`, {
          cache: "no-store",
        })
          .then((res) =>
            res.ok
              ? res.json()
              : Promise.reject(new Error(`HTTP ${res.status}`)),
          )
          .then((access: unknown) => {
            if (!cancelled && access && typeof access === "object")
              setHasCodeMap(
                (access as { hasCode?: Record<string, boolean> }).hasCode ?? {},
              );
          });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

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

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      {/* Brand header */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 text-center shadow-2xs">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F5132] text-white shadow-xs">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-base font-black tracking-tight text-slate-900">
          <span className="urdu text-[15px]">صدائے عوام</span>
          <span aria-hidden> • </span>Field Operations
        </h1>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Authorised field officers only. Sign in with your deployed squad and
          the access code issued by your control room.
        </p>
      </div>

      {selected ? (
        <AccessCodeStep
          squad={selected}
          hasCode={hasCodeMap[selected.id] ?? false}
          onBack={() => setSelected(null)}
          onBound={onBound}
          onError={onError}
        />
      ) : (
        <>
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

                {hasCodeMap[squad.id] ? (
                  <button
                    type="button"
                    onClick={() => setSelected(squad)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F5132] text-sm font-black text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900 active:scale-[0.99]"
                  >
                    <KeyRound className="h-4 w-4" />
                    Sign in as this squad
                  </button>
                ) : (
                  <p className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] font-semibold text-slate-500">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    No access code issued — ask the control room
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------- Step 2: access code ---------------------------- */

function AccessCodeStep({
  squad,
  hasCode,
  onBack,
  onBound,
  onError,
}: {
  squad: SquadOption;
  hasCode: boolean;
  onBack: () => void;
  onBound: (session: SquadSession) => void;
  onError: (message: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pin.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/squad/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadId: squad.id, pin: pin.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        session?: SquadSession;
        error?: string;
      } | null;
      if (!res.ok || !data?.session) {
        throw new Error(data?.error ?? `Sign-in failed (HTTP ${res.status}).`);
      }
      onBound(data.session);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sign-in failed — retry.";
      setError(message);
      onError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xs">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:text-emerald-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Choose a different squad
      </button>

      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-100">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F5132] text-[11px] font-black text-white">
          {squad.agencyCode.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">
            {squad.name}
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500">
            {squad.agencyCode} • Lead {squad.leadTechnician || "—"}
          </p>
        </div>
      </div>

      {hasCode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2.5"
        >
          <label className="block">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Squad access code
            </span>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={reveal ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
                autoFocus
                maxLength={12}
                placeholder="Issued by your control room"
                aria-label="Squad access code"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-11 pl-10 font-mono text-sm font-bold tracking-widest text-slate-800 shadow-2xs placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide access code" : "Show access code"}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                {reveal ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] font-bold text-rose-800"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !pin.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F5132] text-sm font-black text-white shadow-xs transition-colors duration-150 hover:bg-emerald-900 active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Sign in to field console
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-slate-400">
            5 wrong attempts lock sign-in for this squad for 60 seconds.
          </p>
        </form>
      ) : (
        <p className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-3.5 py-3 text-[11px] font-semibold text-amber-900">
          No access code has been issued for this squad yet. The control room
          can issue one from <span className="font-bold">Field Teams → Edit
          Crew → Squad Access Code</span>.
        </p>
      )}
    </div>
  );
}
