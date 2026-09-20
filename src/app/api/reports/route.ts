import { NextResponse } from "next/server";
import {
  cityCode,
  DEFAULT_JURISDICTION,
  JURISDICTION_TYPES,
  type IncidentReport,
  type IncidentStatus,
  type JurisdictionType,
  type UrgencyLevel,
} from "@/types/civic";
import {
  getReportByIdOrToken,
  insertReport,
  listReports,
  patchReport,
  ticketTokenExists,
} from "@/lib/reportsDb";
import { pickSquadForReport } from "@/lib/dispatchAssign";

/* SQLite-backed report ledger. The database (data/reports.db) starts EMPTY —
   every row comes from a real submission through the citizen wizard or this
   API. GET lists, POST files a new report, PATCH advances field-dispatch
   status (and can re-route the agency or escalate urgency). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listReports());
}

const INCIDENT_STATUSES: IncidentStatus[] = [
  "triage",
  "dispatched",
  "in_progress",
  "resolved",
  "disputed",
];

const URGENCIES: UrgencyLevel[] = ["routine", "high", "emergency"];

/** Mint a unique regional ticket token, e.g. "SKT-4912". Retries with a wider
    number range if a random pick ever collides with an existing token. */
function mintToken(cityId: string, cityName: string): string {
  const prefix = cityCode(cityId, cityName);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const range = attempt < 20 ? 9000 : 900000;
    const floor = attempt < 20 ? 1000 : 100000;
    const token = `${prefix}-${Math.floor(floor + Math.random() * range)}`;
    if (!ticketTokenExists(token)) return token;
  }
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      status?: unknown;
      assigned_unit?: unknown;
      assigned_agency?: unknown;
      urgency?: unknown;
      upvote?: unknown;
      after_photo_url?: unknown;
      resolution_notes?: unknown;
      materials_used?: unknown;
    };
    const id = typeof body.id === "string" ? body.id.trim().replace("#", "").toUpperCase() : "";
    const status = body.status;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing report id." },
        { status: 400 },
      );
    }
    if (
      status !== undefined &&
      (typeof status !== "string" || !INCIDENT_STATUSES.includes(status as IncidentStatus))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Expected one of: ${INCIDENT_STATUSES.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const existing = getReportByIdOrToken(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `No report found for ${id}.` },
        { status: 404 },
      );
    }

    const assignedUnit =
      typeof body.assigned_unit === "string" && body.assigned_unit.trim()
        ? body.assigned_unit.trim().slice(0, 120)
        : undefined;
    const assignedAgency =
      typeof body.assigned_agency === "string" && body.assigned_agency.trim()
        ? body.assigned_agency.trim().slice(0, 120)
        : undefined;
    const urgency = URGENCIES.includes(body.urgency as UrgencyLevel)
      ? (body.urgency as UrgencyLevel)
      : undefined;

    const patch: Parameters<typeof patchReport>[1] = {};
    if (typeof status === "string") patch.status = status as IncidentStatus;
    if (assignedUnit) patch.assigned_unit = assignedUnit;
    if (assignedAgency) patch.assigned_agency = assignedAgency;
    if (urgency) patch.urgency = urgency;
    if (body.upvote === true) patch.upvote = true;

    // Squad resolution proof — only meaningful on a resolved ticket, and the
    // "after" photo must be a real inline image (the ledger is the bucket).
    const afterPhoto =
      typeof body.after_photo_url === "string" &&
      body.after_photo_url.startsWith("data:image/") &&
      body.after_photo_url.length < 2_000_000
        ? body.after_photo_url
        : undefined;
    if (afterPhoto) patch.after_photo_url = afterPhoto;
    if (typeof body.resolution_notes === "string" && body.resolution_notes.trim())
      patch.resolution_notes = body.resolution_notes.trim().slice(0, 2000);
    if (typeof body.materials_used === "string" && body.materials_used.trim())
      patch.materials_used = body.materials_used.trim().slice(0, 500);

    if (patch.status === "triage") {
      // Reassignment back to the queue clears the dispatch telemetry.
      patch.clearDispatchTelemetry = true;
    } else if (patch.status === "dispatched") {
      patch.stampDispatch = true;
      // Auto-assignment — when no crew was named, pick one from the agency's
      // registry: ward-matched first, then district-wide crews, lightest load.
      if (!assignedUnit) {
        const crew = pickSquadForReport(existing);
        if (crew) patch.assigned_unit = crew;
      }
    } else if (patch.status === "resolved") {
      // Resolution telemetry is stamped by the ledger, not hand-entered.
      patch.stampResolved = true;
    }

    const updated = patchReport(existing.id, patch);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `No report found for ${id}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, report: updated });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not update report: ${error.message}`
            : "Could not update report.",
      },
      { status: 500 },
    );
  }
}

