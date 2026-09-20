import type { IncidentReport } from "@/types/civic";

/* Citizen ledger derivation. There is no dedicated citizens table — a citizen
   is the named/phone-identified submitter behind one or more rows of the real
   reports ledger. Profiles are aggregated server-side from `/api/reports`
   rows plus the admin governance state (citizen_admin table). Client-safe:
   no node:sqlite imports here. */

export type CitizenStanding = "active" | "suspended";
export type IncidentTone = "emerald" | "amber" | "rose" | "sky";

export interface CitizenIncident {
  ref: string;
  /** Tracking token without the "#", for /track?id= deep links. */
  token: string;
  title: string;
  area: string;
  status: string;
  tone: IncidentTone;
  award: string;
  upvotes: number;
  createdAt: string;
}

export interface CitizenProfile {
  /** Stable grouping key — normalized phone digits or name fallback. */
  key: string;
  /** Display id, e.g. "#CIT-4821" — hashed from the key. */
  id: string;
  name: string;
  initials: string;
  tint: string;
  district: string;
  area: string;
  uc: string;
  phone: string;
  badgeOverride: boolean;
  scoreModifier: number;
  standing: CitizenStanding;
  blacklisted: boolean;
  reported: number;
  resolved: number;
  disputed: number;
  /** Percent of this citizen's reports that reached `resolved`. */
  accuracy: number;
  upvotes: number;
  /** Derived civic score: +20 per resolved, −15 per disputed, + admin modifier. */
  score: number;
  memberSince: string;
  lastActive: string;
  incidents: CitizenIncident[];
}

export interface CitizenAdminState {
  badgeOverride: boolean;
  scoreModifier: number;
  standing: CitizenStanding;
  blacklisted: boolean;
}

export const DEFAULT_ADMIN_STATE: CitizenAdminState = {
  badgeOverride: false,
  scoreModifier: 0,
  standing: "active",
  blacklisted: false,
};

const STATUS_PRESENTATION: Record<
  string,
  { label: string; tone: IncidentTone; award: string }
> = {
  triage: { label: "In Triage", tone: "amber", award: "Pending" },
  dispatched: { label: "Dispatched", tone: "sky", award: "Pending" },
  in_progress: { label: "In Progress", tone: "sky", award: "Pending" },
  resolved: { label: "Resolved", tone: "emerald", award: "+20 Civic Score awarded" },
  disputed: { label: "Disputed", tone: "rose", award: "−15 Civic Score" },
};

/** Drawer stays light — the timeline shows the citizen's most recent tickets. */
const INCIDENT_CAP = 5;

const AVATAR_TINTS = [
  "bg-emerald-700",
  "bg-cyan-700",
  "bg-sky-700",
  "bg-violet-700",
  "bg-teal-700",
  "bg-amber-600",
  "bg-slate-500",
];

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase() || "?";

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Group ledger rows into per-citizen buckets. A citizen is identified by
    normalized phone digits; submissions without a phone fall back to the
    submitted name, and fully anonymous rows share one bucket. */
export function deriveCitizenProfiles(
  reports: IncidentReport[],
  adminStates: Map<string, CitizenAdminState>,
): CitizenProfile[] {
  interface Bucket {
    reports: IncidentReport[];
  }
  const buckets = new Map<string, Bucket>();

  for (const report of reports) {
    const digits = report.citizen_phone.replace(/\D/g, "");
    const key = digits
      ? `tel:${digits}`
      : `name:${report.citizen_name.trim().toLowerCase() || "anonymous"}`;
    const bucket = buckets.get(key) ?? { reports: [] };
    bucket.reports.push(report);
    buckets.set(key, bucket);
  }

  const profiles: CitizenProfile[] = [];
  for (const [key, bucket] of buckets) {
    const rows = [...bucket.reports].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );

    const admin = adminStates.get(key) ?? DEFAULT_ADMIN_STATE;

    // District = most frequent city among the citizen's reports (tie → latest).
    const cityCounts = new Map<string, number>();
    rows.forEach((r) =>
      cityCounts.set(r.city_name, (cityCounts.get(r.city_name) ?? 0) + 1),
    );
    const district =
      [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";

    // Latest non-empty values win for contact/location fields.
    const latest = rows[0];
    const phone = rows.find((r) => r.citizen_phone.trim() !== "")?.citizen_phone ?? "";
    const area = rows.find((r) => r.area_name.trim() !== "")?.area_name ?? "—";
    const uc = rows.find((r) => (r.uc_number ?? "").trim() !== "")?.uc_number ?? "—";
    const name = rows.find((r) => r.citizen_name.trim() !== "")?.citizen_name ?? "Anonymous";

    const reported = rows.length;
    const resolved = rows.filter((r) => r.status === "resolved").length;
    const disputed = rows.filter((r) => r.status === "disputed").length;
    const upvotes = rows.reduce((sum, r) => sum + r.upvotes, 0);
    const score = resolved * 20 - disputed * 15 + admin.scoreModifier;

    const incidents: CitizenIncident[] = rows.slice(0, INCIDENT_CAP).map((r) => {
      const presentation = STATUS_PRESENTATION[r.status] ?? STATUS_PRESENTATION.triage;
      return {
        ref: r.id,
        token: r.tracking_token,
        title: truncate(r.description.trim() || r.category_title, 110),
        area: r.area_name,
        status: presentation.label,
        tone: presentation.tone,
        award: presentation.award,
        upvotes: r.upvotes,
        createdAt: r.created_at,
      };
    });

    profiles.push({
      key,
      id: `#CIT-${1000 + (fnv1a(key) % 9000)}`,
      name,
      initials: initialsOf(name),
      tint: AVATAR_TINTS[fnv1a(key) % AVATAR_TINTS.length],
      district,
      area,
      uc,
      phone,
      badgeOverride: admin.badgeOverride,
      scoreModifier: admin.scoreModifier,
      standing: admin.standing,
      blacklisted: admin.blacklisted,
      reported,
      resolved,
      disputed,
      accuracy: reported > 0 ? Math.round((resolved / reported) * 100) : 0,
      upvotes,
      score,
      memberSince: rows[rows.length - 1].created_at,
      lastActive: latest.created_at,
      incidents,
    });
  }

  return profiles.sort((a, b) => b.reported - a.reported);
}
