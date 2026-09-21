/* The government departments registry — the 4-tier tree the /admin/departments
   console owns and every other operational surface reads:

     Tier 1  CoreSector         Power, Waste, Water, Emergency, Traffic, Municipal
     Tier 2  RegionalAgency     GEPCO, SWMC, MCS, Cantt Board, …
     Tier 3  DistrictOperation  the agency's desk inside one district
     Tier 4  FieldSquad         the crew that actually goes out

   This module is only the SEED. Once an admin saves, the live copy lives in
   data/departments.db behind /api/departments; the seed backs first paint and
   an empty store. */

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

/* ------------------------------ Seed helpers ------------------------------ */

/** Standby bodies are registered but not yet wired for citizen intake — they
    carry no desks and no crews until a district division is configured. */
function standby(
  id: string,
  code: string,
  fullName: string,
  province: string,
  headquarters: string,
  districts: string[]
): RegionalAgency {
  return {
    id,
    code,
    fullName,
    headquarters,
    descriptor: `Covering ${districts.join(", ")}`,
    province,
    jurisdictionDistricts: districts,
    status: "standby",
    reportsEnabled: false,
    districtOperations: [],
  };
}

/* --------------------------------- Seed ----------------------------------- */

/* Phase-1 reality: only the Sialkot desks carry real divisions and crews.
   Every other registered body sits on standby until its district division is
   configured in the console. 31 bodies across 6 sectors, 13 live. */

