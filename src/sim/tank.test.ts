import { describe, expect, it } from "vitest";
import { bandDepthRange, habitatBox } from "./tank";

const tank = { width: 10, height: 4, depth: 5 };

describe("bandDepthRange", () => {
  it("maps band 0 to the slice right behind the glass", () => {
    expect(bandDepthRange(tank, [0, 0])).toEqual({ near: 0, far: -1 });
  });

  it("maps band 4 to the far back of the tank", () => {
    expect(bandDepthRange(tank, [4, 4])).toEqual({ near: -4, far: -5 });
  });

  it("spans several bands", () => {
    expect(bandDepthRange(tank, [1, 3])).toEqual({ near: -1, far: -4 });
  });
});

describe("habitatBox", () => {
  it("limits a species to its bands, height range and the tank width", () => {
    const box = habitatBox(tank, { bands: [1, 3], heightRange: [0.25, 0.75] });

    expect(box.min.toArray()).toEqual([-5, 1, -4]);
    expect(box.max.toArray()).toEqual([5, 3, -1]);
  });
});
