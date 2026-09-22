import { ensureSchema, getPool } from "@/lib/pg";
import type {
  AreaItem,
  CategoryRule,
  CityItem,
  ProvinceItem,
  ZoneItem,
} from "@/types/civic";

/* Normalized Neon store for the coverage document — the { cities, categories,
   provinces } tree that CoverageContext syncs. The client contract stays a
   whole document (GET assembles it, PUT syncs it); here it lives in the
   provinces / cities / zones / areas / category_rules tables.

   Sync strategy — "upsert-then-delete-orphans" inside one transaction, so a
   rename (which changes name-based identity for provinces and zones) can
   never cascade-delete live data: every doc row is upserted first, then only
   rows absent from the doc are removed. Each table is synced in ONE batched
   statement (jsonb_to_recordset), so a full 300-area tree costs ~12 queries
   instead of one per row. */

type Row = Record<string, unknown>;

/* ------------------------------ doc accessors ----------------------------- */

const asRow = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};

/** Required-ish string — missing values become "". */
const str = (row: Row, key: string): string => {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
};

/** Optional string — null/undefined → null; "" is preserved. */
const nulStr = (row: Row, key: string): string | null => {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
};

/** Optional finite number — null/undefined/NaN → null. */
const nulNum = (row: Row, key: string): number | null => {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Optional integer column value. */
const nulInt = (row: Row, key: string): number | null => {
  const n = nulNum(row, key);
  return n === null ? null : Math.round(n);
};

/** Optional JSON payload — null/undefined → null. Strings that parse to a
    JSON object/array are unwrapped first: legacy clients double-encoded
    JSONB fields (e.g. supported_cities as the TEXT '["all"]'), and storing
    them verbatim would round-trip as a JSON string scalar that every
    reader then sees as empty. */
const nulJson = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object")
        return JSON.stringify(parsed);
    } catch {
      /* not JSON — falls through to the plain-string encoding */
    }
  }
  return JSON.stringify(value);
};

/** JSONB column → array. Tolerates rows stored as double-encoded JSON
    strings (see nulJson) so legacy rows still serve real arrays. */
function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to the empty default */
    }
  }
  return [];
}

/** JSONB column → object (null when absent or not an object/array). Same
    double-encoding tolerance as asJsonArray. */
function asJsonObject(value: unknown): Record<string, unknown> | unknown[] | null {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through to null */
    }
  }
  return null;
}

/* -------------------------------- assembly -------------------------------- */

export interface CoverageDoc {
  cities: CityItem[];
  categories: CategoryRule[];
  provinces: ProvinceItem[];
}

/** Assemble the coverage document from the tables, or null when never
    synced (callers fall back to the locally hydrated roster). */
