"""Deep dive into production and international trade series in PET.txt."""
import json
import re
from collections import Counter

# Find: crude oil production by country, US imports/exports by country (monthly/annual)
production_series = []
import_annual = []
export_annual = []
intl_production = []
all_geo_countries = set()

count = 0
with open("PET.txt") as f:
    for line in f:
        d = json.loads(line)
        sid = d.get("series_id", "")
        name = d.get("name", "")
        freq = d.get("f", "")
        geo = d.get("geography", "")
        units = d.get("units", "")
        name_lower = name.lower()

        # International crude oil production (annual/monthly)
        if "crude oil production" in name_lower and freq in ("A", "M"):
            entry = {
                "sid": sid,
                "name": name[:100],
                "geo": geo,
                "freq": freq,
                "units": units,
                "data_count": len(d.get("data", [])),
                "start": d.get("start"),
                "end": d.get("end"),
            }
            if geo and "USA" not in geo:
                intl_production.append(entry)
            else:
                production_series.append(entry)

        # US imports from country X of crude oil (annual)
        if re.search(r"imports from .+ of crude oil", name_lower) and freq == "A":
            import_annual.append({
                "sid": sid,
                "name": name[:100],
                "geo": geo,
                "units": units,
                "data_count": len(d.get("data", [])),
                "start": d.get("start"),
                "end": d.get("end"),
            })

        # US exports to country X of crude oil (annual)
        if re.search(r"exports to .+ of crude oil", name_lower) and freq == "A":
            export_annual.append({
                "sid": sid,
                "name": name[:100],
                "geo": geo,
                "units": units,
                "data_count": len(d.get("data", [])),
                "start": d.get("start"),
                "end": d.get("end"),
            })

        # Collect all non-US country codes
        if geo and not geo.startswith("USA") and len(geo) == 3:
            all_geo_countries.add(geo)

        count += 1

print(f"=== International Crude Oil Production (annual/monthly) — {len(intl_production)} series ===")
for s in sorted(intl_production, key=lambda x: x["name"])[:40]:
    print(f"  {s['sid']}")
    print(f"    {s['name']}")
    print(f"    geo={s['geo']} freq={s['freq']} units={s['units']} points={s['data_count']} range={s['start']}-{s['end']}")

print(f"\n=== US Crude Oil Production — {len(production_series)} series ===")
for s in sorted(production_series, key=lambda x: x["name"])[:20]:
    print(f"  {s['sid']}")
    print(f"    {s['name']}")
    print(f"    geo={s['geo']} freq={s['freq']} units={s['units']} points={s['data_count']}")

print(f"\n=== US Annual Crude Oil Imports by Country — {len(import_annual)} series ===")
for s in sorted(import_annual, key=lambda x: x["name"])[:40]:
    print(f"  {s['sid']}")
    print(f"    {s['name']}")
    print(f"    geo={s['geo']} units={s['units']} points={s['data_count']} range={s['start']}-{s['end']}")

print(f"\n=== US Annual Crude Oil Exports by Country — {len(export_annual)} series ===")
for s in sorted(export_annual, key=lambda x: x["name"])[:40]:
    print(f"  {s['sid']}")
    print(f"    {s['name']}")
    print(f"    geo={s['geo']} units={s['units']} points={s['data_count']} range={s['start']}-{s['end']}")

print(f"\n=== All international country codes ({len(all_geo_countries)}) ===")
print(f"  {sorted(all_geo_countries)}")
