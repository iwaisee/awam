/* In-memory failed-attempt lockout for citizen sign-in — the same shape the
   squad console uses (src/lib/squadAccess.ts). It raises the cost of guessing
   a password and, being process-local, resets on a cold start; a persistent
   throttle belongs with the edge/CDN layer, not this table. */

const failures = new Map<string, { count: number; lockedUntil: number }>();

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export function lockoutRemainingMs(key: string, nowMs = Date.now()): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.lockedUntil - nowMs);
}

export function clearFailedAttempts(key: string): void {
  failures.delete(key);
}

/** Record a rejection and return the lockout still to serve (0 if none). */
export function registerFailedAttempt(key: string, nowMs = Date.now()): number {
  const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = nowMs + LOCKOUT_MS;
    entry.count = 0; // Lock once; the next cycle starts fresh after expiry.
  }
  failures.set(key, entry);
  return Math.max(0, entry.lockedUntil - nowMs);
}
