"""Scan PET.txt to catalog all keys, geography patterns, and search for coordinates."""
import json

all_keys = set()
geo_values = set()
iso_values = set()
geo2_values = set()
name_prefixes = set()
has_coords = []
count = 0

with open("PET.txt") as f:
    for line in f:
        d = json.loads(line)
        all_keys.update(d.keys())

        # Check for coordinate-like keys
        for k in d.keys():
            kl = k.lower()
            if any(w in kl for w in ["lat", "lon", "coord", "location", "position", "geoloc"]):
                has_coords.append((d["series_id"], k, d[k]))

        # Collect geography values
        g = d.get("geography", "")
        if len(geo_values) < 100:
            geo_values.add(g[:120])

        if "iso3166" in d and len(iso_values) < 50:
            iso_values.add(str(d["iso3166"])[:80])

        if "geography2" in d and len(geo2_values) < 50:
            geo2_values.add(str(d["geography2"])[:80])

        # Collect series name prefixes (first ~40 chars)
        name = d.get("name", "")
        prefix = name[:50]
        if len(name_prefixes) < 80:
            name_prefixes.add(prefix)

        count += 1

print(f"Total series: {count}")
print(f"\nAll keys across all records: {sorted(all_keys)}")
print(f"\nHas lat/lon/coord keys: {len(has_coords)}")
for sid, k, v in has_coords[:10]:
    print(f"  {sid}: {k} = {v}")

print(f"\nSample geography values ({len(geo_values)}):")
for g in sorted(geo_values)[:40]:
    print(f"  {g}")

print(f"\nSample iso3166 values ({len(iso_values)}):")
for g in sorted(iso_values):
    print(f"  {g}")

print(f"\nSample geography2 values ({len(geo2_values)}):")
for g in sorted(geo2_values):
    print(f"  {g}")

print(f"\nSample name prefixes ({len(name_prefixes)}):")
for n in sorted(name_prefixes)[:40]:
    print(f"  {n}")
