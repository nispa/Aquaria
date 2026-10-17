import { describe, expect, it } from "vitest";
import { blockGrid, cellCount, cellIndex } from "./blocks";
import { paintBlocks, pickBlock, supportBelow } from "./blockEditing";

/** A 1 m × 0.5 m × 1 m tank in 0.1 m blocks: 10 × 5 × 10. */
const tank = { width: 1, height: 0.5, depth: 1 };
const grid = blockGrid(tank, 0.1);
const empty = (): Uint8Array => new Uint8Array(cellCount(grid));
const down = { x: 0, y: -1, z: 0 };

/** The middle of block (column, row) seen from above, at a height of 2 m. */
const above = (column: number, row: number) => ({
  x: -0.5 + (column + 0.5) * 0.1,
  y: 2,
  z: -1 + (row + 0.5) * 0.1,
});

describe("pickBlock", () => {
  it("offers the floor when nothing is in the way", () => {
    const pick = pickBlock(tank, grid, empty(), above(3, 4), down);

    expect(pick).toMatchObject({ place: { column: 3, layer: 0, row: 4 } });
  });

  it("hits the block in the way and offers the cell on its face", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 0, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, above(3, 4), down);

    expect(pick).toMatchObject({
      hit: { column: 3, layer: 0, row: 4 },
      place: { column: 3, layer: 1, row: 4 },
    });
  });

  it("offers the cell beside a block hit on its side", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 0, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, { x: 2, y: 0.05, z: -0.55 }, { x: -1, y: 0, z: 0 });

    expect(pick?.place).toEqual({ column: 4, layer: 0, row: 4 });
  });

  it("ignores blocks above the slice, so lower layers can be edited", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 0, 4)] = 1;
    cells[cellIndex(grid, 3, 2, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, above(3, 4), down, 1);

    expect(pick?.hit).toEqual({ column: 3, layer: 0, row: 4 });
  });

  it("offers nothing past the top of the slice", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 1, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, above(3, 4), down, 1);

    expect([pick?.hit, pick?.place]).toEqual([{ column: 3, layer: 1, row: 4 }, undefined]);
  });

  it("tells where on the floor the ray landed, on a face looking up", () => {
    const pick = pickBlock(tank, grid, empty(), { x: 0.123, y: 2, z: -0.456 }, down);

    expect([pick?.point.x, pick?.point.y, pick?.point.z, pick?.up]).toEqual([
      expect.closeTo(0.123, 9),
      expect.closeTo(0, 9),
      expect.closeTo(-0.456, 9),
      true,
    ]);
  });

  it("tells where on a block's top the ray landed", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 1, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, above(3, 4), down);

    expect([pick?.point.y, pick?.up]).toEqual([expect.closeTo(0.2, 9), true]);
  });

  it("says when the face met is a side, not a top", () => {
    const cells = empty();
    cells[cellIndex(grid, 3, 0, 4)] = 1;

    const pick = pickBlock(tank, grid, cells, { x: 2, y: 0.05, z: -0.55 }, { x: -1, y: 0, z: 0 });

    expect([pick?.up, pick?.point.x]).toEqual([false, expect.closeTo(-0.1, 9)]);
  });

  it("finds nothing when the ray misses the tank", () => {
    expect(pickBlock(tank, grid, empty(), { x: 5, y: 2, z: 0 }, down)).toBeUndefined();
  });

  it("follows a slanted ray from far away", () => {
    const cells = empty();
    cells[cellIndex(grid, 5, 0, 5)] = 1;
    const target = { x: 0.05, y: 0.1, z: -0.45 };
    const from = { x: target.x + 3, y: target.y + 3, z: target.z + 3 };

    const pick = pickBlock(tank, grid, cells, from, { x: -1, y: -1, z: -1 });

    expect(pick?.hit).toEqual({ column: 5, layer: 0, row: 5 });
  });
});

describe("supportBelow", () => {
  const cells = empty();
  cells[cellIndex(grid, 3, 0, 4)] = 1;
  cells[cellIndex(grid, 3, 3, 4)] = 1;
  const middle = { x: -0.5 + 3.5 * 0.1, z: -1 + 4.5 * 0.1 };

  it("is the top of the highest block at or below a height", () => {
    expect(supportBelow(tank, grid, cells, middle.x, middle.z, 0.3)).toBeCloseTo(0.1);
  });

  it("is the top of the column from above it", () => {
    expect(supportBelow(tank, grid, cells, middle.x, middle.z, 1)).toBeCloseTo(0.4);
  });

  it("is the floor where there is no block", () => {
    expect(supportBelow(tank, grid, cells, 0.4, -0.1, 1)).toBe(0);
  });
});

describe("paintBlocks", () => {
  it("fills a single block with the smallest brush", () => {
    const cells = empty();

    paintBlocks(grid, cells, { column: 3, layer: 0, row: 4 }, 0, 1);

    expect(cells.reduce((sum, cell) => sum + cell, 0)).toBe(1);
  });

  it("fills a ball of blocks with a larger brush", () => {
    const cells = empty();

    paintBlocks(grid, cells, { column: 5, layer: 2, row: 5 }, 1, 1);

    expect(cells.reduce((sum, cell) => sum + cell, 0)).toBe(7);
  });

  it("empties blocks", () => {
    const cells = empty().fill(1);

    paintBlocks(grid, cells, { column: 5, layer: 2, row: 5 }, 1, 0);

    expect(cells.reduce((sum, cell) => sum + cell, 0)).toBe(cellCount(grid) - 7);
  });

  it("stays inside the grid at its edges", () => {
    const cells = empty();

    paintBlocks(grid, cells, { column: 0, layer: 0, row: 0 }, 1, 1);

    expect(cells.reduce((sum, cell) => sum + cell, 0)).toBe(4);
  });

  it("leaves the layers above the slice alone", () => {
    const cells = empty();

    paintBlocks(grid, cells, { column: 5, layer: 2, row: 5 }, 1, 1, 2);

    expect(cells[cellIndex(grid, 5, 3, 5)]).toBe(0);
  });

  it("says whether anything changed", () => {
    const cells = empty();
    paintBlocks(grid, cells, { column: 3, layer: 0, row: 4 }, 0, 1);

    expect(paintBlocks(grid, cells, { column: 3, layer: 0, row: 4 }, 0, 1)).toBe(false);
  });
});