const POWER: RegionalAgency[] = [
  {
    id: "agency-gepco",
    code: "GEPCO",
    fullName: "Gujranwala Electric Power Company",
    headquarters: "Gujranwala",
    hqAddress: "565-A Model Town, G.T. Road, Gujranwala",
    descriptor: "Covering Sialkot, Daska, Gujranwala",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot", "Daska", "Gujranwala"],
    status: "pilot",
    controlHotline: "118",
    dispatchEmail: "dispatch@gepco.gop.pk",
    webhookUrl: "https://gepco.gop.pk/hooks/sada-e-awam",
    reportsEnabled: true,
    avgResolutionHours: 5.1,
    districtOperations: [
      {
        id: "do-gepco-sialkot",
        district: "Sialkot",
        divisionName: "Sialkot City Sub-Division",
        divisionNameUrdu: "سیالکوٹ سٹی سب ڈویژن",
        managerName: "Engr. Adnan Rasheed",
        managerDesignation: "Sub-Divisional Officer (SDO)",
        officialPhone: "052-9250801",
        officialExtension: "214",
        controlRoomHotline: "118",
        coverage: [],
        openTickets: 12,
        resolvedTickets: 148,
        totalSquadsDeployed: 3,
        squads: [
          {
            id: "sq-gepco-ht-04",
            name: "HT Line Repair Squad 04",
            leadTechnician: "Zahid Mehmood",
            phone: "+92 300 6412287",
            membersCount: 7,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "GEP-4412",
            wards: [
              "Paris Road & Commissioner Rd",
              "Civil Lines",
              "Model Town",
              "Kharkana",
            ],
            activeTickets: 3,
          },
          {
            id: "sq-gepco-pmt-09",
            name: "PMT Transformer Crew 09",
            leadTechnician: "Imran Bashir",
            phone: "+92 321 7740155",
            membersCount: 5,
            status: "on_call",
            roleClass: "skilled",
            shift: "evening",
            vehiclePlate: "GEP-2208",
            wards: ["Gohad Pur", "Muradpur", "Hunter Pura", "Shamspura"],
            activeTickets: 1,
          },
          {
            id: "sq-gepco-light-03",
            name: "Streetlight Maintenance Unit 03",
            leadTechnician: "Nadeem Akhtar",
            phone: "+92 333 4519908",
            membersCount: 4,
            status: "active",
            roleClass: "worker",
            shift: "night",
            vehiclePlate: "GEP-1173",
            wards: ["Haji Pura Pulak", "Rangpura", "Laalpura", "Bijli Mohallah"],
            activeTickets: 2,
          },
        ],
      },
      {
        id: "do-gepco-daska",
        district: "Daska",
        divisionName: "Daska Sub-Division",
        divisionNameUrdu: "ڈسکہ سب ڈویژن",
        managerName: "Engr. Faisal Nadeem",
        managerDesignation: "Sub-Divisional Officer (SDO)",
        officialPhone: "052-6614402",
        controlRoomHotline: "118",
        coverage: [],
        openTickets: 4,
        resolvedTickets: 61,
        totalSquadsDeployed: 1,
        squads: [
          {
            id: "sq-gepco-daska-01",
            name: "Daska Feeder Crew 01",
            leadTechnician: "Rizwan Ali",
            phone: "+92 301 8830471",
            membersCount: 6,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "GEP-7731",
          },
        ],
      },
    ],
  },
  {
    id: "agency-lesco",
    code: "LESCO",
    fullName: "Lahore Electric Supply Company",
    headquarters: "Lahore",
    hqAddress: "22-A Queens Road, Lahore",
    descriptor: "Covering Lahore, Kasur, Sheikhupura",
    province: "Punjab",
    jurisdictionDistricts: ["Lahore", "Kasur", "Sheikhupura"],
    status: "active",
    controlHotline: "118",
    dispatchEmail: "dispatch@lesco.gop.pk",
    reportsEnabled: true,
    avgResolutionHours: 6.4,
    districtOperations: [
      {
        id: "do-lesco-lahore",
        district: "Lahore",
        divisionName: "Lahore Central Division",
        managerName: "Engr. Kamran Shah",
        managerDesignation: "Executive Engineer (XEN)",
        officialPhone: "042-99204001",
        controlRoomHotline: "118",
        coverage: [],
        openTickets: 31,
        resolvedTickets: 402,
        totalSquadsDeployed: 1,
        squads: [
          {
            id: "sq-lesco-ht-11",
            name: "Lahore HT Response Squad 11",
            leadTechnician: "Tariq Javed",
            phone: "+92 300 4411902",
            membersCount: 8,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "LES-8890",
          },
        ],
      },
    ],
  },
  {
    id: "agency-fesco",
    code: "FESCO",
    fullName: "Faisalabad Electric Supply Company",
    headquarters: "Faisalabad",
    descriptor: "Covering Faisalabad, Jhang, Toba Tek Singh",
    province: "Punjab",
    jurisdictionDistricts: ["Faisalabad", "Jhang", "Toba Tek Singh"],
    status: "active",
    controlHotline: "118",
    reportsEnabled: true,
    avgResolutionHours: 7.2,
    districtOperations: [],
  },
  {
    id: "agency-iesco",
    code: "IESCO",
    fullName: "Islamabad Electric Supply Company",
    headquarters: "Islamabad",
    descriptor: "Covering Islamabad, Rawalpindi, Attock",
    province: "Islamabad ICT",
    jurisdictionDistricts: ["Islamabad", "Rawalpindi", "Attock"],
    status: "active",
    controlHotline: "118",
    reportsEnabled: true,
    avgResolutionHours: 5.8,
    districtOperations: [],
  },
  standby("agency-mepco", "MEPCO", "Multan Electric Power Company", "Punjab", "Multan", ["Multan", "Bahawalpur", "Vehari"]),
  standby("agency-pesco", "PESCO", "Peshawar Electric Supply Company", "KPK", "Peshawar", ["Peshawar", "Mardan", "Swat"]),
  standby("agency-hesco", "HESCO", "Hyderabad Electric Supply Company", "Sindh", "Hyderabad", ["Hyderabad", "Mirpurkhas"]),
  standby("agency-sepco", "SEPCO", "Sukkur Electric Power Company", "Sindh", "Sukkur", ["Sukkur", "Larkana"]),
  standby("agency-qesco", "QESCO", "Quetta Electric Supply Company", "Balochistan", "Quetta", ["Quetta", "Pishin"]),
  standby("agency-tesco", "TESCO", "Tribal Electric Supply Company", "KPK", "Peshawar", ["Khyber", "Kurram"]),
  standby("agency-kelectric", "K-Electric", "K-Electric Limited", "Sindh", "Karachi", ["Karachi"]),
];

