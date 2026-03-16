/**
 * Pure math helpers extracted from main.ts for testability.
 */

export interface ScreenTouchPoint {
  x: number;
  y: number;
}

export interface TwoPointGestureMetrics {
  angleRad: number;
  distancePx: number;
  centroidX: number;
  centroidY: number;
}

export type TwoPointGestureIntent = "swipe" | "pinch" | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Shortest signed delta between two angles in degrees (result in [-180, 180)). */
export function shortestAngleDeltaDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Shortest signed delta between two angles in radians (result in [-pi, pi)). */
export function normalizeAngleDeltaRad(from: number, to: number): number {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/** Compute distance, angle, and centroid for a two-touch gesture. */
export function computeTwoPointGestureMetrics(
  firstPoint: ScreenTouchPoint,
  secondPoint: ScreenTouchPoint,
): TwoPointGestureMetrics {
  const dx = secondPoint.x - firstPoint.x;
  const dy = secondPoint.y - firstPoint.y;

  return {
    angleRad: Math.atan2(dy, dx),
    distancePx: Math.hypot(dx, dy),
    centroidX: (firstPoint.x + secondPoint.x) * 0.5,
    centroidY: (firstPoint.y + secondPoint.y) * 0.5,
  };
}

/**
 * Decide whether a two-finger gesture is primarily a swipe (centroid translation) or pinch.
 * Returns null while intent is still ambiguous.
 */
export function classifyTwoPointGestureIntent(
  centroidTranslationPx: number,
  scaleRatio: number,
): TwoPointGestureIntent {
  const swipeScore = centroidTranslationPx / 2;
  const scaleScore = Math.abs(scaleRatio - 1) / 0.05;

  if (swipeScore >= 1 && swipeScore > scaleScore * 1.25) {
    return "swipe";
  }

  if (scaleScore >= 1 && scaleScore > swipeScore * 1.25) {
    return "pinch";
  }

  return null;
}

/**
 * Compute pitch relative to the globe surface at the current orbit target.
 * Returns 90 when looking straight down, 0 at the horizon, and negative when looking away.
 */
export function computeSurfaceRelativePitchDeg(viewDirectionDotSurfaceNormal: number): number {
  return (Math.asin(-clamp(viewDirectionDotSurfaceNormal, -1, 1)) * 180) / Math.PI;
}

/** Compensate heading by 180° when camera looks away from the globe. */
export function compensateInvertedHeading(headingDeg: number, isLookingAway: boolean): number {
  return isLookingAway ? (headingDeg + 180) % 360 : headingDeg;
}
