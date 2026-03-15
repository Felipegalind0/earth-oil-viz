// ─── Country Definitions with Oil Port Coordinates ──────────────────
// Derived from the editable port catalog so routing and documentation use the
// same source of truth for primary display anchors.

import { COUNTRY_PORTS, getPrimaryPort } from "./ports";

export interface Country {
  code: string;    // ISO-3166 alpha-3
  name: string;
  portName: string;
  lat: number;
  lon: number;
  region: string;  // region id from regions.ts (for coloring)
  portCount: number;
}

export const COUNTRIES: Country[] = COUNTRY_PORTS.map((entry) => {
  const primaryPort = getPrimaryPort(entry.code);
  return {
    code: entry.code,
    name: entry.name,
    portName: primaryPort.name,
    lat: primaryPort.lat,
    lon: primaryPort.lon,
    region: entry.region,
    portCount: entry.ports.length,
  };
});

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
