import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { IncidentReport } from "@/types/civic";

/* Server-only SQLite ledger for citizen reports. One database file at
   data/reports.db (WAL mode), opened lazily and cached on globalThis so dev
   hot-reloads reuse the same handle. The table starts EMPTY — every row comes
   from a real submission through the wizard or the API. */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "reports.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  tracking_token TEXT NOT NULL UNIQUE,
  city_id TEXT NOT NULL,
  city_name TEXT NOT NULL,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  uc_number TEXT NOT NULL DEFAULT '',
  jurisdiction TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_title TEXT NOT NULL,
  assigned_agency TEXT NOT NULL,
  sla_deadline TEXT NOT NULL,
  urgency TEXT NOT NULL,
  description TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  selected_tags TEXT NOT NULL DEFAULT '[]',
  photo_url TEXT,
  coordinates TEXT,
  citizen_name TEXT NOT NULL DEFAULT 'Anonymous',
  citizen_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'triage',
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  resolved_at TEXT,
  assigned_unit TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);
`;

declare global {
  var __sadaReportsDb: DatabaseSync | undefined;
}

function openDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

/** CREATE TABLE IF NOT EXISTS never alters a database created before the
    resolved_at column existed — migrate older files in place. Checked on
    every handle fetch because the handle itself is cached across dev
    hot-reloads on globalThis. */
function ensureSchemaUpgrades(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(reports)").all() as Array<{
    name: unknown;
  }>;
  if (!columns.some((c) => c.name === "resolved_at")) {
    db.exec("ALTER TABLE reports ADD COLUMN resolved_at TEXT");
  }
  if (!columns.some((c) => c.name === "title")) {
    db.exec("ALTER TABLE reports ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }
  // Squad resolution proof (field portal) — nullable; written on resolve.
  if (!columns.some((c) => c.name === "after_photo_url")) {
    db.exec("ALTER TABLE reports ADD COLUMN after_photo_url TEXT");
  }
  if (!columns.some((c) => c.name === "resolution_notes")) {
    db.exec("ALTER TABLE reports ADD COLUMN resolution_notes TEXT");
  }
  if (!columns.some((c) => c.name === "materials_used")) {
    db.exec("ALTER TABLE reports ADD COLUMN materials_used TEXT");
  }
}

export function getReportsDb(): DatabaseSync {
  if (!globalThis.__sadaReportsDb) {
    globalThis.__sadaReportsDb = openDb();
  }
  ensureSchemaUpgrades(globalThis.__sadaReportsDb);
  return globalThis.__sadaReportsDb;
}

function rowToReport(row: Record<string, unknown>): IncidentReport {
  const parseJson = (value: unknown): unknown => {
    if (typeof value !== "string" || value === "") return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };
  const tags = parseJson(row.selected_tags);
  const coords = parseJson(row.coordinates);
  return {
    id: String(row.id),
    tracking_token: String(row.tracking_token),
    city_id: String(row.city_id),
    city_name: String(row.city_name),
    area_id: String(row.area_id),
    area_name: String(row.area_name),
    uc_number: String(row.uc_number ?? ""),
    jurisdiction: row.jurisdiction as IncidentReport["jurisdiction"],
    category_id: String(row.category_id),
    category_title: String(row.category_title),
    assigned_agency: String(row.assigned_agency),
    sla_deadline: String(row.sla_deadline),
    urgency: row.urgency as IncidentReport["urgency"],
    description: String(row.description),
    title: typeof row.title === "string" ? row.title : undefined,
    selected_tags: Array.isArray(tags) ? (tags as string[]) : [],
    photo_url: typeof row.photo_url === "string" ? row.photo_url : undefined,
    coordinates:
      coords && typeof coords === "object"
        ? (coords as IncidentReport["coordinates"])
        : undefined,
    citizen_name: String(row.citizen_name),
    citizen_phone: String(row.citizen_phone),
    status: row.status as IncidentReport["status"],
    upvotes: Number(row.upvotes ?? 0),
    created_at: String(row.created_at),
    dispatched_at:
      typeof row.dispatched_at === "string" ? row.dispatched_at : undefined,
    resolved_at:
      typeof row.resolved_at === "string" ? row.resolved_at : undefined,
    assigned_unit:
      typeof row.assigned_unit === "string" ? row.assigned_unit : undefined,
    after_photo_url:
      typeof row.after_photo_url === "string" ? row.after_photo_url : undefined,
    resolution_notes:
      typeof row.resolution_notes === "string"
        ? row.resolution_notes
        : undefined,
    materials_used:
      typeof row.materials_used === "string" ? row.materials_used : undefined,
  };
}

const COLUMNS = `id, tracking_token, city_id, city_name, area_id, area_name,
  uc_number, jurisdiction, category_id, category_title, assigned_agency,
  sla_deadline, urgency, description, title, selected_tags, photo_url,
  coordinates, citizen_name, citizen_phone, status, upvotes, created_at,
  dispatched_at, resolved_at, assigned_unit, after_photo_url,
  resolution_notes, materials_used`;

export function listReports(): IncidentReport[] {
  const db = getReportsDb();
  const rows = db.prepare(`SELECT ${COLUMNS} FROM reports ORDER BY created_at DESC, rowid DESC`);
  return rows.all().map((row) => rowToReport(row as Record<string, unknown>));
}

export function getReportByIdOrToken(needle: string): IncidentReport | null {
  const db = getReportsDb();
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM reports WHERE UPPER(id) = ? OR UPPER(tracking_token) = ? LIMIT 1`,
    )
    .get(needle, needle);
  return row ? rowToReport(row as Record<string, unknown>) : null;
}

