import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/* Server-side home for the government departments registry — the full
   sector → agency → division → squad tree as one JSON document in
   data/departments.db. Every browser (and the auto-assignment logic in the
   reports API) reads the same registry here instead of per-browser
   localStorage, so edits made on one machine are visible everywhere. */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "departments.db");

declare global {
  var __sadaDepartmentsDb: DatabaseSync | undefined;
}

function openDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function getDb(): DatabaseSync {
  if (!globalThis.__sadaDepartmentsDb) {
    globalThis.__sadaDepartmentsDb = openDb();
  }
  return globalThis.__sadaDepartmentsDb;
}

/** The saved registry tree, or null when nothing has been stored yet
    (callers fall back to the seed / localStorage migration). */
export function readRegistry(): unknown | null {
  const row = getDb()
    .prepare("SELECT data FROM registry WHERE id = 1")
    .get() as { data: unknown } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(String(row.data));
  } catch {
    return null;
  }
}

export function writeRegistry(data: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO registry (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(data), new Date().toISOString());
}

/** Dev-only escape hatch — resets the store to "never saved" so a browser's
    localStorage registry can be re-migrated. No-op in production builds. */
export function resetRegistry(): void {
  if (process.env.NODE_ENV === "production") return;
  getDb().prepare("DELETE FROM registry WHERE id = 1").run();
}