const WASTE: RegionalAgency[] = [
  {
    id: "agency-swmc",
    code: "SWMC",
    fullName: "Sialkot Waste Management Company",
    headquarters: "Sialkot",
    hqAddress: "Kutchery Road, opposite District Courts, Sialkot",
    descriptor: "Covering Sialkot, Daska",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot", "Daska"],
    status: "pilot",
    controlHotline: "1139",
    dispatchEmail: "dispatch@swmc.gop.pk",
    webhookUrl: "https://swmc.gop.pk/hooks/sada-e-awam",
    reportsEnabled: true,
    avgResolutionHours: 9.5,
    districtOperations: [
      {
        id: "do-swmc-sialkot",
        district: "Sialkot",
        divisionName: "Sialkot City Sanitation Desk",
        divisionNameUrdu: "سیالکوٹ سٹی صفائی ڈیسک",
        managerName: "Sajjad Hussain",
        managerDesignation: "Operations Manager",
        officialPhone: "052-9250765",
        officialExtension: "108",
        controlRoomHotline: "1139",
        coverage: [],
        openTickets: 18,
        resolvedTickets: 233,
        totalSquadsDeployed: 3,
        squads: [
          {
            id: "sq-swmc-lift-04",
            name: "Sanitation Lift Crew 04",
            leadTechnician: "Akram Masih",
            phone: "+92 302 7711840",
            membersCount: 12,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "SWM-4091",
            wards: [
              "Tehsil Bazar",
              "Mori Gate",
              "Karim Pura",
              "Hunter Pura",
              "Miana Pura",
            ],
            activeTickets: 5,
          },
          {
            id: "sq-swmc-sweep-07",
            name: "Street Sweeping Crew 07",
            leadTechnician: "Yasir Gill",
            phone: "+92 345 6018832",
            membersCount: 15,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "SWM-2260",
            wards: ["Model Town", "Civil Lines", "Iqbal Town", "Islamia Park"],
            activeTickets: 2,
          },
          {
            id: "sq-swmc-scrap-02",
            name: "Industrial Scrap Unit 02",
            leadTechnician: "Bilal Sarwar",
            phone: "+92 311 4408126",
            membersCount: 8,
            status: "on_call",
            roleClass: "skilled",
            shift: "evening",
            vehiclePlate: "SWM-9915",
            wards: ["Small Industrial Estate", "Gohad Pur", "Shahab Pura Road"],
          },
        ],
      },
    ],
  },
  {
    id: "agency-lwmc",
    code: "LWMC",
    fullName: "Lahore Waste Management Company",
    headquarters: "Lahore",
    descriptor: "Covering Lahore",
    province: "Punjab",
    jurisdictionDistricts: ["Lahore"],
    status: "active",
    controlHotline: "1139",
    reportsEnabled: true,
    avgResolutionHours: 11.4,
    districtOperations: [
      {
        id: "do-lwmc-lahore",
        district: "Lahore",
        divisionName: "Lahore Metropolitan Sanitation Desk",
        managerName: "Rana Shahid",
        managerDesignation: "Zonal Manager",
        officialPhone: "042-99333100",
        controlRoomHotline: "1139",
        coverage: [],
        openTickets: 54,
        resolvedTickets: 812,
        totalSquadsDeployed: 1,
        squads: [
          {
            id: "sq-lwmc-lift-21",
            name: "Lahore Lift Crew 21",
            leadTechnician: "Arshad Boota",
            phone: "+92 300 8452210",
            membersCount: 18,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "LWM-1120",
          },
        ],
      },
    ],
  },
  {
    id: "agency-rwmc",
    code: "RWMC",
    fullName: "Rawalpindi Waste Management Company",
    headquarters: "Rawalpindi",
    descriptor: "Covering Rawalpindi",
    province: "Punjab",
    jurisdictionDistricts: ["Rawalpindi"],
    status: "active",
    controlHotline: "1139",
    reportsEnabled: true,
    avgResolutionHours: 12.8,
    districtOperations: [],
  },
  standby("agency-fwmc", "FWMC", "Faisalabad Waste Management Company", "Punjab", "Faisalabad", ["Faisalabad"]),
  standby("agency-mwmc", "MWMC", "Multan Waste Management Company", "Punjab", "Multan", ["Multan"]),
  standby("agency-gwmc", "GWMC", "Gujranwala Waste Management Company", "Punjab", "Gujranwala", ["Gujranwala"]),
];

