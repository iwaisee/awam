/* Territory data-portability engine for the Coverage & Territories panel.
   Exports the active district's zone → locality hierarchy as either an
   Excel-safe CSV (UTF-8 BOM so Urdu renders correctly) or a full relational
   JSON backup, and parses both formats back into mergeable zone trees so an
   exported file round-trips through Import without loss. */

import {
  JURISDICTION_TYPES,
  type AreaItem,
  type JurisdictionType,
} from "@/types/civic";

export const EXPORT_VERSION = "1.0";

/** Fixed relational column schema for the CSV format. */
export const CSV_HEADERS = [
  "District",
  "Zone_ID",
  "Zone_Name_EN",
  "Zone_Name_UR",
  "Locality_ID",
  "Locality_Name_EN",
  "Locality_Name_UR",
  "Jurisdiction",
  "Active_Tickets",
] as const;

/** A zone tree snapshot fed to the exporters — the merged view (persisted
    zone entries ∪ implicit towns) the Territories panel already renders. */
export interface TerritorySourceZone {
  name_en: string;
  name_ur?: string;
  jurisdiction: JurisdictionType;
  areas: AreaItem[];
}

export interface ParsedImportArea {
  name_en: string;
  name_ur?: string;
  uc_number?: string;
  sub_division?: string;
  jurisdiction?: JurisdictionType;
  active_tickets?: number;
  status?: "active" | "paused";
}

export interface ParsedImportZone {
  name_en: string;
  name_ur?: string;
  jurisdiction?: JurisdictionType;
  areas: ParsedImportArea[];
}

export type TerritoryParseResult =
  | { ok: true; zones: ParsedImportZone[] }
  | { ok: false; error: string };

/* ------------------------------- Helpers ---------------------------------- */

/** "Cantonment City" → "cantonment-city" (Urdu-only names slug to ""). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const zoneId = (zoneName: string) => `zone-${slugify(zoneName) || "zone"}`;
const localityId = (zoneName: string, localityName: string) =>
  `locality-${slugify(`${zoneName}-${localityName}`) || "item"}`;

/** Placeholder dash persisted by legacy rows is not real content. */
const cleanUrdu = (value?: string) => {
  const trimmed = value?.trim();
  return !trimmed || trimmed === "—" ? undefined : trimmed;
};

const asJurisdiction = (value: unknown): JurisdictionType | undefined =>
  typeof value === "string" && (JURISDICTION_TYPES as string[]).includes(value)
    ? (value as JurisdictionType)
    : undefined;

/* -------------------------------- Export ---------------------------------- */

/** sada-e-awam-sialkot-2026-09-06.csv */
export function exportFileName(
  districtName: string,
  ext: "csv" | "json"
): string {
  const today = new Date();
  const date =
    `${today.getFullYear()}-` +
    `${String(today.getMonth() + 1).padStart(2, "0")}-` +
    `${String(today.getDate()).padStart(2, "0")}`;
  return `sada-e-awam-${slugify(districtName) || "district"}-${date}.${ext}`;
}

/** Escape only when needed — commas, quotes or newlines force quoting. */
const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Relational CSV with a UTF-8 BOM so Excel renders Urdu (سیالکوٹ) intact.
    Empty zones still emit a row (blank locality columns) so the parent zone
    survives a round-trip. */
export function buildTerritoryCsv(
  districtName: string,
  zones: TerritorySourceZone[]
): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const zone of zones) {
    const zoneCells = [
      csvCell(districtName),
      csvCell(zoneId(zone.name_en)),
      csvCell(zone.name_en),
      csvCell(cleanUrdu(zone.name_ur) ?? ""),
    ];
    if (zone.areas.length === 0) {
      rows.push(
        [...zoneCells, "", "", "", csvCell(zone.jurisdiction), "0"].join(",")
      );
      continue;
    }
    for (const area of zone.areas) {
      rows.push(
        [
          ...zoneCells,
          csvCell(localityId(zone.name_en, area.name_en)),
          csvCell(area.name_en),
          csvCell(cleanUrdu(area.name_ur) ?? ""),
          csvCell(area.jurisdiction ?? zone.jurisdiction),
          String(area.active_tickets ?? 0),
        ].join(",")
      );
    }
  }
  return `\uFEFF${rows.join("\n")}`;
}

