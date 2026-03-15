// ─── Hemisphere Culling ─────────────────────────────────────────────
// Hides entities on the far side of the globe using a dot-product test.
// Cost: one normalize + one dot per entity per frame — extremely fast.

import * as Cesium from "cesium";
import type { RenderedLane } from "./visualization/seaLanes";

// Scratch vectors (reused every frame, zero allocation)
const scratchCam = new Cesium.Cartesian3();

// Threshold: cos(~100°) ≈ -0.17  — slightly past the horizon so entities
// don't pop in/out right at the edge. Negative = behind the globe.
const DOT_THRESHOLD = 0;

export interface CullableSet {
  spheres: Cesium.Entity[];
  lanes: RenderedLane[];
  /** Precomputed unit-sphere positions for spheres (parallel array) */
  sphereNormals: Cesium.Cartesian3[];
  /** Precomputed midpoint normals for lanes (parallel array) */
  laneMidNormals: Cesium.Cartesian3[];
}

/**
 * Build a CullableSet from the visualization outputs.
 * Precomputes normalized surface positions so the per-frame loop is pure math.
 */
export function buildCullableSet(
  spheres: Cesium.Entity[],
  lanes: RenderedLane[],
): CullableSet {
  // Sphere normals from their static positions
  const sphereNormals = spheres.map((e) => {
    const pos = e.position?.getValue(Cesium.JulianDate.now());
    if (!pos) return Cesium.Cartesian3.UNIT_X;
    return Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
  });

  // Lane midpoint normals
  const laneMidNormals = lanes.map((lane) => {
    const mid = lane.points[Math.floor(lane.points.length / 2)];
    const pos = Cesium.Cartesian3.fromDegrees(mid[1], mid[0], 0);
    return Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
  });

  return { spheres, lanes, sphereNormals, laneMidNormals };
}

/**
 * Per-frame culling update. Call from viewer.clock.onTick.
 * Hides entities whose surface-normal dot camera-normal < threshold.
 */
export function updateCulling(
  viewer: Cesium.Viewer,
  set: CullableSet,
): void {
  // Camera direction on unit sphere
  const camPos = viewer.camera.positionWC;
  Cesium.Cartesian3.normalize(camPos, scratchCam);

  // Cull spheres
  for (let i = 0; i < set.spheres.length; i++) {
    const dot = Cesium.Cartesian3.dot(scratchCam, set.sphereNormals[i]);
    set.spheres[i].show = dot > DOT_THRESHOLD;
  }

  // Cull lanes — use midpoint of route
  for (let i = 0; i < set.lanes.length; i++) {
    const dot = Cesium.Cartesian3.dot(scratchCam, set.laneMidNormals[i]);
    set.lanes[i].entity.show = dot > DOT_THRESHOLD;
  }
}
