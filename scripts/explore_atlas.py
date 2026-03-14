"""Explore the Harvard Atlas bilateral trade CSV — find crude oil flows."""
import csv
import sys
from collections import Counter

FILE = "sitc_country_country_product_year_4_2020_2024.csv"

# First pass: find all product codes containing "333" to identify crude oil
product_codes = Counter()
crude_rows = 0
years = Counter()
exporters = set()
importers = set()
sample_rows = []

with open(FILE) as f:
    reader = csv.DictReader(f)
    for row in reader:
        sitc = row["product_sitc_code"]
        # SITC 333 = crude petroleum (could be 3330, 3331, etc at 4-digit)
        if sitc.startswith("333"):
            crude_rows += 1
            product_codes[sitc] += 1
            years[row["year"]] += 1

            exp_val = float(row["export_value"]) if row["export_value"] else 0
            imp_val = float(row["import_value"]) if row["import_value"] else 0

            if exp_val > 0:
                exporters.add(row["country_iso3_code"])
            if imp_val > 0:
                importers.add(row["country_iso3_code"])

            if len(sample_rows) < 10:
                sample_rows.append(row)

print(f"Total crude oil rows (SITC 333x): {crude_rows}")
print(f"\nProduct codes found:")
for code, n in product_codes.most_common():
    print(f"  {code}: {n:,}")

print(f"\nYears:")
for y, n in sorted(years.items()):
    print(f"  {y}: {n:,}")

print(f"\nUnique exporters: {len(exporters)}")
print(f"Unique importers: {len(importers)}")

print(f"\nSample rows:")
for r in sample_rows:
    print(f"  {r['country_iso3_code']} -> {r['partner_iso3_code']} | "
          f"sitc={r['product_sitc_code']} year={r['year']} "
          f"export=${float(r['export_value'] or 0):,.0f} "
          f"import=${float(r['import_value'] or 0):,.0f}")

# Now find largest flows for most recent year
print(f"\n=== Top 30 crude oil export flows (most recent year) ===")
largest = []
with open(FILE) as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row["product_sitc_code"] == "3330":
            exp_val = float(row["export_value"]) if row["export_value"] else 0
            if exp_val > 0 and row["year"] == "2023":
                largest.append((exp_val, row["country_iso3_code"], row["partner_iso3_code"], row["year"]))

largest.sort(reverse=True)
for val, src, dst, yr in largest[:30]:
    print(f"  {src} -> {dst} ({yr}): ${val/1e9:.2f}B")

print(f"\nTotal crude export flows with >0 value in 2023: {len(largest)}")
