"""Catalog the types of data series in PET.txt - group by category/pattern."""
import json
import re
from collections import Counter

# Categorize by series_id prefix and by name keywords
series_prefix = Counter()
name_categories = Counter()
units_counter = Counter()
freq_counter = Counter()
geo_counter = Counter()
international_series = []

# Keywords to categorize series
KEYWORDS = {
    "Crude Oil Production": r"crude oil.*production|production.*crude",
    "Crude Oil Imports": r"imports.*crude oil|crude oil.*imports",
    "Crude Oil Exports": r"exports.*crude oil|crude oil.*exports",
    "Petroleum Imports": r"imports",
    "Petroleum Exports": r"exports",
    "Refinery": r"refiner|refinery|refineries",
    "Ending Stocks": r"ending stocks|stocks of",
    "Spot Price": r"spot price",
    "Retail Price": r"retail price|residential price",
    "Wholesale Price": r"wholesale price|resale price",
    "Production": r"production|net production",
    "Consumption": r"consumption|product supplied",
    "Net Input": r"net input",
}

count = 0
with open("PET.txt") as f:
    for line in f:
        d = json.loads(line)
        sid = d.get("series_id", "")
        name = d.get("name", "")
        units = d.get("units", "")
        freq = d.get("f", "")
        geo = d.get("geography", "")
        iso = d.get("iso3166", "")

        # Series ID prefix (first segment before first dot + type code)
        prefix = sid.split(".")[0] if "." in sid else sid[:10]
        series_prefix[prefix] += 1
        units_counter[units] += 1
        freq_counter[freq] += 1

        # Categorize by name
        name_lower = name.lower()
        categorized = False
        for cat, pattern in KEYWORDS.items():
            if re.search(pattern, name_lower):
                name_categories[cat] += 1
                categorized = True
                break
        if not categorized:
            name_categories["Other"] += 1

        # Track international (non-US-only) series
        if iso and not iso.startswith("USA"):
            if len(international_series) < 30:
                international_series.append({
                    "sid": sid,
                    "name": name[:80],
                    "geo": geo,
                    "iso": iso,
                    "units": units,
                })

        # Count geography scope
        if "USA" in geo and len(geo) < 8:
            geo_counter["USA national"] += 1
        elif "USA-" in geo:
            geo_counter["USA state/PADD"] += 1
        elif geo and "USA" not in geo:
            geo_counter["International"] += 1
        elif not geo:
            geo_counter["No geography"] += 1
        else:
            geo_counter["Other"] += 1

        count += 1

print(f"Total series: {count}\n")

print("=== Series by Name Category ===")
for cat, n in name_categories.most_common():
    print(f"  {cat}: {n:,}")

print("\n=== Units ===")
for u, n in units_counter.most_common():
    print(f"  {u}: {n:,}")

print("\n=== Frequency ===")
for f, n in freq_counter.most_common():
    labels = {"W": "Weekly", "M": "Monthly", "A": "Annual", "4": "4-week avg", "D": "Daily"}
    print(f"  {labels.get(f, f)}: {n:,}")

print("\n=== Geography Scope ===")
for g, n in geo_counter.most_common():
    print(f"  {g}: {n:,}")

print(f"\n=== Sample International Series ({len(international_series)}) ===")
for s in international_series:
    print(f"  {s['sid']}")
    print(f"    {s['name']}")
    print(f"    geo={s['geo']}  iso={s['iso']}  units={s['units']}")
