import { ensureSchema, getPool } from "@/lib/pg";
import type {
  CoreSector,
  DistrictOperation,
  FieldSquad,
  RegionalAgency,
} from "@/data/departmentRegistry";

/* Server-side home for the government departments registry — the full
   sector → agency → division → squad tree, normalized into the Neon
   sectors / agencies / divisions / squads tables. Every browser (and the
   auto-assignment logic in the reports API) reads the same tree here
   instead of per-browser localStorage, so edits made on one machine are
   visible everywhere.

   The client contract stays a whole tree: readRegistry() assembles
   CoreSector[] from the rows, writeRegistry() syncs a full tree payload
   (upsert-then-delete-orphans in one transaction, one batched statement
   per tier). Row identity is the client-minted string id, stable across
   renames. */

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};

const str = (row: Row, key: string): string => {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
};

const nulStr = (row: Row, key: string): string | null => {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
};

const nulNum = (row: Row, key: string): number | null => {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const nulInt = (row: Row, key: string): number | null => {
  const n = nulNum(row, key);
  return n === null ? null : Math.round(n);
};

/** JSONB column → string array. Tolerates rows stored as double-encoded JSON
    strings — an earlier write path pre-stringified the array before the
    jsonb_to_recordset insert, so the column held the scalar '"[...]"' and
    every reader saw an empty roster. */
const jsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to the empty default */
    }
  }
  return [];
};

const nulBool = (row: Row, key: string): boolean | null => {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
};

/** The saved registry tree, or null when nothing has been stored yet
    (callers render their loading / empty states). */
export async function readRegistry(): Promise<CoreSector[] | null> {
  await ensureSchema();
  const [sectorRows, agencyRows, divisionRows, squadRows] = await Promise.all([
    getPool().query("SELECT * FROM sectors ORDER BY sort, id"),
    getPool().query("SELECT * FROM agencies ORDER BY sort, id"),
    getPool().query("SELECT * FROM divisions ORDER BY sort, id"),
    getPool().query("SELECT * FROM squads ORDER BY sort, id"),
  ]);
  if (sectorRows.rows.length === 0) return null;

  const squadsByDivision = new Map<string, FieldSquad[]>();
  for (const row of squadRows.rows as Row[]) {
    const squad: FieldSquad = {
      id: String(row.id),
      name: str(row, "name"),
      leadTechnician: str(row, "lead_technician"),
      phone: str(row, "phone"),
      membersCount: Number(row.members_count ?? 0),
      status: str(row, "status") as FieldSquad["status"],
    };
    const roleClass = nulStr(row, "role_class");
    if (roleClass !== null) squad.roleClass = roleClass as FieldSquad["roleClass"];
    const shift = nulStr(row, "shift");
    if (shift !== null) squad.shift = shift as FieldSquad["shift"];
    const vehiclePlate = nulStr(row, "vehicle_plate");
    if (vehiclePlate !== null) squad.vehiclePlate = vehiclePlate;
    squad.wards = jsonArray(row.wards);
    const activeTickets = nulNum(row, "active_tickets");
    if (activeTickets !== null) squad.activeTickets = activeTickets;
    const divisionId = String(row.division_id);
    const list = squadsByDivision.get(divisionId) ?? [];
    list.push(squad);
    squadsByDivision.set(divisionId, list);
  }

  const divisionsByAgency = new Map<string, DistrictOperation[]>();
  for (const row of divisionRows.rows as Row[]) {
    const division: DistrictOperation = {
      id: String(row.id),
      district: str(row, "district"),
      divisionName: str(row, "division_name"),
      managerName: str(row, "manager_name"),
      managerDesignation: str(row, "manager_designation"),
      officialPhone: str(row, "official_phone"),
      controlRoomHotline: str(row, "control_room_hotline"),
      coverage: jsonArray(row.coverage),
      openTickets: Number(row.open_tickets ?? 0),
      resolvedTickets: Number(row.resolved_tickets ?? 0),
      totalSquadsDeployed: Number(row.total_squads_deployed ?? 0),
      squads: squadsByDivision.get(String(row.id)) ?? [],
    };
    const urdu = nulStr(row, "division_name_urdu");
    if (urdu !== null) division.divisionNameUrdu = urdu;
    const extension = nulStr(row, "official_extension");
    if (extension !== null) division.officialExtension = extension;
    const agencyId = String(row.agency_id);
    const list = divisionsByAgency.get(agencyId) ?? [];
    list.push(division);
    divisionsByAgency.set(agencyId, list);
  }

  const agenciesBySector = new Map<string, RegionalAgency[]>();
  for (const row of agencyRows.rows as Row[]) {
    const agency: RegionalAgency = {
      id: String(row.id),
      code: str(row, "code"),
      fullName: str(row, "full_name"),
      headquarters: str(row, "headquarters"),
      descriptor: str(row, "descriptor"),
      province: str(row, "province"),
      jurisdictionDistricts: jsonArray(row.jurisdiction_districts),
      status: str(row, "status") as RegionalAgency["status"],
      districtOperations: divisionsByAgency.get(String(row.id)) ?? [],
    };
    const hqAddress = nulStr(row, "hq_address");
    if (hqAddress !== null) agency.hqAddress = hqAddress;
    for (const key of ["control_hotline", "dispatch_email", "webhook_url"] as const) {
      const value = nulStr(row, key);
      if (value !== null) {
        if (key === "control_hotline") agency.controlHotline = value;
        else if (key === "dispatch_email") agency.dispatchEmail = value;
        else agency.webhookUrl = value;
      }
    }
    const reportsEnabled = nulBool(row, "reports_enabled");
    if (reportsEnabled !== null) agency.reportsEnabled = reportsEnabled;
    const maintenance = nulBool(row, "maintenance");
    if (maintenance !== null) agency.maintenance = maintenance;
    const avgResolutionHours = nulNum(row, "avg_resolution_hours");
    if (avgResolutionHours !== null) agency.avgResolutionHours = avgResolutionHours;
    // liveOpen / liveResolved are display-time ledger folds — never persisted.
    const sectorId = String(row.sector_id);
    const list = agenciesBySector.get(sectorId) ?? [];
    list.push(agency);
    agenciesBySector.set(sectorId, list);
  }

  return (sectorRows.rows as Row[]).map((row) => {
    const sector: CoreSector = {
      id: String(row.id),
      slug: str(row, "slug") || String(row.id),
      name: str(row, "name"),
      nameUrdu: str(row, "name_urdu"),
      icon: str(row, "icon"),
      agencies: agenciesBySector.get(String(row.id)) ?? [],
    };
    const unit = nulStr(row, "unit");
    if (unit !== null) sector.unit = unit;
    return sector;
  });
}