export async function readCoverageDoc(): Promise<CoverageDoc | null> {
  await ensureSchema();
  const [provinceRows, cityRows, zoneRows, areaRows, categoryRows] =
    await Promise.all([
      getPool().query("SELECT * FROM provinces ORDER BY sort, id"),
      getPool().query("SELECT * FROM cities ORDER BY sort, id"),
      getPool().query("SELECT * FROM zones ORDER BY sort, id"),
      getPool().query("SELECT * FROM areas ORDER BY sort, id"),
      getPool().query("SELECT * FROM category_rules ORDER BY sort, id"),
    ]);
  if (provinceRows.rows.length === 0 && cityRows.rows.length === 0) return null;

  const provinceName = new Map<number, string>();
  for (const row of provinceRows.rows as Row[]) {
    provinceName.set(Number(row.id), str(row, "name_en"));
  }
  const zoneById = new Map<number, string>();
  const zonesByCity = new Map<string, ZoneItem[]>();
  for (const row of zoneRows.rows as Row[]) {
    const id = Number(row.id);
    zoneById.set(id, str(row, "name_en"));
    const cityId = String(row.city_id);
    const zone: ZoneItem = {
      name_en: str(row, "name_en"),
      jurisdiction: (str(row, "jurisdiction") || "Municipal Corporation") as ZoneItem["jurisdiction"],
    };
    const nameUr = nulStr(row, "name_ur");
    if (nameUr !== null) zone.name_ur = nameUr;
    for (const key of ["authority", "supervisor", "contact", "office"] as const) {
      const value = nulStr(row, key);
      if (value !== null) zone[key] = value;
    }
    const list = zonesByCity.get(cityId) ?? [];
    list.push(zone);
    zonesByCity.set(cityId, list);
  }
  const areasByCity = new Map<string, AreaItem[]>();
  for (const row of areaRows.rows as Row[]) {
    const area: AreaItem = {
      id: String(row.id),
      name_en: str(row, "name_en"),
    };
    const nameUr = nulStr(row, "name_ur");
    if (nameUr !== null) area.name_ur = nameUr;
    const zoneId = row.zone_id === null || row.zone_id === undefined ? null : Number(row.zone_id);
    const town = zoneId !== null ? zoneById.get(zoneId) : undefined;
    if (town !== undefined) area.town = town;
    const uc = nulStr(row, "uc_number");
    if (uc !== null) area.uc_number = uc;
    const jurisdiction = nulStr(row, "jurisdiction");
    if (jurisdiction !== null) area.jurisdiction = jurisdiction as AreaItem["jurisdiction"];
    const subDivision = nulStr(row, "sub_division");
    if (subDivision !== null) area.sub_division = subDivision;
    const activeTickets = nulNum(row, "active_tickets");
    if (activeTickets !== null) area.active_tickets = activeTickets;
    const status = nulStr(row, "status");
    if (status === "active" || status === "paused") area.status = status;
    for (const key of ["supervisor", "contact", "office"] as const) {
      const value = nulStr(row, key);
      if (value !== null) area[key] = value;
    }
    const cityId = String(row.city_id);
    const list = areasByCity.get(cityId) ?? [];
    list.push(area);
    areasByCity.set(cityId, list);
  }

  const cities: CityItem[] = (cityRows.rows as Row[]).map((row) => {
    const cityId = String(row.id);
    const city: CityItem = {
      id: cityId,
      name_en: str(row, "name_en"),
      name_ur: str(row, "name_ur"),
      province: provinceName.get(Number(row.province_id)) ?? "",
      status: (str(row, "status") || "coming_soon") as CityItem["status"],
      active_reports: Number(row.active_reports ?? 0),
      areas: areasByCity.get(cityId) ?? [],
    };
    const zones = zonesByCity.get(cityId);
    if (zones && zones.length > 0) city.zones = zones;
    const cityAgencies = asJsonObject(row.agencies);
    if (cityAgencies !== null) city.agencies = cityAgencies as string[];
    for (const key of ["subtext", "supervisor", "contact", "office"] as const) {
      const value = nulStr(row, key);
      if (value !== null) city[key] = value;
    }
    return city;
  });

  const provinces: ProvinceItem[] = (provinceRows.rows as Row[]).map((row) => {
    const province: ProvinceItem = { name_en: str(row, "name_en") };
    const nameUr = nulStr(row, "name_ur");
    if (nameUr !== null) province.name_ur = nameUr;
    const kind = nulStr(row, "kind");
    if (kind === "province" || kind === "territory" || kind === "region") province.kind = kind;
    for (const key of ["capital", "code", "slug"] as const) {
      const value = nulStr(row, key);
      if (value !== null) province[key] = value;
    }
    const boundary = asJsonObject(row.boundary);
    if (boundary !== null) {
      province.boundary = boundary as unknown as ProvinceItem["boundary"];
    }
    const areaKm2 = nulNum(row, "area_km2");
    if (areaKm2 !== null) province.area_km2 = areaKm2;
    const population = nulNum(row, "population");
    if (population !== null) province.population = population;
    const provinceTiers = asJsonArray(row.tiers);
    if (provinceTiers.length > 0) {
      province.tiers = provinceTiers as ProvinceItem["tiers"];
    }
    const provinceAgencies = asJsonObject(row.agencies);
    if (provinceAgencies !== null) {
      province.agencies = provinceAgencies as ProvinceItem["agencies"];
    }
    const slaP1 = nulNum(row, "sla_p1_hours");
    if (slaP1 !== null) province.sla_p1_hours = slaP1;
    const slaP2 = nulNum(row, "sla_p2_hours");
    if (slaP2 !== null) province.sla_p2_hours = slaP2;
    const verification = nulStr(row, "verification");
    if (verification === "strict" || verification === "standard") province.verification = verification;
    const lifecycle = nulStr(row, "lifecycle");
    if (lifecycle === "phase1_pilot" || lifecycle === "full_rollout" || lifecycle === "infrastructure" || lifecycle === "planned") {
      province.lifecycle = lifecycle;
    }
    const status = nulStr(row, "status");
    if (status === "draft" || status === "active") province.status = status;
    const adminModel = nulStr(row, "admin_model");
    if (adminModel !== null) province.admin_model = adminModel as ProvinceItem["admin_model"];
    return province;
  });

  const categories: CategoryRule[] = (categoryRows.rows as Row[]).map((row) => {
    const rule: CategoryRule = {
      id: String(row.id),
      name_en: str(row, "name_en"),
      name_ur: str(row, "name_ur"),
      description: str(row, "description"),
      icon_name: str(row, "icon_name"),
      default_agency: (str(row, "default_agency") || "MCS") as CategoryRule["default_agency"],
      sla_hours: Number(row.sla_hours ?? 24),
      urgency: (str(row, "urgency") || "routine") as CategoryRule["urgency"],
      status: (str(row, "status") || "active") as CategoryRule["status"],
      supported_cities: asJsonArray(row.supported_cities) as string[],
      allowed_jurisdictions: asJsonArray(
        row.allowed_jurisdictions
      ) as CategoryRule["allowed_jurisdictions"],
      tags: asJsonArray(row.tags) as string[],
    };
    return rule;
  });

  return { cities, categories, provinces };
}

