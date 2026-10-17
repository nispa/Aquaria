import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { blockGrid, cellIndex } from "../scene/blocks";
import type { RockworkSpec } from "../scene/schema";
import { looseRocksEntries, ridgeCells } from "./ridgeBlocks";
import { createRockwork } from "./rockwork";
import { floorHeight } from "./terrain";

const tank = { width: 2, height: 1, depth: 1 };
const spec: RockworkSpec = {
  bands: [1, 3],
  height: [0.3, 0.5],
  coverage: 0.8,
  thickness: 0.4,
  rocks: 6,
  color: "#8a7d70",
};
const ridge = createRockwork(tank, spec, createRng(1), () => tank.width / 2);
const grid = blockGrid(tank, 0.05);

describe("ridgeCells", () => {
  const cells = ridgeCells(tank, grid, ridge);

  it("fills each column of the ridge up to its surface", () => {
    const [x, z] = ridge.crest(3)[1] ?? [0, -0.5];
    const column = Math.floor((x + 1) / 0.05);
    const row = Math.floor((z + 1) / 0.05);
    const middle = { x: -1 + (column + 0.5) * 0.05, z: -1 + (row + 0.5) * 0.05 };
    const top = floorHeight(middle.x, middle.z) + ridge.heightAt(middle.x, middle.z);

    const layers = Array.from(
      { length: grid.layers },
      (_, layer) => cells[cellIndex(grid, column, layer, row)],
    ).filter((cell) => cell === 1).length;
    expect(layers).toBe(Math.round(top / 0.05));
  });

  it("leaves the sand off the ridge empty", () => {
    const front = Math.floor(0.98 / 0.05);

    const solid = Array.from(
      { length: grid.columns },
      (_, column) => cells[cellIndex(grid, column, 0, front)],
    ).filter((cell) => cell === 1);
    expect(solid).toEqual([]);
  });
});

describe("looseRocksEntries", () => {
  it("keeps the ridge's loose rocks where they lay, as chosen spots", () => {
    const [entry] = looseRocksEntries(ridge, spec);
    const first = ridge.rocks[0];

    expect([entry?.kind, entry?.count, entry?.at?.[0]?.x]).toEqual(["rock", 6, first?.x]);
  });

  it("is in the ridge's color", () => {
    expect(looseRocksEntries(ridge, spec)[0]?.color).toBe("#8a7d70");
  });

  it("splits more rocks than an entry holds into several entries", () => {
    const many = createRockwork(tank, { ...spec, rocks: 120 }, createRng(1), () => 1);

    expect(looseRocksEntries(many, spec).map((entry) => entry.count)).toEqual([50, 50, 20]);
  });
});