function isValidSectorRow(row: Row): boolean {
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    Array.isArray(row.agencies)
  );
}

/** Persist the whole registry tree. The payload is authoritative: rows
    removed from the tree are deleted (squads of deleted divisions cascade).
    liveOpen/liveResolved display folds are ignored if a stale client sends
    them. Malformed agencies/divisions/squads (missing id) are skipped and
    their stale rows swept. */
export async function writeRegistry(data: unknown): Promise<void> {
  if (!Array.isArray(data)) {
    throw new Error("Invalid registry payload — expected a sector array.");
  }
  const sectors = data.map(asRow);
  if (sectors.some((row) => !isValidSectorRow(row))) {
    throw new Error("Invalid registry payload — sector shape check failed.");
  }
  await ensureSchema();

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    /* 1. Sectors. */
    const sectorPayload = sectors.map((row, sort) => {
      const id = str(row, "id");
      return {
        id,
        slug: str(row, "slug") || id,
        name: str(row, "name"),
        name_urdu: str(row, "nameUrdu"),
        icon: str(row, "icon"),
        unit: nulStr(row, "unit"),
        sort,
      };
    });
    const includedSectorIds = new Set(sectorPayload.map((s) => s.id));
    await client.query(
      `INSERT INTO sectors (id, slug, name, name_urdu, icon, unit, sort)
       SELECT id, slug, name, name_urdu, icon, unit, sort
       FROM jsonb_to_recordset($1::jsonb) AS t(id text, slug text, name text,
         name_urdu text, icon text, unit text, sort integer)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name, name_urdu = EXCLUDED.name_urdu,
         icon = EXCLUDED.icon, unit = EXCLUDED.unit, sort = EXCLUDED.sort`,
      [JSON.stringify(sectorPayload)],
    );

    /* 2. Agencies — only under included sectors, so the FK always holds. */
    const agencyPayload = sectors
      .filter((row) => includedSectorIds.has(str(row, "id")))
      .flatMap((row) => {
        const sectorId = str(row, "id");
        const agencies = Array.isArray(row.agencies) ? row.agencies.map(asRow) : [];
        return agencies
          .filter((a) => str(a, "id").trim() !== "")
          .map((agency, sort) => ({
            id: str(agency, "id").trim(),
            sector_id: sectorId,
            code: str(agency, "code"),
            full_name: str(agency, "fullName"),
            headquarters: str(agency, "headquarters"),
            hq_address: nulStr(agency, "hqAddress"),
            descriptor: str(agency, "descriptor"),
            province: str(agency, "province") || "Punjab",
            jurisdiction_districts: jsonArray(agency.jurisdictionDistricts),
            status: str(agency, "status") || "active",
            control_hotline: nulStr(agency, "controlHotline"),
            dispatch_email: nulStr(agency, "dispatchEmail"),
            webhook_url: nulStr(agency, "webhookUrl"),
            reports_enabled: nulBool(agency, "reportsEnabled"),
            maintenance: nulBool(agency, "maintenance"),
            avg_resolution_hours: nulNum(agency, "avgResolutionHours"),
            sort,
          }));
      });
    const includedAgencyIds = new Set(agencyPayload.map((a) => a.id));
    if (agencyPayload.length > 0) {
      await client.query(
        `INSERT INTO agencies (id, sector_id, code, full_name, headquarters, hq_address,
           descriptor, province, jurisdiction_districts, status, control_hotline,
           dispatch_email, webhook_url, reports_enabled, maintenance,
           avg_resolution_hours, sort)
         SELECT id, sector_id, code, full_name, headquarters, hq_address,
           descriptor, province, jurisdiction_districts, status, control_hotline,
           dispatch_email, webhook_url, reports_enabled, maintenance,
           avg_resolution_hours, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, sector_id text, code text,
           full_name text, headquarters text, hq_address text, descriptor text,
           province text, jurisdiction_districts jsonb, status text,
           control_hotline text, dispatch_email text, webhook_url text,
           reports_enabled boolean, maintenance boolean, avg_resolution_hours numeric,
           sort integer)
         ON CONFLICT (id) DO UPDATE SET
           sector_id = EXCLUDED.sector_id, code = EXCLUDED.code,
           full_name = EXCLUDED.full_name, headquarters = EXCLUDED.headquarters,
           hq_address = EXCLUDED.hq_address, descriptor = EXCLUDED.descriptor,
           province = EXCLUDED.province,
           jurisdiction_districts = EXCLUDED.jurisdiction_districts,
           status = EXCLUDED.status, control_hotline = EXCLUDED.control_hotline,
           dispatch_email = EXCLUDED.dispatch_email, webhook_url = EXCLUDED.webhook_url,
           reports_enabled = EXCLUDED.reports_enabled, maintenance = EXCLUDED.maintenance,
           avg_resolution_hours = EXCLUDED.avg_resolution_hours, sort = EXCLUDED.sort`,
        [JSON.stringify(agencyPayload)],
      );
    }

    /* 3. Divisions — only under included agencies. */
    const divisionPayload = sectors
      .filter((row) => includedSectorIds.has(str(row, "id")))
      .flatMap((row) =>
        (Array.isArray(row.agencies) ? row.agencies.map(asRow) : [])
          .filter((a) => includedAgencyIds.has(str(a, "id").trim()))
          .flatMap((agency) => {
            const agencyId = str(agency, "id").trim();
            const divisions = Array.isArray(agency.districtOperations)
              ? agency.districtOperations.map(asRow)
              : [];
            return divisions
              .filter((d) => str(d, "id").trim() !== "")
              .map((division, sort) => ({
                id: str(division, "id").trim(),
                agency_id: agencyId,
                district: str(division, "district"),
                division_name: str(division, "divisionName"),
                division_name_urdu: nulStr(division, "divisionNameUrdu"),
                manager_name: str(division, "managerName"),
                manager_designation: str(division, "managerDesignation"),
                official_phone: str(division, "officialPhone"),
                official_extension: nulStr(division, "officialExtension"),
                control_room_hotline: str(division, "controlRoomHotline"),
                coverage: jsonArray(division.coverage),
                open_tickets: nulInt(division, "openTickets") ?? 0,
                resolved_tickets: nulInt(division, "resolvedTickets") ?? 0,
                total_squads_deployed: nulInt(division, "totalSquadsDeployed") ?? 0,
                sort,
              }));
          }),
      );
    const includedDivisionIds = new Set(divisionPayload.map((d) => d.id));
    if (divisionPayload.length > 0) {
      await client.query(
        `INSERT INTO divisions (id, agency_id, district, division_name, division_name_urdu,
           manager_name, manager_designation, official_phone, official_extension,
           control_room_hotline, coverage, open_tickets, resolved_tickets,
           total_squads_deployed, sort)
         SELECT id, agency_id, district, division_name, division_name_urdu,
           manager_name, manager_designation, official_phone, official_extension,
           control_room_hotline, coverage, open_tickets, resolved_tickets,
           total_squads_deployed, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, agency_id text, district text,
           division_name text, division_name_urdu text, manager_name text,
           manager_designation text, official_phone text, official_extension text,
           control_room_hotline text, coverage jsonb, open_tickets integer,
           resolved_tickets integer, total_squads_deployed integer, sort integer)
         ON CONFLICT (id) DO UPDATE SET
           agency_id = EXCLUDED.agency_id, district = EXCLUDED.district,
           division_name = EXCLUDED.division_name,
           division_name_urdu = EXCLUDED.division_name_urdu,
           manager_name = EXCLUDED.manager_name,
           manager_designation = EXCLUDED.manager_designation,
           official_phone = EXCLUDED.official_phone,
           official_extension = EXCLUDED.official_extension,
           control_room_hotline = EXCLUDED.control_room_hotline,
           coverage = EXCLUDED.coverage, open_tickets = EXCLUDED.open_tickets,
           resolved_tickets = EXCLUDED.resolved_tickets,
           total_squads_deployed = EXCLUDED.total_squads_deployed, sort = EXCLUDED.sort`,
        [JSON.stringify(divisionPayload)],
      );
    }

    /* 4. Squads — only under included divisions. */
    const squadPayload = sectors
      .filter((row) => includedSectorIds.has(str(row, "id")))
      .flatMap((row) =>
        (Array.isArray(row.agencies) ? row.agencies.map(asRow) : [])
          .filter((a) => includedAgencyIds.has(str(a, "id").trim()))
          .flatMap((agency) =>
            (Array.isArray(agency.districtOperations) ? agency.districtOperations.map(asRow) : [])
              .filter((d) => includedDivisionIds.has(str(d, "id").trim()))
              .flatMap((division) => {
                const divisionId = str(division, "id").trim();
                const squads = Array.isArray(division.squads) ? division.squads.map(asRow) : [];
                return squads
                  .filter((s) => str(s, "id").trim() !== "")
                  .map((squad, sort) => ({
                    id: str(squad, "id").trim(),
                    division_id: divisionId,
                    name: str(squad, "name"),
                    lead_technician: str(squad, "leadTechnician"),
                    phone: str(squad, "phone"),
                    members_count: nulInt(squad, "membersCount") ?? 0,
                    status: str(squad, "status") || "active",
                    role_class: nulStr(squad, "roleClass"),
                    shift: nulStr(squad, "shift"),
                    vehicle_plate: nulStr(squad, "vehiclePlate"),
                    wards: jsonArray(squad.wards),
                    active_tickets: nulInt(squad, "activeTickets"),
                    sort,
                  }));
              }),
          ),
      );
    const squadIds = squadPayload.map((s) => s.id);
    if (squadPayload.length > 0) {
      await client.query(
        `INSERT INTO squads (id, division_id, name, lead_technician, phone,
           members_count, status, role_class, shift, vehicle_plate, wards,
           active_tickets, sort)
         SELECT id, division_id, name, lead_technician, phone,
           members_count, status, role_class, shift, vehicle_plate, wards,
           active_tickets, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, division_id text, name text,
           lead_technician text, phone text, members_count integer, status text,
           role_class text, shift text, vehicle_plate text, wards jsonb,
           active_tickets integer, sort integer)
         ON CONFLICT (id) DO UPDATE SET
           division_id = EXCLUDED.division_id, name = EXCLUDED.name,
           lead_technician = EXCLUDED.lead_technician, phone = EXCLUDED.phone,
           members_count = EXCLUDED.members_count, status = EXCLUDED.status,
           role_class = EXCLUDED.role_class, shift = EXCLUDED.shift,
           vehicle_plate = EXCLUDED.vehicle_plate, wards = EXCLUDED.wards,
           active_tickets = EXCLUDED.active_tickets, sort = EXCLUDED.sort`,
        [JSON.stringify(squadPayload)],
      );
    }

    /* 5. Orphan sweep — rows the tree no longer contains (children cascade). */
    await client.query("DELETE FROM squads WHERE id <> ALL($1::text[])", [squadIds]);
    await client.query(
      "DELETE FROM divisions WHERE id <> ALL($1::text[])",
      [divisionPayload.map((d) => d.id)],
    );
    await client.query(
      "DELETE FROM agencies WHERE id <> ALL($1::text[])",
      [agencyPayload.map((a) => a.id)],
    );
    await client.query(
      "DELETE FROM sectors WHERE id <> ALL($1::text[])",
      [sectorPayload.map((s) => s.id)],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Single-row duty-status write for the field-squad availability mirror —
    replaces the old read-modify-write of the whole tree. */
export async function updateSquadStatus(id: string, status: string): Promise<void> {
  await ensureSchema();
  await getPool().query("UPDATE squads SET status = $2 WHERE id = $1", [id, status]);
}

/** Dev-only escape hatch — resets the store to "never saved" so a browser's
    registry table can be rebuilt. No-op in production builds. */
export async function resetRegistry(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await ensureSchema();
  await getPool().query("TRUNCATE squads, divisions, agencies, sectors");
}
