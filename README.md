# Earth Oil Viz

Interactive 3D globe visualization of global crude oil trade flows, built with [Cesium.js](https://cesium.com/) and real bilateral trade data.

**[Live Demo](https://felipegalind0.github.io/earth-oil-viz/)**

## Data

**Source**: [Harvard Atlas of Economic Complexity](https://atlas.hks.harvard.edu) / [UN Comtrade](https://comtradeplus.un.org/) (IMTS), reconciled by the Harvard Growth Lab.

| Field | Value |
|-------|-------|
| Commodity | SITC Rev.2 3330 — "Petroleum oils, crude" |
| Year | 2023 |
| Metric | Export value (FOB), USD |
| Flows | 468 bilateral country pairs (≥$100M threshold) |
| Countries | 96 |

### Data Pipeline

1. **Download** the "Country Trade by Partner and Product — Bilateral Trade (SITC)" CSV from [atlas.hks.harvard.edu/data-downloads](https://atlas.hks.harvard.edu/data-downloads)
2. **Process** with `python3 scripts/process_atlas_crude.py` — filters for SITC 3330, year 2023, ≥$100M, maps ISO-3166 alpha-3 codes
3. **Output** is auto-generated to `src/data/tradeFlows.ts` — do not edit manually

The raw CSV (`sitc_country_country_product_year_4_2020_2024.csv`) is not committed — download it yourself to reproduce.

An EIA PET bulk dataset (`PET.txt` from [eia.gov/opendata/bulk/PET.zip](https://www.eia.gov/opendata/bulk/PET.zip)) was also explored. It contains ~195K US-centric petroleum series (imports, exports, production, prices, stocks by PADD region and state). Analysis scripts are in `scripts/scan_pet.py`, `scripts/catalog_pet.py`, and `scripts/deep_dive_pet.py`. This dataset may be used for a future US drill-down view.

### Citation

> Growth Lab at Harvard University. "The Atlas of Economic Complexity." https://atlas.hks.harvard.edu

## Architecture

```
src/
├── main.ts                          # App entry — viewer, gestures, dataset switching
├── culling.ts                       # Hemisphere culling (dot-product visibility test)
├── style.css                        # UI styles
├── data/
│   ├── tradeFlows.ts                # AUTO-GENERATED — 468 bilateral crude oil flows
│   ├── countries.ts                 # 96 countries with oil port/terminal coordinates
│   ├── regions.ts                   # 10 regions for color grouping
│   └── seaRoutes.ts                 # Scenario-aware corridor routing + pipeline overrides
└── visualization/
    ├── regionSpheres.ts             # Country spheres sized by trade volume
    ├── seaLanes.ts                  # Polyline sea routes with width ∝ flow value
    └── flowAnimation.ts            # Animated particles along routes (CallbackProperty)
```

### Key Technical Details

- **Trade routing**: Dijkstra on a logistics-aware maritime corridor graph, with edge costs based on corridor type, chokepoint penalties, and canal delays. A small explicit pipeline layer handles obvious overland cases such as Canada→United States and Benelux refinery corridors.
- **Corridor geometry**: Key chokepoints and coastal approaches now use authored segment geometry for Hormuz, Suez, Gibraltar, the English Channel, Danish Straits, Bosphorus, Malacca, Panama, the Cape route, and several Atlantic/African coastal legs.
- **Scenario controls**: The UI can rebuild routes for Baseline, Suez Closed, Panama Constrained, and Hormuz High Risk cases. These scenarios change graph costs or closures and trigger actual rerouting.
- **Hemisphere culling**: Entities on the far side of the globe are hidden each frame via a dot-product test (camera normal · entity normal). Zero-allocation per frame using scratch vectors.
- **Flow animation**: 5 particles per lane, phase-offset, using `CallbackProperty` for per-frame position interpolation. Speed and size scale with flow value.
- **Country spheres**: Sized by `log1p(totalTradeVolume)`, colored by region with warm/cool tinting based on net exporter/importer status.
- **Gesture handling**: Trackpad-aware (distinguishes two-finger swipe from mouse wheel), Safari `GestureEvent` support, touchscreen pointer fallback.

## Setup

```bash
npm install
npm run dev          # dev server at localhost:5173
npm run build        # production build to dist/
npm run deploy       # build + deploy to GitHub Pages
```

### Google 3D Tiles (optional)

Append `?key=YOUR_GOOGLE_MAPS_API_KEY` to the URL for [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles). Without a key, falls back to OpenStreetMap.

## Dataset Selector

The UI dropdown lets you filter flows:

| Option | Description |
|--------|-------------|
| All Flows (468) | Every bilateral flow ≥$100M |
| Top 50 | 50 largest flows by USD value |
| Top 30 | 30 largest flows by USD value |
| Middle East Exports | Flows originating from SAU, IRQ, IRN, ARE, KWT, QAT, OMN, etc. |
| Americas Exports | Flows from USA, CAN, MEX, BRA, VEN, COL, ECU, etc. |
| Africa Exports | Flows from NGA, AGO, LBY, DZA, EGY, GNQ, GAB, etc. |
| Europe Exports | Flows from NOR, GBR, NLD, RUS excluded (has own category) |
| Russia & CIS | Flows from RUS, KAZ, AZE, TKM, UZB |

### Routing Scenarios

| Scenario | Effect |
|----------|--------|
| Baseline | Normal corridor costs with all major chokepoints open |
| Suez Closed | Blocks Suez Canal and pushes Europe-Asia traffic toward the Cape when possible |
| Panama Constrained | Adds large delay to Panama Canal transit, encouraging longer alternatives |
| Hormuz High Risk | Increases Gulf chokepoint risk cost for Hormuz-linked export routes |

## Stack

- **Cesium.js** 1.139 — 3D globe rendering
- **Vite** 7.3 + **TypeScript** 5.9 — build tooling
- **gh-pages** — GitHub Pages deployment
- **Python 3** — data processing scripts
