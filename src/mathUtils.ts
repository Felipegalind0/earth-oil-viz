/**
 * Pure math helpers extracted from main.ts for testability.
 */

/** Shortest signed delta between two angles in degrees (result in [-180, 180)). */
export function shortestAngleDeltaDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Compensate heading by 180° when camera looks away from the globe. */
export function compensateInvertedHeading(headingDeg: number, isLookingAway: boolean): number {
  return isLookingAway ? (headingDeg + 180) % 360 : headingDeg;
}

/**
 * Compute 2-axis compass tilt (X, Y) that follows the current heading,
 * so the tilt direction is visually correct regardless of which compass
 * heading the camera is facing.
 *
 * @param pitchDeg  Cesium camera pitch in degrees (−90 = top-down, 0 = horizon)
 * @param headingDeg  Accumulated display heading in degrees (unwrapped)
 * @returns [tiltX, tiltY] in degrees for CSS rotateX/rotateY
 */
export function compassTilt(pitchDeg: number, headingDeg: number): [number, number] {
  const pitchFromNadir = clamp(pitchDeg + 90, 0, 90);
  const tiltMagnitude = (pitchFromNadir / 90) * 60; // 0–60° range
  const headingRad = headingDeg * (Math.PI / 180);
  const tiltX = tiltMagnitude * Math.cos(headingRad);
  const tiltY = -tiltMagnitude * Math.sin(headingRad);
  return [tiltX, tiltY];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