const WATER: RegionalAgency[] = [
  {
    id: "agency-wasa-lahore",
    code: "WASA Lahore",
    fullName: "Water & Sanitation Agency, Lahore Development Authority",
    headquarters: "Lahore",
    descriptor: "Covering Lahore",
    province: "Punjab",
    jurisdictionDistricts: ["Lahore"],
    status: "active",
    controlHotline: "1334",
    reportsEnabled: true,
    avgResolutionHours: 15.2,
    districtOperations: [
      {
        id: "do-wasa-lahore",
        district: "Lahore",
        divisionName: "Lahore Water & Sewerage Division",
        managerName: "Engr. Hassan Raza",
        managerDesignation: "Executive Engineer (XEN)",
        officialPhone: "042-99232301",
        controlRoomHotline: "1334",
        coverage: [],
        openTickets: 27,
        resolvedTickets: 389,
        totalSquadsDeployed: 1,
        squads: [
          {
            id: "sq-wasa-lhr-05",
            name: "Lahore Pipeline Crew 05",
            leadTechnician: "Ghulam Abbas",
            phone: "+92 321 4490017",
            membersCount: 9,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "WSA-3340",
          },
        ],
      },
    ],
  },
  {
    id: "agency-wasa-rawalpindi",
    code: "WASA Rawalpindi",
    fullName: "Water & Sanitation Agency, Rawalpindi Development Authority",
    headquarters: "Rawalpindi",
    descriptor: "Covering Rawalpindi",
    province: "Punjab",
    jurisdictionDistricts: ["Rawalpindi"],
    status: "active",
    controlHotline: "1334",
    reportsEnabled: true,
    avgResolutionHours: 17.6,
    districtOperations: [],
  },
  standby("agency-wasa-faisalabad", "WASA Faisalabad", "Water & Sanitation Agency, Faisalabad Development Authority", "Punjab", "Faisalabad", ["Faisalabad"]),
  standby("agency-wasa-multan", "WASA Multan", "Water & Sanitation Agency, Multan Development Authority", "Punjab", "Multan", ["Multan"]),
  standby("agency-wasa-gujranwala", "WASA Gujranwala", "Water & Sanitation Agency, Gujranwala Development Authority", "Punjab", "Gujranwala", ["Gujranwala"]),
];

