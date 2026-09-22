"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Droplets,
  Trash2,
  Zap,
  TrafficCone,
  Phone,
  MessageSquare,
  Search,
  MapPin,
  Clock,
  TrendingUp,
  ArrowRight,
  Landmark,
  CheckCircle2,
} from "lucide-react";
import { DEPARTMENTS, resolveJurisdiction } from "@/data/departmentDirectory";
import type { Department } from "@/data/departmentDirectory";

const DEPT_ICONS: Record<
  Department["icon"],
  typeof Droplets
> = {
  droplets: Droplets,
  trash: Trash2,
  zap: Zap,
  traffic: TrafficCone,
  landmark: Landmark,
};

export default function DepartmentsPage() {
  const [areaQuery, setAreaQuery] = useState("");
  const [result, setResult] = useState<ReturnType<
    typeof resolveJurisdiction
  > | null>(null);

  const handleResolve = () => setResult(resolveJurisdiction(areaQuery));

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Page header */}
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Municipal Agencies &amp; Jurisdictions{" "}
          <span className="urdu text-lg font-semibold text-emerald-700">
            سرکاری محکمے
          </span>
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Find responsible agencies, verified helplines, operational scorecards,
          and escalation ladders across the Sialkot pilot district.
        </p>

        {/* Jurisdiction resolver */}
        <div className="mb-12 mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
          <h2 className="font-heading flex items-center gap-2 text-lg font-bold text-slate-900">
            <Landmark className="h-5 w-5 text-emerald-700" />
            Who Governs My Area?
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Enter your housing society or area and we&apos;ll map the
            responsible agencies instantly.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResolve()}
                placeholder="Enter your area or society (e.g., Cantt Model Villas, Model Town, Bijli Mohallah)..."
                aria-label="Your area"
                className="w-full rounded-xl border border-emerald-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            <button
              type="button"
              onClick={handleResolve}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800"
            >
              <Search className="h-4 w-4" />
              Resolve Jurisdiction
            </button>
          </div>
          {result && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
              {result.matched ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <MapPin className="h-5 w-5 text-amber-500" />
              )}
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {result.query ? `“${result.query}” — ` : ""}Your area is
                governed by:{" "}
                <span className="font-bold text-emerald-700">
                  {result.governing.join(" + ")}
                </span>
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {result.note}
              </p>
            </div>
          )}
        </div>

        {/* Directory grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((dept) => {
            const Icon = DEPT_ICONS[dept.icon];
            return (
              <article
                key={dept.key}
                className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 transition-shadow duration-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                {/* Identity */}
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dept.badgeClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-heading truncate text-sm font-bold text-slate-900">
                      {dept.shortName}
                    </h3>
                    <p className="urdu truncate text-xs text-slate-500" dir="rtl">
                      {dept.urduName}
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 text-xs font-medium leading-5 text-slate-600">
                  {dept.fullName}
                </p>

                {/* Jurisdiction tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dept.jurisdictionTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Metrics ribbon */}
                <div className="mt-4 flex items-center gap-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                    Avg Response: {dept.avgResponse}
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    Resolution Rate: {dept.resolutionRate}
                  </span>
                </div>

                {/* Contact + escalation */}
                <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`tel:${dept.helpline.replace(/[^\d+]/g, "")}`}
                      className="flex items-center gap-1.5 font-bold text-emerald-700 transition-colors duration-150 hover:text-emerald-800"
                    >
                      <Phone className="h-4 w-4" />
                      {dept.helpline}
                    </a>
                    {dept.contacts && dept.contacts.length > 0 && (
                      <div className="flex flex-col items-end gap-0.5 text-xs font-semibold text-slate-500">
                        {dept.contacts.map((contact) => (
                          <span
                            key={contact.value}
                            className="flex items-center gap-1.5"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {contact.label}: {contact.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Escalation Chain
                    </p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-600">
                      {dept.escalationChain.join(" → ")}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{dept.hours}</p>
                </div>

                {/* CTA */}
                <Link
                  href={`/report?dept=${dept.key}`}
                  className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800"
                >
                  Report Issue to this Department
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
