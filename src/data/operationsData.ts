/* Operational surfaces' shared vocabulary: the municipal field portal's
   demo queues, the Command Radar incident row shape, and the abuse-review
   evidence union.

   The radar/sentinel types here are contracts, not fixtures — TriageView and
   SentinelView render live ledger rows mapped into RadarIncident
   (lib/liveReports) and flags produced by the abuse-detection pass. */

/* ------------------------- Municipal field portal ------------------------- */

export type PortalDeptKey = "mcs" | "swmc" | "gepco" | "ctp" | "cantt";

export interface PortalDept {
  key: PortalDeptKey;
  name: string;
  /** Desk the signed-in operator belongs to, shown beside the title. */
  division: string;
}

export const PORTAL_DEPTS: PortalDept[] = [
  { key: "mcs", name: "MCS", division: "Sialkot City Sub-Division" },
  { key: "swmc", name: "SWMC", division: "Sialkot City Sanitation Desk" },
  { key: "gepco", name: "GEPCO", division: "Sialkot City Sub-Division" },
  { key: "ctp", name: "CTP Sialkot", division: "Sialkot City Traffic Sector" },
  { key: "cantt", name: "Cantt Board", division: "Cantt Sub-Division" },
];

/** Zone filter chips — "All Zones" is the default, the rest mirror the
    Sialkot town clusters in the coverage tree. */
export const PORTAL_ZONES = [
  "All Zones",
  "City",
  "Cantonment",
  "Haji Pura",
  "Rangpura",
  "Villages",
];

/** Crews a dispatcher can hand a ticket to from the portal's assign modal. */
export const CREW_OPTIONS = [
  "Drainage Jetting Unit 02",
  "Sanitation Lift Crew 04",
  "HT Line Repair Squad 04",
  "Pipeline Repair Crew 07",
  "Road Patching Unit 05",
  "Signal Maintenance Unit 01",
  "Streetlight Maintenance Unit 03",
];

export type QueuePriority = "emergency" | "high" | "routine";

export interface QueueItem {
  /** Ticket reference, e.g. "SKT-1042". */
  id: string;
  title: string;
  /** One of PORTAL_ZONES (never "All Zones"). */
  zone: string;
  /** Locality / union-council anchor under the zone. */
  uc: string;
  priority: QueuePriority;
  upvotes: number;
  elapsedHours: number;
  /** Assigned crew name, or undefined while the ticket is unassigned. */
  crew?: string;
}

export const PORTAL_QUEUE: Record<PortalDeptKey, QueueItem[]> = {
  mcs: [
    {
      id: "SKT-1042",
      title: "Open manhole outside Allama Iqbal Library",
      zone: "City",
      uc: "Paris Road & Commissioner Rd",
      priority: "emergency",
      upvotes: 128,
      elapsedHours: 7,
    },
    {
      id: "SKT-1038",
      title: "Burst supply line flooding the service lane",
      zone: "City",
      uc: "Model Town",
      priority: "high",
      upvotes: 64,
      elapsedHours: 11,
      crew: "Pipeline Repair Crew 07",
    },
    {
      id: "SKT-1031",
      title: "Collapsed drain slab near the girls' school gate",
      zone: "Haji Pura",
      uc: "Haji Pura Pulak",
      priority: "high",
      upvotes: 41,
      elapsedHours: 19,
    },
    {
      id: "SKT-1016",
      title: "Deep crater on the link road to Kotli Loharan",
      zone: "Villages",
      uc: "Kotli Loharan",
      priority: "routine",
      upvotes: 22,
      elapsedHours: 46,
      crew: "Road Patching Unit 05",
    },
  ],
  swmc: [
    {
      id: "SKT-1049",
      title: "Leather factory scrap dumped on the nullah bank",
      zone: "City",
      uc: "Small Industrial Estate",
      priority: "high",
      upvotes: 87,
      elapsedHours: 9,
    },
    {
      id: "SKT-1044",
      title: "Overflowing dumpster opposite the vegetable market",
      zone: "City",
      uc: "Tehsil Bazar",
      priority: "high",
      upvotes: 53,
      elapsedHours: 5,
      crew: "Sanitation Lift Crew 04",
    },
    {
      id: "SKT-1027",
      title: "Street sweeping skipped for four consecutive days",
      zone: "Rangpura",
      uc: "Laalpura",
      priority: "routine",
      upvotes: 18,
      elapsedHours: 52,
    },
  ],
  gepco: [
    {
      id: "SKT-1051",
      title: "Hanging 11kV wire over the bus stop shelter",
      zone: "City",
      uc: "Kharkana",
      priority: "emergency",
      upvotes: 164,
      elapsedHours: 4,
    },
    {
      id: "SKT-1047",
      title: "Sparking PMT transformer beside the bakery",
      zone: "City",
      uc: "Gohad Pur",
      priority: "emergency",
      upvotes: 96,
      elapsedHours: 8,
      crew: "HT Line Repair Squad 04",
    },
    {
      id: "SKT-1034",
      title: "Whole lane dark — streetlight feeder tripped",
      zone: "Haji Pura",
      uc: "Muslim Colony",
      priority: "routine",
      upvotes: 29,
      elapsedHours: 31,
      crew: "Streetlight Maintenance Unit 03",
    },
  ],
  ctp: [
    {
      id: "SKT-1053",
      title: "Signal dead at the Khadim Ali Road chowk",
      zone: "City",
      uc: "Paris Road & Commissioner Rd",
      priority: "emergency",
      upvotes: 112,
      elapsedHours: 3,
      crew: "Signal Maintenance Unit 01",
    },
    {
      id: "SKT-1040",
      title: "Bazaar stalls choking the one-way lane at peak hours",
      zone: "City",
      uc: "Tehsil Bazar",
      priority: "high",
      upvotes: 74,
      elapsedHours: 14,
    },
    {
      id: "SKT-1022",
      title: "Dumpers parked across the Rangpura junction",
      zone: "Rangpura",
      uc: "Chari Wali Gali",
      priority: "routine",
      upvotes: 16,
      elapsedHours: 27,
    },
  ],
  cantt: [
    {
      id: "SKT-1050",
      title: "Sewer choke flooding the Saddar market footpath",
      zone: "Cantonment",
      uc: "Cantt View Colony",
      priority: "high",
      upvotes: 58,
      elapsedHours: 10,
    },
    {
      id: "SKT-1036",
      title: "Water pipe burst outside the Askari-II gate",
      zone: "Cantonment",
      uc: "Askari-II",
      priority: "high",
      upvotes: 37,
      elapsedHours: 16,
      crew: "Drainage Jetting Unit 02",
    },
    {
      id: "SKT-1019",
      title: "Broken paver footpath along Lane 6",
      zone: "Cantonment",
      uc: "Lane 6",
      priority: "routine",
      upvotes: 11,
      elapsedHours: 61,
    },
  ],
};

