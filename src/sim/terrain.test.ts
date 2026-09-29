import { describe, expect, it } from "vitest";
import { floorHeight, FLOOR_AMPLITUDE } from "./terrain";

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
