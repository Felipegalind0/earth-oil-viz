# Cesium to deck.gl Migration Audit

Date: 2026-05-17

## Executive Summary

- The current runtime is fully coupled to Cesium in rendering, camera control, selection, culling, and UI integration.
- Replacing Cesium with deck.gl is feasible, but the current deck.gl WebGPU path is not feature-complete for this app's terrain stack.
- Most importantly: `Tile3DLayer` and picking-dependent flows are still marked non-WebGPU in deck.gl's current WebGPU status docs.
- Result: migrating to deck.gl now can simplify architecture and improve maintainability, but it will not deliver full WebGPU acceleration for Google 3D Tiles yet.

## Current Coupling Inventory

### Build/Dependency Coupling

- `package.json`
  - `cesium` runtime dependency
  - `vite-plugin-cesium` dev dependency
  - Build script copies Cesium assets into `dist/cesium`
- `vite.config.ts`
  - Cesium Vite plugin registration

### Runtime Coupling

- `src/globe.ts`
  - Creates and manages `Cesium.Viewer`
  - Configures imagery and Google photorealistic tileset via Cesium APIs
  - Implements custom camera state model using Cesium cartesian/cartographic math
  - Binds pointer, wheel, touch, and Safari gesture events directly to Cesium camera operations
  - Uses Cesium entity tracking/selection and InfoBox behavior
- `src/visualization/orbitCompass.ts`
  - Compass rendered as Cesium entities (polylines, labels, points)
- `src/culling.ts`
  - Horizon culling toggles Cesium entities using Cesium vector math

### DOM/CSS Coupling

- `index.html`
  - Cesium container id and Cesium-oriented structure
- `src/style.css`
  - Cesium container selectors
  - Cesium InfoBox override styles

### Reusable (Engine-Agnostic) Code

- `src/mathUtils.ts`
- `src/mathUtils.test.ts`

## Deck.gl Reality Check (WebGPU)

Based on deck.gl docs and current source-based WebGPU matrix:

- WebGPU support is still work in progress.
- `Tile3DLayer` is currently not marked as WebGPU-ready.
- Picking paths are currently listed as not available on WebGPU.
- Terrain-aware camera flows for 3D tiles rely on picking (`pickable: '3d'` + `TerrainController`).

Practical implication for this repo:

- If Google 3D Tiles remains the primary base layer, deck.gl still runs that path on WebGL today.
- A migration can still be worthwhile, but expected gain is architecture portability and future-readiness, not immediate end-to-end WebGPU throughput.

## Recommended Target Architecture

Introduce a small engine abstraction and move domain logic above the renderer.

### New Core Contracts

- `src/engine/types.ts`
  - `GlobeViewState` (longitude, latitude, zoom, bearing, pitch)
  - `EngineContext` (view state getters/setters, picking hooks, event bus)
  - `EngineLayer` (deck.gl layer factories or equivalent render payloads)
  - `GlobeLayer` updated to engine-neutral contracts (no Cesium types)

### Engine Adapters

- `src/engine/deck/createDeckEngine.ts`
  - Owns `Deck` instance lifecycle
  - Uses `GlobeView` for globe camera mode and `Tile3DLayer` for tiles
  - Attempts WebGPU initialization first, then explicit fallback to WebGL
- Optional transitional adapter:
  - `src/engine/cesium/createCesiumEngine.ts` to avoid big-bang migration

### App Shell

- `src/globe.ts`
  - Becomes engine-orchestrator, not Cesium implementation
  - Keeps public `createGlobe` entrypoint
  - Delegates runtime to selected engine (`deck` default)

### UI/Compass

- Move compass rendering out of Cesium entities:
  - Option A: pure DOM/SVG HUD (recommended for fast parity)
  - Option B: deck.gl overlay layers for world-anchored compass geometry

### Culling

- Keep geometric strategy from `src/culling.ts`, but convert to engine-neutral data model:
  - Use plain vectors and per-layer visibility predicates
  - Avoid direct `entity.show` mutation assumptions

## Phased Migration Plan

## Phase 0: Foundation (1-2 days)

1. Add engine-neutral type contracts.
2. Refactor plugin interface away from `Cesium.Viewer` and `Cesium.Entity` types.
3. Keep Cesium adapter temporarily to avoid breaking downstream projects immediately.

Deliverable:

- Existing behavior still works with Cesium through adapter layer.

## Phase 1: Deck.gl WebGL Parity (3-6 days)

1. Implement `createDeckEngine` with:
   - `Deck`
   - `GlobeView`
   - `Tile3DLayer` (Google 3D Tiles with API header)
2. Port interaction model:
   - Prefer built-in `GlobeController` first
   - Re-add custom wheel/trackpad behavior only where needed
3. Port HUD status and north-up reset from Cesium camera state to deck `viewState`.
4. Replace Cesium-based orbit compass with DOM/SVG implementation.

Deliverable:

- Feature parity in WebGL mode without Cesium runtime.

## Phase 2: WebGPU Gate + Capability Routing (1-2 days)

1. Add startup capability detection and runtime reporting:
   - `requestedRenderer`: `webgpu`
   - `actualRenderer`: `webgpu` or `webgl`
2. Initialize deck with WebGPU adapter first.
3. Auto-fallback when layer/controller paths are unsupported.

Deliverable:

- Deterministic runtime mode with explicit telemetry in console/HUD.

## Phase 3: Remove Cesium (0.5-1 day)

1. Delete Cesium adapter and Cesium-only files.
2. Remove `cesium` and `vite-plugin-cesium` from dependencies.
3. Remove Cesium asset copy steps from build scripts.
4. Remove Cesium-specific CSS rules and InfoBox overrides.

Deliverable:

- Clean deck.gl-only codebase.

## Phase 4: Performance Pass (1-2 days)

1. Tune `Tile3DLayer` load options:
   - `maximumScreenSpaceError`
   - `maximumMemoryUsage`
   - `memoryAdjustedScreenSpaceError`
2. Reduce draw buffer pressure with `useDevicePixels` strategy.
3. Add deck metrics logging via `_onMetrics` for regression checks.

Deliverable:

- Stable frame pacing and measurable memory budget controls.

## Risk Register

1. WebGPU expectation mismatch
- Risk: team expects immediate full WebGPU acceleration.
- Mitigation: ship runtime capability banner and documented fallback behavior.

2. Interaction regressions
- Risk: custom Cesium gestures feel different under deck controllers.
- Mitigation: parity acceptance tests for pan/orbit/zoom semantics.

3. Plugin ecosystem breakage
- Risk: downstream projects depend on `Cesium.Viewer` in layer `setup`.
- Mitigation: provide temporary compatibility adapter and migration guide.

4. 3D tile visual differences
- Risk: lighting/LOD differences vs Cesium defaults.
- Mitigation: controlled before/after visual snapshots and tuned load options.

## Acceptance Criteria

- No direct `cesium` imports anywhere in `src/`.
- `npm run build` does not copy Cesium assets.
- Globe renders with deck.gl and Google 3D tiles.
- Existing HUD controls work (north-up, status updates, help/settings dialogs).
- Plugin API no longer references Cesium types.
- Runtime exposes whether render backend is WebGPU or WebGL fallback.

## Suggested Immediate Next Change Set

1. Add `src/engine/types.ts` and adapt `GlobeLayer` to engine-neutral types.
2. Split current `src/globe.ts` into orchestrator + `createCesiumEngine` adapter.
3. Scaffold `createDeckEngine` with Google 3D Tiles and basic controller.
4. Add temporary query flag `?engine=deck|cesium` for side-by-side validation.
