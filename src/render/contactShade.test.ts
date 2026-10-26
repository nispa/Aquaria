import { describe, expect, it } from "vitest";
import { contactShade, propFootprints, rockFootprints, shadeAt } from "./contactShade";

const tank = { width: 1, height: 0.5, depth: 0.5 };
/** A rock 10 cm wide standing in the middle of the floor. */
const rock = { x: 0, z: -0.25, radius: 0.05 };

describe("contactShade", () => {
  it("leaves the sand lit far from anything standing on it", () => {
    const grid = contactShade(tank, [rock], 0.5);

    expect(shadeAt(grid, 0.45, -0.05)).toBeCloseTo(1);
  });

  it("darkens the sand most right at the foot of a rock", () => {
    const grid = contactShade(tank, [rock], 0.5);

    expect(shadeAt(grid, 0, -0.25)).toBeCloseTo(0.5, 1);
  });

  it("fades the shade away from the rock", () => {
    const grid = contactShade(tank, [rock], 0.5);
    const near = shadeAt(grid, 0.07, -0.25);
    const farther = shadeAt(grid, 0.1, -0.25);

    expect(near).toBeGreaterThan(0.5);
    expect(farther).toBeGreaterThan(near);
  });

  it("leaves the sand lit when the scene asks for no shade", () => {
    const grid = contactShade(tank, [rock], 0);

    expect(shadeAt(grid, 0, -0.25)).toBeCloseTo(1);
  });

  it("leaves the sand lit when nothing stands on it", () => {
    const grid = contactShade(tank, [], 0.5);

    expect(shadeAt(grid, 0, -0.25)).toBeCloseTo(1);
  });
});

describe("footprints", () => {
  it("finds the rock blocks that stand on the floor", () => {
    const blocks = {
      grid: { size: 0.25, columns: 4, layers: 2, rows: 2 },
      cells: new Uint8Array(16),
    };
    blocks.cells[1] = 1;

    expect(rockFootprints(blocks, tank)).toEqual([{ x: -0.125, z: -0.375, radius: 0.15 }]);
  });

  it("leaves out rock blocks that do not touch the floor", () => {
    const blocks = {
      grid: { size: 0.25, columns: 4, layers: 2, rows: 2 },
      cells: new Uint8Array(16),
    };
    blocks.cells[9] = 1;

    expect(rockFootprints(blocks, tank)).toEqual([]);
  });

  it("gives a coral on the sand a footprint the size of its base", () => {
    const coral = { x: 0.2, z: -0.1, size: 0.2 };

    const [footprint] = propFootprints([coral]);

    expect(footprint).toMatchObject({ x: 0.2, z: -0.1 });
    expect(footprint?.radius).toBeCloseTo(0.07);
  });

  it("gives no footprint to a pebble, too small to shade the sand round it", () => {
    const pebble = { x: 0.2, z: -0.1, size: 0.03 };

    expect(propFootprints([pebble])).toEqual([]);
  });

  it("gives no footprint on the sand to a coral standing on the rock", () => {
    const coral = { x: 0.2, z: -0.1, size: 0.2, elevation: 0.3 };

    expect(propFootprints([coral])).toEqual([]);
  });
});
