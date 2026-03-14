// ─── Flow Animation (Particles Along Sea Lanes) ────────────────────
// Animates point entities travelling along each sea lane using
// CallbackProperty for efficient per-frame position updates.

import * as Cesium from "cesium";
import { COUNTRY_TO_REGION, REGIONS } from "../data/regions";
import type { RenderedLane } from "./seaLanes";

/** Particles per lane */
const PARTICLES_PER_LANE = 5;
/** Base speed: fraction of route per second */
const BASE_SPEED = 0.035;
const MIN_POINT_SIZE = 3;
const MAX_POINT_SIZE = 7;
/** Altitude for particles */
const ALT_OFFSET = 20_000;

export interface FlowAnimationHandle {
  /** All particle entities (for culling) */
  particles: Cesium.Entity[];
  /** Cleanup function to remove all particles */
  cleanup: () => void;
}

/**
 * Start animating particles along all rendered sea lanes.
 * Uses CallbackProperty so Cesium updates positions automatically each frame.
 * Returns a handle with particle entities and a cleanup function.
 */
export function startFlowAnimation(
  viewer: Cesium.Viewer,
  lanes: RenderedLane[],
  maxFlowValue: number,
): FlowAnimationHandle {
  const particleEntities: Cesium.Entity[] = [];

  // Region color lookup
  const regionColorMap = new Map<string, [number, number, number]>();
  for (const r of REGIONS) regionColorMap.set(r.id, r.color);

  // Base time reference
  const startTime = performance.now() / 1000;

  for (const lane of lanes) {
    // Precompute Cartesian3 positions from the route points
    const positions = lane.points.map(([lat, lon]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, ALT_OFFSET),
    );
    if (positions.length < 2) continue;

    const segCount = positions.length - 1;

    // Speed and size scale with flow value
    const normalizedValue = lane.flow.value / maxFlowValue;
    const durationFactor = Cesium.Math.clamp(120 / Math.max(lane.totalCostHours, 24), 0.45, 1.85);
    const modeFactor = lane.mode === "pipeline" ? 0.8 : 1;
    const speed = BASE_SPEED * durationFactor * modeFactor * (0.6 + normalizedValue * 1.4);
    const pointSize = MIN_POINT_SIZE +
      (MAX_POINT_SIZE - MIN_POINT_SIZE) * Math.sqrt(normalizedValue);
    const displayPointSize = lane.mode === "pipeline" ? pointSize * 0.8 : pointSize;

    // Brighter version of source region color
    const regionId = COUNTRY_TO_REGION.get(lane.flow.from) ?? "africa";
    const [cr, cg, cb] = regionColorMap.get(regionId) ?? [180, 180, 180];
    const color = new Cesium.Color(
      Math.min(1, (cr / 255) * 1.3 + 0.2),
      Math.min(1, (cg / 255) * 1.3 + 0.2),
      Math.min(1, (cb / 255) * 1.3 + 0.2),
      lane.mode === "pipeline" ? 0.65 : 0.85,
    );

    for (let i = 0; i < PARTICLES_PER_LANE; i++) {
      const phaseOffset = i / PARTICLES_PER_LANE;

      // Use CallbackProperty for efficient per-frame position update
      const positionProperty = new Cesium.CallbackProperty(() => {
        const elapsed = performance.now() / 1000 - startTime;
        const phase = ((elapsed * speed) + phaseOffset) % 1;
        const totalT = phase * segCount;
        const segIndex = Math.min(Math.floor(totalT), segCount - 1);
        const localT = totalT - segIndex;

        return Cesium.Cartesian3.lerp(
          positions[segIndex],
          positions[segIndex + 1],
          localT,
          new Cesium.Cartesian3(),
        );
      }, false);

      const entity = viewer.entities.add({
        position: positionProperty as unknown as Cesium.PositionProperty,
        point: {
          pixelSize: displayPointSize,
          color,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.25),
        },
      });

      particleEntities.push(entity);
    }
  }

  // Ensure clock is running for animation
  viewer.clock.shouldAnimate = true;

  // Return handle with particles and cleanup
  return {
    particles: particleEntities,
    cleanup: () => {
      for (const entity of particleEntities) {
        viewer.entities.remove(entity);
      }
      particleEntities.length = 0;
    },
  };
}