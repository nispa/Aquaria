import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { beamOffset, beamRadius, torchStrength } from "./torch";

const origin = new Vector3(0, 1, 0);
const intoTank = new Vector3(0, 0, -1);

describe("the torch's beam", () => {
  it("measures how far along the beam a fish is, and how far off it", () => {
    const off = new Vector3();

    const along = beamOffset(new Vector3(0.3, 1, -2), origin, intoTank, off);

    expect(along).toBeCloseTo(2);
    expect(off.toArray()).toEqual([0.3, 0, 0]);
  });

  it("does not reach behind the glass", () => {
    expect(beamOffset(new Vector3(0, 1, 1), origin, intoTank, new Vector3())).toBe(-1);
  });

  it("widens with distance", () => {
    expect(beamRadius(3)).toBeGreaterThan(beamRadius(1));
  });
});

describe("torchStrength", () => {
  it("is full at night", () => {
    expect(torchStrength(0)).toBe(1);
  });

  it("is weaker, but still felt, by day", () => {
    const day = torchStrength(1);

    expect(day).toBeGreaterThan(0);
    expect(day).toBeLessThan(0.5);
  });
});
