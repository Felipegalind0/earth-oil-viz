// ─── Sea Lane Polyline Visualization ────────────────────────────────
// Renders smooth polylines along computed sea routes with width ∝ trade volume.

import * as Cesium from "cesium";
import { getCountry } from "../data/countries";
import { COUNTRY_TO_REGION, REGIONS } from "../data/regions";
import { findTradeRoute } from "../data/seaRoutes";
import type { RouteMode } from "../data/seaRoutes";
import type { RouteScenarioId } from "../data/seaRoutes";
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
  mode: RouteMode;
  totalCostHours: number;
  totalDistanceKm: number;
  /** Interpolated [lat, lon] points along the route */
  points: [number, number][];
}

export function createSeaLanes(
  viewer: Cesium.Viewer,
  flows: TradeFlow[],
  scenarioId: RouteScenarioId,
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
    const cacheKey = `${scenarioId}:${flow.from}→${flow.to}`;
    const route = findTradeRoute(
      flow.from,
      fromCountry.lat,
      fromCountry.lon,
      flow.to,
      toCountry.lat,
      toCountry.lon,
      scenarioId,
      cacheKey,
    );
    if (!route || route.points.length < 2) continue;
    const points = route.points;

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
    const baseColor = new Cesium.Color(r / 255, g / 255, b / 255, route.mode === "pipeline" ? 0.7 : 0.45);
    const material = route.mode === "pipeline"
      ? new Cesium.PolylineDashMaterialProperty({
        color: baseColor,
        dashLength: 16,
      })
      : new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: baseColor,
      });

    const displayWidth = route.mode === "pipeline"
      ? Math.max(1.5, width * 0.75)
      : width;

    const transitDays = route.totalCostHours / 24;
    const routeLabel = route.mode === "pipeline" ? "Pipeline corridor" : "Maritime corridor";

    const entity = viewer.entities.add({
      name: `${fromCountry.name} → ${toCountry.name}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(degreesAndHeights),
        width: displayWidth,
        material,
        arcType: Cesium.ArcType.NONE,
      },
      description: `${fromCountry.name} → ${toCountry.name}<br/>` +
        `Trade value: $${(flow.value / 1e9).toFixed(1)}B<br/>` +
        `Route mode: ${routeLabel}<br/>` +
        `Estimated transit: ${transitDays.toFixed(1)} days<br/>` +
        `Route length: ${(route.totalDistanceKm / 1000).toFixed(1)}k km`,
    });

    lanes.push({
      entity,
      flow,
      mode: route.mode,
      totalCostHours: route.totalCostHours,
      totalDistanceKm: route.totalDistanceKm,
      points,
    });
  }

  return lanes;
}