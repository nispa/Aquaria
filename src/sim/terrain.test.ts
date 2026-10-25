import { describe, expect, it } from "vitest";
import { floorHeight, floorOf, FLOOR_AMPLITUDE } from "./terrain";

describe("floorHeight", () => {
  it("stays within the dune amplitude", () => {
    const heights = Array.from({ length: 400 }, (_, index) =>
      floorHeight((index % 20) * 0.53 - 5, Math.floor(index / 20) * -0.31),
    );

    expect(Math.max(...heights.map(Math.abs))).toBeLessThanOrEqual(FLOOR_AMPLITUDE);
  });

  it("is not flat", () => {
    expect(floorHeight(0, 0)).not.toBe(floorHeight(1.7, -2.3));
  });

  it("is smooth between nearby points", () => {
    expect(Math.abs(floorHeight(1, -1) - floorHeight(1.01, -1))).toBeLessThan(0.01);
  });
});

describe("floorOf", () => {
  const large = { width: 2.4, height: 1.1, depth: 1 };
  const nano = { width: 0.4, height: 0.3, depth: 0.3 };

  it("is the usual sand in a large tank with no profile", () => {
    const floor = floorOf(large, {});

    expect(floor(0.7, -0.4)).toBeCloseTo(floorHeight(0.7, -0.4));
  });

  it("keeps the dunes of a small tank in proportion to its height", () => {
    const floor = floorOf(nano, {});
    const heights = Array.from({ length: 100 }, (_, index) =>
      floor((index % 10) * 0.04 - 0.2, Math.floor(index / 10) * -0.03),
    );

    expect(Math.max(...heights.map(Math.abs))).toBeLessThanOrEqual(
      (FLOOR_AMPLITUDE * nano.height) / large.height,
    );
  });

  it("lays a flat floor when the dunes are switched off", () => {
    const floor = floorOf(large, { dunes: 0 });

    expect(floor(0.7, 0)).toBe(0);
  });

  it("rises towards the back by its share of the tank height", () => {
    const floor = floorOf(large, { dunes: 0, rise: 0.2 });

    expect(floor(0, -large.depth)).toBeCloseTo(0.2 * large.height);
  });

  it("starts the rise at the front glass", () => {
    const floor = floorOf(large, { dunes: 0, rise: 0.2 });

    expect(floor(0, 0)).toBe(0);
  });

  it("stays at the back's height beyond the tank", () => {
    const floor = floorOf(large, { dunes: 0, rise: 0.2 });

    expect(floor(0, -3 * large.depth)).toBeCloseTo(0.2 * large.height);
  });
});