/** Full relational tree with metadata — the lossless backup format. */
export function buildTerritoryJson(
  district: { id: string; name_en: string; name_ur?: string },
  zones: TerritorySourceZone[]
): string {
  const payload = {
    export_version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    district: {
      id: district.id,
      name_en: district.name_en,
      name_ur: cleanUrdu(district.name_ur),
    },
    total_zones: zones.length,
    total_localities: zones.reduce((sum, z) => sum + z.areas.length, 0),
    zones: zones.map((zone) => ({
      zone_id: zoneId(zone.name_en),
      name_en: zone.name_en,
      name_ur: cleanUrdu(zone.name_ur),
      jurisdiction: zone.jurisdiction,
      sub_areas: zone.areas.map((area) => ({
        locality_id: localityId(zone.name_en, area.name_en),
        name_en: area.name_en,
        name_ur: cleanUrdu(area.name_ur),
        jurisdiction: area.jurisdiction ?? zone.jurisdiction,
        uc_number: area.uc_number?.trim() || undefined,
        sub_division: area.sub_division?.trim() || undefined,
        active_tickets: area.active_tickets ?? 0,
        status: area.status ?? "active",
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** Blob-based download trigger (client-only — call from event handlers). */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* -------------------------------- Import ---------------------------------- */

/** Quote-aware single-line CSV splitter (handles "a, ""b""", c). */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = false;
      } else current += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

const parseTickets = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
};

const parseStatus = (raw: string): "active" | "paused" | undefined =>
  raw.toLowerCase() === "paused"
    ? "paused"
    : raw.toLowerCase() === "active"
      ? "active"
      : undefined;

/** Parses the relational CSV produced by buildTerritoryCsv. Falls back to the
    legacy Name,Urdu,Zone,UC #,Division sheets the panel previously accepted. */
export function parseTerritoryCsv(text: string): TerritoryParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, error: "The CSV file is empty." };
  }
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const first = (...names: string[]) => {
    for (const name of names) {
      const index = col(name);
      if (index !== -1) return index;
    }
    return -1;
  };

  const relational = col("zone_name_en") !== -1;
  const iName = relational ? col("locality_name_en") : first("locality_name_en", "name", "mohallah");
  if (iName === -1) {
    return {
      ok: false,
      error:
        "Unrecognized columns — expected the export schema (Zone_Name_EN, Locality_Name_EN) or a Name-based sheet.",
    };
  }
  const iZone = relational ? col("zone_name_en") : first("zone", "town");
  const iZoneId = col("zone_id");
  const iZoneUr = col("zone_name_ur");
  const iLocUr = relational ? col("locality_name_ur") : first("urdu", "name_ur");
  const iJur = col("jurisdiction");
  const iTickets = relational
    ? col("active_tickets")
    : first("open tickets", "active_tickets");
  const iUc = first("uc number", "uc_number", "uc #", "uc");
  const iDiv = first("sub-division", "sub_division", "division");
  const iStatus = col("status");

  const groups = new Map<string, ParsedImportZone>();
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line).map((cell) => cell.trim());
    const zoneName = relational
      ? (iZone !== -1 ? cells[iZone] : "") || (iZoneId !== -1 ? cells[iZoneId] : "")
      : iZone !== -1
        ? cells[iZone]
        : "";
    const localityName = cells[iName] ?? "";
    if (!zoneName && !localityName) continue;

    const key = (zoneName || "general").toLowerCase();
    let zone = groups.get(key);
    if (!zone) {
      zone = {
        name_en: zoneName || "General",
        name_ur: iZoneUr !== -1 ? cleanUrdu(cells[iZoneUr]) : undefined,
        jurisdiction: iJur !== -1 ? asJurisdiction(cells[iJur]) : undefined,
        areas: [],
      };
      groups.set(key, zone);
    }
    if (!localityName) continue; // zone-only row — keeps an empty parent zone

    zone.areas.push({
      name_en: localityName,
      name_ur: iLocUr !== -1 ? cleanUrdu(cells[iLocUr]) : undefined,
      jurisdiction: iJur !== -1 ? asJurisdiction(cells[iJur]) : undefined,
      active_tickets: iTickets !== -1 ? parseTickets(cells[iTickets]) : undefined,
      uc_number: iUc !== -1 ? cells[iUc] || undefined : undefined,
      sub_division: iDiv !== -1 ? cells[iDiv] || undefined : undefined,
      status: iStatus !== -1 ? parseStatus(cells[iStatus]) : undefined,
    });
  }

  const zones = [...groups.values()];
  if (zones.length === 0) {
    return { ok: false, error: "No valid zone rows found in the CSV file." };
  }
  return { ok: true, zones };
}

/** Parses the JSON tree produced by buildTerritoryJson (strictly typed). */
export function parseTerritoryJson(text: string): TerritoryParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON file — it could not be parsed." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Invalid territory export — expected a JSON object." };
  }
  const zonesRaw = (data as { zones?: unknown }).zones;
  if (!Array.isArray(zonesRaw)) {
    return { ok: false, error: "Invalid territory export — missing 'zones' array." };
  }
  const zones: ParsedImportZone[] = [];
  for (let i = 0; i < zonesRaw.length; i++) {
    const raw = zonesRaw[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Zone entry #${i + 1} is malformed.` };
    }
    const zone = raw as Record<string, unknown>;
    const name = typeof zone.name_en === "string" ? zone.name_en.trim() : "";
    const subAreas = Array.isArray(zone.sub_areas)
      ? zone.sub_areas
      : Array.isArray(zone.areas)
        ? zone.areas
        : [];
    const areas: ParsedImportArea[] = [];
    for (const areaRaw of subAreas) {
      if (!areaRaw || typeof areaRaw !== "object" || Array.isArray(areaRaw)) continue;
      const area = areaRaw as Record<string, unknown>;
      const areaName = typeof area.name_en === "string" ? area.name_en.trim() : "";
      if (!areaName) continue;
      areas.push({
        name_en: areaName,
        name_ur: typeof area.name_ur === "string" ? cleanUrdu(area.name_ur) : undefined,
        jurisdiction: asJurisdiction(area.jurisdiction),
        active_tickets:
          typeof area.active_tickets === "number" && Number.isFinite(area.active_tickets)
            ? Math.max(0, Math.round(area.active_tickets))
            : undefined,
        uc_number: typeof area.uc_number === "string" ? area.uc_number.trim() || undefined : undefined,
        sub_division:
          typeof area.sub_division === "string" ? area.sub_division.trim() || undefined : undefined,
        status:
          area.status === "paused" ? "paused" : area.status === "active" ? "active" : undefined,
      });
    }
    if (!name && areas.length === 0) continue;
    zones.push({
      name_en: name,
      name_ur: typeof zone.name_ur === "string" ? cleanUrdu(zone.name_ur) : undefined,
      jurisdiction: asJurisdiction(zone.jurisdiction),
      areas,
    });
  }
  if (zones.length === 0) {
    return { ok: false, error: "The file contains no zones to import." };
  }
  return { ok: true, zones };
}

/** Merge preview: how many incoming localities are genuinely new (district-wide,
    case-insensitive name match — the same uniqueness rule the edit modals use). */
export function countNewLocalities(
  existingAreas: { name_en: string }[],
  zones: ParsedImportZone[]
): { added: number; incoming: number } {
  const existing = new Set(
    existingAreas.map((area) => area.name_en.trim().toLowerCase())
  );
  const seen = new Set<string>();
  let added = 0;
  let incoming = 0;
  for (const zone of zones) {
    for (const area of zone.areas) {
      const name = area.name_en.trim();
      if (!name) continue;
      incoming++;
      const key = name.toLowerCase();
      if (existing.has(key) || seen.has(key)) continue;
      seen.add(key);
      added++;
    }
  }
  return { added, incoming };
}