const EMERGENCY: RegionalAgency[] = [
  {
    id: "agency-rescue-1122",
    code: "Rescue 1122",
    fullName: "Punjab Emergency Service — Sialkot District",
    headquarters: "Sialkot",
    hqAddress: "Rescue 1122 District Station, Defence Road, Sialkot",
    descriptor: "Covering Sialkot, Daska",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot", "Daska"],
    status: "pilot",
    controlHotline: "1122",
    dispatchEmail: "sialkot@rescue.gop.pk",
    reportsEnabled: true,
    avgResolutionHours: 0.6,
    districtOperations: [
      {
        id: "do-rescue-sialkot",
        district: "Sialkot",
        divisionName: "Sialkot District Emergency Station",
        divisionNameUrdu: "سیالکوٹ ضلعی ایمرجنسی اسٹیشن",
        managerName: "Dr. Hammad Yousaf",
        managerDesignation: "Station Officer",
        officialPhone: "052-9250122",
        controlRoomHotline: "1122",
        coverage: [],
        openTickets: 3,
        resolvedTickets: 511,
        totalSquadsDeployed: 2,
        squads: [
          {
            id: "sq-rescue-hazard-01",
            name: "Health Hazard Response Unit 01",
            leadTechnician: "Usama Tariq",
            phone: "+92 300 7712204",
            membersCount: 6,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "RES-1122",
            activeTickets: 1,
          },
          {
            id: "sq-rescue-fog-02",
            name: "Dengue Fogging Team 02",
            leadTechnician: "Salman Ashraf",
            phone: "+92 333 9014476",
            membersCount: 5,
            status: "on_call",
            roleClass: "worker",
            shift: "evening",
            vehiclePlate: "RES-4408",
          },
        ],
      },
    ],
  },
  standby("agency-civil-defence", "Civil Defence Punjab", "Directorate of Civil Defence, Punjab", "Punjab", "Lahore", ["Lahore", "Sialkot"]),
  standby("agency-vector-control", "Vector Control", "Punjab Health Department — Vector Control Wing", "Punjab", "Lahore", ["Lahore", "Sialkot", "Rawalpindi"]),
];

const TRAFFIC: RegionalAgency[] = [
  {
    id: "agency-ctp-sialkot",
    code: "CTP Sialkot",
    fullName: "City Traffic Police Sialkot",
    headquarters: "Sialkot",
    hqAddress: "Traffic Headquarters, Khadim Ali Road, Sialkot",
    descriptor: "Covering Sialkot",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot"],
    status: "pilot",
    controlHotline: "15",
    dispatchEmail: "ctp.sialkot@punjabpolice.gov.pk",
    reportsEnabled: true,
    avgResolutionHours: 2.4,
    districtOperations: [
      {
        id: "do-ctp-sialkot",
        district: "Sialkot",
        divisionName: "Sialkot City Traffic Sector",
        divisionNameUrdu: "سیالکوٹ سٹی ٹریفک سیکٹر",
        managerName: "DSP Waqar Cheema",
        managerDesignation: "Sector Incharge",
        officialPhone: "052-9250444",
        officialExtension: "31",
        controlRoomHotline: "15",
        coverage: [],
        openTickets: 9,
        resolvedTickets: 176,
        totalSquadsDeployed: 2,
        squads: [
          {
            id: "sq-ctp-signal-01",
            name: "Signal Maintenance Unit 01",
            leadTechnician: "Shoaib Anwar",
            phone: "+92 345 8801193",
            membersCount: 4,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "CTP-0177",
            wards: ["Paris Road & Commissioner Rd", "Tehsil Bazar", "Mori Gate"],
            activeTickets: 2,
          },
          {
            id: "sq-ctp-encroach-03",
            name: "Encroachment Clearance Patrol 03",
            leadTechnician: "Inspector Adeel Butt",
            phone: "+92 300 6640881",
            membersCount: 10,
            status: "on_call",
            roleClass: "worker",
            shift: "evening",
            vehiclePlate: "CTP-0233",
            wards: ["Kashmiri Mohallah", "Rangpura", "Haji Pura Pulak"],
          },
        ],
      },
    ],
  },
  standby("agency-ctp-lahore", "CTP Lahore", "City Traffic Police Lahore", "Punjab", "Lahore", ["Lahore"]),
  standby("agency-ctp-islamabad", "CTP Islamabad", "Islamabad Traffic Police", "Islamabad ICT", "Islamabad", ["Islamabad"]),
];

