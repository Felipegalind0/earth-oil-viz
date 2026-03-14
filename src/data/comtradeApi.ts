// ─── UN Comtrade API Client ─────────────────────────────────────────
// Fetches bilateral crude oil trade data and aggregates into region flows.

import { REGIONS, COUNTRY_TO_REGION } from "./regions";

// ─── Types ──────────────────────────────────────────────────────────
export interface RegionFlow {
  from: string;   // region id (exporter)
  to: string;     // region id (importer)
  value: number;  // trade value in USD
  weight: number; // net weight in kg
}

export interface RegionVolume {
  regionId: string;
  totalExport: number; // USD
  totalImport: number; // USD
  netExport: number;   // positive = net exporter
}

export interface TradeData {
  flows: RegionFlow[];
  volumes: RegionVolume[];
  year: number;
  source: "comtrade" | "fallback";
}

// UN Comtrade API v1 response shape (subset of fields we need)
interface ComtradeRecord {
  reporterISO: string;
  partnerISO: string;
  primaryValue: number;  // USD
  netWgt: number;        // kg
  flowCode: string;      // "M" import, "X" export
}

interface ComtradeResponse {
  data: ComtradeRecord[];
  count: number;
}

// ─── API Fetch ──────────────────────────────────────────────────────
const COMTRADE_BASE = "https://comtradeapi.un.org/data/v1/get/C/A";

/**
 * Fetch crude oil bilateral trade from UN Comtrade.
 * HS code 2709 = crude petroleum oils.
 * @param apiKey  Comtrade subscription key
 * @param year    Trade year (default: latest available, typically 2 years ago)
 */
export async function fetchComtradeData(
  apiKey: string,
  year?: number,
): Promise<TradeData> {
  const tradeYear = year ?? new Date().getFullYear() - 2;

  // Fetch exports: reporters export HS 2709 to partners
  const url = new URL(`${COMTRADE_BASE}/HS`);
  url.searchParams.set("cmdCode", "2709");
  url.searchParams.set("flowCode", "X");
  url.searchParams.set("period", String(tradeYear));
  url.searchParams.set("reporterCode", ""); // all reporters
  url.searchParams.set("partnerCode", "");  // all partners

  const resp = await fetch(url.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!resp.ok) {
    throw new Error(`Comtrade API error: ${resp.status} ${resp.statusText}`);
  }

  const json: ComtradeResponse = await resp.json();
  return aggregateToRegions(json.data, tradeYear, "comtrade");
}

// ─── Aggregation ────────────────────────────────────────────────────
export function aggregateToRegions(
  records: ComtradeRecord[],
  year: number,
  source: "comtrade" | "fallback",
): TradeData {
  // Accumulate region-to-region flows
  const flowMap = new Map<string, { value: number; weight: number }>();
  const exportMap = new Map<string, number>();
  const importMap = new Map<string, number>();

  for (const rec of records) {
    const fromRegion = COUNTRY_TO_REGION.get(rec.reporterISO);
    const toRegion = COUNTRY_TO_REGION.get(rec.partnerISO);
    if (!fromRegion || !toRegion || fromRegion === toRegion) continue;

    const key = `${fromRegion}→${toRegion}`;
    const existing = flowMap.get(key) ?? { value: 0, weight: 0 };
    existing.value += rec.primaryValue ?? 0;
    existing.weight += rec.netWgt ?? 0;
    flowMap.set(key, existing);

    exportMap.set(fromRegion, (exportMap.get(fromRegion) ?? 0) + (rec.primaryValue ?? 0));
    importMap.set(toRegion, (importMap.get(toRegion) ?? 0) + (rec.primaryValue ?? 0));
  }

  const flows: RegionFlow[] = [];
  for (const [key, data] of flowMap) {
    const [from, to] = key.split("→");
    if (data.value > 0) {
      flows.push({ from, to, value: data.value, weight: data.weight });
    }
  }

  // Sort by value descending
  flows.sort((a, b) => b.value - a.value);

  const volumes: RegionVolume[] = REGIONS.map((r) => {
    const totalExport = exportMap.get(r.id) ?? 0;
    const totalImport = importMap.get(r.id) ?? 0;
    return {
      regionId: r.id,
      totalExport,
      totalImport,
      netExport: totalExport - totalImport,
    };
  });

  return { flows, volumes, year, source };
}