/* ---------------------------------- sync ---------------------------------- */

/** Keep the last occurrence of each identity, preserving first-seen order. */
function dedupe<T>(rows: T[], key: (row: T) => string): { row: T; sort: number }[] {
  const map = new Map<string, { row: T; sort: number }>();
  rows.forEach((row, index) => {
    const k = key(row);
    if (k === "") return;
    const existing = map.get(k);
    if (existing) existing.row = row;
    else map.set(k, { row, sort: index });
  });
  return [...map.values()].sort((a, b) => a.sort - b.sort);
}

/** Persist the whole coverage document into the tables. The document is
    authoritative: fields cleared in the doc are cleared in the database, and
    rows removed from the doc are deleted (children of deleted provinces and
    cities cascade). */
export async function writeCoverageDoc(doc: unknown): Promise<void> {
  await ensureSchema();
  const root = asRow(doc);
  if (
    !Array.isArray(root.cities) &&
    !Array.isArray(root.categories) &&
    !Array.isArray(root.provinces)
  ) {
    throw new Error("Malformed coverage document — expected cities/categories/provinces arrays.");
  }
  const provinces = Array.isArray(root.provinces) ? root.provinces.map(asRow) : [];
  const cities = Array.isArray(root.cities) ? root.cities.map(asRow) : [];
  const categories = Array.isArray(root.categories) ? root.categories.map(asRow) : [];

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    /* 1. Provinces — identity is lower(name_en). */
    const provincePayload = dedupe(provinces, (r) => str(r, "name_en").trim().toLowerCase()).map(
      ({ row, sort }) => ({
        name_en: str(row, "name_en").trim(),
        name_ur: nulStr(row, "name_ur"),
        kind: nulStr(row, "kind"),
        capital: nulStr(row, "capital"),
        code: nulStr(row, "code"),
        slug: nulStr(row, "slug"),
        boundary: nulJson(row.boundary),
        area_km2: nulNum(row, "area_km2"),
        population: nulNum(row, "population"),
        tiers: nulJson(row.tiers),
        agencies: nulJson(row.agencies),
        sla_p1_hours: nulInt(row, "sla_p1_hours"),
        sla_p2_hours: nulInt(row, "sla_p2_hours"),
        verification: nulStr(row, "verification"),
        lifecycle: nulStr(row, "lifecycle"),
        status: nulStr(row, "status"),
        admin_model: nulStr(row, "admin_model"),
        sort,
      }),
    );
    const provinceIdByKey = new Map<string, number>();
    const provinceIds: number[] = [];
    if (provincePayload.length > 0) {
      const result = await client.query(
        `INSERT INTO provinces (name_en, name_ur, kind, capital, code, slug, boundary,
           area_km2, population, tiers, agencies, sla_p1_hours, sla_p2_hours,
           verification, lifecycle, status, admin_model, sort)
         SELECT name_en, name_ur, kind, capital, code, slug, boundary,
           area_km2, population, tiers, agencies, sla_p1_hours, sla_p2_hours,
           verification, lifecycle, status, admin_model, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(name_en text, name_ur text, kind text,
           capital text, code text, slug text, boundary jsonb, area_km2 numeric,
           population bigint, tiers jsonb, agencies jsonb, sla_p1_hours integer,
           sla_p2_hours integer, verification text, lifecycle text, status text,
           admin_model text, sort integer)
         ON CONFLICT (lower(name_en)) DO UPDATE SET
           name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur, kind = EXCLUDED.kind,
           capital = EXCLUDED.capital, code = EXCLUDED.code, slug = EXCLUDED.slug,
           boundary = EXCLUDED.boundary, area_km2 = EXCLUDED.area_km2,
           population = EXCLUDED.population, tiers = EXCLUDED.tiers,
           agencies = EXCLUDED.agencies, sla_p1_hours = EXCLUDED.sla_p1_hours,
           sla_p2_hours = EXCLUDED.sla_p2_hours, verification = EXCLUDED.verification,
           lifecycle = EXCLUDED.lifecycle, status = EXCLUDED.status,
           admin_model = EXCLUDED.admin_model, sort = EXCLUDED.sort
         RETURNING id, lower(name_en) AS key`,
        [JSON.stringify(provincePayload)],
      );
      for (const row of result.rows as Row[]) {
        const id = Number(row.id);
        provinceIdByKey.set(String(row.key), id);
        provinceIds.push(id);
      }
    }

    /* 2. Cities — identity is the client-minted id; the doc's province
          reference resolves by name (missing references get a minimal
          province row, mirroring today's dangling-string tolerance). */
    const missingProvinces = new Map<string, string>();
    for (const row of cities) {
      const name = str(row, "province").trim();
      if (name && !provinceIdByKey.has(name.toLowerCase())) {
        missingProvinces.set(name.toLowerCase(), name);
      }
    }
    if (missingProvinces.size > 0) {
      const payload = [...missingProvinces.entries()].map(([key, name]) => ({
        name_en: name,
        sort: 9999,
        __key: key,
      }));
      const result = await client.query(
        `INSERT INTO provinces (name_en, sort)
         SELECT name_en, sort FROM jsonb_to_recordset($1::jsonb) AS t(name_en text, sort integer)
         ON CONFLICT (lower(name_en)) DO UPDATE SET sort = LEAST(provinces.sort, EXCLUDED.sort)
         RETURNING id, lower(name_en) AS key`,
        [JSON.stringify(payload)],
      );
      for (const row of result.rows as Row[]) {
        const id = Number(row.id);
        provinceIdByKey.set(String(row.key), id);
        provinceIds.push(id);
      }
    }

    const cityPayload = dedupe(cities, (r) => str(r, "id").trim())
      .map(({ row, sort }) => {
        const id = str(row, "id").trim();
        const provinceName = str(row, "province").trim();
        const provinceId = provinceIdByKey.get(provinceName.toLowerCase());
        if (provinceId === undefined) return null;
        return {
          id,
          province_id: provinceId,
          name_en: str(row, "name_en"),
          name_ur: str(row, "name_ur"),
          status: str(row, "status") || "coming_soon",
          active_reports: nulInt(row, "active_reports") ?? 0,
          agencies: nulJson(row.agencies),
          subtext: nulStr(row, "subtext"),
          supervisor: nulStr(row, "supervisor"),
          contact: nulStr(row, "contact"),
          office: nulStr(row, "office"),
          sort,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const includedCityIds = new Set(cityPayload.map((c) => c.id));
    if (cityPayload.length > 0) {
      await client.query(
        `INSERT INTO cities (id, province_id, name_en, name_ur, status, active_reports,
           agencies, subtext, supervisor, contact, office, sort)
         SELECT id, province_id, name_en, name_ur, status, active_reports,
           agencies, subtext, supervisor, contact, office, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, province_id bigint, name_en text,
           name_ur text, status text, active_reports integer, agencies jsonb,
           subtext text, supervisor text, contact text, office text, sort integer)
         ON CONFLICT (id) DO UPDATE SET
           province_id = EXCLUDED.province_id, name_en = EXCLUDED.name_en,
           name_ur = EXCLUDED.name_ur, status = EXCLUDED.status,
           active_reports = EXCLUDED.active_reports, agencies = EXCLUDED.agencies,
           subtext = EXCLUDED.subtext, supervisor = EXCLUDED.supervisor,
           contact = EXCLUDED.contact, office = EXCLUDED.office, sort = EXCLUDED.sort`,
        [JSON.stringify(cityPayload)],
      );
    }

    /* 3. Zones — identity is (city, lower(name_en)). Only cities included
          above are visited, so zone payloads always satisfy the FK. */
    const zonePayload = cities
      .filter((r) => includedCityIds.has(str(r, "id").trim()))
      .flatMap((row) => {
        const cityId = str(row, "id").trim();
        const zones = Array.isArray(row.zones) ? row.zones.map(asRow) : [];
        return dedupe(zones, (r) => str(r, "name_en").trim().toLowerCase()).map(
          ({ row: zone, sort }) => ({
            city_id: cityId,
            name_en: str(zone, "name_en").trim(),
            name_ur: nulStr(zone, "name_ur"),
            jurisdiction: str(zone, "jurisdiction") || "Municipal Corporation",
            authority: nulStr(zone, "authority"),
            supervisor: nulStr(zone, "supervisor"),
            contact: nulStr(zone, "contact"),
            office: nulStr(zone, "office"),
            sort,
          }),
        );
      });
    const zoneIdByKey = new Map<string, number>();
    const zoneIds: number[] = [];
    if (zonePayload.length > 0) {
      const result = await client.query(
        `INSERT INTO zones (city_id, name_en, name_ur, jurisdiction, authority, supervisor, contact, office, sort)
         SELECT city_id, name_en, name_ur, jurisdiction, authority, supervisor, contact, office, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(city_id text, name_en text, name_ur text,
           jurisdiction text, authority text, supervisor text, contact text, office text, sort integer)
         ON CONFLICT (city_id, lower(name_en)) DO UPDATE SET
           name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur,
           jurisdiction = EXCLUDED.jurisdiction, authority = EXCLUDED.authority,
           supervisor = EXCLUDED.supervisor, contact = EXCLUDED.contact,
           office = EXCLUDED.office, sort = EXCLUDED.sort
         RETURNING id, city_id, lower(name_en) AS key`,
        [JSON.stringify(zonePayload)],
      );
      for (const row of result.rows as Row[]) {
        const id = Number(row.id);
        zoneIdByKey.set(`${String(row.city_id)}|${String(row.key)}`, id);
        zoneIds.push(id);
      }
    }

    /* 4. Areas — identity is the client-minted id; a town with no zone row
          is created on first sight so implicit zones survive the trip. */
    const implicitZones = new Map<string, { city_id: string; name_en: string; jurisdiction: string }>();
    const areaPayload = cities
      .filter((r) => includedCityIds.has(str(r, "id").trim()))
      .flatMap((row) => {
        const cityId = str(row, "id").trim();
        const areas = Array.isArray(row.areas) ? row.areas.map(asRow) : [];
        return dedupe(areas, (r) => str(r, "id").trim()).map(({ row: area, sort }) => {
          const town = nulStr(area, "town");
          let zoneId: number | null = null;
          if (town !== null && town.trim() !== "") {
            const trimmed = town.trim();
            const key = `${cityId}|${trimmed.toLowerCase()}`;
            zoneId = zoneIdByKey.get(key) ?? null;
            if (zoneId === null && !implicitZones.has(key)) {
              implicitZones.set(key, {
                city_id: cityId,
                name_en: trimmed,
                jurisdiction: nulStr(area, "jurisdiction") ?? "Municipal Corporation",
              });
            }
          }
          return {
            payload: {
              id: str(area, "id").trim(),
              city_id: cityId,
              name_en: str(area, "name_en"),
              name_ur: nulStr(area, "name_ur"),
              uc_number: nulStr(area, "uc_number"),
              jurisdiction: nulStr(area, "jurisdiction"),
              sub_division: nulStr(area, "sub_division"),
              active_tickets: nulInt(area, "active_tickets"),
              status: nulStr(area, "status"),
              supervisor: nulStr(area, "supervisor"),
              contact: nulStr(area, "contact"),
              office: nulStr(area, "office"),
              sort,
            },
            townKey: town !== null && town.trim() !== "" ? `${cityId}|${town.trim().toLowerCase()}` : null,
          };
        });
      });
    if (implicitZones.size > 0) {
      const result = await client.query(
        `INSERT INTO zones (city_id, name_en, jurisdiction, sort)
         SELECT city_id, name_en, jurisdiction, 9999
         FROM jsonb_to_recordset($1::jsonb) AS t(city_id text, name_en text, jurisdiction text)
         ON CONFLICT (city_id, lower(name_en)) DO UPDATE SET sort = LEAST(zones.sort, EXCLUDED.sort)
         RETURNING id, city_id, lower(name_en) AS key`,
        [JSON.stringify([...implicitZones.values()])],
      );
      for (const row of result.rows as Row[]) {
        const id = Number(row.id);
        const key = `${String(row.city_id)}|${String(row.key)}`;
        zoneIdByKey.set(key, id);
        zoneIds.push(id);
      }
    }
    const finalAreaPayload = areaPayload.map(({ payload, townKey }) => ({
      ...payload,
      zone_id: townKey !== null ? (zoneIdByKey.get(townKey) ?? null) : null,
    }));
    const areaIds = finalAreaPayload.map((a) => a.id);
    if (finalAreaPayload.length > 0) {
      await client.query(
        `INSERT INTO areas (id, city_id, zone_id, name_en, name_ur, uc_number, jurisdiction,
           sub_division, active_tickets, status, supervisor, contact, office, sort)
         SELECT id, city_id, zone_id, name_en, name_ur, uc_number, jurisdiction,
           sub_division, active_tickets, status, supervisor, contact, office, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, city_id text, zone_id bigint,
           name_en text, name_ur text, uc_number text, jurisdiction text,
           sub_division text, active_tickets integer, status text, supervisor text,
           contact text, office text, sort integer)
         ON CONFLICT (id) DO UPDATE SET
           city_id = EXCLUDED.city_id, zone_id = EXCLUDED.zone_id,
           name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur,
           uc_number = EXCLUDED.uc_number, jurisdiction = EXCLUDED.jurisdiction,
           sub_division = EXCLUDED.sub_division, active_tickets = EXCLUDED.active_tickets,
           status = EXCLUDED.status, supervisor = EXCLUDED.supervisor,
           contact = EXCLUDED.contact, office = EXCLUDED.office, sort = EXCLUDED.sort`,
        [JSON.stringify(finalAreaPayload)],
      );
    }

    /* 5. Categories — identity is the client-minted id. */
    const categoryPayload = dedupe(categories, (r) => str(r, "id").trim()).map(({ row, sort }) => ({
      id: str(row, "id").trim(),
      name_en: str(row, "name_en"),
      name_ur: str(row, "name_ur"),
      description: str(row, "description"),
      icon_name: str(row, "icon_name"),
      default_agency: str(row, "default_agency") || "MCS",
      sla_hours: nulInt(row, "sla_hours") ?? 24,
      urgency: str(row, "urgency") || "routine",
      status: str(row, "status") || "active",
      supported_cities: nulJson(row.supported_cities) ?? "[]",
      allowed_jurisdictions: nulJson(row.allowed_jurisdictions) ?? "[]",
      tags: nulJson(row.tags) ?? "[]",
      sort,
    }));
    const categoryIds = categoryPayload.map((c) => c.id);
    if (categoryPayload.length > 0) {
      await client.query(
        `INSERT INTO category_rules (id, name_en, name_ur, description, icon_name,
           default_agency, sla_hours, urgency, status, supported_cities,
           allowed_jurisdictions, tags, sort)
         SELECT id, name_en, name_ur, description, icon_name,
           default_agency, sla_hours, urgency, status, supported_cities,
           allowed_jurisdictions, tags, sort
         FROM jsonb_to_recordset($1::jsonb) AS t(id text, name_en text, name_ur text,
           description text, icon_name text, default_agency text, sla_hours integer,
           urgency text, status text, supported_cities jsonb,
           allowed_jurisdictions jsonb, tags jsonb, sort integer)
         ON CONFLICT (id) DO UPDATE SET
           name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur,
           description = EXCLUDED.description, icon_name = EXCLUDED.icon_name,
           default_agency = EXCLUDED.default_agency, sla_hours = EXCLUDED.sla_hours,
           urgency = EXCLUDED.urgency, status = EXCLUDED.status,
           supported_cities = EXCLUDED.supported_cities,
           allowed_jurisdictions = EXCLUDED.allowed_jurisdictions,
           tags = EXCLUDED.tags, sort = EXCLUDED.sort`,
        [JSON.stringify(categoryPayload)],
      );
    }

    /* 6. Orphan sweep — everything the doc no longer contains. Children of
          deleted cities/provinces cascade; doc rows were all upserted above,
          so only genuinely removed entities are hit. */
    await client.query("DELETE FROM areas WHERE id <> ALL($1::text[])", [areaIds]);
    await client.query("DELETE FROM zones WHERE id <> ALL($1::bigint[])", [zoneIds]);
    await client.query("DELETE FROM cities WHERE id <> ALL($1::text[])", [cityPayload.map((c) => c.id)]);
    await client.query("DELETE FROM provinces WHERE id <> ALL($1::bigint[])", [provinceIds]);
    await client.query("DELETE FROM category_rules WHERE id <> ALL($1::text[])", [categoryIds]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Dev-only escape hatch — empties the territory tables so the browser-side
    roster can be re-synced from scratch. No-op in production builds. */
export async function resetCoverage(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await ensureSchema();
  await getPool().query("TRUNCATE areas, zones, cities, provinces, category_rules");
}
