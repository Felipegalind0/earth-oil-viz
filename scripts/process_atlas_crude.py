#!/usr/bin/env python3
"""
process_atlas_crude.py — Extract bilateral crude oil trade flows from
Harvard Atlas of Economic Complexity SITC bilateral trade data.

DATA SOURCE
-----------
Harvard Growth Lab, "The Atlas of Economic Complexity"
Dataset: Country Trade by Partner and Product — Bilateral Trade (SITC)
URL: https://atlas.hks.harvard.edu/data-downloads
Downloaded: 2026-03-14
File: sitc_country_country_product_year_4_2020_2024.csv
License: Free for reuse with citation (see atlas.hks.harvard.edu)

The underlying raw data originates from UN Comtrade (IMTS), reconciled
and cleaned by the Harvard Growth Lab methodology:
  Bustos et al. (2026), "Tackling Discrepancies in Trade Data:
  The Harvard Growth Lab International Trade Datasets", Scientific Data.

METHODOLOGY
-----------
1. Filter for SITC Rev.2 code 3330 ("Petroleum oils, crude").
2. Select the most recent complete year available.
3. Use `export_value` column (reporter = exporter) as the flow value in USD.
4. Drop flows below a minimum threshold ($100M) to keep visualization clean.
5. For each exporter→importer pair, take the single-year value.
6. Output TypeScript source file `src/data/tradeFlows.ts`.
7. Report countries present in the trade data but missing from countries.ts
   so we can add them.

USAGE
-----
    python3 scripts/process_atlas_crude.py

OUTPUTS
-------
    src/data/tradeFlows.ts         — Generated TypeScript module
    (stdout)                       — Processing log and missing-country report
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

# ─── Configuration ───────────────────────────────────────────────────
INPUT_CSV = Path("sitc_country_country_product_year_4_2020_2024.csv")
OUTPUT_TS = Path("src/data/tradeFlows.ts")
SITC_CRUDE = "3330"          # SITC Rev.2: Petroleum oils, crude
TARGET_YEAR = "2023"         # Most recent complete year
MIN_VALUE_USD = 100_000_000  # $100M threshold — filters noise

# Countries already in countries.ts (update if you add more)
KNOWN_COUNTRIES = {
    # Middle East
    "SAU", "IRQ", "IRN", "ARE", "KWT", "QAT", "OMN", "ISR", "JOR",
    # Africa
    "NGA", "AGO", "LBY", "DZA", "EGY", "GNQ", "GAB", "COG", "ZAF",
    "GHA", "CIV", "CMR", "TCD", "SDN", "SSD", "SEN", "TUN", "COD",
    # Northern Europe
    "NOR", "GBR", "NLD", "DEU", "SWE", "FIN", "BEL", "POL", "LTU",
    "DNK", "IRL",
    # Med & Central Europe
    "ITA", "ESP", "FRA", "GRC", "TUR", "PRT", "HRV", "ROU", "BGR",
    "AUT", "CHE", "CZE", "HUN", "SVK", "SRB", "GIB",
    # Russia/CIS
    "RUS", "KAZ", "AZE", "TKM", "UZB",
    # Americas
    "USA", "CAN", "MEX", "BRA", "VEN", "COL", "ECU", "ARG", "TTO", "GUY",
    "CHL", "PER", "URY", "PAN", "DOM", "JAM", "NIC",
    # East Asia
    "CHN", "JPN", "KOR", "TWN", "MNG",
    # South Asia
    "IND", "PAK", "BGD", "LKA",
    # SE Asia & Oceania
    "SGP", "MYS", "IDN", "THA", "AUS", "VNM", "PHL", "BRN", "MMR",
    "NZL", "PNG",
}

# ─── ISO-3166 alpha-3 → country name (for reporting) ────────────────
# This is only used for the missing-country report and TS comments.
# We read it from the CSV itself.
country_names: dict[str, str] = {}

# ─── Step 1: Read CSV and extract crude oil export flows ─────────────
print(f"Reading {INPUT_CSV}...")
print(f"Filtering: SITC={SITC_CRUDE}, year={TARGET_YEAR}, export_value≥${MIN_VALUE_USD/1e6:.0f}M")

flows: list[tuple[str, str, float]] = []  # (exporter_iso3, importer_iso3, usd)
all_countries_in_flows = set()
skipped_low = 0
total_crude = 0

with open(INPUT_CSV) as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row["product_sitc_code"] != SITC_CRUDE:
            continue
        if row["year"] != TARGET_YEAR:
            continue

        total_crude += 1
        exp_val = float(row["export_value"]) if row["export_value"] else 0

        if exp_val < MIN_VALUE_USD:
            skipped_low += 1
            continue

        src = row["country_iso3_code"]
        dst = row["partner_iso3_code"]
        flows.append((src, dst, exp_val))
        all_countries_in_flows.add(src)
        all_countries_in_flows.add(dst)

print(f"Total crude oil rows for {TARGET_YEAR}: {total_crude}")
print(f"Flows above ${MIN_VALUE_USD/1e6:.0f}M threshold: {len(flows)}")
print(f"Skipped below threshold: {skipped_low}")

# Sort by value descending
flows.sort(key=lambda x: -x[2])

# ─── Step 2: Identify missing countries ──────────────────────────────
missing = all_countries_in_flows - KNOWN_COUNTRIES
if missing:
    print(f"\n⚠  {len(missing)} countries in trade data but NOT in countries.ts:")
    for code in sorted(missing):
        # Find a sample flow to show relevance
        sample_flows = [(s, d, v) for s, d, v in flows if s == code or d == code]
        total_vol = sum(v for _, _, v in sample_flows)
        print(f"  {code}: ${total_vol/1e9:.2f}B across {len(sample_flows)} flows")
    print("\n  → These flows will be EXCLUDED. Add them to countries.ts to include.")

# Filter to only known countries
flows_clean = [(s, d, v) for s, d, v in flows if s in KNOWN_COUNTRIES and d in KNOWN_COUNTRIES]
excluded = len(flows) - len(flows_clean)
if excluded:
    print(f"  Excluded {excluded} flows involving unknown countries")
    print(f"  Remaining: {len(flows_clean)} flows")
else:
    flows_clean = flows

# ─── Step 3: Generate TypeScript ─────────────────────────────────────
print(f"\nGenerating {OUTPUT_TS}...")

lines = []
lines.append(f'// ──────────────────────────────────────────────────────────────────')
lines.append(f'// Bilateral Crude Oil Trade Flows ({TARGET_YEAR})')
lines.append(f'// ──────────────────────────────────────────────────────────────────')
lines.append(f'//')
lines.append(f'// AUTO-GENERATED by scripts/process_atlas_crude.py')
lines.append(f'// DO NOT EDIT MANUALLY')
lines.append(f'//')
lines.append(f'// DATA SOURCE:')
lines.append(f'//   Harvard Growth Lab, "The Atlas of Economic Complexity"')
lines.append(f'//   Dataset: Country Trade by Partner and Product (SITC)')
lines.append(f'//   https://atlas.hks.harvard.edu/data-downloads')
lines.append(f'//   Underlying data: UN Comtrade (IMTS), reconciled by Growth Lab')
lines.append(f'//')
lines.append(f'// COMMODITY: SITC Rev.2 code 3330 — "Petroleum oils, crude"')
lines.append(f'// YEAR: {TARGET_YEAR}')
lines.append(f'// UNIT: USD (export value, FOB)')
lines.append(f'// THRESHOLD: Flows ≥ ${MIN_VALUE_USD/1e6:.0f}M only')
lines.append(f'// FLOW COUNT: {len(flows_clean)}')
lines.append(f'//')
lines.append(f'// Citation:')
lines.append(f'//   Growth Lab at Harvard University. "The Atlas of Economic')
lines.append(f'//   Complexity." https://atlas.hks.harvard.edu')
lines.append(f'// ──────────────────────────────────────────────────────────────────')
lines.append(f'')
lines.append(f'export interface TradeFlow {{')
lines.append(f'  from: string;   // ISO-3166 alpha-3 (exporter)')
lines.append(f'  to: string;     // ISO-3166 alpha-3 (importer)')
lines.append(f'  value: number;  // USD (export value, FOB)')
lines.append(f'}}')
lines.append(f'')
lines.append(f'// Compact: [exporter, importer, USD]')
lines.append(f'const RAW: [string, string, number][] = [')

for src, dst, val in flows_clean:
    lines.append(f'  ["{src}", "{dst}", {int(val)}],')

lines.append(f'];')
lines.append(f'')
lines.append(f'export const TRADE_FLOWS: TradeFlow[] = RAW.map(([from, to, value]) => ({{')
lines.append(f'  from, to, value,')
lines.append(f'}}));')
lines.append(f'')
lines.append(f'/** Total exports by country (USD) */')
lines.append(f'export function totalExports(code: string): number {{')
lines.append(f'  return TRADE_FLOWS')
lines.append(f'    .filter((f) => f.from === code)')
lines.append(f'    .reduce((sum, f) => sum + f.value, 0);')
lines.append(f'}}')
lines.append(f'')
lines.append(f'/** Total imports by country (USD) */')
lines.append(f'export function totalImports(code: string): number {{')
lines.append(f'  return TRADE_FLOWS')
lines.append(f'    .filter((f) => f.to === code)')
lines.append(f'    .reduce((sum, f) => sum + f.value, 0);')
lines.append(f'}}')
lines.append(f'')
lines.append(f'export const TRADE_YEAR = {TARGET_YEAR};')
lines.append(f'')
lines.append(f'export const DATA_SOURCE = {{')
lines.append(f'  name: "Harvard Atlas of Economic Complexity",')
lines.append(f'  url: "https://atlas.hks.harvard.edu",')
lines.append(f'  dataset: "Country Trade by Partner and Product — Bilateral Trade (SITC)",')
lines.append(f'  underlying: "UN Comtrade (IMTS), reconciled by Harvard Growth Lab",')
lines.append(f'  commodity: "SITC Rev.2 3330 — Petroleum oils, crude",')
lines.append(f'  year: {TARGET_YEAR},')
lines.append(f'  unit: "USD (export value, FOB)",')
lines.append(f'  threshold: "{MIN_VALUE_USD/1e6:.0f}M USD minimum",')
lines.append(f'  citation: \'Growth Lab at Harvard University. "The Atlas of Economic Complexity." https://atlas.hks.harvard.edu\',')
lines.append(f'}};')
lines.append(f'')

OUTPUT_TS.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_TS.write_text("\n".join(lines))

print(f"✓ Wrote {len(flows_clean)} flows to {OUTPUT_TS}")

# ─── Summary ─────────────────────────────────────────────────────────
total_value = sum(v for _, _, v in flows_clean)
print(f"\nSummary:")
print(f"  Total trade value: ${total_value/1e9:.1f}B")
print(f"  Flows: {len(flows_clean)}")
print(f"  Top 10 flows:")
for src, dst, val in flows_clean[:10]:
    print(f"    {src} → {dst}: ${val/1e9:.2f}B")
