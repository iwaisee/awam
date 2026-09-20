"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Siren,
  Clock,
  Users,
  UserPlus,
  CheckCircle2,
  ArrowLeftRight,
  X,
  Camera,
  ArrowRight,
} from "lucide-react";
import {
  CREW_OPTIONS,
  PORTAL_DEPTS,
  PORTAL_QUEUE,
  PORTAL_ZONES,
} from "@/data/operationsData";
import type { PortalDeptKey, QueueItem, QueuePriority } from "@/data/operationsData";

type ModalKind = "assign" | "resolve" | "transfer" | null;

const PRIORITY_META: Record<QueuePriority, { label: string; pillClass: string }> =
  {
    emergency: { label: "Emergency", pillClass: "bg-rose-100 text-rose-700" },
    high: { label: "High", pillClass: "bg-amber-100 text-amber-800" },
    routine: { label: "Routine", pillClass: "bg-slate-100 text-slate-600" },
  };

export default function PortalClient({ deptKey }: { deptKey: PortalDeptKey }) {
  const dept = PORTAL_DEPTS.find((d) => d.key === deptKey)!;
  const [zone, setZone] = useState<string>("All Zones");
  const [queue, setQueue] = useState<QueueItem[]>(PORTAL_QUEUE[deptKey]);
  const [modal, setModal] = useState<{ kind: ModalKind; item: QueueItem } | null>(
    null
  );
  const [selectedCrew, setSelectedCrew] = useState<string>(CREW_OPTIONS[0]);
  const [transferTarget, setTransferTarget] = useState<string>(PORTAL_DEPTS[1].key);
  const [crewNotes, setCrewNotes] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [timestampConfirmed, setTimestampConfirmed] = useState(false);

  const visible = useMemo(
    () => queue.filter((item) => zone === "All Zones" || item.zone === zone),
    [queue, zone]
  );
  const unassignedEmergency = queue.filter(
    (item) => item.priority === "emergency" && !item.crew
  ).length;

  const assignCrew = () => {
    if (!modal) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.id === modal.item.id ? { ...item, crew: selectedCrew } : item
      )
    );
    closeModal();
  };

  const markResolved = () => {
    if (!modal || !photoName || !timestampConfirmed) return;
    setQueue((prev) => prev.filter((item) => item.id !== modal.item.id));
    closeModal();
  };

  const transfer = () => {
    if (!modal) return;
    setQueue((prev) => prev.filter((item) => item.id !== modal.item.id));
    closeModal();
  };

  const closeModal = () => {
    setModal(null);
    setCrewNotes("");
    setPhotoName(null);
    setTimestampConfirmed(false);
  };

  const otherDepts = PORTAL_DEPTS.filter((d) => d.key !== deptKey);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Top bar */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Municipal Field Portal
            </p>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {dept.name} Operations Portal{" "}
              <span className="font-semibold text-slate-400">—</span>{" "}
              <span className="text-emerald-700">{dept.division}</span>
            </h1>
          </div>
          <div
            role="group"
            aria-label="Zone filter"
            className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200/60 bg-slate-100/80 p-1"
          >
            {PORTAL_ZONES.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZone(z)}
                aria-pressed={zone === z}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  zone === z
                    ? "bg-white text-emerald-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        {/* Urgent banner */}
        {unassignedEmergency > 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5">
            <Siren className="h-5 w-5 shrink-0 text-rose-600" />
            <p className="text-sm font-bold text-rose-800">
              🚨 {unassignedEmergency} Unassigned Emergency{" "}
              {unassignedEmergency === 1 ? "Hazard" : "Hazards"} exceeding 6h SLA
            </p>
          </div>
        )}

        {/* Operational queue table */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Priority</th>
                  <th className="px-5 py-3 font-semibold">Landmark / UC</th>
                  <th className="px-5 py-3 font-semibold">Upvotes</th>
                  <th className="px-5 py-3 font-semibold">Elapsed</th>
                  <th className="px-5 py-3 font-semibold">Assigned Crew</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      Queue is clear for {zone}. Great work, {dept.name}.
                    </td>
                  </tr>
                )}
                {visible.map((item) => {
                  const priority = PRIORITY_META[item.priority];
                  const overdue = item.elapsedHours > 6 && item.priority === "emergency";
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-50 transition-colors duration-150 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-4 font-mono text-xs font-bold text-slate-500">
                        {item.id}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${priority.pillClass}`}
                        >
                          {priority.label}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-5 py-4">
                        <p className="truncate font-medium text-slate-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.zone} • {item.uc}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Users className="h-3.5 w-3.5 text-emerald-600" />
                          {item.upvotes}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`flex items-center gap-1 font-semibold ${
                            overdue ? "text-rose-600" : "text-slate-600"
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          {item.elapsedHours}h
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {item.crew ? (
                          <span className="text-xs font-semibold text-emerald-700">
                            {item.crew}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-rose-600">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCrew(item.crew ?? CREW_OPTIONS[0]);
                              setModal({ kind: "assign", item });
                            }}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-800"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assign
                          </button>
                          <button
                            type="button"
                            onClick={() => setModal({ kind: "resolve", item })}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => setModal({ kind: "transfer", item })}
                            aria-label={`Transfer ${item.id} to another department`}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors duration-150 hover:border-amber-300 hover:text-amber-700"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Transfer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Citizen-facing link: share{" "}
          <span className="font-mono">sadaeawam.pk/track?id={"{ticket}"}</span>{" "}
          or manage reports from the{" "}
          <Link href="/admin" className="font-semibold text-emerald-700 hover:underline">
            provincial dashboard
          </Link>
          .
        </p>
      </div>

      {/* ------------------------------ Modals ------------------------------ */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {modal.kind === "assign"
                    ? "Assign Field Crew"
                    : modal.kind === "resolve"
                      ? "Mark Resolved"
                      : "Transfer Jurisdiction"}
                </p>
                <p className="font-heading mt-1 text-lg font-bold text-slate-900">
                  {modal.item.id} — {modal.item.title}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Assign modal */}
            {modal.kind === "assign" && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-700">
                  Pick a crew for {modal.item.zone}:
                </p>
                <div className="mt-3 space-y-2">
                  {CREW_OPTIONS.map((crew) => (
                    <button
                      key={crew}
                      type="button"
                      onClick={() => setSelectedCrew(crew)}
                      aria-pressed={selectedCrew === crew}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors duration-150 ${
                        selectedCrew === crew
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 text-slate-600 hover:border-emerald-300"
                      }`}
                    >
                      {crew}
                      {selectedCrew === crew && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={assignCrew}
                  className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-emerald-800"
                >
                  Confirm Assignment
                </button>
              </div>
            )}

            {/* Resolve modal */}
            {modal.kind === "resolve" && (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-1.5 text-sm font-bold text-slate-900">
                    1. After-fix photo{" "}
                    <span className="font-normal text-rose-600">(required)</span>
                  </p>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500 transition-colors duration-150 hover:border-emerald-400 hover:text-emerald-700">
                    <Camera className="h-4 w-4" />
                    {photoName ? photoName : "Upload geotagged after-fix photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
                    />
                  </label>
                </div>
                <div>
                  <label
                    htmlFor="crew-notes"
                    className="mb-1.5 block text-sm font-bold text-slate-900"
                  >
                    2. Crew notes
                  </label>
                  <textarea
                    id="crew-notes"
                    rows={3}
                    value={crewNotes}
                    onChange={(e) => setCrewNotes(e.target.value)}
                    placeholder="Work performed, materials used, site condition…"
                    className="w-full resize-none rounded-xl border border-slate-200/80 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTimestampConfirmed(!timestampConfirmed)}
                  aria-pressed={timestampConfirmed}
                  className="flex w-full items-center gap-2.5 text-left text-sm font-semibold text-slate-700"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
                      timestampConfirmed
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {timestampConfirmed && (
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    )}
                  </span>
                  3. I confirm this timestamp reflects on-site completion
                </button>
                <button
                  type="button"
                  onClick={markResolved}
                  disabled={!photoName || !timestampConfirmed}
                  className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Close Ticket & Publish Proof
                </button>
              </div>
            )}

            {/* Transfer modal */}
            {modal.kind === "transfer" && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-700">
                  Route this complaint to the correct department:
                </p>
                <div className="mt-3 space-y-2">
                  {otherDepts.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setTransferTarget(d.key)}
                      aria-pressed={transferTarget === d.key}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors duration-150 ${
                        transferTarget === d.key
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 text-slate-600 hover:border-emerald-300"
                      }`}
                    >
                      {d.name}
                      <span className="text-xs font-normal text-slate-400">
                        {d.division}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={transfer}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-amber-600"
                >
                  Transfer to {transferTarget.toUpperCase()}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
