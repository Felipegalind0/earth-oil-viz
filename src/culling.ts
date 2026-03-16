// ─── Hemisphere Culling ─────────────────────────────────────────────
// Hides entities on the far side of the globe using a dot-product test.
// Cost: one normalize + one dot per entity per frame — extremely fast.

import * as Cesium from "cesium";

/** Any polyline entity with [lat, lon] sample points — generic interface for culling. */
export interface CullablePolyline {
  entity: Cesium.Entity;
  points: [number, number][];
}

// Scratch vectors (reused every frame, zero allocation)
const scratchCam = new Cesium.Cartesian3();

// Earth equatorial radius (meters) — used to compute geometric horizon
const R = Cesium.Ellipsoid.WGS84.maximumRadius;

// Small margin subtracted from the threshold so entities don't pop
// right at the geometric horizon edge.
const HORIZON_MARGIN = 0.03;

export interface CullableSet {
  spheres: Cesium.Entity[];
  lanes: CullablePolyline[];
  /** Precomputed unit-sphere positions for spheres (parallel array) */
  sphereNormals: Cesium.Cartesian3[];
  /** Precomputed start normals for lanes (parallel array) */
  laneStartNormals: Cesium.Cartesian3[];
  /** Precomputed midpoint normals for lanes (parallel array) */
  laneMidNormals: Cesium.Cartesian3[];
  /** Precomputed end normals for lanes (parallel array) */
  laneEndNormals: Cesium.Cartesian3[];
}

/**
 * Build a CullableSet from the visualization outputs.
 * Precomputes normalized surface positions so the per-frame loop is pure math.
 */
export function buildCullableSet(
  spheres: Cesium.Entity[],
  lanes: CullablePolyline[],
): CullableSet {
  // Sphere normals from their static positions
  const sphereNormals = spheres.map((e) => {
    const pos = e.position?.getValue(Cesium.JulianDate.now());
    if (!pos) return Cesium.Cartesian3.UNIT_X;
    return Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
  });

  // Lane start / mid / end normals
  const laneStartNormals: Cesium.Cartesian3[] = [];
  const laneMidNormals: Cesium.Cartesian3[] = [];
  const laneEndNormals: Cesium.Cartesian3[] = [];
  for (const lane of lanes) {
    const pts = lane.points;
    const s = pts[0];
    const m = pts[Math.floor(pts.length / 2)];
    const e = pts[pts.length - 1];
    laneStartNormals.push(Cesium.Cartesian3.normalize(Cesium.Cartesian3.fromDegrees(s[1], s[0], 0), new Cesium.Cartesian3()));
    laneMidNormals.push(Cesium.Cartesian3.normalize(Cesium.Cartesian3.fromDegrees(m[1], m[0], 0), new Cesium.Cartesian3()));
    laneEndNormals.push(Cesium.Cartesian3.normalize(Cesium.Cartesian3.fromDegrees(e[1], e[0], 0), new Cesium.Cartesian3()));
  }

  return { spheres, lanes, sphereNormals, laneStartNormals, laneMidNormals, laneEndNormals };
}

/**
 * Per-frame culling update. Call from viewer.clock.onTick.
 * Uses a dynamic horizon threshold based on camera distance:
 *   threshold = R / d  (Earth radius / camera distance from center)
 * This matches the geometric horizon exactly at every zoom level.
 */
export function updateCulling(
  viewer: Cesium.Viewer,
  set: CullableSet,
): void {
  const camPos = viewer.camera.positionWC;
  Cesium.Cartesian3.normalize(camPos, scratchCam);

  // Dynamic threshold: R/d shrinks as camera moves away, grows as it zooms in
  const camDist = Cesium.Cartesian3.magnitude(camPos);
  const threshold = R / camDist - HORIZON_MARGIN;

  // Cull spheres
  for (let i = 0; i < set.spheres.length; i++) {
    const dot = Cesium.Cartesian3.dot(scratchCam, set.sphereNormals[i]);
    set.spheres[i].show = dot > threshold;
  }

  // Cull lanes — visible if ANY of start/mid/end is above threshold
  for (let i = 0; i < set.lanes.length; i++) {
    const dS = Cesium.Cartesian3.dot(scratchCam, set.laneStartNormals[i]);
    const dM = Cesium.Cartesian3.dot(scratchCam, set.laneMidNormals[i]);
    const dE = Cesium.Cartesian3.dot(scratchCam, set.laneEndNormals[i]);
    set.lanes[i].entity.show = dS > threshold || dM > threshold || dE > threshold;
  }
}
