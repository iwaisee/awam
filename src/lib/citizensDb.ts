import { ensureSchema, query } from "@/lib/pg";
import {
  DEFAULT_ADMIN_STATE,
  type CitizenAdminState,
  type CitizenStanding,
} from "@/lib/citizenProfiles";

/* Server-only Neon (Postgres) store for the admin governance state that is
   NOT part of the reports ledger itself: badge overrides, civic score
   modifiers, account standing and device blacklists. Keyed by the same
   citizen key used by citizenProfiles.ts, in the `citizen_admin` table. */

function rowToState(row: Record<string, unknown>): CitizenAdminState {
  const truthy = (value: unknown): boolean =>
    value === true || Number(value ?? 0) === 1;
  return {
    badgeOverride: truthy(row.badge_override),
    scoreModifier: Number(row.score_modifier ?? 0),
    standing: (row.standing === "suspended" ? "suspended" : "active") as CitizenStanding,
    blacklisted: truthy(row.blacklisted),
  };
}

export async function listCitizenAdminStates(): Promise<Map<string, CitizenAdminState>> {
  await ensureSchema();
  const rows = await query<Record<string, unknown>>(
    "SELECT key, badge_override, score_modifier, standing, blacklisted FROM citizen_admin",
  );
  const states = new Map<string, CitizenAdminState>();
  for (const row of rows) {
    states.set(String(row.key), rowToState(row));
  }
  return states;
}

export async function getCitizenAdminState(key: string): Promise<CitizenAdminState> {
  await ensureSchema();
  const rows = await query<Record<string, unknown>>(
    "SELECT badge_override, score_modifier, standing, blacklisted FROM citizen_admin WHERE key = $1 LIMIT 1",
    [key],
  );
  return rows[0] ? rowToState(rows[0]) : { ...DEFAULT_ADMIN_STATE };
}

export interface CitizenAdminPatch {
  badgeOverride?: boolean;
  /** Absolute replacement of the civic score modifier. */
  scoreModifier?: number;
  standing?: CitizenStanding;
  blacklisted?: boolean;
}

export async function updateCitizenAdminState(
  key: string,
  patch: CitizenAdminPatch,
): Promise<CitizenAdminState> {
  const current = await getCitizenAdminState(key);
  const next: CitizenAdminState = {
    badgeOverride: patch.badgeOverride ?? current.badgeOverride,
    scoreModifier: patch.scoreModifier ?? current.scoreModifier,
    standing: patch.standing ?? current.standing,
    blacklisted: patch.blacklisted ?? current.blacklisted,
  };
  await ensureSchema();
  await query(
    `INSERT INTO citizen_admin (key, badge_override, score_modifier, standing, blacklisted, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT(key) DO UPDATE SET
       badge_override = excluded.badge_override,
       score_modifier = excluded.score_modifier,
       standing = excluded.standing,
       blacklisted = excluded.blacklisted,
       updated_at = now()`,
    [
      key,
      next.badgeOverride,
      next.scoreModifier,
      next.standing,
      next.blacklisted,
    ],
  );
  return next;
}
