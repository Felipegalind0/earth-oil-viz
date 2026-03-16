import { describe, it, expect } from "vitest";
import {
  classifyTwoPointGestureIntent,
  computeSurfaceRelativePitchDeg,
  computeTwoPointGestureMetrics,
  shortestAngleDeltaDeg,
  compensateInvertedHeading,
  normalizeAngleDeltaRad,
} from "./mathUtils";

// ─── shortestAngleDeltaDeg ──────────────────────────────────────────
describe("shortestAngleDeltaDeg", () => {
  it("returns 0 for identical angles", () => {
    expect(shortestAngleDeltaDeg(45, 45)).toBe(0);
  });

  it("returns positive delta for clockwise motion", () => {
    expect(shortestAngleDeltaDeg(10, 20)).toBe(10);
  });

  it("returns negative delta for counter-clockwise motion", () => {
    expect(shortestAngleDeltaDeg(20, 10)).toBe(-10);
  });

  it("wraps across 0°/360° going clockwise (350 → 10)", () => {
    expect(shortestAngleDeltaDeg(350, 10)).toBe(20);
  });

  it("wraps across 0°/360° going counter-clockwise (10 → 350)", () => {
    expect(shortestAngleDeltaDeg(10, 350)).toBe(-20);
  });

  it("handles exact 180° gap (ambiguous, returns -180)", () => {
    expect(shortestAngleDeltaDeg(0, 180)).toBe(-180);
  });

  it("handles near-180° gap correctly (picks short way)", () => {
    expect(shortestAngleDeltaDeg(0, 179)).toBe(179);
    expect(shortestAngleDeltaDeg(0, 181)).toBe(-179);
  });

  it("works with angles > 360", () => {
    expect(shortestAngleDeltaDeg(720, 740)).toBe(20);
  });
});

// ─── normalizeAngleDeltaRad ────────────────────────────────────────
describe("normalizeAngleDeltaRad", () => {
  it("returns 0 for identical angles", () => {
    expect(normalizeAngleDeltaRad(1.5, 1.5)).toBe(0);
  });

  it("wraps clockwise across the -pi/pi seam", () => {
    expect(normalizeAngleDeltaRad((350 * Math.PI) / 180, (10 * Math.PI) / 180)).toBeCloseTo((20 * Math.PI) / 180);
  });

  it("wraps counter-clockwise across the -pi/pi seam", () => {
    expect(normalizeAngleDeltaRad((10 * Math.PI) / 180, (350 * Math.PI) / 180)).toBeCloseTo((-20 * Math.PI) / 180);
  });

  it("returns -pi for the ambiguous half-turn", () => {
    expect(normalizeAngleDeltaRad(0, Math.PI)).toBe(-Math.PI);
  });
});

// ─── computeTwoPointGestureMetrics ────────────────────────────────
describe("computeTwoPointGestureMetrics", () => {
  it("computes angle, distance, and centroid", () => {
    const metrics = computeTwoPointGestureMetrics({ x: 10, y: 20 }, { x: 22, y: 36 });

    expect(metrics.angleRad).toBeCloseTo(Math.atan2(16, 12));
    expect(metrics.distancePx).toBeCloseTo(20);
    expect(metrics.centroidX).toBe(16);
    expect(metrics.centroidY).toBe(28);
  });
});

// ─── classifyTwoPointGestureIntent ────────────────────────────────
describe("classifyTwoPointGestureIntent", () => {
  it("recognizes swipe intent when centroid translation dominates", () => {
    expect(classifyTwoPointGestureIntent(15, 1.01)).toBe("swipe");
  });

  it("recognizes pinch intent when scale dominates", () => {
    expect(classifyTwoPointGestureIntent(0, 1.14)).toBe("pinch");
  });

  it("returns null while intent is still ambiguous", () => {
    expect(classifyTwoPointGestureIntent(1, 1.02)).toBeNull();
  });
});

// ─── computeSurfaceRelativePitchDeg ───────────────────────────────
describe("computeSurfaceRelativePitchDeg", () => {
  it("returns 90 when looking straight down at the surface", () => {
    expect(computeSurfaceRelativePitchDeg(-1)).toBeCloseTo(90);
  });

  it("returns 0 at the horizon", () => {
    expect(computeSurfaceRelativePitchDeg(0)).toBeCloseTo(0);
  });

  it("returns negative values when looking away from the globe", () => {
    expect(computeSurfaceRelativePitchDeg(1)).toBeCloseTo(-90);
  });

  it("clamps minor floating point overshoot", () => {
    expect(computeSurfaceRelativePitchDeg(-1.2)).toBeCloseTo(90);
    expect(computeSurfaceRelativePitchDeg(1.2)).toBeCloseTo(-90);
  });
});

// ─── compensateInvertedHeading ──────────────────────────────────────
describe("compensateInvertedHeading", () => {
  it("returns heading unchanged when not looking away", () => {
    expect(compensateInvertedHeading(45, false)).toBe(45);
    expect(compensateInvertedHeading(0, false)).toBe(0);
    expect(compensateInvertedHeading(359, false)).toBe(359);
  });

  it("adds 180° when looking away", () => {
    expect(compensateInvertedHeading(0, true)).toBe(180);
    expect(compensateInvertedHeading(90, true)).toBe(270);
  });

  it("wraps back to [0, 360) when looking away", () => {
    expect(compensateInvertedHeading(200, true)).toBe(20);
    expect(compensateInvertedHeading(270, true)).toBe(90);
  });

  it("handles exact 180° input", () => {
    expect(compensateInvertedHeading(180, true)).toBe(0);
  });
});

