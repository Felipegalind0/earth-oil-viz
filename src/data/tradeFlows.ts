// ─── Static Bilateral Crude Oil Trade Data (2023) ───────────────────
// Approximate values based on publicly available trade statistics
// (EIA, national customs data, trade press).
// HS 2709 = crude petroleum oils.
// Values in billions of USD.

export interface TradeFlow {
  from: string;   // ISO-3166 alpha-3 (exporter)
  to: string;     // ISO-3166 alpha-3 (importer)
  value: number;  // USD (converted from billions below)
}

// Compact: [exporter, importer, billions USD]
const RAW: [string, string, number][] = [
  // ── Saudi Arabia exports (~$142B) ─────────────────────────────────
  ["SAU", "CHN", 50.0],
  ["SAU", "IND", 25.0],
  ["SAU", "JPN", 20.0],
  ["SAU", "KOR", 15.0],
  ["SAU", "USA",  7.0],
  ["SAU", "TWN",  5.0],
  ["SAU", "THA",  4.0],
  ["SAU", "SGP",  3.5],
  ["SAU", "IDN",  2.5],
  ["SAU", "EGY",  2.5],
  ["SAU", "ITA",  2.0],
  ["SAU", "TUR",  2.0],
  ["SAU", "ESP",  1.5],
  ["SAU", "PAK",  1.5],

  // ── Russia exports (~$110B) ───────────────────────────────────────
  ["RUS", "CHN", 50.0],
  ["RUS", "IND", 37.0],
  ["RUS", "TUR",  5.0],
  ["RUS", "NLD",  3.0],
  ["RUS", "ITA",  3.0],
  ["RUS", "KOR",  3.0],
  ["RUS", "BGR",  2.0],
  ["RUS", "DEU",  2.0],
  ["RUS", "BEL",  2.0],
  ["RUS", "GRC",  1.5],
  ["RUS", "FIN",  1.5],

  // ── Iraq exports (~$75B) ──────────────────────────────────────────
  ["IRQ", "CHN", 25.0],
  ["IRQ", "IND", 22.0],
  ["IRQ", "KOR",  7.0],
  ["IRQ", "USA",  5.0],
  ["IRQ", "ITA",  4.0],
  ["IRQ", "GRC",  3.0],
  ["IRQ", "TUR",  3.0],
  ["IRQ", "ESP",  2.5],
  ["IRQ", "NLD",  2.0],
  ["IRQ", "THA",  1.5],

  // ── Iran exports (~$30B, limited data) ────────────────────────────
  ["IRN", "CHN", 25.0],
  ["IRN", "IND",  3.0],
  ["IRN", "TUR",  1.5],

  // ── UAE exports (~$50B) ───────────────────────────────────────────
  ["ARE", "IND", 14.0],
  ["ARE", "CHN", 13.0],
  ["ARE", "JPN", 12.0],
  ["ARE", "KOR",  5.0],
  ["ARE", "THA",  3.0],
  ["ARE", "SGP",  2.0],
  ["ARE", "IDN",  1.5],

  // ── Kuwait exports (~$40B) ────────────────────────────────────────
  ["KWT", "CHN", 14.0],
  ["KWT", "KOR",  8.0],
  ["KWT", "JPN",  7.0],
  ["KWT", "IND",  5.0],
  ["KWT", "TWN",  3.0],
  ["KWT", "THA",  2.0],

  // ── Oman exports (~$18B) ──────────────────────────────────────────
  ["OMN", "CHN", 12.0],
  ["OMN", "IND",  2.5],
  ["OMN", "JPN",  2.0],
  ["OMN", "KOR",  1.5],

  // ── Qatar condensate exports (~$12B) ──────────────────────────────
  ["QAT", "JPN",  4.0],
  ["QAT", "KOR",  3.0],
  ["QAT", "CHN",  3.0],
  ["QAT", "IND",  2.0],

  // ── Norway exports (~$40B) ────────────────────────────────────────
  ["NOR", "GBR",  9.0],
  ["NOR", "DEU",  7.0],
  ["NOR", "NLD",  6.0],
  ["NOR", "SWE",  4.0],
  ["NOR", "FRA",  4.0],
  ["NOR", "FIN",  3.0],
  ["NOR", "CHN",  3.0],
  ["NOR", "POL",  2.0],
  ["NOR", "USA",  1.5],

  // ── Nigeria exports (~$28B) ───────────────────────────────────────
  ["NGA", "IND",  7.0],
  ["NGA", "ESP",  4.5],
  ["NGA", "NLD",  3.5],
  ["NGA", "FRA",  3.0],
  ["NGA", "USA",  2.5],
  ["NGA", "IDN",  2.0],
  ["NGA", "ITA",  2.0],
  ["NGA", "CHN",  2.0],
  ["NGA", "ZAF",  1.5],

  // ── Angola exports (~$20B) ────────────────────────────────────────
  ["AGO", "CHN", 14.0],
  ["AGO", "IND",  2.5],
  ["AGO", "ESP",  1.5],
  ["AGO", "PRT",  1.0],

  // ── Libya exports (~$16B) ─────────────────────────────────────────
  ["LBY", "ITA",  6.0],
  ["LBY", "ESP",  3.0],
  ["LBY", "DEU",  2.0],
  ["LBY", "FRA",  2.0],
  ["LBY", "CHN",  2.0],

  // ── Algeria exports (~$9B crude) ──────────────────────────────────
  ["DZA", "ITA",  3.0],
  ["DZA", "ESP",  2.0],
  ["DZA", "FRA",  2.0],
  ["DZA", "CHN",  1.5],

  // ── Egypt exports (~$3B crude) ────────────────────────────────────
  ["EGY", "ITA",  1.5],

  // ── Congo exports (~$5B) ─────────────────────────────────────────
  ["COG", "CHN",  3.0],
  ["COG", "IND",  1.0],

  // ── Equatorial Guinea exports (~$4B) ──────────────────────────────
  ["GNQ", "CHN",  2.0],
  ["GNQ", "ESP",  1.0],

  // ── Gabon exports (~$3B) ──────────────────────────────────────────
  ["GAB", "CHN",  1.5],

  // ── USA exports (~$70B crude) ─────────────────────────────────────
  ["USA", "KOR", 13.0],
  ["USA", "NLD", 10.0],
  ["USA", "GBR",  8.0],
  ["USA", "CHN",  8.0],
  ["USA", "IND",  7.0],
  ["USA", "JPN",  5.0],
  ["USA", "ITA",  4.0],
  ["USA", "FRA",  3.5],
  ["USA", "TWN",  3.0],
  ["USA", "DEU",  3.0],
  ["USA", "SGP",  2.5],
  ["USA", "THA",  1.5],

  // ── Canada tanker exports (~$5B, excl pipeline to US) ─────────────
  ["CAN", "CHN",  2.0],
  ["CAN", "IND",  1.5],
  ["CAN", "GBR",  1.5],

  // ── Brazil exports (~$28B) ────────────────────────────────────────
  ["BRA", "CHN", 18.0],
  ["BRA", "USA",  3.0],
  ["BRA", "ESP",  2.5],
  ["BRA", "IND",  2.0],
  ["BRA", "NLD",  2.0],

  // ── Mexico exports (~$12B) ────────────────────────────────────────
  ["MEX", "USA",  5.0],
  ["MEX", "ESP",  2.5],
  ["MEX", "KOR",  1.5],
  ["MEX", "IND",  1.5],
  ["MEX", "CHN",  1.5],

  // ── Colombia exports (~$8B) ───────────────────────────────────────
  ["COL", "USA",  3.0],
  ["COL", "CHN",  2.0],
  ["COL", "IND",  1.5],

  // ── Ecuador exports (~$5B) ────────────────────────────────────────
  ["ECU", "USA",  2.5],
  ["ECU", "CHN",  2.0],

  // ── Venezuela exports (~$5B) ──────────────────────────────────────
  ["VEN", "CHN",  3.0],
  ["VEN", "IND",  1.5],

  // ── Guyana exports (~$4B, growing fast) ───────────────────────────
  ["GUY", "USA",  3.0],
  ["GUY", "NLD",  1.0],

  // ── Trinidad & Tobago exports (~$2B) ──────────────────────────────
  ["TTO", "USA",  1.5],

  // ── UK North Sea exports (~$12B) ──────────────────────────────────
  ["GBR", "NLD",  3.0],
  ["GBR", "DEU",  2.5],
  ["GBR", "KOR",  2.0],
  ["GBR", "CHN",  2.0],
  ["GBR", "USA",  1.5],

  // ── Malaysia exports (~$6B) ───────────────────────────────────────
  ["MYS", "CHN",  2.5],
  ["MYS", "IND",  1.5],
  ["MYS", "AUS",  1.0],
  ["MYS", "JPN",  1.0],
];

export const TRADE_FLOWS: TradeFlow[] = RAW.map(([from, to, valueB]) => ({
  from,
  to,
  value: valueB * 1e9,
}));

/** Total exports by country (USD) */
export function totalExports(code: string): number {
  return TRADE_FLOWS
    .filter((f) => f.from === code)
    .reduce((sum, f) => sum + f.value, 0);
}

/** Total imports by country (USD) */
export function totalImports(code: string): number {
  return TRADE_FLOWS
    .filter((f) => f.to === code)
    .reduce((sum, f) => sum + f.value, 0);
}

export const TRADE_YEAR = 2023;
