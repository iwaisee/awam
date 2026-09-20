import { readRegistry } from "@/lib/departmentsDb";
import { listReports } from "@/lib/reportsDb";
import type { CoreSector, FieldSquad } from "@/data/departmentRegistry";

/* Auto-assignment — picks the field squad that should take a dispatched
   ticket. Crews are area owners: the picker searches EVERY department's
   squads for one whose serving wards include the ticket's area, then falls
   back to district-wide crews (the ticket's own agency first), then prefers
   on-duty crews with the lightest active workload. Returns null when no
   squad covers the area — the dispatcher assigns manually then. */

const AGENCY_ALIASES: Record<string, string> = {
  "Cantt Board": "CB",
};

function agencyMatches(code: string, assignedAgency: string): boolean {
  const a = code.toLowerCase();
  const b = assignedAgency.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function pickSquadForReport(report: {
  assigned_agency: string;
  area_name: string;
}): string | null {
  const registry = readRegistry();
  if (!Array.isArray(registry)) return null;
  const area = report.area_name.toLowerCase();
  const ownAgency = (
    AGENCY_ALIASES[report.assigned_agency] ?? report.assigned_agency
  ).toLowerCase();

  const busyUnits = new Set(
    listReports()
      .filter((r) => r.status === "dispatched" || r.status === "in_progress")
      .map((r) => (r.assigned_unit ?? "").toLowerCase())
      .filter(Boolean)
  );

  const score = (squad: FieldSquad, agencyCode: string): number => {
    const wards = squad.wards ?? [];
    const wardHit = wards.some((w) => w.toLowerCase() === area)
      ? 0
      : wards.length > 0
        ? 2
        : 1;
    const agencyHit = agencyMatches(agencyCode, ownAgency) ? 0 : 1;
    const statusPenalty =
      squad.status === "off_duty" ? 3 : squad.status === "on_call" ? 1 : 0;
    const load = busyUnits.has(squad.name.toLowerCase()) ? 10 : 0;
    return wardHit * 100 + agencyHit * 30 + statusPenalty * 10 + load;
  };

  const ranked = (registry as CoreSector[])
    .flatMap((sector) => sector.agencies)
    .flatMap((agency) =>
      agency.districtOperations.flatMap((op) =>
        op.squads.map((squad) => ({ squad, code: agency.code })),
      ),
    )
    .sort((a, b) => score(a.squad, a.code) - score(b.squad, b.code));

  const best = ranked[0];
  if (!best) return null;
  const bestWards = best.squad.wards ?? [];
  // Every crew explicitly excludes this area — leave it to the dispatcher.
  if (bestWards.length > 0 && !bestWards.some((w) => w.toLowerCase() === area))
    return null;
  return best.squad.name;
}
