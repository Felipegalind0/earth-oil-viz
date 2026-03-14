// ─── Fallback / Demo Trade Data ─────────────────────────────────────
// Approximate 2023 crude oil trade flows (billions USD) between regions.
// Based on publicly available aggregate trade statistics.
// Used when UN Comtrade API key is unavailable.

import { aggregateToRegions } from "./comtradeApi";

// We simulate Comtrade-like records at the region level using
// synthetic country pairs. Each record represents the dominant
// exporter of a region shipping to the dominant importer.

interface FallbackFlow {
  from: string;   // region id
  to: string;     // region id
  valueB: number; // billions USD
}

const FALLBACK_FLOWS: FallbackFlow[] = [
  // Middle East exports (largest global exporter)
  { from: "middle_east", to: "east_asia",       valueB: 180 },
  { from: "middle_east", to: "south_asia",      valueB: 85  },
  { from: "middle_east", to: "se_asia_oceania",  valueB: 45  },
  { from: "middle_east", to: "med_europe",       valueB: 40  },
  { from: "middle_east", to: "north_europe",     valueB: 25  },
  { from: "middle_east", to: "north_america",    valueB: 20  },
  { from: "middle_east", to: "africa",           valueB: 10  },
  { from: "middle_east", to: "south_america",    valueB: 5   },

  // Russia/CIS exports
  { from: "russia_cis", to: "east_asia",        valueB: 75  },
  { from: "russia_cis", to: "north_europe",     valueB: 35  },
  { from: "russia_cis", to: "med_europe",       valueB: 30  },
  { from: "russia_cis", to: "south_asia",       valueB: 40  },

  // Africa exports
  { from: "africa", to: "north_europe",         valueB: 30  },
  { from: "africa", to: "med_europe",           valueB: 25  },
  { from: "africa", to: "east_asia",            valueB: 35  },
  { from: "africa", to: "north_america",        valueB: 15  },
  { from: "africa", to: "south_asia",           valueB: 20  },
  { from: "africa", to: "south_america",        valueB: 5   },

  // North America exports
  { from: "north_america", to: "east_asia",     valueB: 25  },
  { from: "north_america", to: "north_europe",  valueB: 20  },
  { from: "north_america", to: "south_asia",    valueB: 10  },

  // South America exports
  { from: "south_america", to: "north_america", valueB: 15  },
  { from: "south_america", to: "east_asia",     valueB: 20  },
  { from: "south_america", to: "north_europe",  valueB: 10  },

  // SE Asia & Oceania exports
  { from: "se_asia_oceania", to: "east_asia",   valueB: 30  },
  { from: "se_asia_oceania", to: "south_asia",  valueB: 10  },

  // North Europe re-exports (refined products / North Sea)
  { from: "north_europe", to: "north_america",  valueB: 8   },
];

// Map region ids to representative ISO codes for the aggregation function
const REGION_REP_CODES: Record<string, [string, string]> = {
  north_america:  ["USA", "USA"],
  south_america:  ["BRA", "BRA"],
  north_europe:   ["GBR", "GBR"],
  med_europe:     ["ITA", "ITA"],
  russia_cis:     ["RUS", "RUS"],
  middle_east:    ["SAU", "SAU"],
  africa:         ["NGA", "NGA"],
  south_asia:     ["IND", "IND"],
  east_asia:      ["CHN", "CHN"],
  se_asia_oceania: ["SGP", "SGP"],
};

export function getFallbackData() {
  // Convert to Comtrade-like records
  const records = FALLBACK_FLOWS.map((f) => ({
    reporterISO: REGION_REP_CODES[f.from]?.[0] ?? "USA",
    partnerISO:  REGION_REP_CODES[f.to]?.[1] ?? "USA",
    primaryValue: f.valueB * 1e9,
    netWgt: f.valueB * 1e7 * 1000, // rough: ~$100/barrel, ~136kg/barrel
    flowCode: "X" as const,
  }));

  return aggregateToRegions(records, 2023, "fallback");
}
