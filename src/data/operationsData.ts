/* Operational surfaces' shared vocabulary: the Command Radar incident row
   shape and the abuse-review evidence union.

   The radar/sentinel types here are contracts, not fixtures — TriageView and
   SentinelView render live ledger rows mapped into RadarIncident
   (lib/liveReports) and flags produced by the abuse-detection pass. */

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
