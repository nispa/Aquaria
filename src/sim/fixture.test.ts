import { describe, expect, it } from "vitest";
import { spotPositions } from "./fixture";

const tank = { width: 2.4, height: 1.1, depth: 1 };

describe("spotPositions", () => {
  it("places the requested number of spots", () => {
    expect(spotPositions(tank, 6)).toHaveLength(6);
  });

  it("spaces the spots evenly across the tank, symmetric around the middle", () => {
    const xs = spotPositions(tank, 4).map((spot) => spot.x);

    expect(xs[0]).toBeCloseTo(-(xs[3] ?? 0));
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeCloseTo((xs[2] ?? 0) - (xs[1] ?? 0));
  });

  it("keeps every spot over the tank, above the water", () => {
    const outside = spotPositions(tank, 8).filter(
      (spot) =>
        Math.abs(spot.x) > tank.width / 2 ||
        spot.z > 0 ||
        spot.z < -tank.depth ||
        spot.y <= tank.height,
    );

    expect(outside).toEqual([]);
  });
});