/* ------------------------------ Command Radar ----------------------------- */

/** "contested" is not an urgency the citizen picks — it marks a closed fix
    the neighbourhood disputed, which outranks a routine row in triage. */
export type RadarSeverity = "emergency" | "high" | "medium" | "contested";

/** Presentation tone for the status pill. TriageView widens this with
    "emerald" for resolved rows (see TriageTone in lib/liveReports). */
export type RadarTone = "amber" | "slate" | "blue" | "purple";

/** A flattened ledger row as the Command Radar and triage table render it.
    Produced by lib/liveReports.reportToIncident — never seeded. */
export interface RadarIncident {
  /** Ticket reference, e.g. "#SKT-1042". */
  id: string;
  severity: RadarSeverity;
  /** Category + jurisdiction caption under the hazard line. */
  demoTag: string;
  /** Provenance glyph key, e.g. "community". */
  demoIcon: string;
  /** Headline: category — area, district. */
  hazard: string;
  location: string;
  /** "UC #, District" anchor; the district filter parses this. */
  uc: string;
  votes: number;
  /** Humanised age, e.g. "45m", "6h", "3d". */
  elapsed: string;
  agency: string;
  /** Citizen-readable status label. */
  status: string;
  statusTone: RadarTone;
  /** Tailwind gradient stops behind the evidence photo placeholder. */
  photoTint: string;
  /** Formatted coordinates, empty when the report carries no GPS fix. */
  gps: string;
  /** Citizen narrative (voice notes are transcribed into this field). */
  voiceTranscript: string;
  tags: string[];
  /** Quick-issue pills tapped in wizard step 2. */
  quickTags?: string[];
}

/* ------------------------------ Sentinel flags ---------------------------- */

export type FlagCategory = "duplicate" | "gps" | "flood";

/** Why the abuse pass flagged a report — each variant carries exactly the
    proof its panel renders, so the drawer never has to guess. */
export type FlagEvidence =
  | {
      kind: "duplicate";
      /** Image both reports carry. */
      photo: string;
      /** "Uploaded 2 hours ago" — sinceLabel strips the prefix. */
      thisUploaded: string;
      matchedTicket: string;
      matchedUploaded: string;
      /** A third ticket reusing the same photo, when one exists. */
      alsoMatched?: string;
    }
  | {
      kind: "gps";
      /** Area the citizen selected. */
      claimed: string;
      /** Area the device actually reported from. */
      detected: string;
      /** Human distance between the two, e.g. "38 km". */
      distance: string;
    }
  | {
      kind: "flood";
      /** Burst window the reports landed in. */
      windowHours: number;
      /** Timeline dots: `zone` indexes into `zones`, `left` is a 0-100 %. */
      pins: { at: string; zone: number; left: number }[];
      zones: { name: string; count: number; dot: string }[];
    };

/** One row in the abuse-review queue. */
export interface ConsoleFlagged {
  /** Ticket reference of the flagged report. */
  id: string;
  category: FlagCategory;
  area: string;
  /** Masked reporter handle / phone. */
  reporter: string;
  evidence: FlagEvidence;
}
