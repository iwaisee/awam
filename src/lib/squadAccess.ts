import { readState, writeState } from "@/lib/appStateDb";
import { ACCESS_CODE_PATTERN } from "@/lib/squadFields";
import { timingSafeEqual } from "node:crypto";

/* Squad access codes — the field-officer credential for the /squad console.
   Codes live in the server-side app-state store (data/appstate.db, key
   "squad-access") and are NEVER served to browsers: /api/departments serves
   the whole registry publicly, so a code inside the registry document would
   leak. The admin Field Teams console issues/rotates codes via
   /api/squad/access; sign-in verifies against them server-side with a
   constant-time compare plus a small failed-attempt lockout. */

const STORE_KEY = "squad-access";

export { ACCESS_CODE_PATTERN };
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

function readCodes(): Record<string, string> {
  const raw = readState(STORE_KEY);
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, code] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof code === "string" && code) out[id] = code;
  }
  return out;
}

function writeCodes(codes: Record<string, string>): void {
  writeState(STORE_KEY, codes);
}

export function hasAccessCode(squadId: string): boolean {
  return Boolean(readCodes()[squadId]);
}

export function accessCodeStatus(squadIds: string[]): Record<string, boolean> {
  const codes = readCodes();
  return Object.fromEntries(squadIds.map((id) => [id, Boolean(codes[id])]));
}

/** Issue or rotate a squad's access code. Throws on an invalid code shape. */
export function setAccessCode(squadId: string, code: string): void {
  const trimmed = code.trim();
  if (!ACCESS_CODE_PATTERN.test(trimmed)) {
    throw new Error(
      "Access code must be 4-12 letters, numbers or dashes (no spaces).",
    );
  }
  const codes = readCodes();
  codes[squadId] = trimmed;
  writeCodes(codes);
  clearFailures(squadId);
}

export function clearAccessCode(squadId: string): void {
  const codes = readCodes();
  delete codes[squadId];
  writeCodes(codes);
  clearFailures(squadId);
}

/* ------------------------- Verification + lockout ------------------------- */

/** In-memory failed-attempt tracker — per squad, resets on server restart.
    Deliberately simple: the pilot console has one shared public entry point. */
const failures = new Map<string, { count: number; lockedUntil: number }>();

function clearFailures(squadId: string): void {
  failures.delete(squadId);
}

export function lockoutRemainingMs(squadId: string, nowMs: number): number {
  const entry = failures.get(squadId);
  if (!entry) return 0;
  return Math.max(0, entry.lockedUntil - nowMs);
}

function registerFailure(squadId: string, nowMs: number): number {
  const entry = failures.get(squadId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = nowMs + LOCKOUT_MS;
    entry.count = 0; // Lock once; the next cycle starts fresh after expiry.
  }
  failures.set(squadId, entry);
  return Math.max(0, entry.lockedUntil - nowMs);
}

export type AccessVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no_code_issued" | "locked" | "mismatch";
      retryAfterMs?: number;
    };

/** Constant-time-ish verification of an officer's access code. */
export function verifySquadAccess(
  squadId: string,
  code: string,
  nowMs: number = Date.now(),
): AccessVerifyResult {
  const codes = readCodes();
  const expected = codes[squadId];
  if (!expected) return { ok: false, reason: "no_code_issued" };

  const lockedFor = lockoutRemainingMs(squadId, nowMs);
  if (lockedFor > 0) return { ok: false, reason: "locked", retryAfterMs: lockedFor };

  const supplied = code.trim();
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (match) {
    clearFailures(squadId);
    return { ok: true };
  }
  const retryAfterMs = registerFailure(squadId, nowMs);
  return {
    ok: false,
    reason: "mismatch",
    retryAfterMs: retryAfterMs > 0 ? retryAfterMs : undefined,
  };
}
