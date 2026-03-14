// ─── Sea Lane Polyline Visualization ────────────────────────────────
// Renders smooth polylines along sea routes with width proportional to trade volume.

import * as Cesium from "cesium";
import { getRegion } from "../data/regions";
import { findRoute, interpolateRoute } from "../data/seaRoutes";
import type { RegionFlow } from "../data/comtradeApi";

/** Minimum polyline width in pixels */
const MIN_WIDTH = 1.5;
/** Maximum polyline width in pixels */
const MAX_WIDTH = 12;
/** Altitude of sea lane polylines above surface (metres) */
const LANE_ALTITUDE = 15_000;

export interface RenderedLane {
  entity: Cesium.Entity;
  flow: RegionFlow;
  /** Interpolated [lat, lon] points along the route */
  points: [number, number][];
}

export function createSeaLanes(
  viewer: Cesium.Viewer,
  flows: RegionFlow[],
): RenderedLane[] {
  const lanes: RenderedLane[] = [];

  // Find max flow value for width normalization
  const maxValue = Math.max(...flows.map((f) => f.value), 1);

  for (const flow of flows) {
    const route = findRoute(flow.from, flow.to);
    if (!route) continue;

    // If route is defined in reverse direction, flip the waypoints
    const isReverse = route.from !== flow.from;
    const wpKeys = isReverse ? [...route.waypoints].reverse() : route.waypoints;

    // Interpolate smooth curve through waypoints
    const points = interpolateRoute(wpKeys, 10);

    // Build Cesium positions array: [lon, lat, alt, lon, lat, alt, ...]
    const degreesAndHeights: number[] = [];
    for (const [lat, lon] of points) {
      degreesAndHeights.push(lon, lat, LANE_ALTITUDE);
    }

    // Width proportional to log of value
    const normalizedValue = flow.value / maxValue;
    const width = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.sqrt(normalizedValue);

    // Color based on source region
    const sourceRegion = getRegion(flow.from);
    const [r, g, b] = sourceRegion.color;
    const color = new Cesium.Color(r / 255, g / 255, b / 255, 0.5);
    // Main lane line
    const entity = viewer.entities.add({
      name: `${getRegion(flow.from).name} → ${getRegion(flow.to).name}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(degreesAndHeights),
        width,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color,
        }),
        arcType: Cesium.ArcType.NONE, // already interpolated
      },
      description: `Trade value: $${(flow.value / 1e9).toFixed(1)}B`,
    });

    lanes.push({ entity, flow, points });
  }

  return lanes;
}
