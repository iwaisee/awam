import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/* Generic key/value store for shared application state that used to live in
   per-browser localStorage (system preferences, admin profile, coverage
   roster, …). One SQLite document per key in data/appstate.db so every
   browser reads the same values. */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "appstate.db");

declare global {
  var __sadaAppStateDb: DatabaseSync | undefined;
}

function openDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function getDb(): DatabaseSync {
  if (!globalThis.__sadaAppStateDb) {
    globalThis.__sadaAppStateDb = openDb();
  }
  return globalThis.__sadaAppStateDb;
}

/** The stored JSON value for `key`, or null when nothing was saved yet. */
export function readState(key: string): unknown | null {
  const row = getDb()
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .get(key) as { value: unknown } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(String(row.value));
  } catch {
    return null;
  }
}

export function writeState(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value), new Date().toISOString());
}
