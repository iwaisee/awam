/* Territory URL state engine — the deep-link contract that keeps the left
   hierarchy tree and the right management canvas in sync.

   Route → level mapping (the route IS the manager level):
     /admin/territories/provinces?province=punjab          → Province focus
     /admin/territories/cities?province=punjab             → Cities, Punjab-scoped
     /admin/territories/cities?province=punjab&district=sialkot → District focus
     /admin/territories/zones?district=sialkot&zone=cantt  → Zone focus
     /admin/territories/zones?...&zone=cantt&locality=<id> → Locality focus

   `add=district|zone|locality|province` rides along on any of the above to
   open a creation modal pre-scoped to the linked territory. A legacy
   `?nodeId=<id>` bookmark still resolves (mapped through the node index by
   the view). */

import type { ReadonlyURLSearchParams } from "next/navigation";
import type { CityItem } from "@/types/civic";
import type { TerritoryNode } from "@/lib/territoryTree";
import { slugify } from "@/utils/territoryExport";

export const TERRITORY_ROUTES = {
  provinces: "/admin/territories/provinces",
  cities: "/admin/territories/cities",
  zones: "/admin/territories/zones",
} as const;

export type TerritoryRouteLevel = keyof typeof TERRITORY_ROUTES;

/* ------------------------------- URL builders ----------------------------- */

export const provinceUrl = (provinceName: string) =>
  `${TERRITORY_ROUTES.provinces}?province=${slugify(provinceName)}`;

/** District deck — the parent province rides along so the left tree can
    auto-expand the right accordion on arrival. */
export const districtUrl = (city: Pick<CityItem, "province" | "name_en">) =>
  `${TERRITORY_ROUTES.cities}?province=${slugify(city.province)}&district=${slugify(city.name_en)}`;

/** Cities manager scoped to one province ("Manage Districts & Cities →"). */
export const citiesUrl = (provinceName: string) =>
  `${TERRITORY_ROUTES.cities}?province=${slugify(provinceName)}`;

/** Zones manager scoped to one district. */
export const zonesUrl = (city: Pick<CityItem, "name_en">) =>
  `${TERRITORY_ROUTES.zones}?district=${slugify(city.name_en)}`;

export const zoneUrl = (
  city: Pick<CityItem, "province" | "name_en">,
  zoneName: string,
  localityId?: string
) =>
  `${TERRITORY_ROUTES.zones}?province=${slugify(city.province)}&district=${slugify(city.name_en)}&zone=${slugify(zoneName)}${
    localityId ? `&locality=${encodeURIComponent(localityId)}` : ""
  }`;

/** URL for any tree node — cross-routes to the node's manager level. */
export function territoryNodeUrl(node: TerritoryNode): string {
  switch (node.level) {
    case "province":
      return provinceUrl(node.name);
    case "city":
      return districtUrl({ province: node.city!.province, name_en: node.name });
    case "zone":
      return zoneUrl(
        { province: node.city!.province, name_en: node.city!.name_en },
        node.zone!.name
      );
    case "mohallah":
      return zoneUrl(
        { province: node.city!.province, name_en: node.city!.name_en },
        node.zone!.name,
        node.area!.id
      );
  }
}

/* ------------------------------ Focus resolver ---------------------------- */

/** The selection derived from the URL — null nodeId means the level
    dashboard (Province Manager / Districts & Cities / Tehsils & Zones). */
export interface TerritoryFocus {
  provinceParam?: string;
  districtParam?: string;
  zoneParam?: string;
  localityParam?: string;
  addParam?: string;
  /** Deck node to render (validated against the node index by the view). */
  nodeId: string | null;
  /** Resolved display names scoping the dashboards / modal defaults. */
  scopeProvinceName?: string;
  scopeDistrictName?: string;
  scopeCityId?: string;
  scopeZoneName?: string;
}

const findCityByDistrictSlug = (
  cities: CityItem[],
  districtSlug: string,
  provinceSlug?: string
): CityItem | undefined =>
  cities.find(
    (c) =>
      slugify(c.name_en) === districtSlug &&
      (!provinceSlug || slugify(c.province) === provinceSlug)
  ) ?? cities.find((c) => slugify(c.name_en) === districtSlug);

const findCityByZoneSlug = (
  cities: CityItem[],
  zoneSlug: string,
  districtSlug?: string,
  provinceSlug?: string
): CityItem | undefined =>
  cities.find((c) => {
    if (districtSlug && slugify(c.name_en) !== districtSlug) return false;
    if (provinceSlug && slugify(c.province) !== provinceSlug) return false;
    const zoneNames = [
      ...(c.zones ?? []).map((z) => z.name_en),
      ...c.areas.map((a) => a.town?.trim() || "General"),
    ];
    return zoneNames.some((n) => slugify(n) === zoneSlug);
  });

/** Resolve the territory focus from URL search params. Pure — the view
    validates the returned nodeId against its node index (a stale deep link
    degrades to the dashboard instead of a broken deck). */
export function resolveTerritoryFocus(
  searchParams: ReadonlyURLSearchParams,
  cities: CityItem[]
): TerritoryFocus {
  const provinceParam = searchParams.get("province") ?? undefined;
  const districtParam = searchParams.get("district") ?? undefined;
  const zoneParam = searchParams.get("zone") ?? undefined;
  const localityParam = searchParams.get("locality") ?? undefined;
  const addParam = searchParams.get("add") ?? undefined;

  const focus: TerritoryFocus = {
    provinceParam,
    districtParam,
    zoneParam,
    localityParam,
    addParam,
    nodeId: null,
  };

  // Scope names (case-insensitive slug matches against the live roster).
  if (provinceParam) {
    focus.scopeProvinceName = cities.find(
      (c) => slugify(c.province) === provinceParam
    )?.province;
  }

  const districtCity = districtParam
    ? findCityByDistrictSlug(cities, districtParam, provinceParam)
    : undefined;
  if (districtCity) {
    focus.scopeDistrictName = districtCity.name_en;
    focus.scopeCityId = districtCity.id;
    focus.scopeProvinceName ??= districtCity.province;
  }

  const zoneCity = zoneParam
    ? findCityByZoneSlug(
        cities,
        zoneParam,
        districtParam,
        provinceParam
      )
    : undefined;
  if (zoneCity) {
    focus.scopeCityId = zoneCity.id;
    focus.scopeDistrictName = zoneCity.name_en;
    focus.scopeProvinceName ??= zoneCity.province;
    // Prefer the persisted zone entry's exact name, then the town cluster.
    const persisted = (zoneCity.zones ?? []).find(
      (z) => slugify(z.name_en) === zoneParam
    );
    const towned = zoneCity.areas.find(
      (a) => slugify(a.town?.trim() || "General") === zoneParam
    );
    focus.scopeZoneName = persisted?.name_en ?? towned?.town?.trim();
    focus.nodeId = `zone-${zoneCity.id}-${zoneParam}`;

    if (localityParam) {
      const area = zoneCity.areas.find((a) => a.id === localityParam);
      if (area) focus.nodeId = area.id;
    }
    return focus;
  }

  if (districtCity) {
    focus.nodeId = districtCity.id;
    return focus;
  }

  /* A bare ?province= slug deliberately does NOT resolve to a node here —
     whether it focuses the province deck (provinces route) or merely scopes
     the cities/zones dashboard is the calling route's decision. */
  return focus;
}
