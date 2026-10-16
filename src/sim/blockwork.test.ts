import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { blockGrid, cellCount, cellIndex, encodeRuns } from "../scene/blocks";
import { createBlockwork } from "./blockwork";

/** A 2 × 1 × 2 m tank in 0.25 m blocks: 8 columns, 4 layers, 8 rows. */
const tank = { width: 2, height: 1, depth: 2 };
const SIZE = 0.25;
const grid = blockGrid(tank, SIZE);

/** Blocks from a list of [column, layer, row]. */
function build(solid: readonly (readonly [number, number, number])[]) {
  const cells = new Uint8Array(cellCount(grid));
  for (const [column, layer, row] of solid) cells[cellIndex(grid, column, layer, row)] = 1;
  return createBlockwork(tank, { size: SIZE, runs: encodeRuns(cells), color: "#888888" });
}

/** The middle of block [column, layer, row], tank coordinates. */
const middleOf = (column: number, layer: number, row: number) =>
  new Vector3(-1 + (column + 0.5) * SIZE, (layer + 0.5) * SIZE, -2 + (row + 0.5) * SIZE);

describe("blockwork", () => {
  it("knows which blocks are solid", () => {
    const blocks = build([[2, 0, 3]]);

    expect(blocks.solidAt(middleOf(2, 0, 3))).toBe(true);
    expect(blocks.solidAt(middleOf(2, 1, 3))).toBe(false);
  });

  it("finds the top of the highest block under a spot", () => {
    const blocks = build([
      [2, 0, 3],
      [2, 1, 3],
    ]);
    const spot = middleOf(2, 0, 3);

    expect(blocks.topAt(spot.x, spot.z)).toBeCloseTo(0.5);
    expect(blocks.topAt(0.9, -0.1)).toBe(0);
  });

  it("picks random spots on the tops of the blocks", () => {
    const blocks = build([
      [1, 0, 1],
      [6, 2, 6],
    ]);
    const rng = createRng(3);

    const spots = Array.from({ length: 20 }, () => blocks.randomTop(rng));

    expect(spots.every((spot) => spot !== undefined && blocks.topAt(spot[0], spot[1]) > 0)).toBe(
      true,
    );
  });

  it("has no tops to offer when it has no blocks", () => {
    expect(build([]).randomTop(createRng(1))).toBeUndefined();
  });
});

describe("blockwork as an obstacle", () => {
  const normal = new Vector3();

  it("measures how far above a block a point is, pointing up", () => {
    const blocks = build([[3, 0, 3]]);
    const above = middleOf(3, 0, 3).setY(SIZE + 0.1);

    expect(blocks.field.distance(above, normal, 1)).toBeCloseTo(0.1, 1);
    expect(normal.y).toBeGreaterThan(0.9);
  });

  it("is negative inside a block", () => {
    const blocks = build([[3, 0, 3]]);

    expect(blocks.field.distance(middleOf(3, 0, 3), normal, 1)).toBeLessThan(0);
  });

  it("leaves room in a cave", () => {
    // A hollow block with solid blocks on every side.
    const cave: [number, number, number][] = [
      [3, 1, 2],
      [3, 1, 4],
      [2, 1, 3],
      [4, 1, 3],
      [3, 0, 3],
      [3, 2, 3],
    ];

    expect(build(cave).field.distance(middleOf(3, 1, 3), normal, 1)).toBeGreaterThan(0);
  });

  it("counts the way to the grid for a point outside it, beside the tank", () => {
    const blocks = build([[0, 0, 3]]);
    const beside = middleOf(0, 0, 3).setX(-1 - 0.5);

    // 0.5 m from the block's face; the estimate stays within half a block of it.
    expect(blocks.field.distance(beside, normal, 2)).toBeGreaterThanOrEqual(0.5 - SIZE / 2);
  });

  it("ignores blocks farther than asked", () => {
    const blocks = build([[0, 0, 0]]);

    expect(blocks.field.distance(middleOf(7, 3, 7), normal, 0.2)).toBe(Infinity);
  });
});