const MUNICIPAL: RegionalAgency[] = [
  {
    id: "agency-mcs",
    code: "MCS",
    fullName: "Municipal Corporation Sialkot",
    headquarters: "Sialkot",
    hqAddress: "Municipal Corporation Building, Kutchery Road, Sialkot",
    descriptor: "Covering Sialkot, Daska",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot", "Daska"],
    status: "pilot",
    controlHotline: "1139",
    dispatchEmail: "dispatch@mcs.gop.pk",
    webhookUrl: "https://mcs.gop.pk/hooks/sada-e-awam",
    reportsEnabled: true,
    avgResolutionHours: 22.5,
    districtOperations: [
      {
        id: "do-mcs-sialkot-city",
        district: "Sialkot",
        divisionName: "Sialkot City Sub-Division",
        divisionNameUrdu: "سیالکوٹ سٹی سب ڈویژن",
        managerName: "Engr. Naveed Anjum",
        managerDesignation: "Executive Engineer (XEN)",
        officialPhone: "052-9250311",
        officialExtension: "142",
        controlRoomHotline: "1139",
        coverage: [],
        openTickets: 26,
        resolvedTickets: 318,
        totalSquadsDeployed: 4,
        squads: [
          {
            id: "sq-mcs-drain-02",
            name: "Drainage Jetting Unit 02",
            leadTechnician: "Munir Ahmed",
            phone: "+92 300 8814402",
            membersCount: 8,
            status: "active",
            roleClass: "skilled",
            shift: "morning",
            vehiclePlate: "MCS-2214",
            wards: [
              "Mori Gate",
              "Tehsil Bazar",
              "Karim Pura",
              "Muhammad Pura",
              "Neka Pura",
            ],
            activeTickets: 6,
          },
          {
            id: "sq-mcs-pipe-07",
            name: "Pipeline Repair Crew 07",
            leadTechnician: "Ashfaq Warraich",
            phone: "+92 321 6690714",
            membersCount: 7,
            status: "active",
            roleClass: "skilled",
            shift: "evening",
            vehiclePlate: "MCS-3309",
            wards: [
              "Paris Road & Commissioner Rd",
              "Civil Lines",
              "Model Town",
              "Iqbal Town",
            ],
            activeTickets: 3,
          },
          {
            id: "sq-mcs-road-05",
            name: "Road Patching Unit 05",
            leadTechnician: "Riaz Sandhu",
            phone: "+92 333 4471229",
            membersCount: 10,
            status: "on_call",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "MCS-5540",
            wards: [
              "Gohad Pur",
              "Small Industrial Estate",
              "Shamspura",
              "Muradpur",
            ],
          },
          {
            id: "sq-mcs-night-11",
            name: "Night Emergency Works Crew 11",
            leadTechnician: "Jameel Sabir",
            phone: "+92 345 7702118",
            membersCount: 6,
            status: "off_duty",
            roleClass: "worker",
            shift: "night",
            vehiclePlate: "MCS-8817",
          },
        ],
      },
      {
        id: "do-mcs-sialkot-villages",
        district: "Sialkot",
        divisionName: "Kotli Sub-Division (Villages)",
        divisionNameUrdu: "کوٹلی سب ڈویژن",
        managerName: "Sajid Mehmood Bhatti",
        managerDesignation: "Sub-Divisional Officer (SDO)",
        officialPhone: "052-9250318",
        controlRoomHotline: "1139",
        coverage: [],
        openTickets: 11,
        resolvedTickets: 94,
        totalSquadsDeployed: 1,
        squads: [
          {
            id: "sq-mcs-rural-03",
            name: "Rural Works Crew 03",
            leadTechnician: "Abdul Rauf",
            phone: "+92 302 5518840",
            membersCount: 9,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "MCS-6621",
            wards: [
              "Kotli Loharan",
              "Kotli Loharan East",
              "Marakiwal",
              "Sahowali",
              "Kharota Syedan",
            ],
            activeTickets: 2,
          },
        ],
      },
    ],
  },
  {
    id: "agency-cb-sialkot",
    code: "CB Sialkot",
    fullName: "Sialkot Cantonment Board",
    headquarters: "Sialkot",
    hqAddress: "Cantonment Board Office, Saddar Bazaar, Sialkot Cantt",
    descriptor: "Covering Sialkot Cantonment",
    province: "Punjab",
    jurisdictionDistricts: ["Sialkot"],
    status: "pilot",
    controlHotline: "052-4265001",
    dispatchEmail: "cbsialkot@mlc.gov.pk",
    reportsEnabled: true,
    avgResolutionHours: 20.1,
    districtOperations: [
      {
        id: "do-cb-sialkot-cantt",
        district: "Sialkot",
        divisionName: "Cantt Sub-Division",
        divisionNameUrdu: "کینٹ سب ڈویژن",
        managerName: "Maj. (R) Tanveer Ahmad",
        managerDesignation: "Municipal Officer",
        officialPhone: "052-4265001",
        officialExtension: "17",
        controlRoomHotline: "052-4265009",
        coverage: [],
        openTickets: 7,
        resolvedTickets: 132,
        totalSquadsDeployed: 2,
        squads: [
          {
            id: "sq-cb-works-01",
            name: "Cantt Municipal Works Crew 01",
            leadTechnician: "Shahzad Iqbal",
            phone: "+92 321 6110042",
            membersCount: 8,
            status: "active",
            roleClass: "worker",
            shift: "morning",
            vehiclePlate: "CB-1104",
            wards: ["Askari-I", "Askari-II", "Cantt Model Villas", "Lane 2", "Lane 6"],
            activeTickets: 2,
          },
          {
            id: "sq-cb-sewer-02",
            name: "Cantt Sewer Jetting Crew 02",
            leadTechnician: "Ijaz Hussain",
            phone: "+92 300 9940128",
            membersCount: 6,
            status: "on_call",
            roleClass: "skilled",
            shift: "evening",
            vehiclePlate: "CB-2207",
            wards: ["Cantt View Colony", "Staff Colony ATC"],
          },
        ],
      },
    ],
  },
  standby("agency-mcl", "MCL", "Metropolitan Corporation Lahore", "Punjab", "Lahore", ["Lahore"]),
];

