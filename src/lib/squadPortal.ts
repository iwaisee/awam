import { readRegistry, updateSquadStatus } from "@/lib/departmentsDb";
import { readState, writeState } from "@/lib/appStateDb";
import { SQUAD_AVAILABILITY, type SquadAvailability, type SquadSession } from "@/lib/squadFields";
import type { CoreSector, FieldSquad } from "@/data/departmentRegistry";

/* Field-squad session store — binds the /squad field console to one REAL
   squad from the departments registry (Neon `registry` table). The bound
   session document lives in the shared app-state store (Neon `app_state`)
   so the officer's phone, the control room, and any other browser all see
   the same binding. Squad metadata is re-resolved from the live registry on
   every read, so console edits (new lead, new plate) propagate instantly. */

export { SQUAD_AVAILABILITY };
export type { SquadAvailability, SquadSession };

const STATE_KEY = "squad-session";

interface ResolvedSquad {
  squad: FieldSquad;
  agencyCode: string;
  agencyName: string;
  sectorSlug: string;
  divisionId: string;
  divisionName: string;
  district: string;
}

/** Look one squad up across the whole sector → agency → division tree. */
export async function findSquadInRegistry(squadId: string): Promise<ResolvedSquad | null> {
  const registry = await readRegistry();
  if (!Array.isArray(registry)) return null;
  for (const sector of registry as CoreSector[]) {
    for (const agency of sector.agencies) {
      for (const op of agency.districtOperations) {
        const squad = op.squads.find((s) => s.id === squadId);
        if (squad) {
          return {
            squad,
            agencyCode: agency.code,
            agencyName: agency.fullName,
            sectorSlug: sector.slug,
            divisionId: op.id,
            divisionName: op.divisionName,
            district: op.district,
          };
        }
      }
    }
  }
  return null;
}

function toSession(
  resolved: ResolvedSquad,
  availability: SquadAvailability,
  boundAt: string,
): SquadSession {
  const { squad } = resolved;
  return {
    squadId: squad.id,
    squadName: squad.name,
    agencyCode: resolved.agencyCode,
    agencyName: resolved.agencyName,
    sectorSlug: resolved.sectorSlug,
    divisionId: resolved.divisionId,
    divisionName: resolved.divisionName,
    district: resolved.district,
    leadName: squad.leadTechnician,
    leadPhone: squad.phone,
    membersCount: squad.membersCount,
    vehiclePlate: squad.vehiclePlate,
    shift: squad.shift,
    wards: squad.wards ?? [],
    availability,
    boundAt,
  };
}

/** The stored binding with metadata refreshed from the live registry.
    Returns null when nothing is bound or the squad was decommissioned. */
export async function readSquadSession(): Promise<SquadSession | null> {
  const stored = (await readState(STATE_KEY)) as
    | { squadId?: unknown; availability?: unknown; boundAt?: unknown }
    | null;
  if (!stored || typeof stored.squadId !== "string") return null;
  const resolved = await findSquadInRegistry(stored.squadId);
  if (!resolved) return null;
  const availability = (
    typeof stored.availability === "string" &&
    stored.availability in SQUAD_AVAILABILITY
      ? stored.availability
      : "active_field"
  ) as SquadAvailability;
  return toSession(
    resolved,
    availability,
    typeof stored.boundAt === "string"
      ? stored.boundAt
      : new Date().toISOString(),
  );
}

/** Bind the portal to a registry squad. Throws when the id is unknown.
    A fresh binding starts Active in Field and mirrors that into the
    registry roster so the admin board never shows a stale duty state. */
export async function bindSquadSession(squadId: string): Promise<SquadSession> {
  const resolved = await findSquadInRegistry(squadId);
  if (!resolved) throw new Error(`No field squad found for id ${squadId}.`);
  const boundAt = new Date().toISOString();
  const session = toSession(resolved, "active_field", boundAt);
  await writeState(STATE_KEY, {
    squadId: session.squadId,
    availability: session.availability,
    boundAt,
  });
  await mirrorAvailabilityToRegistry(session.squadId, session.availability);
  return session;
}

export async function unbindSquadSession(): Promise<void> {
  await writeState(STATE_KEY, null);
}

/** Write the roster-facing status for a squad into the departments registry.
    Best-effort: the session document always carries the truth for /squad. */
async function mirrorAvailabilityToRegistry(
  squadId: string,
  availability: SquadAvailability,
): Promise<void> {
  await updateSquadStatus(squadId, SQUAD_AVAILABILITY[availability].registry);
}

/** Flip field availability and mirror the roster-facing status back into the
    departments registry, so the admin Field Teams board follows the officer. */
export async function setSquadAvailability(
  availability: SquadAvailability,
): Promise<SquadSession> {
  const session = await readSquadSession();
  if (!session) throw new Error("No squad session is bound.");
  await writeState(STATE_KEY, {
    squadId: session.squadId,
    availability,
    boundAt: session.boundAt,
  });
  await mirrorAvailabilityToRegistry(session.squadId, availability);
  return { ...session, availability };
}