export function ticketTokenExists(token: string): boolean {
  const db = getReportsDb();
  const row = db
    .prepare("SELECT 1 FROM reports WHERE tracking_token = ? LIMIT 1")
    .get(token);
  return row !== undefined;
}

export function insertReport(
  report: IncidentReport,
  tagsJson: string,
  coordsJson: string | null,
): void {
  const db = getReportsDb();
  db.prepare(
    `INSERT INTO reports (${COLUMNS}) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
  ).run(
    report.id,
    report.tracking_token,
    report.city_id,
    report.city_name,
    report.area_id,
    report.area_name,
    report.uc_number ?? "",
    report.jurisdiction,
    report.category_id,
    report.category_title,
    report.assigned_agency,
    report.sla_deadline,
    report.urgency,
    report.description,
    report.title ?? "",
    tagsJson,
    report.photo_url ?? null,
    coordsJson,
    report.citizen_name,
    report.citizen_phone,
    report.status,
    report.upvotes,
    report.created_at,
    report.dispatched_at ?? null,
    report.resolved_at ?? null,
    report.assigned_unit ?? null,
    report.after_photo_url ?? null,
    report.resolution_notes ?? null,
    report.materials_used ?? null,
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
  materials_used?: string;
}

export function patchReport(id: string, patch: ReportPatch): IncidentReport | null {
  const db = getReportsDb();
  const existing = getReportByIdOrToken(id);
  if (!existing) return null;

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  if (patch.assigned_unit !== undefined) {
    sets.push("assigned_unit = ?");
    args.push(patch.assigned_unit);
  }
  if (patch.assigned_agency !== undefined) {
    sets.push("assigned_agency = ?");
    args.push(patch.assigned_agency);
  }
  if (patch.after_photo_url !== undefined) {
    sets.push("after_photo_url = ?");
    args.push(patch.after_photo_url);
  }
  if (patch.resolution_notes !== undefined) {
    sets.push("resolution_notes = ?");
    args.push(patch.resolution_notes);
  }
  if (patch.materials_used !== undefined) {
    sets.push("materials_used = ?");
    args.push(patch.materials_used);
  }
  if (patch.urgency !== undefined) {
    sets.push("urgency = ?");
    args.push(patch.urgency);
  }
  if (patch.clearDispatchTelemetry) {
    sets.push("dispatched_at = NULL", "assigned_unit = NULL");
  }
  if (patch.stampDispatch && !existing.dispatched_at) {
    sets.push("dispatched_at = ?");
    args.push(new Date().toISOString());
  }
  if (patch.upvote) {
    sets.push("upvotes = upvotes + 1");
  }
  if (patch.status === "resolved") {
    // Re-resolving keeps the original stamp; a fresh resolution gets one.
    if (!existing.resolved_at) {
      sets.push("resolved_at = ?");
      args.push(new Date().toISOString());
    }
  } else if (
    patch.status === "triage" ||
    patch.status === "dispatched" ||
    patch.status === "in_progress"
  ) {
    // Re-opened tickets lose their resolution telemetry and proof.
    sets.push(
      "resolved_at = NULL",
      "after_photo_url = NULL",
      "resolution_notes = NULL",
      "materials_used = NULL",
    );
  }
  if (sets.length === 0) return existing;

  args.push(existing.id);
  db.prepare(`UPDATE reports SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  return getReportByIdOrToken(existing.id);
}
