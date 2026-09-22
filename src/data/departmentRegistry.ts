/* The government departments registry — the 4-tier tree the /admin/departments
   console owns and every other operational surface reads:

     Tier 1  CoreSector         Power, Waste, Water, Emergency, Traffic, Municipal
     Tier 2  RegionalAgency     GEPCO, SWMC, MCS, Cantt Board, …
     Tier 3  DistrictOperation  the agency's desk inside one district
     Tier 4  FieldSquad         the crew that actually goes out

   This module is types, label config and pure geo roll-up helpers only — the
   live registry data lives in Neon behind /api/departments (see
   lib/registryClient + hooks/useDepartmentRegistry). */

/* --------------------------------- Enums ---------------------------------- */

export type AgencyStatus = "active" | "pilot" | "standby";

export type SquadStatus = "active" | "on_call" | "off_duty";

/** Crew skill band — drives the sector-aware workforce label on squad cards. */
export type WorkforceClass = "worker" | "skilled" | "officer";

/** Duty windows offered in the squad form; shiftLabel (lib/squadFields)
    renders the same three windows on the field console. */
export const SQUAD_SHIFTS = [
  { value: "morning", label: "Morning Shift • 06:00 – 14:00" },
  { value: "evening", label: "Evening Shift • 14:00 – 22:00" },
  { value: "night", label: "Night Emergency Shift" },
] as const;

export type SquadShift = (typeof SQUAD_SHIFTS)[number]["value"];

/** Regions an agency can be registered under. Territories spells Islamabad
    out in full; the registry abbreviates it (see TERRITORY_PROVINCE_KEYS). */
export const PROVINCE_OPTIONS = [
  "Punjab",
  "Sindh",
  "KPK",
  "Balochistan",
  "Islamabad ICT",
];

/** Nodal-officer titles offered for a district division. The sector's own
    officer title from SECTOR_WORKFORCE is prepended at the form. */
export const MANAGER_DESIGNATIONS = [
  "Executive Engineer (XEN)",
  "Sub-Divisional Officer (SDO)",
  "Assistant Engineer (AEN)",
  "Operations Manager",
  "Zonal Manager",
  "Assistant Commissioner",
  "Chief Officer",
];

/** Sector-aware naming for a squad's workforce band — one dictionary so the
    roster CSV, the squad card pill and the squad form all read identically. */
export const SECTOR_WORKFORCE: Record<string, Record<WorkforceClass, string>> = {
  power: {
    worker: "Linemen",
    skilled: "HT Technicians",
    officer: "Line Superintendent",
  },
  waste: {
    worker: "Sanitary Workers",
    skilled: "Machine Operators",
    officer: "Sanitary Inspector",
  },
  water: {
    worker: "Pipeline Workers",
    skilled: "Pump & Valve Operators",
    officer: "Sub-Engineer (Water)",
  },
  emergency: {
    worker: "Rescuers",
    skilled: "Paramedics",
    officer: "Station Officer",
  },
  traffic: {
    worker: "Traffic Wardens",
    skilled: "Signal Technicians",
    officer: "Sector Incharge",
  },
  municipal: {
    worker: "Field Workers",
    skilled: "Works Technicians",
    officer: "Municipal Officer",
  },
};

/* -------------------------------- Entities -------------------------------- */

/** Tier 4 — the crew on the ground. `wards` is the crew's serving area list;
    empty/absent means district-wide. */
export interface FieldSquad {
  id: string;
  name: string;
  leadTechnician: string;
  phone: string;
  membersCount: number;
  status: SquadStatus;
  roleClass?: WorkforceClass;
  shift?: SquadShift;
  vehiclePlate?: string;
  /** Localities this crew owns — matched against IncidentReport.area_name. */
  wards?: string[];
  /** Open workload; folded from the live ledger for display. */
  activeTickets?: number;
}

/** Tier 3 — one agency's operational desk inside one district. */
export interface DistrictOperation {
  id: string;
  district: string;
  divisionName: string;
  divisionNameUrdu?: string;
  managerName: string;
  managerDesignation: string;
  officialPhone: string;
  officialExtension?: string;
  controlRoomHotline: string;
  /** Legacy ward scoping — empty means the desk serves the whole district. */
  coverage: string[];
  openTickets: number;
  resolvedTickets: number;
  totalSquadsDeployed: number;
  squads: FieldSquad[];
}

/** Tier 2 — a registered public body (DISCO, WMC, corporation, board). */
export interface RegionalAgency {
  id: string;
  /** Acronym used for ticket routing, e.g. "GEPCO", "MCS", "CB Sialkot". */
  code: string;
  fullName: string;
  headquarters: string;
  hqAddress?: string;
  /** One-line coverage summary rendered under the agency banner. */
  descriptor: string;
  province: string;
  jurisdictionDistricts: string[];
  status: AgencyStatus;
  controlHotline?: string;
  dispatchEmail?: string;
  webhookUrl?: string;
  /** false pauses citizen complaint intake for this body. */
  reportsEnabled?: boolean;
  /** Dispatches temporarily paused (planned works, system upgrade). */
  maintenance?: boolean;
  /** Turnaround telemetry measured against the sector's SLA budget. */
  avgResolutionHours?: number;
  /** Ledger roll-ups folded in for display — never persisted. */
  liveOpen?: number;
  liveResolved?: number;
  districtOperations: DistrictOperation[];
}

