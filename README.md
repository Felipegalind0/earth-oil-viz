# FOSS Earth

Free and open-source 3D globe viewer built with [Cesium.js](https://cesium.com/). Provides an improved Google Earth-style experience with custom gesture handling, an interactive camera HUD, and a plugin system for layering domain-specific visualizations.

**[Live Demo](https://felipegalind0.github.io/foss-earth/)**

## Features

- **Google Photorealistic 3D Tiles** with OpenStreetMap fallback
- **Trackpad-aware gestures**: two-finger swipe to pan, pinch to zoom, shift+swipe to orbit, Safari `GestureEvent` support
- **Touch support**: two-finger orbit and pinch on mobile/tablet
- **Interactive camera HUD**: click to edit lat/lon/heading/pitch/zoom directly
- **Orbit compass**: 3D cardinal-direction axes anchored to the globe surface
- **North-up reset**: one-click button to reset heading and tilt
- **Hemisphere culling**: fast dot-product visibility test (zero allocation per frame)
- **Plugin system**: `GlobeLayer` interface for adding domain-specific data layers

## Architecture

```
src/
├── main.ts                          # Entry point — creates the globe
├── globe.ts                         # Generic Cesium globe (viewer, camera, gestures, HUD, compass, layers)
├── culling.ts                       # Hemisphere culling (dot-product visibility test)
├── mathUtils.ts                     # Pure math helpers for gesture classification
├── mathUtils.test.ts                # Unit tests (vitest)
├── style.css                        # UI styles
└── visualization/
    └── orbitCompass.ts              # 3D cardinal-direction compass
```

## GlobeLayer Plugin Interface

Add domain-specific visualizations by implementing `GlobeLayer`:

```typescript
import { createGlobe, type GlobeLayer } from "./globe";

const myLayer: GlobeLayer = {
  id: "my-layer",
  setup(viewer) {
    // Create entities, return POI entities for tracking
    const entities = [...];
    return { poiEntities: entities };
  },
  destroy(viewer) {
    // Remove entities
  },
};

const globe = await createGlobe({ apiKey: "..." });
globe.addLayer(myLayer);
```

## Setup

```bash
npm install
npm run dev          # dev server at localhost:5173
npm run build        # production build to dist/
npm run deploy       # build + deploy to GitHub Pages
npm run test         # run unit tests
```

### Google 3D Tiles (optional)

Append `?key=YOUR_GOOGLE_MAPS_API_KEY` to the URL for [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles). Without a key, falls back to OpenStreetMap.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Pan | Left drag / 2-finger swipe | 1-finger drag |
| Orbit (heading + pitch) | Right drag / Shift + 2-finger swipe | 2-finger drag |
| Zoom | Scroll wheel / Pinch | Pinch |
| North-up reset | Click "North Up" button | Click "North Up" button |

## Projects Using FOSS Earth

- **[foss-earth-oil](https://github.com/felipegalind0/foss-earth-oil)** — Global crude oil trade flow visualization with 468 bilateral flows, Dijkstra maritime routing, chokepoint scenarios, and country spheres.

## Stack

- **Cesium.js** 1.139 — 3D globe rendering
- **Vite** 7.3 + **TypeScript** 5.9 — build tooling
- **gh-pages** — GitHub Pages deployment
