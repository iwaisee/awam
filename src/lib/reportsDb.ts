import { deleteImage } from "@/lib/cloudinary";
import { ensureSchema, query } from "@/lib/pg";
import type { IncidentReport } from "@/types/civic";

/* Server-only Neon (Postgres) ledger for citizen reports — the `reports`
   table. Starts EMPTY: every row comes from a real submission through the
   wizard or the API. The schema is ensured once per process (see pg.ts). */

/** timestamptz columns arrive as JS Date objects from node-pg (legacy rows
    migrated from TEXT may still surface strings) — the IncidentReport API
    contract carries ISO strings, so normalize both here. */
function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** JSONB column arrives parsed from pg; tolerate a JSON-encoded string too
    (defensive, mirrors values that were stored as text before migration). */
function asJson(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Optional timestamp variant — null/undefined stays undefined. */
function isoOpt(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return iso(value);
}

function rowToReport(row: Record<string, unknown>): IncidentReport {
  const tags = Array.isArray(row.selected_tags) ? row.selected_tags : [];
  const lat = row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude);
  const lng = row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude);
  const coords =
    lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : undefined;
  return {
    id: String(row.id),
    tracking_token: String(row.tracking_token),
    city_id: String(row.city_id),
    city_name: String(row.city_name),
    area_id: String(row.area_id),
    area_name: String(row.area_name),
    jurisdiction: row.jurisdiction as IncidentReport["jurisdiction"],
    category_id: String(row.category_id),
    category_title: String(row.category_title),
    assigned_agency: String(row.assigned_agency),
    sla_deadline: iso(row.sla_deadline),
    urgency: row.urgency as IncidentReport["urgency"],
    description: String(row.description),
    title: typeof row.title === "string" ? row.title : undefined,
    selected_tags: Array.isArray(tags) ? (tags as string[]) : [],
    photo_url: typeof row.photo_url === "string" ? row.photo_url : undefined,
    coordinates: coords,
    geo_verification:
      row.geo_verification && typeof row.geo_verification === "object"
        ? (row.geo_verification as IncidentReport["geo_verification"])
        : (asJson(row.geo_verification) as
            | IncidentReport["geo_verification"]
            | undefined),
    citizen_name: String(row.citizen_name),
    citizen_phone: String(row.citizen_phone),
    user_id: typeof row.user_id === "string" ? row.user_id : undefined,
    status: row.status as IncidentReport["status"],
    upvotes: Number(row.upvotes ?? 0),
    created_at: iso(row.created_at),
    dispatched_at: isoOpt(row.dispatched_at),
    resolved_at: isoOpt(row.resolved_at),
    assigned_unit:
      typeof row.assigned_unit === "string" ? row.assigned_unit : undefined,
    after_photo_url:
      typeof row.after_photo_url === "string" ? row.after_photo_url : undefined,
    resolution_notes:
      typeof row.resolution_notes === "string"
        ? row.resolution_notes
        : undefined,
  };
}

const COLUMNS = `id, tracking_token, city_id, city_name, area_id, area_name,
  jurisdiction, category_id, category_title, assigned_agency,
  sla_deadline, urgency, description, title, selected_tags, photo_url,
  latitude, longitude, geo_verification, citizen_name, citizen_phone, user_id,
  status, upvotes, created_at, dispatched_at, resolved_at, assigned_unit,
  after_photo_url, resolution_notes`;

/** `userId` narrows the ledger to one account's own filings — the citizen
    surfaces use it instead of re-filtering the public list by phone, which
    broke as soon as a report carried a contact number other than the
    account's. */
export async function listReports(
  userId?: string,
): Promise<IncidentReport[]> {
  await ensureSchema();
  // `seq` (insertion order) replaces the SQLite rowid tie-break.
  const rows = await query<Record<string, unknown>>(
    userId
      ? `SELECT ${COLUMNS} FROM reports WHERE user_id = $1
         ORDER BY created_at DESC, seq DESC`
      : `SELECT ${COLUMNS} FROM reports ORDER BY created_at DESC, seq DESC`,
    userId ? [userId] : [],
  );
  return rows.map((row) => rowToReport(row));
}

export async function getReportByIdOrToken(
  needle: string,
): Promise<IncidentReport | null> {
  await ensureSchema();
  const rows = await query<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM reports WHERE UPPER(id) = $1 OR UPPER(tracking_token) = $2 LIMIT 1`,
    [needle, needle],
  );
  return rows[0] ? rowToReport(rows[0]) : null;
}

export async function ticketTokenExists(token: string): Promise<boolean> {
  await ensureSchema();
  const rows = await query(
    "SELECT 1 FROM reports WHERE tracking_token = $1 LIMIT 1",
    [token],
  );
  return rows.length > 0;
}

export async function insertReport(
  report: IncidentReport,
  tags: string[],
  coordinates: { lat: number; lng: number } | null,
): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO reports (${COLUMNS}) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19::jsonb, $20, $21,
      $22, $23, $24, $25, $26, $27, $28, $29, $30
    )`,
    [
      report.id,
      report.tracking_token,
      report.city_id,
      report.city_name,
      report.area_id,
      report.area_name,
      report.jurisdiction,
      report.category_id,
      report.category_title,
      report.assigned_agency,
      report.sla_deadline,
      report.urgency,
      report.description,
      report.title ?? "",
      tags,
      report.photo_url ?? null,
      coordinates?.lat ?? null,
      coordinates?.lng ?? null,
      report.geo_verification ? JSON.stringify(report.geo_verification) : null,
      report.citizen_name,
      report.citizen_phone,
      report.user_id ?? null,
      report.status,
      report.upvotes,
      report.created_at,
      report.dispatched_at ?? null,
      report.resolved_at ?? null,
      report.assigned_unit ?? null,
      report.after_photo_url ?? null,
      report.resolution_notes ?? null,
    ],
  );
}

