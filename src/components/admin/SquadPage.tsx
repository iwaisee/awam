"use client";

/* Squad Page — the full-page detail surface for ONE field squad (registry
   Tier 4). Reached by drilling department → city division → squad, i.e.
   ?sector=…&agency=…&division=…&squad=…. Replaces the old cramped reassign
   popup: everything about the crew lives here — identity, metrics, serving
   areas, and the citizen tickets routed to it. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CircleCheck,
  MapPin,
  Pencil,
  Phone,
  Truck,
  Users,
} from "lucide-react";
import {
  type CoreSector,
  type DistrictOperation,
  type FieldSquad,
  type RegionalAgency,
} from "@/data/departmentRegistry";
import { SQUAD_STATUS_META, shiftLabelOf, workforceLabel } from "./departmentMeta";
import { SECTOR_ACCENTS } from "./sectorIcons";
import type { IncidentReport } from "@/types/civic";

/** One renderable ticket row for the squad's queue panel. */
interface SquadTicket {
  id: string;
  category: string;
  area: string;
  urgency: string;
  status: string;
  submitted: string;
  description: string;
}

const URGENCY_PILL: Record<string, string> = {
  emergency: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  urgent: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  routine: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const STATUS_PILL: Record<string, string> = {
  dispatched: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  pending: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const pillOf = (map: Record<string, string>, key: string, fallback: string) =>
  map[key] ?? `bg-slate-100 text-slate-600 ring-1 ring-slate-200 ${fallback}`;

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default function SquadPage({
  sector,
  agency,
  op,
  squad,
  onBack,
  onEdit,
}: {
  sector: CoreSector;
  agency: RegionalAgency;
  op: DistrictOperation;
  squad: FieldSquad;
  onBack: () => void;
  onEdit: () => void;
}) {
  const meta = SQUAD_STATUS_META[squad.status];
  const accent = SECTOR_ACCENTS[sector.id] ?? "bg-indigo-50 text-indigo-600";

  /* Citizen tickets routed to this crew: live reports whose area matches one
     of the squad's serving areas; district-wide squads fall back to their
     city's queue. */
  const [ledger, setLedger] = useState<IncidentReport[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)),
      )
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) setLedger(data as IncidentReport[]);
      })
      .catch(() => {
        if (!cancelled) setLedger([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tickets = useMemo<SquadTicket[]>(() => {
    const wardSet = new Set((squad.wards ?? []).map((w) => w.toLowerCase()));
    const districtKey = op.district.toLowerCase();
    const byWard = ledger.filter((r) =>
      wardSet.has(r.area_name.toLowerCase())
    );
    const scoped =
      byWard.length > 0
        ? byWard
        : ledger.filter((r) => r.city_name.toLowerCase() === districtKey);
    return scoped.slice(0, 8).map((r) => ({
      id: r.id,
      category: r.category_title,
      area: r.area_name,
      urgency: r.urgency,
      status: r.status,
      submitted: r.created_at,
      description: r.description,
    }));
  }, [ledger, squad.wards, op.district]);

  return (
    <>
      {/* 1. Squad identity header */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 font-mono text-[11px] font-bold text-slate-500 transition-colors duration-150 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {op.district} division desk
        </button>
        <nav
          aria-label="Squad breadcrumb"
          className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400"
        >
          <span>Departments</span>
          <span aria-hidden className="text-slate-300">&gt;</span>
          <span>{sector.name}</span>
          <span aria-hidden className="text-slate-300">&gt;</span>
          <span>{agency.code}</span>
          <span aria-hidden className="text-slate-300">&gt;</span>
          <span>{op.district} Division</span>
          <span aria-hidden className="text-slate-300">&gt;</span>
          <span className="font-bold text-emerald-800">{squad.name}</span>
        </nav>

        <div className="mt-3 flex flex-col gap-5 @2xl:flex-row @2xl:items-start @2xl:justify-between">
          <div className="flex min-w-0 gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${accent}`}
            >
              <span className="font-mono text-xl font-black leading-none">
                {squad.membersCount}
              </span>
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider">
                Crew
              </span>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">
                  {squad.name}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${meta.pill}`}
                >
                  <span className={`h-1.5 w-1.5 ${meta.dot}`} />
                  {meta.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-bold text-slate-700">
                {workforceLabel(sector.slug, squad)} ·{" "}
                {squad.shift ? shiftLabelOf(squad.shift) : "Shift unassigned"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {agency.code} — {agency.fullName} · {op.district} District
                Division
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  <Users className="h-3 w-3" />
                  Lead {squad.leadTechnician}
                </span>
                <a
                  href={`tel:${squad.phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600 transition-colors duration-150 hover:bg-slate-200 hover:text-slate-800"
                >
                  <Phone className="h-3 w-3 font-sans" />
                  {squad.phone}
                </a>
                {squad.vehiclePlate && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600">
                    <Truck className="h-3 w-3 font-sans" />
                    {squad.vehiclePlate}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  <MapPin className="h-3 w-3" />
                  {(squad.wards?.length ?? 0) > 0
                    ? `${squad.wards!.length} serving area${squad.wards!.length === 1 ? "" : "s"}`
                    : "District-wide"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 @lg:flex-row @2xl:flex-col @2xl:items-stretch">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Squad
            </button>
            <Link
              href="/admin/triage"
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-emerald-600/40 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              <Activity className="h-3.5 w-3.5" />
              Open Full Queue
            </Link>
          </div>
        </div>

        {/* Serving areas roster */}
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Serving — areas this crew works
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {squad.wards && squad.wards.length > 0 ? (
              squad.wards.map((ward) => (
                <span
                  key={ward}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  <MapPin className="h-3 w-3 text-emerald-600" />
                  {ward}
                </span>
              ))
            ) : (
              <span className="text-[11px] font-semibold text-slate-400">
                District-wide — no specific wards assigned.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Squad metrics */}
      <section className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Open Tickets
            </p>
            <Activity className="h-4 w-4 shrink-0 text-slate-300" />
          </div>
          <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
            {squad.activeTickets ?? 0}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            assigned to this crew
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Crew Personnel
            </p>
            <Users className="h-4 w-4 shrink-0 text-slate-300" />
          </div>
          <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
            {squad.membersCount}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {workforceLabel(sector.slug, squad)} on roster
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Serving Areas
            </p>
            <MapPin className="h-4 w-4 shrink-0 text-slate-300" />
          </div>
          <p className="font-heading mt-1.5 text-2xl font-bold leading-7 text-slate-900">
            {squad.wards?.length ?? 0}
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {(squad.wards?.length ?? 0) > 0
              ? "wards & sub-localities assigned"
              : "covers the whole district"}
          </p>
        </div>
      </section>

      {/* 3. Citizen tickets routed to this crew */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Citizen Tickets in This Area
            </h3>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 ring-1 ring-amber-200/70">
              {tickets.length}
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            mock ledger — matched by serving area
          </p>
        </div>

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <CircleCheck className="h-5 w-5" />
            </span>
            <p className="text-sm font-bold text-slate-700">
              No tickets routed here yet
            </p>
            <p className="text-xs font-medium text-slate-400">
              Citizen reports matching this crew&apos;s serving areas will appear
              here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ul className="min-w-[640px] divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white">
              <li className="flex items-center gap-3 bg-slate-50/60 px-4 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                <span className="w-20 shrink-0">Ticket</span>
                <span className="min-w-0 flex-1">Complaint</span>
                <span className="w-36 shrink-0">Area</span>
                <span className="w-24 shrink-0">Urgency</span>
                <span className="w-16 shrink-0">Filed</span>
                <span className="w-24 shrink-0 text-right">Status</span>
              </li>
              {tickets.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-slate-50/70"
                >
                  <span className="w-20 shrink-0 font-mono text-[11px] font-bold text-slate-700">
                    {t.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {t.category}
                    </span>
                    <span className="block truncate text-[10px] font-medium text-slate-400">
                      {t.description}
                    </span>
                  </span>
                  <span className="w-36 shrink-0 truncate text-[11px] font-semibold text-slate-600">
                    {t.area}
                  </span>
                  <span className="w-24 shrink-0">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold capitalize ${pillOf(URGENCY_PILL, t.urgency, "")}`}
                    >
                      {t.urgency}
                    </span>
                  </span>
                  <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-500">
                    {dayOf(t.submitted)}
                  </span>
                  <span className="w-24 shrink-0 text-right">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold capitalize ${pillOf(STATUS_PILL, t.status, "")}`}
                    >
                      {t.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
