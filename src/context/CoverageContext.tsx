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
  type AreaInput,
  type AreaItem,
  type CategoryRule,
  type CityItem,
  type JurisdictionType,
  type ProvinceItem,
  type ZoneItem,
} from "@/types/civic";
import { PILOT_CITIES } from "@/data/pilotCities";

export type { AreaItem, CityItem, ProvinceItem, ZoneItem };

/* ------------------------------ Default seed ------------------------------ */

/* ------------------------- Sialkot locality tree -------------------------- */
/* Scraped municipal address tree: town-level clusters under Sialkot, each
   with its mohallahs/villages. Cantonment areas carry their own jurisdiction;
   everything else defaults to the Municipal Corporation. */

const SIALKOT_TOWNS: { town: string; areas: string[] }[] = [
  {
    town: "Bijli Mohallah",
    areas: ["Bijli Mohallah"],
  },
  {
    town: "Cantonment",
    areas: ["Askari-I", "Askari-II", "Cantt Model Villas", "Lane 2", "Lane 6"],
  },
  {
    town: "City",
    areas: [
      "Ajmal Garden Colony",
      "Akbarabad",
      "Al Hadi Town",
      "Anwar Pura",
      "Aslam Nagar",
      "Behari Colony",
      "Bharth",
      "Bilal Town",
      "Cantt View Colony",
      "Christian Town",
      "Church Area",
      "Civil Lines",
      "Colony Opposite Dawn Bagh",
      "Diamond City",
      "Faiz Colony",
      "Ghazipur",
      "Gohad Pur",
      "Gulshan Town",
      "Hadi Town",
      "Hamza Ghaus",
      "Hunter Pura",
      "Iqbal Town",
      "Islamabad Mohalla",
      "Islamia Park",
      "Karim Pura",
      "Kharkana",
      "Latif Abad",
      "Miana Pura",
      "Model Town",
      "Model Town Gohadpur",
      "Mohallah Chapri",
      "Mohalla Khajori Wala",
      "Mori Gate",
      "Mubarak Pura",
      "Muhammad Pura",
      "Muradpur",
      "Muzaffarpur",
      "Nadir Town",
      "Neka Pura",
      "New Miana Pura",
      "Noorabad",
      "Pakka Garha",
      "Paris Road & Commissioner Rd",
      "Punjab Colony",
      "Ruby Villas",
      "Shamspura",
      "Shatab Garh",
      "Small Industrial Estate",
      "Staff Colony ATC",
      "Sultan Pur",
      "Talwara Mughlan",
      "Tauheed Town",
      "Tehsil Bazar",
    ],
  },
  {
    town: "Haji Pura",
    areas: [
      "Abad Nager",
      "Ansari Colony",
      "Bogra",
      "Charagh Pura",
      "Chitti Khan Ga",
      "Feruz Pura",
      "Haji Pura Pulak",
      "Jhamat Town",
      "Muslim Colony",
      "Taj Pura",
    ],
  },
  {
    town: "Imam Sahib",
    areas: [
      "Ali Town",
      "Mohallah Arali Yaqoob",
      "New Abadi",
      "Sherwani Colony",
    ],
  },
  {
    town: "Kashmiri Mohallah",
    areas: [
      "Do Darwaza Chowk",
      "Mohallah Dharowal",
      "Pholo Wali Gali",
      "Shabhala",
      "Tanchi Mohallah",
      "Tiba Jhalian",
      "Tiba Kake Zaiyan",
      "Tiba Syedhan",
    ],
  },
  {
    town: "Rangpura",
    areas: ["Chari Wali Gali", "Laalpura"],
  },
  {
    town: "Villages",
    areas: [
      "Addah",
      "Ahmed Nagar Boonga",
      "Ajjuwali",
      "Alo Chak",
      "Anjotar",
      "Badhian",
      "Bajra Ghari",
      "Ballan Wala",
      "Baooli",
      "Bary Tager",
      "Basantpur",
      "Beerh",
      "Begwal",
      "Bhabrianwala",
      "Bhadal",
      "Bhago Bhatty",
      "Bhattay Kalan",
      "Bheko Choher",
      "Bhindar",
      "Bhoroki",
      "Bhoth",
      "Brame Chak",
      "Chadiala",
      "Chak Aadla",
      "Chak Maluk",
      "Chak Mandhar",
      "Chak Qazi",
      "Channumome",
      "Chaprar",
      "Charind",
      "Charwa",
      "Chela Sialkot",
      "Chhabilpur",
      "Chhani",
      "Chhichhar Wali",
      "Chhowni Sulehrian",
      "Chitti Sheikhan",
      "Daluwali",
      "Darkaliyan",
      "Dhalay",
      "Dhane",
      "Dhatal",
      "Dheera Sandha",
      "Dhelum Ghazi",
      "Dhesian",
      "Dhuddianwali",
      "Dhudianwali",
      "Dinge",
      "Dogran",
      "Dulchike",
      "Dusri",
      "Faizabad",
      "Ganjianwali Kalan",
      "Ghaniabad",
      "Ghansar Pur",
      "Ghattorora",
      "Ghuinke",
      "Gondal",
      "Gopal Pur",
      "Grahi Bora",
      "Gulbahar Niki",
      "Gulbahar Nikki",
      "Gunna Kalaan",
      "Gunna Khurd",
      "Happugarh",
      "Haripur",
      "Harpal",
      "Harrar",
      "Head Marala",
      "Heer",
      "Hundal",
      "Ismail Awan",
      "Jajay",
      "Jalphanwali",
      "Jamke Cheema Town",
      "Jangmur",
      "Jattha",
      "Jaurian",
      "Jaurian Kalan",
      "Jaurian Khurd",
      "Jhai",
      "Jhulki",
      "Jhun",
      "Jodhay Wali",
      "Jura",
      "Kais",
      "Kajhuriwala",
      "Kala",
      "Kalahrawan",
      "Kala Khambra",
      "Kalaswala Town",
      "Kallu Payara",
      "Kamanwala",
      "Kapurowali",
      "Karane Chak",
      "Karwarpur",
      "Kharani",
      "Kharolian Khas",
      "Kharota Syedan",
      "Khichian",
      "Kingra Mor",
      "Kishnaywali Kothey",
      "Kotbagrian",
      "Kot Bawa",
      "Kot Bhage",
      "Kot Bukhran",
      "Kot Chanda",
      "Kot Harrar",
      "Kot Karam Baksh",
      "Kotla Ambanwala Village",
      "Kotli Amir Ali",
      "Kotli Araian Kalan",
      "Kotli Bago",
      "Kotli Bhutta",
      "Kotli Fareed",
      "Kotli Loharan",
      "Kotli Loharan East",
      "Kotli Said Mir",
      "Kotli Telian",
      "Kot Manan",
      "Kubba Chak",
      "Lakhan Pur",
      "Lalpur",
      "Laluke",
      "Langeriali",
      "Lodhary",
      "Lopowali",
      "Machhi Khokar",
      "Machhi Khokhar",
      "Mahal Magra",
      "Malagarpur",
      "Malhappar Village",
      "Malke Khurd",
      "Maluchit",
      "Mandianwala",
      "Mangu Bahram",
      "Marakiwal",
      "Merajke",
      "Miani",
      "Moman Khurd",
      "Mughal Town Gunjianwala",
      "Mughal Town Gunjianwali",
      "Mughlanwali",
      "Mundair Khurd",
      "Mundair Sharif Syedan",
      "Mundair Sharif Syeden",
      "Nagaur",
      "Nandpur",
      "Nangal",
      "Nawa Bahlool",
      "Nawan Male Chak",
      "Nawan Pind",
      "Nidoke",
      "Nika Marakiwal",
      "Noor Abad",
      "Noul Moor",
      "Olakh Jatthan",
      "Pakhar",
      "Pakki Kotli",
      "Paropi Arayian",
      "Patesar",
      "Pathan Wali",
      "Phullo Deota",
      "Pindi Bhago",
      "Pragpur",
      "Punnowal",
      "Putlia Chak",
      "Qulli Salah",
      "Raipur",
      "Raja Harpal",
      "Rangpur Jetan",
      "Rangpur Saroch",
      "Rasoolpur Balian",
      "Rasoolpur Bhallian",
      "Raspur",
      "Rasulpur",
      "Rattowal Syedan",
      "Sabzi Mandi Sialkot",
      "Sadray",
      "Sagar",
      "Sahowali",
      "Saidanwal",
      "Saidanwali",
      "Said Pur",
      "Saidra Khurd",
      "Saleempur",
      "Sandhwala",
      "Sandrana",
      "Sargpur",
      "Sattowali",
      "Shaddi Wal",
      "Shehni Shehar",
      "Sherpur",
      "Sidh",
      "Sukhnian",
      "Tahoo",
      "Talwara",
      "Taukan",
      "Thathi",
      "Tibawali",
      "Tibbi",
      "Tilakpur",
      "Tufail Kot",
      "Umranwali",
      "Veerum",
      "Wahgran",
      "Wariam",
      "Wario",
      "Waziray Chak",
    ],
  },
];

