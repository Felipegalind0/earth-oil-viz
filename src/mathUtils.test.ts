import { describe, it, expect } from "vitest";
import {
  shortestAngleDeltaDeg,
  compensateInvertedHeading,
  compassTilt,
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

// ─── compassTilt ────────────────────────────────────────────────────
describe("compassTilt", () => {
  const EPS = 0.01;

  it("returns [0, 0] at top-down view (pitch = -90°)", () => {
    const [tx, ty] = compassTilt(-90, 0);
    expect(tx).toBeCloseTo(0, 5);
    expect(ty).toBeCloseTo(0, 5);
  });

  it("tilts on X axis only when heading is 0° (facing north)", () => {
    const [tx, ty] = compassTilt(0, 0); // pitch = 0° = horizon
    expect(tx).toBeCloseTo(60, EPS); // max tilt
    expect(ty).toBeCloseTo(0, EPS);
  });

  it("tilts on -Y axis only when heading is 90° (facing east)", () => {
    const [tx, ty] = compassTilt(0, 90);
    expect(Math.abs(tx)).toBeLessThan(0.01);
    expect(ty).toBeCloseTo(-60, EPS);
  });

  it("tilts on -X axis when heading is 180° (facing south)", () => {
    const [tx, ty] = compassTilt(0, 180);
    expect(tx).toBeCloseTo(-60, EPS);
    expect(Math.abs(ty)).toBeLessThan(0.01);
  });

  it("tilts on +Y axis when heading is 270° (facing west)", () => {
    const [tx, ty] = compassTilt(0, 270);
    expect(Math.abs(tx)).toBeLessThan(0.01);
    expect(ty).toBeCloseTo(60, EPS);
  });

  it("scales tilt magnitude linearly with pitch", () => {
    const [txHalf] = compassTilt(-45, 0); // halfway between -90 and 0
    expect(txHalf).toBeCloseTo(30, EPS); // half of 60
  });

  it("clamps pitch above horizon (positive pitch)", () => {
    // pitch = 10° should still clamp to 90° from nadir → full 60° tilt
    const [tx] = compassTilt(10, 0);
    expect(tx).toBeCloseTo(60, EPS);
  });
});