export const DEPARTMENT_SECTORS: CoreSector[] = [
  {
    id: "power",
    slug: "power",
    name: "Power & Electricity",
    nameUrdu: "بجلی و توانائی",
    icon: "Zap",
    unit: "DISCOs",
    agencies: POWER,
  },
  {
    id: "waste",
    slug: "waste",
    name: "Solid Waste Management",
    nameUrdu: "ٹھوس فضلہ",
    icon: "Trash2",
    unit: "WMCs",
    agencies: WASTE,
  },
  {
    id: "water",
    slug: "water",
    name: "Water & Sewerage",
    nameUrdu: "پانی و سیوریج",
    icon: "Droplets",
    unit: "WASAs",
    agencies: WATER,
  },
  {
    id: "emergency",
    slug: "emergency",
    name: "Emergency Services",
    nameUrdu: "ہنگامی خدمات",
    icon: "Siren",
    unit: "Agencies",
    agencies: EMERGENCY,
  },
  {
    id: "traffic",
    slug: "traffic",
    name: "Traffic Police",
    nameUrdu: "ٹریفک پولیس",
    icon: "ShieldAlert",
    unit: "CTPs",
    agencies: TRAFFIC,
  },
  {
    id: "municipal",
    slug: "municipal",
    name: "Municipal Works",
    nameUrdu: "بلدیاتی امور",
    icon: "Landmark",
    unit: "Councils",
    agencies: MUNICIPAL,
  },
];

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
  sectors: CoreSector[] = DEPARTMENT_SECTORS
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
  sectors: CoreSector[] = DEPARTMENT_SECTORS
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
  sectors: CoreSector[] = DEPARTMENT_SECTORS
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
  sectors: CoreSector[] = DEPARTMENT_SECTORS
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
