// ─── Flow Animation (Particles Along Sea Lanes) ────────────────────
// Animates small point entities travelling along each rendered sea lane
// to show the direction and intensity of oil flow.

import * as Cesium from "cesium";
import { getRegion } from "../data/regions";
import type { RenderedLane } from "./seaLanes";

/** Number of particles per lane */
const PARTICLES_PER_LANE = 6;
/** Base animation speed (fraction of route per second) */
const BASE_SPEED = 0.04;
/** Particle point size range */
const MIN_POINT_SIZE = 4;
const MAX_POINT_SIZE = 8;
/** Altitude offset above the sea lane line */
const ALT_OFFSET = 25_000;

interface Particle {
  entity: Cesium.Entity;
  /** Current progress along route: 0..1 */
  phase: number;
}

interface LaneAnimation {
  lane: RenderedLane;
  particles: Particle[];
  speed: number; // fraction of route per second
  /** Precomputed Cartesian3 positions along the route */
  positions: Cesium.Cartesian3[];
}

let animations: LaneAnimation[] = [];
let removeTickListener: (() => void) | null = null;

/**
 * Start animating particles along all rendered sea lanes.
 * Call once after createSeaLanes().
 */
export function startFlowAnimation(
  viewer: Cesium.Viewer,
  lanes: RenderedLane[],
  maxFlowValue: number,
): void {
  // Clean up previous animation if any
  stopFlowAnimation(viewer);

  animations = [];

  for (const lane of lanes) {
    // Precompute Cartesian3 positions from lat/lon points
    const positions = lane.points.map(([lat, lon]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, ALT_OFFSET),
    );

    if (positions.length < 2) continue;

    // Speed scales with flow value (higher volume = faster particles)
    const normalizedValue = lane.flow.value / maxFlowValue;
    const speed = BASE_SPEED * (0.5 + normalizedValue * 1.5);

    // Particle visual size
    const pointSize =
      MIN_POINT_SIZE +
      (MAX_POINT_SIZE - MIN_POINT_SIZE) * Math.sqrt(normalizedValue);

    // Color: brighter version of the source region color
    const region = getRegion(lane.flow.from);
    const [r, g, b] = region.color;
    const color = new Cesium.Color(
      Math.min(1, (r / 255) * 1.3 + 0.2),
      Math.min(1, (g / 255) * 1.3 + 0.2),
      Math.min(1, (b / 255) * 1.3 + 0.2),
      0.9,
    );

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLES_PER_LANE; i++) {
      const phase = i / PARTICLES_PER_LANE;

      const entity = viewer.entities.add({
        position: positions[0], // will be updated each frame
        point: {
          pixelSize: pointSize,
          color,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.3),
        },
      });

      particles.push({ entity, phase });
    }

    animations.push({ lane, particles, speed, positions });
  }

  // Register tick handler for animation
  const tickHandler = (_clock: Cesium.Clock) => {
    updateParticles(viewer);
  };
  viewer.clock.onTick.addEventListener(tickHandler);
  removeTickListener = () =>
    viewer.clock.onTick.removeEventListener(tickHandler);

  // Make sure the clock is running
  viewer.clock.shouldAnimate = true;
}

/** Stop and clean up all particle animations */
export function stopFlowAnimation(viewer: Cesium.Viewer): void {
  if (removeTickListener) {
    removeTickListener();
    removeTickListener = null;
  }
  for (const anim of animations) {
    for (const p of anim.particles) {
      viewer.entities.remove(p.entity);
    }
  }
  animations = [];
}

// ─── Frame Update ───────────────────────────────────────────────────
let lastTime = 0;

function updateParticles(_viewer: Cesium.Viewer): void {
  const now = performance.now() / 1000; // seconds
  const dt = lastTime === 0 ? 0.016 : Math.min(now - lastTime, 0.1);
  lastTime = now;

  for (const anim of animations) {
    const { positions, speed, particles } = anim;
    const segCount = positions.length - 1;

    for (const particle of particles) {
      // Advance phase
      particle.phase += speed * dt;
      if (particle.phase >= 1) particle.phase -= 1;

      // Map phase to segment + local t
      const totalT = particle.phase * segCount;
      const segIndex = Math.min(Math.floor(totalT), segCount - 1);
      const localT = totalT - segIndex;

      // Lerp between segment endpoints
      const pos = Cesium.Cartesian3.lerp(
        positions[segIndex],
        positions[segIndex + 1],
        localT,
        new Cesium.Cartesian3(),
      );

      particle.entity.position = pos as unknown as Cesium.PositionProperty;
    }
  }
}