export interface ReportPatch {
  status?: IncidentReport["status"];
  assigned_unit?: string;
  assigned_agency?: string;
  urgency?: IncidentReport["urgency"];
  /** Citizen "confirm issue still present" — increments upvotes by 1. */
  upvote?: boolean;
  clearDispatchTelemetry?: boolean;
  stampDispatch?: boolean;
  stampResolved?: boolean;
  /** Squad resolution proof — cleared when a ticket is re-opened. */
  after_photo_url?: string;
  resolution_notes?: string;
}

export async function patchReport(
  id: string,
  patch: ReportPatch,
): Promise<IncidentReport | null> {
  const existing = await getReportByIdOrToken(id);
  if (!existing) return null;

  /* One assignment per column, keyed by name. A status transition also rewrites
     the fields it governs — a re-opened ticket loses its crew and its proof —
     and emitting both that rule and an explicit value for the same column makes
     Postgres reject the entire UPDATE ("multiple assignments to same column").
     Keying lets the later, status-derived write win instead. Placeholders are
     numbered at assembly, so fragments carry `?`. */
  const assignments = new Map<
    string,
    { sql: string; values: (string | number | null)[] }
  >();
  const set = (
    column: string,
    sql: string,
    ...values: (string | number | null)[]
  ) => void assignments.set(column, { sql, values });

  if (patch.status !== undefined) set("status", "status = ?", patch.status);
  if (patch.assigned_unit !== undefined) set("assigned_unit", "assigned_unit = ?", patch.assigned_unit);
  if (patch.assigned_agency !== undefined) set("assigned_agency", "assigned_agency = ?", patch.assigned_agency);
  if (patch.after_photo_url !== undefined) set("after_photo_url", "after_photo_url = ?", patch.after_photo_url);
  if (patch.resolution_notes !== undefined) set("resolution_notes", "resolution_notes = ?", patch.resolution_notes);
  if (patch.urgency !== undefined) set("urgency", "urgency = ?", patch.urgency);
  if (patch.clearDispatchTelemetry) {
    set("dispatched_at", "dispatched_at = NULL");
    set("assigned_unit", "assigned_unit = NULL");
  }
  if (patch.stampDispatch && !existing.dispatched_at) {
    set("dispatched_at", "dispatched_at = ?", new Date().toISOString());
  }
  if (patch.upvote) set("upvotes", "upvotes = upvotes + 1");
  if (patch.status === "resolved") {
    // Re-resolving keeps the original stamp; a fresh resolution gets one.
    if (!existing.resolved_at) {
      set("resolved_at", "resolved_at = ?", new Date().toISOString());
    }
  } else if (
    patch.status === "triage" ||
    patch.status === "dispatched" ||
    patch.status === "in_progress"
  ) {
    // Re-opened tickets lose their resolution telemetry and proof.
    set("resolved_at", "resolved_at = NULL");
    set("after_photo_url", "after_photo_url = NULL");
    set("resolution_notes", "resolution_notes = NULL");
  }
  if (assignments.size === 0) return existing;

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const { sql, values } of assignments.values()) {
    let fragment = sql;
    for (const value of values) {
      args.push(value);
      fragment = fragment.replace("?", `$${args.length}`);
    }
    sets.push(fragment);
  }

  args.push(existing.id);
  await query(
    `UPDATE reports SET ${sets.join(", ")} WHERE id = $${args.length}`,
    args,
  );
  const updated = await getReportByIdOrToken(existing.id);
  /* A squad filing a second proof, or an admin re-opening the ticket, leaves
     the old after-photo unreferenced. This is the one place holding both the
     previous and the stored value, so the retired asset is destroyed here
     rather than by every caller. Awaited: on serverless the process is frozen
     the moment the response lands. */
  const retired = existing.after_photo_url;
  if (retired && updated?.after_photo_url !== retired) {
    await deleteImage(retired);
  }
  return updated;
}

/** Remove a ticket from the ledger outright, returning the row that went so the
    caller can name it. Both evidence photos are retired here: a deleted ticket
    leaves them referenced by nothing, and this is the layer that knows their
    URLs. */
export async function deleteReport(id: string): Promise<IncidentReport | null> {
  const existing = await getReportByIdOrToken(id);
  if (!existing) return null;
  await ensureSchema();
  /* Row first, assets second — the order in patchReport. Destroying an image a
     live ticket still points at would corrupt the ledger; losing a file that
     references nothing is only a wasted byte. */
  await query("DELETE FROM reports WHERE id = $1", [existing.id]);
  for (const url of [existing.photo_url, existing.after_photo_url]) {
    if (url) await deleteImage(url);
  }
  return existing;
}
