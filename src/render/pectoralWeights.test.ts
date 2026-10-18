import { describe, expect, it } from "vitest";
import type { PectoralFin } from "../scene/modelManifest";
import { pectoralWeights } from "./pectoralWeights";

const FIN: PectoralFin = {
  root: [
    [0.15, 0.06],
    [0.12, -0.08],
  ],
  side: 0.1,
  front: 0.17,
  back: -0.08,
  top: 0.13,
  bottom: -0.13,
  rest: 30,
  sweep: 35,
};

const weightOf = (x: number, y: number, z: number): number | undefined =>
  pectoralWeights([x, y, z], FIN)[0];

describe("pectoralWeights", () => {
  it("moves the whole fin, out beyond the side of the body", () => {
    expect(weightOf(0.05, 0, 0.16)).toBe(1);
  });

  it("finds the fin on the left side as on the right", () => {
    expect(weightOf(0.05, 0, -0.16)).toBe(1);
  });

  it("leaves the body inside the fin's box alone", () => {
    expect(weightOf(0.05, 0, 0.06)).toBe(0);
  });

  it("leaves other fins outside the box alone", () => {
    expect(weightOf(0.05, -0.2, 0.16)).toBe(0);
  });

  it("blends the fin into the body where it joins it", () => {
    const join = weightOf(0.12, 0, 0.095) ?? 0;

    expect(join).toBeGreaterThan(0);
    expect(join).toBeLessThan(1);
  });

  it("gives one weight per point", () => {
    expect(pectoralWeights([0, 0, 0, 0.05, 0, 0.16], FIN)).toHaveLength(2);
  });
});