const SIALKOT_AREAS: AreaItem[] = SIALKOT_TOWNS.flatMap(({ town, areas }) =>
  areas.map((name_en, index) => ({
    id: `sialkot-${town.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
    name_en,
    // Every area carries its town so the cascading picker can reach it.
    town,
    ...(town === "Cantonment"
      ? { jurisdiction: "Cantonment Board" as const }
      : {}),
  }))
);

/** Urdu labels for the pilot town clusters (zone cards show both scripts). */
const SIALKOT_ZONE_URDU: Record<string, string> = {
  "Bijli Mohallah": "بجلی محلہ",
  Cantonment: "کینٹ",
  City: "شہر",
  "Haji Pura": "حاجی پورہ",
  "Imam Sahib": "امام صاحب",
  "Kashmiri Mohallah": "کشمیری محلہ",
  Rangpura: "رنگ پورہ",
  Villages: "دیہات",
};

/** Parent operational zones for the pilot district — one per town cluster.
    Cantonment is its own jurisdiction; every other zone defaults to the
    Municipal Corporation. */
const SIALKOT_ZONES: ZoneItem[] = SIALKOT_TOWNS.map(({ town }) => ({
  name_en: town,
  name_ur: SIALKOT_ZONE_URDU[town],
  jurisdiction:
    town === "Cantonment"
      ? ("Cantonment Board" as const)
      : ("Municipal Corporation" as const),
}));

/**
 * The reporting wizard's coverage seed is the SAME roster the landing launcher
 * uses (PILOT_CITIES) — only the active pilot district carries a locality
 * tree, so a district becomes reportable purely by activating it in the seed.
 */
const SEED_CITIES: CityItem[] = PILOT_CITIES.map((city) =>
  city.id === "sialkot" && city.status === "active"
    ? { ...city, areas: SIALKOT_AREAS, zones: SIALKOT_ZONES }
    : city
);

/** Province roster seed — the standard Pakistani provincial hierarchy the
    console ships with. Punjab is the live pilot; Sindh and Balochistan ride
    as Setup / Planned cards until their municipal desks go live; Islamabad
    Capital Territory backs the Phase-2 district of the same name. Balochistan
    is spelled with the correct "Baloch" root (not "Blochistan") everywhere. */
const SEED_PROVINCES: ProvinceItem[] = [
  {
    kind: "province",
    name_en: "Punjab",
    name_ur: "پنجاب",
    capital: "Lahore",
    code: "PROV-PUN",
    slug: "PK-PU",
    lifecycle: "phase1_pilot",
    status: "active",
    admin_model: "provincial_lg_dept",
  },
  {
    kind: "province",
    name_en: "Sindh",
    name_ur: "سندھ",
    capital: "Karachi",
    code: "PROV-SIN",
    slug: "PK-SD",
    lifecycle: "infrastructure",
    status: "active",
    admin_model: "provincial_lg_dept",
  },
  {
    kind: "province",
    name_en: "Balochistan",
    name_ur: "بلوچستان",
    capital: "Quetta",
    code: "PROV-BAL",
    slug: "PK-BA",
    lifecycle: "planned",
    status: "active",
    admin_model: "provincial_lg_dept",
  },
  {
    kind: "territory",
    name_en: "Islamabad Capital Territory",
    name_ur: "وفاقی راجگڑھ اسلام آباد",
    capital: "Islamabad",
    code: "PROV-ICT",
    slug: "PK-IS",
    lifecycle: "planned",
    status: "active",
    admin_model: "capital_territory_authority",
  },
];

/* --------------------------- Default category rules ------------------------ */
/* The Sialkot dispatch roster: each card routes to the agency that actually
   operates that service in the district. MCS categories exclude cantt
   jurisdiction because the Cantonment Board runs its own water, road and
   sanitation desks inside cantonment limits (see cantonment_infrastructure). */

const NON_CANTT_JURISDICTIONS = [
  "Municipal Corporation",
  "Development Authority",
  "Private Housing",
] as const;

const SEED_CATEGORIES: CategoryRule[] = [
  {
    id: "sanitation",
    name_en: "Sanitation & Waste",
    name_ur: "صفائی",
    description: "Garbage piles, overflowing bins, missed commercial waste pickups",
    icon_name: "Trash2",
    default_agency: "SWMC",
    sla_hours: 12,
    urgency: "high",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: [...NON_CANTT_JURISDICTIONS],
    tags: [
      "Overflowing Dumpster",
      "Dead Animal / Carcass",
      "Missed Street Sweeping",
      "Leather Factory Scrap",
      "Illegal Plot Dump",
    ],
  },
  {
    id: "broken_road",
    name_en: "Broken Road & Potholes",
    name_ur: "ٹوٹی سڑک",
    description:
      "Potholes, asphalt collapse, damaged footpaths, industrial corridor damage",
    icon_name: "Construction",
    default_agency: "MCS",
    sla_hours: 48,
    urgency: "routine",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: [...NON_CANTT_JURISDICTIONS],
    tags: [
      "Deep Vehicle Crater",
      "Sunken Asphalt Trench",
      "Broken Paver Footpath",
      "Industrial Road Damage",
    ],
  },
  {
    id: "open_manhole",
    name_en: "Open Manhole & Drains",
    name_ur: "کھلا گٹر / نالی",
    description: "Uncovered sewer chambers, collapsed drain slabs, stormwater choking",
    icon_name: "AlertOctagon",
    default_agency: "MCS",
    sla_hours: 6,
    urgency: "emergency",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: [...NON_CANTT_JURISDICTIONS],
    tags: [
      "Missing Cover (High Danger)",
      "Broken Chamber Slab",
      "Sewage Backflow in Street",
      "Choked Storm Drain",
    ],
  },
  {
    id: "water_leak",
    name_en: "Water Leak & Supply Failure",
    name_ur: "پانی کا رساؤ",
    description: "Burst municipal supply lines, contamination, low pressure",
    icon_name: "Droplets",
    default_agency: "MCS",
    sla_hours: 12,
    urgency: "high",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: [...NON_CANTT_JURISDICTIONS],
    tags: ["Burst Pipeline", "Contaminated Water", "Low Pressure", "No Supply"],
  },
  {
    id: "electricity",
    name_en: "Electricity Hazard",
    name_ur: "بجلی کا خطرہ",
    description:
      "Loose 11kV wires, sparking transformers, leaning poles, blackout faults",
    icon_name: "Zap",
    default_agency: "GEPCO",
    sla_hours: 4,
    urgency: "emergency",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: ["all"],
    tags: [
      "Hanging 11kV Wire",
      "Sparking Transformer",
      "Leaning Electric Pole",
      "Open Feeder Box",
    ],
  },
  {
    id: "traffic",
    name_en: "Traffic & Encroachment Bottleneck",
    name_ur: "ٹریفک اور تجاوزات",
    description:
      "Broken traffic signals, illegal market encroachment, choked intersections",
    icon_name: "TrafficCone",
    default_agency: "CTP Sialkot",
    sla_hours: 2,
    urgency: "high",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: ["all"],
    tags: [
      "Bazaar Stall Encroachment",
      "Choked Chowk Jam",
      "Broken Signal",
      "Roadside Parking Block",
    ],
  },
  {
    id: "cantonment_infrastructure",
    name_en: "Cantonment Infrastructure",
    name_ur: "کینٹ بلدیاتی مسائل",
    description: "Water, road, or sanitation issues within Sialkot Cantonment limits",
    icon_name: "Landmark",
    default_agency: "Cantt Board",
    sla_hours: 24,
    urgency: "high",
    status: "active",
    supported_cities: ["all"],
    allowed_jurisdictions: ["Cantonment Board"],
    tags: [
      "Saddar Market Waste",
      "Cantt Sewer Choke",
      "Cantonment Pipe Burst",
    ],
  },
];

/* -------------------------------- Context --------------------------------- */

const STORAGE_KEY = "sada_coverage_data";
const CATEGORY_STORAGE_KEY = "sada_category_rules";
const PROVINCE_STORAGE_KEY = "sada_provinces";
/** Guards the province roster against seed revisions: a stored roster only
    hydrates when it was written under the CURRENT seed revision. This survives
    hot-reload traps where a live page persists the new schema constant while
    still holding an older in-memory roster. */
const PROVINCE_SEED_VERSION_KEY = "sada_provinces_seed_version";
const PROVINCE_SEED_VERSION = "2";
/** Bumped when the seed roster changes shape in a way stored data can't merge
    (see hydrate below). v4: the Phase-1 Sialkot pilot roster replaced the
    retired multi-city seed. v5: category seeds re-pointed to the final Sialkot
    agency roster (WASA/LWMC/LESCO desks folded into MCS; cantt gating).
    v6: quick-issue tag taxonomy seeded onto every category.
    v7: province roster seeded with the full four-region hierarchy (Punjab,
    Sindh, Balochistan, ICT) — stale rosters drop so Balochistan renders. */
const SCHEMA_KEY = "sada_coverage_schema_version";
const SCHEMA_VERSION = "7";
/** One-time Sialkot town-tree reseed marker (flips only after durable write). */
const SIALKOT_TOWNS_KEY = "sada_sialkot_towns";

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
    urgency: raw.urgency ?? "routine",
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
  const [cities, setCities] = useState<CityItem[]>(SEED_CITIES);
  const [provinces, setProvinces] = useState<ProvinceItem[]>(SEED_PROVINCES);
  const [categories, setCategories] = useState<CategoryRule[]>(SEED_CATEGORIES);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on first client mount. Storage reads run in a
  // deferred microtask so no setState fires synchronously inside the effect.
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      let pilotSchema = false;
      try {
        // Storages written before the pilot roster hold retired districts and
        // Lahore-era agency/jurisdiction tags that can't be merged forward, so
        // they are dropped once and the seed (written by the persist effects
        // below) becomes the source of truth again.
        pilotSchema =
          window.localStorage.getItem(SCHEMA_KEY) === SCHEMA_VERSION;
        const raw = pilotSchema ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (raw) {
          // Sialkot's scraped town→mohallah tree ships as a one-time reseed of
          // the old placeholder. The marker flips only after the migrated data
          // is durably written, so a crashed session can neither skip the
          // reseed nor replay it over later admin edits.
          const needsSialkotReseed =
            window.localStorage.getItem(SIALKOT_TOWNS_KEY) !== "3";
          const parsed = JSON.parse(raw) as CityItem[];
          let migrationsDurablyWritten = !needsSialkotReseed;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated = parsed.map((city) => {
              if (city.id === "sialkot" && needsSialkotReseed) {
                return { ...city, status: "active" as const, areas: SIALKOT_AREAS };
              }
              return city;
            });
            setCities(migrated);
            if (!migrationsDurablyWritten) {
              try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                migrationsDurablyWritten = true;
              } catch {
                // Quota failure — the seed write retries on next load; until it
                // lands, the reseed marker stays unset.
              }
            }
          }
          if (migrationsDurablyWritten) {
            window.localStorage.setItem(SIALKOT_TOWNS_KEY, "3");
          }
        } else {
          window.localStorage.setItem(SIALKOT_TOWNS_KEY, "3");
        }
        window.localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
      } catch {
        // Corrupt storage — fall back to the seed dataset.
      }
      if (!pilotSchema) {
        try {
          // Stale pre-pilot rows; the persist effects rewrite all three from
          // seed (the province roster too, so new seeded regions surface).
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem(CATEGORY_STORAGE_KEY);
          window.localStorage.removeItem(PROVINCE_STORAGE_KEY);
        } catch {
          // Storage unavailable — state stays on the seed for this session.
        }
      }
      try {
        const rawCat = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
        if (rawCat) {
          const parsedCat = JSON.parse(rawCat) as CategoryRule[];
          if (Array.isArray(parsedCat) && parsedCat.length > 0) {
            const normalized = parsedCat
              .map(normalizeCategory)
              .filter((c): c is CategoryRule => c !== null);
            if (normalized.length > 0) setCategories(normalized);
          }
        }
      } catch {
        // Keep the seed taxonomy when the stored one is unreadable.
      }
      try {
        const storedSeedVersion = window.localStorage.getItem(
          PROVINCE_SEED_VERSION_KEY
        );
        const rawProv =
          storedSeedVersion === PROVINCE_SEED_VERSION
            ? window.localStorage.getItem(PROVINCE_STORAGE_KEY)
            : null;
        if (rawProv) {
          const parsedProv = JSON.parse(rawProv) as ProvinceItem[];
          if (Array.isArray(parsedProv) && parsedProv.length > 0) {
            setProvinces(
              parsedProv.filter((p) => p && typeof p.name_en === "string")
            );
          }
        } else {
          // Roster predates the current seed revision (or is corrupt) — drop
          // it; the persist effect below writes the seeded roster instead.
          window.localStorage.removeItem(PROVINCE_STORAGE_KEY);
        }
      } catch {
        // Keep the seed provinces when the stored roster is unreadable.
      }
      setHydrated(true);
      })();
  }, []);

  // Persist every change back to localStorage once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
    } catch {
      // Storage full or unavailable — state still works in-memory.
    }
  }, [cities, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        CATEGORY_STORAGE_KEY,
        JSON.stringify(categories)
      );
    } catch {
      // Storage full or unavailable — state still works in-memory.
    }
  }, [categories, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        PROVINCE_STORAGE_KEY,
        JSON.stringify(provinces)
      );
      window.localStorage.setItem(PROVINCE_SEED_VERSION_KEY, PROVINCE_SEED_VERSION);
    } catch {
      // Storage full or unavailable — state still works in-memory.
    }
  }, [provinces, hydrated]);

  /* ------------------ Server sync (shared across browsers) ------------------ */
  /* The coverage document — cities, category rules, province roster — lives in
     the database (data/appstate.db via /api/state/coverage) so every browser
     edits the same roster. localStorage stays as the fast synchronous cache
     hydrated above. */

  const serverDocRef = useRef("");

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/state/coverage", { cache: "no-store" });
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
          // Fresh database — migrate the locally hydrated roster up.
          const doc = { cities, categories, provinces };
          serverDocRef.current = JSON.stringify(doc);
          await fetch("/api/state/coverage", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: doc }),
          });
        }
      } catch {
        // Server unreachable — the localStorage cache keeps working.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once after hydration — the migration PUT reads the locally
    // hydrated roster at that moment; later edits flow through the debounced
    // push effect below, so state deps are intentionally omitted here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Debounced push of local edits into the shared document.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const doc = { cities, categories, provinces };
      const json = JSON.stringify(doc);
      if (json === serverDocRef.current) return; // echo of a server apply
      serverDocRef.current = json;
      void fetch("/api/state/coverage", {
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