const REQUIRED_FIELDS = [
  "city_id",
  "city_name",
  "area_id",
  "area_name",
  "category_id",
  "category_title",
  "assigned_agency",
  "description",
] as const;

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = body[field];
      return typeof value !== "string" || value.trim() === "";
    });
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing or empty required field(s): ${missing.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const slaHours = Math.min(
      720,
      Math.max(1, Math.round(Number(body.sla_hours) || 24)),
    );
    const cityName = asString(body.city_name);
    const urgency = URGENCIES.includes(body.urgency as UrgencyLevel)
      ? (body.urgency as UrgencyLevel)
      : "routine";
    const jurisdiction = JURISDICTION_TYPES.includes(
      body.jurisdiction as JurisdictionType,
    )
      ? (body.jurisdiction as JurisdictionType)
      : DEFAULT_JURISDICTION;
    // Quick-issue pills: strictly typed — keep plain, non-empty strings only,
    // capped at 3 to mirror the wizard's selection limit.
    const selected_tags = Array.isArray(body.selected_tags)
      ? body.selected_tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const token = mintToken(asString(body.city_id), cityName);
    const ticket = `#${token}`;

    const report: IncidentReport = {
      id: ticket,
      tracking_token: token,
      city_id: asString(body.city_id),
      city_name: cityName,
      area_id: asString(body.area_id),
      area_name: asString(body.area_name),
      uc_number: asString(body.uc_number, ""),
      jurisdiction,
      category_id: asString(body.category_id),
      category_title: asString(body.category_title),
      assigned_agency: asString(body.assigned_agency),
      sla_deadline: new Date(
        Date.now() + slaHours * 60 * 60 * 1000,
      ).toISOString(),
      urgency,
      description: asString(body.description).slice(0, 2000),
      // Citizen headline from wizard step 3; optional so older clients pass.
      title: asString(body.title).slice(0, 140) || undefined,
      // Submitted photo(s) arrive downscaled as data URLs from the wizard.
      photo_url:
        typeof body.photo_url === "string" &&
        body.photo_url.startsWith("data:image/") &&
        body.photo_url.length < 2_000_000
          ? body.photo_url
          : undefined,
      selected_tags,
      coordinates:
        body.coordinates &&
        typeof body.coordinates === "object" &&
        typeof (body.coordinates as { lat?: unknown }).lat === "number" &&
        typeof (body.coordinates as { lng?: unknown }).lng === "number"
          ? (body.coordinates as { lat: number; lng: number })
          : undefined,
      citizen_name: asString(body.citizen_name, "Anonymous") || "Anonymous",
      citizen_phone: asString(body.citizen_phone),
      status: "triage",
      upvotes: 0,
      created_at: new Date().toISOString(),
    };

    insertReport(
      report,
      JSON.stringify(report.selected_tags),
      report.coordinates ? JSON.stringify(report.coordinates) : null,
    );

    /* Dedicated allocation — the moment a report exists, the crew whose
       serving wards cover its area is attached. Dispatch later just
       confirms; the department decks see the attribution immediately. */
    let stored = report;
    const crew = pickSquadForReport(report);
    if (crew) {
      stored = patchReport(report.id, { assigned_unit: crew }) ?? report;
    }

    return NextResponse.json(
      { success: true, ticket_id: report.id, report: stored },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not save report: ${error.message}`
            : "Could not save report.",
      },
      { status: 500 },
    );
  }
}
