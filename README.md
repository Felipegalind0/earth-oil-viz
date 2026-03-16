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

### Port And Pipeline Sources

The trade values come from the Harvard Atlas download pipeline above. The route network uses separate manually curated location and infrastructure references:

- **Port naming and locality reference**: UNECE UN/LOCODE. Used as a standardized port-location reference when choosing named terminals and coastal localities.
- **Terminal selection**: public port authority, refinery, and operator documentation. Used to prefer crude terminals, offshore loading points, and refinery receipt points over country centroids.
- **Pipeline reference**: [Global Energy Monitor's Global Oil Infrastructure Tracker](https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/). Used to decide which bilateral flows should be represented as overland pipeline corridors and to sketch generalized pipeline paths.
- **Cartographic verification**: manual map checks to place each point near the operational terminal or inland receipt node used in the visualization.

These route and terminal layers are schematic. They are intended to tell a more realistic logistics story than simple great-circle lines, not to reproduce survey-grade AIS or engineering GIS.

### Citation

> Growth Lab at Harvard University. "The Atlas of Economic Complexity." https://atlas.hks.harvard.edu

## Architecture

```
src/
├── main.ts                          # App entry — viewer, gestures, dataset switching
├── culling.ts                       # Hemisphere culling (dot-product visibility test)
├── mathUtils.ts                     # Pure math helpers for gesture classification and camera control
├── mathUtils.test.ts                # Unit tests for mathUtils (vitest)
├── style.css                        # UI styles
├── data/
│   ├── tradeFlows.ts                # AUTO-GENERATED — 468 bilateral crude oil flows
│   ├── ports.ts                     # Editable port catalog, alternate terminals, source groups
│   ├── pipelines.ts                 # Editable pipeline corridor catalog and source groups
│   ├── countries.ts                 # Derived country display anchors from the port catalog
│   ├── regions.ts                   # 10 regions for color grouping
│   └── seaRoutes.ts                 # Scenario-aware maritime corridor routing
└── visualization/
    ├── orbitCompass.ts              # 3D cardinal-direction compass anchored to the globe
    ├── regionSpheres.ts             # Country spheres sized by trade volume
    └── seaLanes.ts                  # Maritime and pipeline route rendering
```

### Key Technical Details

- **Trade routing**: Dijkstra on a logistics-aware maritime corridor graph, with edge costs based on corridor type, chokepoint penalties, and canal delays. A separate editable pipeline layer handles obvious overland cases such as Canada→United States, Russia→China, Kazakhstan→China, and short refinery corridors in Northwest Europe.
- **Corridor geometry**: Key chokepoints and coastal approaches now use authored segment geometry for Hormuz, Suez, Gibraltar, the English Channel, Danish Straits, Bosphorus, Malacca, Panama, the Cape route, and several Atlantic/African coastal legs.
- **Scenario controls**: The UI can rebuild routes for Baseline, Suez Closed, Panama Constrained, and Hormuz High Risk cases. These scenarios change graph costs or closures and trigger actual rerouting.
- **Hemisphere culling**: Entities on the far side of the globe are hidden each frame via a dot-product test (camera normal · entity normal). Zero-allocation per frame using scratch vectors.
- **Rendering strategy**: Lanes are rendered as persistent corridors only. The particle animation path was removed to reduce per-frame GPU and CPU work.
- **Country spheres**: Sized by `log1p(totalTradeVolume)`, colored by region with warm/cool tinting based on net exporter/importer status.
- **Orbit compass**: Cardinal-direction axes and labels rendered around the camera target, with dynamic radius scaling based on zoom distance.
- **Gesture handling**: Trackpad-aware (distinguishes two-finger swipe from mouse wheel), Safari `GestureEvent` support, touchscreen pointer fallback. Gesture classification and angle math live in `mathUtils.ts`.

## Methods

The route model is built in layers:

1. **Trade flows** come from Atlas bilateral SITC 3330 exports and are thresholded at $100M.
2. **Country anchors** are derived from a manual port catalog in `src/data/ports.ts`. Each country has one primary display anchor and can have alternate terminals for future route refinement.
3. **Pipeline corridors** live in `src/data/pipelines.ts`. They are generalized paths for flows that should not be shown as maritime.
4. **Maritime corridors** live in `src/data/seaRoutes.ts`. Each corridor has a profile, optional authored geometry, and optional scenario tags.
5. **Route selection** uses Dijkstra on generalized transit cost, not pure distance. Canal delays, chokepoint risk, and closures can change the selected path.

This means the visualization is no longer a pure geometry problem. It is a hand-curated logistics model that mixes trade data with transport assumptions.

## Editing The Network

If you want to edit the route model directly, use these files:

- `src/data/ports.ts`: add ports, alternate terminals, source notes, and special country-to-waypoint entry rules.
- `src/data/pipelines.ts`: add or modify overland pipeline corridors.
- `src/data/seaRoutes.ts`: edit maritime chokepoints, corridor geometry, or scenario penalties.

The intended workflow is:

1. Add or update terminals in `ports.ts`.
2. Add pipeline corridors in `pipelines.ts` for flows that should not be maritime.
3. Tune maritime geometry or scenario cost in `seaRoutes.ts`.
4. Run `npm run build` to validate the network changes.

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
