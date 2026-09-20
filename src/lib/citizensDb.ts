import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ADMIN_STATE,
  type CitizenAdminState,
  type CitizenStanding,
} from "@/lib/citizenProfiles";

/* Server-only SQLite store for the admin governance state that is NOT part of
   the reports ledger itself: badge overrides, civic score modifiers, account
   standing and device blacklists. Keyed by the same citizen key used by
   citizenProfiles.ts. Lives beside the reports ledger in data/reports.db so
   the whole console shares one database file. */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "reports.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS citizen_admin (
  key TEXT PRIMARY KEY,
  badge_override INTEGER NOT NULL DEFAULT 0,
  score_modifier INTEGER NOT NULL DEFAULT 0,
  standing TEXT NOT NULL DEFAULT 'active',
  blacklisted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __sadaCitizensAdminDb: DatabaseSync | undefined;
}

function getCitizensDb(): DatabaseSync {
  if (!globalThis.__sadaCitizensAdminDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA);
    globalThis.__sadaCitizensAdminDb = db;
  }
  return globalThis.__sadaCitizensAdminDb;
}

function rowToState(row: Record<string, unknown>): CitizenAdminState {
  return {
    badgeOverride: Number(row.badge_override ?? 0) === 1,
    scoreModifier: Number(row.score_modifier ?? 0),
    standing: (row.standing === "suspended" ? "suspended" : "active") as CitizenStanding,
    blacklisted: Number(row.blacklisted ?? 0) === 1,
  };
}

export function listCitizenAdminStates(): Map<string, CitizenAdminState> {
  const db = getCitizensDb();
  const rows = db
    .prepare("SELECT key, badge_override, score_modifier, standing, blacklisted FROM citizen_admin")
    .all() as Array<Record<string, unknown>>;
  const states = new Map<string, CitizenAdminState>();
  for (const row of rows) {
    states.set(String(row.key), rowToState(row));
  }
  return states;
}

export function getCitizenAdminState(key: string): CitizenAdminState {
  const row = getCitizensDb()
    .prepare(
      "SELECT badge_override, score_modifier, standing, blacklisted FROM citizen_admin WHERE key = ? LIMIT 1",
    )
    .get(key) as Record<string, unknown> | undefined;
  return row ? rowToState(row) : { ...DEFAULT_ADMIN_STATE };
}

export interface CitizenAdminPatch {
  badgeOverride?: boolean;
  /** Absolute replacement of the civic score modifier. */
  scoreModifier?: number;
  standing?: CitizenStanding;
  blacklisted?: boolean;
}

export function updateCitizenAdminState(
  key: string,
  patch: CitizenAdminPatch,
): CitizenAdminState {
  const current = getCitizenAdminState(key);
  const next: CitizenAdminState = {
    badgeOverride: patch.badgeOverride ?? current.badgeOverride,
    scoreModifier: patch.scoreModifier ?? current.scoreModifier,
    standing: patch.standing ?? current.standing,
    blacklisted: patch.blacklisted ?? current.blacklisted,
  };
  getCitizensDb()
    .prepare(
      `INSERT INTO citizen_admin (key, badge_override, score_modifier, standing, blacklisted, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         badge_override = excluded.badge_override,
         score_modifier = excluded.score_modifier,
         standing = excluded.standing,
         blacklisted = excluded.blacklisted,
         updated_at = excluded.updated_at`,
    )
    .run(
      key,
      next.badgeOverride ? 1 : 0,
      next.scoreModifier,
      next.standing,
      next.blacklisted ? 1 : 0,
      new Date().toISOString(),
    );
  return next;
}
