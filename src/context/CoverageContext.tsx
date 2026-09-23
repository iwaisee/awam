"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AGENCY_OPTIONS,
  DEFAULT_JURISDICTION,
  JURISDICTION_TYPES,
  normalizeAreaInput,
  toUrgencyLevel,
  type AreaInput,
  type AreaItem,
  type CategoryRule,
  type CityItem,
  type JurisdictionType,
  type ProvinceItem,
  type ZoneItem,
} from "@/types/civic";

export type { AreaItem, CityItem, ProvinceItem, ZoneItem };


/** Keep stored category rows valid when the schema gains fields. Legacy
    agency tags (WASA/LWMC/LESCO era) fold into MCS, the municipal desk. */
function normalizeCategory(raw: CategoryRule): CategoryRule | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name_en !== "string")
    return null;
  return {
    ...raw,
    description: raw.description ?? "",
    icon_name: raw.icon_name || "Layers",
    default_agency: AGENCY_OPTIONS.includes(raw.default_agency)
      ? raw.default_agency
      : "MCS",
    sla_hours: Number.isFinite(raw.sla_hours) && raw.sla_hours > 0 ? raw.sla_hours : 24,
    urgency: toUrgencyLevel(raw.urgency),
    status: raw.status === "disabled" ? "disabled" : "active",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    supported_cities: Array.isArray(raw.supported_cities)
      ? raw.supported_cities
      : ["all"],
    allowed_jurisdictions: Array.isArray(raw.allowed_jurisdictions)
      ? raw.allowed_jurisdictions
      : ["all"],
  };
}

interface CoverageContextValue {
  cities: CityItem[];
  provinces: ProvinceItem[];
  /** True once the authoritative Neon coverage document has been fetched
      (successfully or not). Gate first paints on this — the roster starts
      empty and is never seeded. */
  hydrated: boolean;
  /** Register a top-level province / region created by the Customizer Studio
      (full configuration payload) — standalone districts may follow. */
  addProvince: (province: ProvinceItem) => void;
  /** Update a province from the creator/editor modal — renaming re-points
      every district filed under it; the other fields merge into the roster
      entry (identity, seat, registry code, lifecycle). */
  updateProvince: (
    name: string,
    patch: {
      name_en?: string;
      name_ur?: string;
      status?: "draft" | "active";
    } & Partial<Omit<ProvinceItem, "name_en" | "name_ur" | "status">>
  ) => void;
  /** Delete a province together with every district (and localities) under it. */
  deleteProvince: (name: string) => void;
  addCity: (city: Omit<CityItem, "id" | "active_reports">) => void;
  toggleCityStatus: (cityId: string) => void;
  deleteCity: (cityId: string) => void;
  updateCity: (
    cityId: string,
    patch: Partial<Omit<CityItem, "id" | "areas">>
  ) => void;
  addArea: (cityId: string, area: AreaInput) => void;
  removeArea: (cityId: string, areaId: string) => void;
  updateArea: (
    cityId: string,
    areaId: string,
    patch: Partial<Omit<AreaItem, "id">>
  ) => void;
  /** Create an empty parent zone (localities are added to it afterwards). */
  addZone: (
    cityId: string,
    zone: { name_en: string; name_ur?: string; jurisdiction: JurisdictionType }
  ) => void;
  /** Rename a zone and/or change its governing jurisdiction. Renaming
      re-points every child locality's town; a jurisdiction change is applied
      to all child localities (it is the zone's governing desk). The optional
      routing fields (authority/supervisor/contact/office) feed the territory
      governance deck and are inherited by localities without overrides. */
  updateZone: (
    cityId: string,
    zoneName: string,
    patch: {
      name_en?: string;
      name_ur?: string;
      jurisdiction?: JurisdictionType;
      authority?: string;
      supervisor?: string;
      contact?: string;
      office?: string;
    }
  ) => void;
  /** Delete a zone together with all of its child localities. */
  deleteZone: (cityId: string, zoneName: string) => void;
  /** Bulk-import a parsed zone tree (file import): zone entries are upserted
      by name and localities whose name is new to the district are appended.
      Existing localities are never modified or removed. */
  importZones: (
    cityId: string,
    zones: {
      name_en: string;
      name_ur?: string;
      jurisdiction?: JurisdictionType;
      areas?: AreaInput[];
    }[]
  ) => void;
  getActiveCities: () => CityItem[];
  getAreasByCity: (cityName: string) => AreaItem[];
  /** Active city + only UCs currently open for citizen reporting. */
  getReportableAreas: (cityName: string) => AreaItem[];
  categories: CategoryRule[];
  addCategory: (rule: Omit<CategoryRule, "id">) => void;
  updateCategory: (id: string, patch: Partial<Omit<CategoryRule, "id">>) => void;
  removeCategory: (id: string) => void;
  toggleCategoryStatus: (id: string) => void;
}

