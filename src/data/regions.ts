// ─── Region Definitions ─────────────────────────────────────────────
// 10 oil-trade regions with center coordinates and ISO-3166 alpha-3 codes.

export interface Region {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** ISO-3166 alpha-3 country codes belonging to this region */
  countries: string[];
  color: [number, number, number]; // RGB 0-255
}

export const REGIONS: Region[] = [
  {
    id: "north_america",
    name: "North America",
    lon: -90,
    lat: 30,
    countries: ["USA", "CAN", "MEX"],
    color: [30, 144, 255], // dodger blue
  },
  {
    id: "south_america",
    name: "South America",
    lon: -38,
    lat: -15,
    countries: [
      "BRA", "VEN", "COL", "ECU", "ARG", "PER", "CHL", "BOL", "PRY",
      "URY", "GUY", "SUR", "TTO",
    ],
    color: [34, 197, 94], // green
  },
  {
    id: "north_europe",
    name: "Northern Europe",
    lon: 3,
    lat: 57,
    countries: [
      "GBR", "NOR", "SWE", "DNK", "FIN", "NLD", "BEL", "DEU", "POL",
      "IRL", "ISL", "LTU", "LVA", "EST",
    ],
    color: [99, 102, 241], // indigo
  },
  {
    id: "med_europe",
    name: "Mediterranean Europe",
    lon: 15,
    lat: 40,
    countries: [
      "ITA", "ESP", "FRA", "GRC", "TUR", "PRT", "HRV", "SVN", "ROU",
      "BGR", "CYP", "MLT", "ALB", "MNE", "SRB", "MKD", "BIH", "HUN",
      "AUT", "CHE", "CZE", "SVK",
    ],
    color: [168, 85, 247], // purple
  },
  {
    id: "russia_cis",
    name: "Russia & CIS",
    lon: 50,
    lat: 60,
    countries: [
      "RUS", "KAZ", "AZE", "TKM", "UZB", "BLR", "UKR", "GEO", "ARM",
      "MDA", "KGZ", "TJK",
    ],
    color: [239, 68, 68], // red
  },
  {
    id: "middle_east",
    name: "Middle East",
    lon: 52,
    lat: 26,
    countries: [
      "SAU", "IRQ", "IRN", "ARE", "KWT", "QAT", "OMN", "YEM", "BHR",
      "JOR", "ISR", "LBN", "SYR",
    ],
    color: [245, 158, 11], // amber
  },
  {
    id: "africa",
    name: "Africa",
    lon: 5,
    lat: 3,
    countries: [
      "NGA", "AGO", "LBY", "DZA", "EGY", "GNQ", "GAB", "COG", "TCD",
      "CMR", "GHA", "CIV", "SDN", "SSD", "TUN", "MAR", "MOZ", "ZAF",
      "KEN", "TZA", "UGA", "SEN", "NER", "MRT",
    ],
    color: [234, 179, 8], // yellow
  },
  {
    id: "south_asia",
    name: "South Asia",
    lon: 73,
    lat: 15,
    countries: ["IND", "PAK", "BGD", "LKA", "NPL"],
    color: [20, 184, 166], // teal
  },
  {
    id: "east_asia",
    name: "East Asia",
    lon: 125,
    lat: 32,
    countries: ["CHN", "JPN", "KOR", "PRK", "TWN", "MNG"],
    color: [244, 63, 94], // rose
  },
  {
    id: "se_asia_oceania",
    name: "SE Asia & Oceania",
    lon: 104,
    lat: 1,
    countries: [
      "SGP", "IDN", "MYS", "THA", "VNM", "PHL", "MMR", "KHM", "LAO",
      "BRN", "AUS", "NZL", "PNG",
    ],
    color: [6, 182, 212], // cyan
  },
];

/** ISO-3166 alpha-3 → region id lookup */
export const COUNTRY_TO_REGION = new Map<string, string>();
for (const region of REGIONS) {
  for (const code of region.countries) {
    COUNTRY_TO_REGION.set(code, region.id);
  }
}

/** Get region by id */
export function getRegion(id: string): Region {
  const r = REGIONS.find((r) => r.id === id);
  if (!r) throw new Error(`Unknown region: ${id}`);
  return r;
}
