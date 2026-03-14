// ─── Sea Lane Polyline Visualization ────────────────────────────────
// Renders smooth polylines along computed sea routes with width ∝ trade volume.

import * as Cesium from "cesium";
import { getCountry } from "../data/countries";
import { COUNTRY_TO_REGION, REGIONS } from "../data/regions";
import { findSeaRoute } from "../data/seaRoutes";
import type { TradeFlow } from "../data/tradeFlows";

/** Minimum polyline width in pixels */
const MIN_WIDTH = 1.0;
/** Maximum polyline width in pixels */
const MAX_WIDTH = 10;
/** Altitude of sea lane polylines above surface (metres) */
const LANE_ALTITUDE = 12_000;

export interface RenderedLane {
  entity: Cesium.Entity;
  flow: TradeFlow;
  /** Interpolated [lat, lon] points along the route */
  points: [number, number][];
}

export function createSeaLanes(
  viewer: Cesium.Viewer,
  flows: TradeFlow[],
): RenderedLane[] {
  const lanes: RenderedLane[] = [];

  // Max flow value for width normalization
  const maxValue = Math.max(...flows.map((f) => f.value), 1);

  // Region color lookup
  const regionColorMap = new Map<string, [number, number, number]>();
  for (const r of REGIONS) regionColorMap.set(r.id, r.color);

  for (const flow of flows) {
    let fromCountry, toCountry;
    try {
      fromCountry = getCountry(flow.from);
      toCountry = getCountry(flow.to);
    } catch {
      continue; // skip flows for countries not in our dataset
    }

    // Find route via waypoint graph
    const cacheKey = `${flow.from}→${flow.to}`;
    const points = findSeaRoute(
      fromCountry.lat, fromCountry.lon,
      toCountry.lat, toCountry.lon,
      cacheKey,
    );
    if (!points || points.length < 2) continue;

    // Build Cesium positions: [lon, lat, alt, ...]
    const degreesAndHeights: number[] = [];
    for (const [lat, lon] of points) {
      degreesAndHeights.push(lon, lat, LANE_ALTITUDE);
    }

    // Width proportional to sqrt of normalized value
    const normalizedValue = flow.value / maxValue;
    const width = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.sqrt(normalizedValue);

    // Color based on source region
    const regionId = COUNTRY_TO_REGION.get(flow.from) ?? "africa";
    const [r, g, b] = regionColorMap.get(regionId) ?? [180, 180, 180];
    const color = new Cesium.Color(r / 255, g / 255, b / 255, 0.45);

    const entity = viewer.entities.add({
      name: `${fromCountry.name} → ${toCountry.name}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(degreesAndHeights),
        width,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color,
        }),
        arcType: Cesium.ArcType.NONE,
      },
      description: `${fromCountry.name} → ${toCountry.name}<br/>` +
        `Trade value: $${(flow.value / 1e9).toFixed(1)}B`,
    });

    lanes.push({ entity, flow, points });
  }

  return lanes;
}