const CoverageContext = createContext<CoverageContextValue | null>(null);

export function CoverageProvider({ children }: { children: ReactNode }) {
  const [cities, setCities] = useState<CityItem[]>([]);
  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [categories, setCategories] = useState<CategoryRule[]>([]);
  /** True once the authoritative Neon document has been fetched and adopted
      (or the fetch failed and the roster stays empty). Consumers gate their
      first paint on this so no seed/mock roster is ever rendered. */
  const [hydrated, setHydrated] = useState(false);

  /* ------------------------ Neon sync (single source) ----------------------- */
  /* The coverage document — cities, category rules, province roster — lives in
     normalized Neon tables (provinces/cities/zones/areas/category_rules) behind
     /api/territories. Neon is the ONLY data source: state starts empty and is
     populated by the initial GET; there is no seed and no localStorage copy. */

  const serverDocRef = useRef("");
  /** True once the initial server GET has settled. The debounced push must
      not fire before that: a push of empty/default state on every mount
      would clobber the shared document. */
  const serverSettledRef = useRef(false);

  useEffect(() => {
    // One-time cleanup of localStorage keys the retired seed/cache layer
    // used to write — they are dead weight now that Neon is the only store.
    const RETIRED_KEYS = [
      "sada_coverage_data",
      "sada_category_rules",
      "sada_provinces",
      "sada_provinces_seed_version",
      "sada_coverage_schema_version",
      "sada_sialkot_towns",
      "sada_departments_registry",
      "sada_departments_schema",
    ];
    for (const key of RETIRED_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Storage unavailable — nothing to clean.
      }
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/territories", { cache: "no-store" });
        const data = (await res.json()) as {
          value?: {
            cities?: CityItem[];
            categories?: CategoryRule[];
            provinces?: ProvinceItem[];
          };
          seeded?: boolean;
        };
        if (cancelled) return;
        if (data.seeded && data.value) {
          // The database is authoritative — adopt its document.
          const doc = data.value;
          serverDocRef.current = JSON.stringify(doc);
          if (Array.isArray(doc.cities)) setCities(doc.cities);
          if (Array.isArray(doc.categories)) {
            setCategories(
              doc.categories
                .map(normalizeCategory)
                .filter((c): c is CategoryRule => c !== null)
            );
          }
          if (Array.isArray(doc.provinces) && doc.provinces.length > 0) {
            setProvinces(
              doc.provinces.filter((p) => p && typeof p.name_en === "string")
            );
          }
        } else {
          // Fresh, empty database — remember the empty baseline so this
          // session's first edit pushes the full document.
          serverDocRef.current = JSON.stringify({
            cities: [],
            categories: [],
            provinces: [],
          });
        }
        // Only a successful GET arms the push effect. If the server is
        // unreachable at load, staying unsettled blocks every push — the
        // in-memory roster must never overwrite the shared document with a
        // half-loaded (empty) snapshot.
        serverSettledRef.current = true;
      } catch {
        // Server unreachable — surfaces render their empty/loading states.
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced push of local edits into the shared document.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      // The initial GET may still be in flight — the hydrated cache is not
      // this session's edit yet, so it must never be pushed (see the ref).
      if (!serverSettledRef.current) return;
      const doc = { cities, categories, provinces };
      const json = JSON.stringify(doc);
      if (json === serverDocRef.current) return; // echo of a server apply
      serverDocRef.current = json;
      void fetch("/api/territories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: doc }),
      }).catch(() => {
        // Offline — the next edit retries.
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cities, categories, provinces, hydrated]);

  const addProvince = useCallback((province: ProvinceItem) => {
    const name = province.name_en.trim();
    if (!name) return;
    setProvinces((prev) =>
      prev.some((p) => p.name_en.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, { ...province, name_en: name }]
    );
  }, []);

  const updateProvince = useCallback(
    (
      name: string,
      patch: {
        name_en?: string;
        name_ur?: string;
        status?: "draft" | "active";
      } & Partial<Omit<ProvinceItem, "name_en" | "name_ur" | "status">>
    ) => {
      const nextName = patch.name_en?.trim() || name;
      const { status, ...rest } = patch;
      setProvinces((prev) =>
        prev.map((p) =>
          p.name_en === name
            ? {
                ...p,
                ...rest,
                // Trimmed identity wins over the raw patch spread.
                name_en: nextName,
                name_ur:
                  patch.name_ur !== undefined
                    ? patch.name_ur.trim() || undefined
                    : p.name_ur,
                ...(status !== undefined ? { status } : {}),
              }
            : p
        )
      );
      // Renaming a region re-points every district filed under it.
      setCities((prev) =>
        prev.map((c) => (c.province === name ? { ...c, province: nextName } : c))
      );
    },
    []
  );

  const deleteProvince = useCallback((name: string) => {
    setCities((prev) => prev.filter((c) => c.province !== name));
    setProvinces((prev) => prev.filter((p) => p.name_en !== name));
  }, []);

  const addCity = useCallback(
    (city: Omit<CityItem, "id" | "active_reports">) => {
      setCities((prev) => [
        ...prev,
        { ...city, id: `city-${Date.now()}`, active_reports: 0 },
      ]);
    },
    []
  );

  const toggleCityStatus = useCallback((cityId: string) => {
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityId
          ? { ...c, status: c.status === "active" ? "disabled" : "active" }
          : c
      )
    );
  }, []);

  const deleteCity = useCallback((cityId: string) => {
    setCities((prev) => prev.filter((c) => c.id !== cityId));
  }, []);

  const updateCity = useCallback(
    (cityId: string, patch: Partial<Omit<CityItem, "id" | "areas">>) => {
      setCities((prev) =>
        prev.map((c) => (c.id === cityId ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const updateArea = useCallback(
    (cityId: string, areaId: string, patch: Partial<Omit<AreaItem, "id">>) => {
      setCities((prev) =>
        prev.map((c) =>
          c.id === cityId
            ? {
                ...c,
                areas: c.areas.map((a) =>
                  a.id === areaId ? { ...a, ...patch } : a
                ),
              }
            : c
        )
      );
    },
    []
  );

  const addArea = useCallback((cityId: string, area: AreaInput) => {
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityId
          ? {
              ...c,
              areas: [
                ...c.areas,
                // Missing municipal metadata (UC #, jurisdiction, division)
                // is silently defaulted so a name is all an admin needs.
                { ...normalizeAreaInput(area), id: `${cityId}-area-${Date.now()}` },
              ],
            }
          : c
      )
    );
  }, []);

  const removeArea = useCallback((cityId: string, areaId: string) => {
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityId
          ? { ...c, areas: c.areas.filter((a) => a.id !== areaId) }
          : c
      )
    );
  }, []);

  const addZone = useCallback(
    (
      cityId: string,
      zone: { name_en: string; name_ur?: string; jurisdiction: JurisdictionType }
    ) => {
      setCities((prev) =>
        prev.map((c) =>
          c.id === cityId ? { ...c, zones: [...(c.zones ?? []), zone] } : c
        )
      );
    },
    []
  );

  const updateZone = useCallback(
    (
      cityId: string,
      zoneName: string,
      patch: {
        name_en?: string;
        name_ur?: string;
        jurisdiction?: JurisdictionType;
        authority?: string;
        supervisor?: string;
        contact?: string;
        office?: string;
      }
    ) => {
      setCities((prev) =>
        prev.map((c) => {
          if (c.id !== cityId) return c;
          const nextName = patch.name_en?.trim() || zoneName;
          const zones = c.zones ?? [];
          const existing = zones.some((z) => z.name_en === zoneName);
          // Routing fields follow the same "undefined = leave unchanged"
          // contract as name_ur; an empty string clears the override.
          const routingPatch = {
            authority:
              patch.authority !== undefined
                ? patch.authority.trim() || undefined
                : undefined,
            supervisor:
              patch.supervisor !== undefined
                ? patch.supervisor.trim() || undefined
                : undefined,
            contact:
              patch.contact !== undefined
                ? patch.contact.trim() || undefined
                : undefined,
            office:
              patch.office !== undefined
                ? patch.office.trim() || undefined
                : undefined,
          };
          const nextZones: ZoneItem[] = existing
            ? zones.map((z) =>
                z.name_en === zoneName
                  ? {
                      ...z,
                      name_en: nextName,
                      name_ur:
                        patch.name_ur !== undefined
                          ? patch.name_ur.trim() || undefined
                          : z.name_ur,
                      jurisdiction: patch.jurisdiction ?? z.jurisdiction,
                      ...(patch.authority !== undefined
                        ? { authority: routingPatch.authority }
                        : {}),
                      ...(patch.supervisor !== undefined
                        ? { supervisor: routingPatch.supervisor }
                        : {}),
                      ...(patch.contact !== undefined
                        ? { contact: routingPatch.contact }
                        : {}),
                      ...(patch.office !== undefined
                        ? { office: routingPatch.office }
                        : {}),
                    }
                  : z
              )
            : // Implicit zone (derived from area towns) — materialize it.
              // The jurisdiction falls back to what its localities already
              // carry (e.g. Cantonment Board), never silently to the district
              // default — writing routing details must not re-govern the zone.
              [
                ...zones,
                {
                  name_en: nextName,
                  name_ur: patch.name_ur?.trim() || undefined,
                  jurisdiction:
                    patch.jurisdiction ??
                    c.areas.find((a) => a.town === zoneName)?.jurisdiction ??
                    DEFAULT_JURISDICTION,
                  authority: routingPatch.authority,
                  supervisor: routingPatch.supervisor,
                  contact: routingPatch.contact,
                  office: routingPatch.office,
                },
              ];
          const areas = c.areas.map((a) => {
            if (a.town !== zoneName) return a;
            const out = { ...a, town: nextName };
            if (patch.jurisdiction) out.jurisdiction = patch.jurisdiction;
            return out;
          });
          return { ...c, zones: nextZones, areas };
        })
      );
    },
    []
  );

  const deleteZone = useCallback((cityId: string, zoneName: string) => {
    setCities((prev) =>
      prev.map((c) =>
        c.id === cityId
          ? {
              ...c,
              zones: (c.zones ?? []).filter((z) => z.name_en !== zoneName),
              areas: c.areas.filter((a) => a.town !== zoneName),
            }
          : c
      )
    );
  }, []);

  /** One functional update for a whole imported file — never per-row addArea
      calls, which could mint colliding timestamp ids within the same millisecond. */
  const importZones = useCallback(
    (
      cityId: string,
      zones: {
        name_en: string;
        name_ur?: string;
        jurisdiction?: JurisdictionType;
        areas?: AreaInput[];
      }[]
    ) => {
      setCities((prev) =>
        prev.map((c) => {
          if (c.id !== cityId) return c;
          const nextZones = [...(c.zones ?? [])];
          const nextAreas = [...c.areas];
          const knownNames = new Set(
            nextAreas.map((a) => a.name_en.trim().toLowerCase())
          );
          const stamp = Date.now();
          zones.forEach((zone, zoneIndex) => {
            const zoneName = zone.name_en.trim();
            // Omitted jurisdiction means "keep what the district already has".
            const zoneJurisdiction =
              zone.jurisdiction && JURISDICTION_TYPES.includes(zone.jurisdiction)
                ? zone.jurisdiction
                : undefined;
            let effectiveJurisdiction = zoneJurisdiction ?? DEFAULT_JURISDICTION;
            if (zoneName) {
              const zoneIdx = nextZones.findIndex(
                (z) => z.name_en.toLowerCase() === zoneName.toLowerCase()
              );
              if (zoneIdx !== -1) {
                // File metadata is authoritative for the zone entry itself;
                // existing localities inside it stay untouched.
                effectiveJurisdiction = zoneJurisdiction ?? nextZones[zoneIdx].jurisdiction;
                nextZones[zoneIdx] = {
                  ...nextZones[zoneIdx],
                  name_ur: zone.name_ur?.trim() || nextZones[zoneIdx].name_ur,
                  jurisdiction: effectiveJurisdiction,
                };
              } else {
                nextZones.push({
                  name_en: zoneName,
                  name_ur: zone.name_ur?.trim() || undefined,
                  jurisdiction: effectiveJurisdiction,
                });
              }
            }
            for (const area of zone.areas ?? []) {
              const areaName = area.name_en?.trim();
              if (!areaName || knownNames.has(areaName.toLowerCase())) continue;
              knownNames.add(areaName.toLowerCase());
              nextAreas.push({
                ...normalizeAreaInput({
                  ...area,
                  name_en: areaName,
                  town: zoneName || area.town?.trim() || undefined,
                  jurisdiction: area.jurisdiction ?? effectiveJurisdiction,
                }),
                id: `${cityId}-area-${stamp}-${zoneIndex}-${nextAreas.length}`,
              });
            }
          });
          return { ...c, zones: nextZones, areas: nextAreas };
        })
      );
    },
    []
  );

  const getActiveCities = useCallback(
    () => cities.filter((c) => c.status === "active"),
    [cities]
  );

  const getAreasByCity = useCallback(
    (cityName: string) =>
      cities.find(
        (c) => c.status === "active" && c.name_en === cityName
      )?.areas ?? [],
    [cities]
  );

  const getReportableAreas = useCallback(
    (cityName: string) =>
      cities.find(
        (c) => c.status === "active" && c.name_en === cityName
      )?.areas.filter((a) => a.status !== "paused") ?? [],
    [cities]
  );

  const addCategory = useCallback((rule: Omit<CategoryRule, "id">) => {
    setCategories((prev) => [...prev, { ...rule, id: `cat-${Date.now()}` }]);
  }, []);

  const updateCategory = useCallback(
    (id: string, patch: Partial<Omit<CategoryRule, "id">>) => {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const removeCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleCategoryStatus = useCallback((id: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: c.status === "active" ? "disabled" : "active" }
          : c
      )
    );
  }, []);

  const value = useMemo(
    () => ({
      cities,
      provinces,
      hydrated,
      addProvince,
      updateProvince,
      deleteProvince,
      addCity,
      toggleCityStatus,
      deleteCity,
      updateCity,
      addArea,
      removeArea,
      updateArea,
      addZone,
      updateZone,
      deleteZone,
      importZones,
      getActiveCities,
      getAreasByCity,
      getReportableAreas,
      categories,
      addCategory,
      updateCategory,
      removeCategory,
      toggleCategoryStatus,
    }),
    [
      cities,
      provinces,
      hydrated,
      addProvince,
      updateProvince,
      deleteProvince,
      addCity,
      toggleCityStatus,
      deleteCity,
      updateCity,
      addArea,
      removeArea,
      updateArea,
      addZone,
      updateZone,
      deleteZone,
      importZones,
      getActiveCities,
      getAreasByCity,
      getReportableAreas,
      categories,
      addCategory,
      updateCategory,
      removeCategory,
      toggleCategoryStatus,
    ]
  );

  return (
    <CoverageContext.Provider value={value}>
      {children}
    </CoverageContext.Provider>
  );
}

export function useCoverage(): CoverageContextValue {
  const ctx = useContext(CoverageContext);
  if (!ctx) {
    throw new Error("useCoverage must be used within a CoverageProvider");
  }
  return ctx;
}
