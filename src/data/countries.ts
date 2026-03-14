// ─── Country Definitions with Oil Port Coordinates ──────────────────
// ~47 countries that significantly trade crude oil, positioned at their
// primary oil terminal/port location (not capital city).

export interface Country {
  code: string;    // ISO-3166 alpha-3
  name: string;
  portName: string;
  lat: number;
  lon: number;
  region: string;  // region id from regions.ts (for coloring)
}

// Compact format: [code, name, portName, lat, lon, region]
type CountryTuple = [string, string, string, number, number, string];

const RAW: CountryTuple[] = [
  // ── Middle East ───────────────────────────────────────────────────
  ["SAU", "Saudi Arabia",      "Ras Tanura",      26.64,  50.17, "middle_east"],
  ["IRQ", "Iraq",              "Al Basrah OT",    29.68,  48.80, "middle_east"],
  ["IRN", "Iran",              "Kharg Island",    29.23,  50.33, "middle_east"],
  ["ARE", "UAE",               "Fujairah",        25.12,  56.33, "middle_east"],
  ["KWT", "Kuwait",            "Mina Al Ahmadi",  29.06,  48.16, "middle_east"],
  ["QAT", "Qatar",             "Ras Laffan",      25.93,  51.57, "middle_east"],
  ["OMN", "Oman",              "Mina Al Fahal",   23.63,  58.53, "middle_east"],

  // ── Africa ────────────────────────────────────────────────────────
  ["NGA", "Nigeria",           "Bonny Island",     4.42,   7.17, "africa"],
  ["AGO", "Angola",            "Soyo Terminal",   -6.13,  12.37, "africa"],
  ["LBY", "Libya",             "Es Sider",        30.63,  18.35, "africa"],
  ["DZA", "Algeria",           "Arzew",           35.82,  -0.30, "africa"],
  ["EGY", "Egypt",             "Ain Sukhna",      29.60,  32.35, "africa"],
  ["GNQ", "Equatorial Guinea", "Malabo",           3.75,   8.78, "africa"],
  ["GAB", "Gabon",             "Port Gentil",     -0.72,   8.78, "africa"],
  ["COG", "Congo",             "Pointe-Noire",    -4.78,  11.83, "africa"],
  ["ZAF", "South Africa",      "Saldanha Bay",   -33.00,  17.93, "africa"],

  // ── Northern Europe ───────────────────────────────────────────────
  ["NOR", "Norway",            "Mongstad",        60.81,   5.03, "north_europe"],
  ["GBR", "United Kingdom",    "Fawley",          50.85,  -1.33, "north_europe"],
  ["NLD", "Netherlands",       "Rotterdam",       51.90,   4.50, "north_europe"],
  ["DEU", "Germany",           "Wilhelmshaven",   53.51,   8.12, "north_europe"],
  ["SWE", "Sweden",            "Gothenburg",      57.70,  11.80, "north_europe"],
  ["FIN", "Finland",           "Porvoo",          60.31,  25.55, "north_europe"],
  ["BEL", "Belgium",           "Antwerp",         51.30,   4.28, "north_europe"],
  ["POL", "Poland",            "Gdańsk",          54.35,  18.65, "north_europe"],
  ["LTU", "Lithuania",         "Būtingė",         56.07,  21.07, "north_europe"],

  // ── Mediterranean Europe ──────────────────────────────────────────
  ["ITA", "Italy",             "Trieste",         45.65,  13.73, "med_europe"],
  ["ESP", "Spain",             "Cartagena",       37.60,  -0.98, "med_europe"],
  ["FRA", "France",            "Fos-sur-Mer",     43.42,   4.94, "med_europe"],
  ["GRC", "Greece",            "Agioi Theodoroi", 37.94,  23.06, "med_europe"],
  ["TUR", "Turkey",            "Ceyhan",          36.68,  35.80, "med_europe"],
  ["PRT", "Portugal",          "Sines",           37.95,  -8.87, "med_europe"],
  ["HRV", "Croatia",           "Omišalj",         45.21,  14.54, "med_europe"],
  ["ROU", "Romania",           "Constanța",       44.16,  28.67, "med_europe"],
  ["BGR", "Bulgaria",          "Burgas",          42.49,  27.49, "med_europe"],

  // ── Russia/CIS ────────────────────────────────────────────────────
  ["RUS", "Russia",            "Primorsk",        60.36,  28.61, "russia_cis"],

  // ── Americas ──────────────────────────────────────────────────────
  ["USA", "United States",     "LOOP Terminal",   28.88, -90.03, "north_america"],
  ["CAN", "Canada",            "Saint John NB",   45.26, -66.06, "north_america"],
  ["MEX", "Mexico",            "Dos Bocas",       18.43, -93.17, "north_america"],
  ["BRA", "Brazil",            "Angra dos Reis", -23.01, -44.32, "south_america"],
  ["VEN", "Venezuela",         "Jose Terminal",   10.17, -65.01, "south_america"],
  ["COL", "Colombia",          "Coveñas",          9.40, -75.69, "south_america"],
  ["ECU", "Ecuador",           "Esmeraldas",       0.97, -79.63, "south_america"],
  ["ARG", "Argentina",         "Bahía Blanca",   -38.74, -62.27, "south_america"],
  ["TTO", "Trinidad & Tobago", "Point Fortin",    10.17, -61.69, "south_america"],
  ["GUY", "Guyana",            "Georgetown",       6.81, -58.17, "south_america"],

  // ── East Asia ─────────────────────────────────────────────────────
  ["CHN", "China",             "Qingdao",         36.07, 120.38, "east_asia"],
  ["JPN", "Japan",             "Chiba",           35.56, 140.08, "east_asia"],
  ["KOR", "South Korea",       "Ulsan",           35.50, 129.38, "east_asia"],
  ["TWN", "Taiwan",            "Kaohsiung",       22.61, 120.27, "east_asia"],

  // ── South Asia ────────────────────────────────────────────────────
  ["IND", "India",             "Jamnagar",        22.47,  70.02, "south_asia"],
  ["PAK", "Pakistan",          "Port Qasim",      24.78,  67.35, "south_asia"],

  // ── SE Asia & Oceania ─────────────────────────────────────────────
  ["SGP", "Singapore",         "Jurong Island",    1.26, 103.83, "se_asia_oceania"],
  ["MYS", "Malaysia",          "Pengerang",        1.36, 104.18, "se_asia_oceania"],
  ["IDN", "Indonesia",         "Cilacap",         -7.73, 109.02, "se_asia_oceania"],
  ["THA", "Thailand",          "Map Ta Phut",     12.68, 101.15, "se_asia_oceania"],
  ["AUS", "Australia",         "Kwinana",        -32.23, 115.77, "se_asia_oceania"],
];

export const COUNTRIES: Country[] = RAW.map(([code, name, portName, lat, lon, region]) => ({
  code, name, portName, lat, lon, region,
}));

/** ISO-3166 alpha-3 → Country lookup */
export const COUNTRY_MAP = new Map<string, Country>();
for (const c of COUNTRIES) {
  COUNTRY_MAP.set(c.code, c);
}

export function getCountry(code: string): Country {
  const c = COUNTRY_MAP.get(code);
  if (!c) throw new Error(`Unknown country: ${code}`);
  return c;
}
