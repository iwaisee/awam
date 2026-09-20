/* Shared territory hierarchy engine — projects the flat coverage store (plus
   the live report ledger) into the recursive Province → District → Zone →
   Mohallah tree consumed by both the admin sidebar sub-menu and the
   Territories & Coverage governance deck. Deterministic by construction:
   telemetry seeds hash node ids so SSR and hydrated trees always agree. */

import {
  cityCode,
  DEFAULT_JURISDICTION,
  type AreaItem,
  type CityItem,
  type IncidentReport,
  type JurisdictionType,
  type ProvinceItem,
} from "@/types/civic";
import { slugify } from "@/utils/territoryExport";

/* ------------------------------ Zone view model --------------------------- */

/** One parent zone row: a persisted zone entry merged with the child
    localities whose town matches its name (implicit town-derived zones
    included so legacy rows and CSV-only imports render). */
export interface ZoneVm {
  name: string;
  nameUr?: string;
  jurisdiction: JurisdictionType;
  authority?: string;
  supervisor?: string;
  contact?: string;
  office?: string;
  areas: AreaItem[];
}

export function buildZoneVms(city: CityItem): ZoneVm[] {
  const byName = new Map<string, ZoneVm>();
  for (const zone of city.zones ?? []) {
    byName.set(zone.name_en, {
      name: zone.name_en,
      nameUr: zone.name_ur,
      jurisdiction: zone.jurisdiction,
      authority: zone.authority,
      supervisor: zone.supervisor,
      contact: zone.contact,
      office: zone.office,
      areas: [],
    });
  }
  for (const area of city.areas) {
    const key = area.town?.trim() || "General";
    let vm = byName.get(key);
    if (!vm) {
      vm = {
        name: key,
        jurisdiction: area.jurisdiction ?? DEFAULT_JURISDICTION,
        areas: [],
      };
      byName.set(key, vm);
    }
    vm.areas.push(area);
  }
  for (const vm of byName.values()) {
    vm.areas.sort((a, b) => a.name_en.localeCompare(b.name_en));
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------- Telemetry -------------------------------- */

/** Ticket telemetry bucket: live ledger reports only — counts come straight
    from the backend database, no seeded baseline merged in. `resolved` counts
    completed ledger reports so cards can show the full lifecycle. */
export interface TicketBucket {
  open: number;
  p1: number;
  p2: number;
  p3: number;
  resolved: number;
}

export const EMPTY_BUCKET: TicketBucket = {
  open: 0,
  p1: 0,
  p2: 0,
  p3: 0,
  resolved: 0,
};

/** Deterministic 0..1 hash — telemetry seeds must be identical on server and
    client so the SSR tree never mismatches after hydration. */
export const hash01 = (value: string) => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return (h % 10000) / 10000;
};

const code4 = (seed: string) =>
  Math.floor(hash01(seed) * 1679616)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");

const slaFor = (seed: string) => ({
  slaHours: Math.round((6.4 + hash01(`${seed}:sla`) * 6.2) * 10) / 10,
  slaRate: Math.round(88 + hash01(`${seed}:rate`) * 9),
});

/* ------------------------------ Tree nodes -------------------------------- */

export type TerritoryLevel = "province" | "city" | "zone" | "mohallah";

/** Recursive governance node — the UI-level projection of the flat coverage
    store into Province → District → Zone → Mohallah. */
export interface TerritoryNode {
  id: string;
  parentId: string | null;
  level: TerritoryLevel;
  name: string;
  nameUr?: string;
  code: string;
  /** Ancestor + self node ids, root first (breadcrumbs & auto-expand). */
  path: string[];
  city?: CityItem;
  zone?: ZoneVm;
  area?: AreaItem;
  children: TerritoryNode[];
  areaCount: number;
  zoneCount: number;
  open: number;
  resolved: number;
  total: number;
  p1: number;
  p2: number;
  p3: number;
  /** Real platform citizens: distinct non-empty reporter phone numbers in
      the live ledger under this node, deduplicated across descendants. */
  citizens: number;
  slaHours: number;
  slaRate: number;
}

export interface TerritoryTree {
  provinceRoots: TerritoryNode[];
  nodeIndex: Map<string, TerritoryNode>;
  defaultNodeId: string;
}

/** Build the full hierarchy. Regions come from the standalone province roster
    first, then any city-only province names (e.g. typed into the district
    modal) — so an empty province still renders as a manageable node. Districts
    group under their province, zones merge persisted entries with implicit
    town clusters, and open-ticket telemetry folds the live ledger bottom-up.
    Citizens are real ledger reporters: distinct phone numbers per area,
    deduplicated up the tree — never modelled population figures. */
export function buildTerritoryTree(
  cities: CityItem[],
  reports: IncidentReport[],
  provinces: ProvinceItem[] = []
): TerritoryTree {
  // Live ledger grouped by district (id or name — legacy rows differ). Each
  // report is indexed once per distinct key: when a city's id equals its
  // lowercased name (id "sialkot" for "Sialkot") the keys collapse so the
  // same ticket is never counted twice.
  const cityReportMap = new Map<string, IncidentReport[]>();
  for (const report of reports) {
    const keys = new Set<string>();
    if (report.city_id) keys.add(report.city_id);
    const nameKey = (report.city_name ?? "").trim().toLowerCase();
    if (nameKey) keys.add(nameKey);
    for (const key of keys) {
      const list = cityReportMap.get(key) ?? [];
      list.push(report);
      cityReportMap.set(key, list);
    }
  }
  const bucketOf = (city: CityItem, area: AreaItem): TicketBucket => {
    let live = EMPTY_BUCKET;
    let resolved = 0;
    for (const report of cityReportMap.get(city.id) ?? []) {
      if (
        (report.area_name ?? "").trim().toLowerCase() !==
        area.name_en.trim().toLowerCase()
      )
        continue;
      if (report.status === "resolved") {
        resolved += 1;
        continue;
      }
      live = {
        open: live.open + 1,
        p1: live.p1 + (report.urgency === "emergency" ? 1 : 0),
        p2: live.p2 + (report.urgency === "high" ? 1 : 0),
        p3: live.p3 + (report.urgency === "routine" ? 1 : 0),
        resolved: live.resolved,
      };
    }
    return {
      open: live.open,
      p1: live.p1,
      p2: live.p2,
      p3: live.p3,
      resolved,
    };
  };

  /** Distinct reporter phone numbers per node id — citizens are counted once
      per area and deduplicated up the tree, so a citizen reporting in several
      localities still registers as one platform citizen on every ancestor. */
  const phoneSets = new Map<string, Set<string>>();
  const phonesOf = (city: CityItem, area: AreaItem): Set<string> => {
    const phones = new Set<string>();
    for (const report of cityReportMap.get(city.id) ?? []) {
      if (
        (report.area_name ?? "").trim().toLowerCase() !==
        area.name_en.trim().toLowerCase()
      )
        continue;
      const phone = report.citizen_phone.trim();
      if (phone) phones.add(phone);
    }
    return phones;
  };

  const index = new Map<string, TerritoryNode>();
  const groups = new Map<string, CityItem[]>();
  for (const city of cities) {
    const list = groups.get(city.province) ?? [];
    list.push(city);
    groups.set(city.province, list);
  }
  // Standalone provinces first (roster order), then any city-only regions.
  const orderedProvinces = [
    ...provinces.map((p) => p.name_en),
    ...[...groups.keys()].filter(
      (name) => !provinces.some((p) => p.name_en === name)
    ),
  ];

  const roots: TerritoryNode[] = [];
  for (const provinceName of orderedProvinces) {
    const group = groups.get(provinceName) ?? [];
    const provinceId = `province-${slugify(provinceName)}`;
    const provinceNode: TerritoryNode = {
      id: provinceId,
      parentId: null,
      level: "province",
      name: provinceName,
      nameUr: provinces.find((p) => p.name_en === provinceName)?.name_ur,
      code: `PROV-${
        provinceName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() ||
        "REGION"
      }`,
      path: [provinceId],
      children: [],
      areaCount: 0,
      zoneCount: 0,
      open: 0,
      resolved: 0,
      total: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      citizens: 0,
      ...slaFor(provinceId),
    };
    index.set(provinceId, provinceNode);

    for (const city of group) {
      const abbr = cityCode(city.id, city.name_en);
      const cityNode: TerritoryNode = {
        id: city.id,
        parentId: provinceId,
        level: "city",
        name: city.name_en,
        nameUr: city.name_ur === "—" ? undefined : city.name_ur,
        code: `DIST-${abbr}`,
        path: [provinceId, city.id],
        city,
        children: [],
        areaCount: 0,
        zoneCount: 0,
        open: 0,
        resolved: 0,
        total: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        citizens: 0,
        ...slaFor(city.id),
      };
      index.set(city.id, cityNode);

      const zoneVms = buildZoneVms(city);
      zoneVms.forEach((vm, zoneIdx) => {
        const zoneId = `zone-${city.id}-${slugify(vm.name)}`;
        const zoneNode: TerritoryNode = {
          id: zoneId,
          parentId: city.id,
          level: "zone",
          name: vm.name,
          nameUr: vm.nameUr,
          code: `ZONE-${abbr}-${String(zoneIdx + 1).padStart(2, "0")}`,
          path: [provinceId, city.id, zoneId],
          city,
          zone: vm,
          children: [],
          areaCount: 0,
          zoneCount: 0,
          open: 0,
          resolved: 0,
          total: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          citizens: 0,
          ...slaFor(zoneId),
        };
        index.set(zoneId, zoneNode);

        for (const area of vm.areas) {
          const bucket = bucketOf(city, area);
          const areaPhones = phonesOf(city, area);
          phoneSets.set(area.id, areaPhones);
          const areaNode: TerritoryNode = {
            id: area.id,
            parentId: zoneId,
            level: "mohallah",
            name: area.name_en,
            nameUr:
              area.name_ur && area.name_ur !== "—" ? area.name_ur : undefined,
            code: `LOC-${abbr}-${code4(area.id)}`,
            path: [provinceId, city.id, zoneId, area.id],
            city,
            zone: vm,
            area,
            children: [],
            areaCount: 0,
            zoneCount: 0,
            ...bucket,
            total: bucket.open + bucket.resolved,
            citizens: areaPhones.size,
            ...slaFor(area.id),
          };
          index.set(area.id, areaNode);
          zoneNode.children.push(areaNode);
          zoneNode.areaCount += 1;
          zoneNode.open += bucket.open;
          zoneNode.resolved += bucket.resolved;
          zoneNode.total += bucket.open + bucket.resolved;
          zoneNode.p1 += bucket.p1;
          zoneNode.p2 += bucket.p2;
          zoneNode.p3 += bucket.p3;
        }
        const zonePhones = new Set<string>();
        for (const child of zoneNode.children)
          for (const phone of phoneSets.get(child.id) ?? [])
            zonePhones.add(phone);
        phoneSets.set(zoneId, zonePhones);
        zoneNode.citizens = zonePhones.size;
        cityNode.children.push(zoneNode);
        cityNode.areaCount += zoneNode.areaCount;
        cityNode.zoneCount += 1;
        cityNode.open += zoneNode.open;
        cityNode.resolved += zoneNode.resolved;
        cityNode.total += zoneNode.total;
        cityNode.p1 += zoneNode.p1;
        cityNode.p2 += zoneNode.p2;
        cityNode.p3 += zoneNode.p3;
      });
      const cityPhones = new Set<string>();
      for (const child of cityNode.children)
        for (const phone of phoneSets.get(child.id) ?? []) cityPhones.add(phone);
      phoneSets.set(city.id, cityPhones);
      cityNode.citizens = cityPhones.size;
      provinceNode.children.push(cityNode);
      provinceNode.areaCount += cityNode.areaCount;
      provinceNode.zoneCount += cityNode.zoneCount;
      provinceNode.open += cityNode.open;
      provinceNode.resolved += cityNode.resolved;
      provinceNode.total += cityNode.total;
      provinceNode.p1 += cityNode.p1;
      provinceNode.p2 += cityNode.p2;
      provinceNode.p3 += cityNode.p3;
    }
    const provincePhones = new Set<string>();
    for (const child of provinceNode.children)
      for (const phone of phoneSets.get(child.id) ?? [])
        provincePhones.add(phone);
    phoneSets.set(provinceId, provincePhones);
    provinceNode.citizens = provincePhones.size;
    roots.push(provinceNode);
  }

  const fallbackId =
    cities.find((c) => c.status === "active")?.id ??
    cities[0]?.id ??
    roots[0]?.id ??
    "";
  return { provinceRoots: roots, nodeIndex: index, defaultNodeId: fallbackId };
}

/* ---------------------------- Deep-link helpers ---------------------------- */

/** Node ids of the ancestor chain (inclusive) for a deep-linked selection. */
export function resolveInitialExpanded(
  citiesList: CityItem[],
  nodeId: string | null
): Set<string> {
  const ids = new Set<string>();
  if (!nodeId) return ids;
  if (nodeId.startsWith("province-")) {
    ids.add(nodeId);
    return ids;
  }
  const city = citiesList.find((c) => c.id === nodeId);
  if (city) {
    ids.add(`province-${slugify(city.province)}`);
    ids.add(city.id);
    return ids;
  }
  for (const candidate of citiesList) {
    const zoneNames = new Set<string>([
      ...(candidate.zones ?? []).map((z) => z.name_en),
      ...candidate.areas.map((a) => a.town?.trim() || "General"),
    ]);
    if (
      [...zoneNames].some(
        (n) => `zone-${candidate.id}-${slugify(n)}` === nodeId
      )
    ) {
      ids.add(`province-${slugify(candidate.province)}`);
      ids.add(candidate.id);
      ids.add(nodeId);
      return ids;
    }
    const area = candidate.areas.find((a) => a.id === nodeId);
    if (area) {
      const zoneName = area.town?.trim() || "General";
      ids.add(`province-${slugify(candidate.province)}`);
      ids.add(candidate.id);
      ids.add(`zone-${candidate.id}-${slugify(zoneName)}`);
      ids.add(nodeId);
      return ids;
    }
  }
  return ids;
}

/** Resolve the zone display name behind a `zone-<cityId>-<slug>` node id —
    used to pre-scope the "add locality" modal from sidebar deep links. */
export function deepLinkZoneName(
  citiesList: CityItem[],
  nodeId: string | null
): string | null {
  if (!nodeId || !nodeId.startsWith("zone-")) return null;
  for (const city of citiesList) {
    const prefix = `zone-${city.id}-`;
    if (!nodeId.startsWith(prefix)) continue;
    const slug = nodeId.slice(prefix.length);
    const zoneNames = new Set<string>([
      ...(city.zones ?? []).map((z) => z.name_en),
      ...city.areas.map((a) => a.town?.trim() || "General"),
    ]);
    for (const name of zoneNames) {
      if (slugify(name) === slug) return name;
    }
  }
  return null;
}

/** Parent ids of every branch in a (filtered) subtree — Expand/Collapse All. */
export function collectParentIds(nodes: TerritoryNode[]): string[] {
  return nodes.flatMap((n) =>
    n.children.length > 0 ? [n.id, ...collectParentIds(n.children)] : []
  );
}

/** Ward / Village / Mohallah label derived from the parent zone's character.
    Cantonment localities are "Wards" (military board), Villages clusters are
    "Villages", everything else is a "Mohallah". */
export const areaTypeLabel = (zoneName: string) =>
  zoneName === "Villages"
    ? "Village"
    : /cantt|cantonment/i.test(zoneName)
      ? "Ward"
      : "Mohallah";