/** Tier 1 — the service sector grouping a family of agencies. */
export interface CoreSector {
  id: string;
  /** Same value as `id`; the accent/SLA dictionaries key off it. */
  slug: string;
  name: string;
  nameUrdu: string;
  /** SECTOR_ICONS key, e.g. "Zap". */
  icon: string;
  /** Body-type noun for the count pill, e.g. "DISCOs". */
  unit?: string;
  agencies: RegionalAgency[];
}


/* ------------------------------ Geo roll-ups ------------------------------ */
/* Territory surfaces ask the registry geographic questions ("which desks work
   here?"). These four helpers are the single answer — the province focus deck,
   the district governance deck and the province cards all read them, so the
   numbers can never disagree between surfaces. */

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** An agency seen from a territory, carrying its sector for chip grouping. */
export interface AgencyPresence {
  id: string;
  code: string;
  fullName: string;
  province: string;
  /** Parent sector display name, e.g. "Power & Electricity". */
  sector: string;
  /** Parent sector's SECTOR_ICONS key. */
  sectorIcon: string;
  /** Districts of the queried territory this body is registered in. */
  districts: string[];
}

/** An agency's desk inside one district, with the crews attached to it. */
export interface DistrictServiceDepartment extends AgencyPresence {
  divisionName: string;
  squads: FieldSquad[];
}

/** A deployed crew flattened out of the tree, with its parent identifiers. */
export interface DeployedSquad {
  id: string;
  name: string;
  agencyCode: string;
  district: string;
  divisionName: string;
  members: number;
  shift?: SquadShift;
  status: SquadStatus;
}

/** Every body registered in a province — whether or not it has a desk yet.
    `districtNames` scopes the lookup to the province's rostered districts, so
    a body registered province-wide still counts. */
export function agenciesOperatingIn(
  provinceName: string,
  districtNames: string[],
  sectors: CoreSector[]
): AgencyPresence[] {
  const out: AgencyPresence[] = [];
  for (const sector of sectors) {
    for (const agency of sector.agencies) {
      const districts = agency.jurisdictionDistricts.filter((d) =>
        districtNames.some((name) => sameName(name, d))
      );
      if (districts.length === 0 && !sameName(agency.province, provinceName)) {
        continue;
      }
      out.push({
        id: agency.id,
        code: agency.code,
        fullName: agency.fullName,
        province: agency.province,
        sector: sector.name,
        sectorIcon: sector.icon,
        districts,
      });
    }
  }
  return out;
}

/** Only the bodies that have an operational desk configured in one of the
    given districts — registry truth for "how many departments work here". */
export function departmentsWithDesks(
  districtNames: string[],
  sectors: CoreSector[]
): RegionalAgency[] {
  return sectors
    .flatMap((sector) => sector.agencies)
    .filter((agency) =>
      agency.districtOperations.some((op) =>
        districtNames.some((name) => sameName(name, op.district))
      )
    );
}

/** Desks servicing ONE district, one entry per agency division. */
export function districtServiceDepartments(
  districtName: string,
  sectors: CoreSector[]
): DistrictServiceDepartment[] {
  const out: DistrictServiceDepartment[] = [];
  for (const sector of sectors) {
    for (const agency of sector.agencies) {
      const ops = agency.districtOperations.filter((op) =>
        sameName(op.district, districtName)
      );
      if (ops.length === 0) continue;
      out.push({
        id: agency.id,
        code: agency.code,
        fullName: agency.fullName,
        province: agency.province,
        sector: sector.name,
        sectorIcon: sector.icon,
        districts: [districtName],
        divisionName: ops.map((op) => op.divisionName).join(" · "),
        squads: ops.flatMap((op) => op.squads),
      });
    }
  }
  return out;
}

/** Crews actually deployed across the given districts — off-duty excluded,
    because the territory decks count boots on the ground, not the roster. */
export function squadsOnGround(
  districtNames: string[],
  sectors: CoreSector[]
): DeployedSquad[] {
  const out: DeployedSquad[] = [];
  for (const sector of sectors) {
    for (const agency of sector.agencies) {
      for (const op of agency.districtOperations) {
        if (!districtNames.some((name) => sameName(name, op.district))) continue;
        for (const squad of op.squads) {
          if (squad.status === "off_duty") continue;
          out.push({
            id: squad.id,
            name: squad.name,
            agencyCode: agency.code,
            district: op.district,
            divisionName: op.divisionName,
            members: squad.membersCount,
            shift: squad.shift,
            status: squad.status,
          });
        }
      }
    }
  }
  return out;
}
