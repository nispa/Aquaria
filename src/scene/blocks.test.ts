import { describe, expect, it } from "vitest";
import { blockGrid, cellIndex, decodeRuns, encodeRuns, runsTotal } from "./blocks";

const tank = { width: 2, height: 1, depth: 1.5 };

describe("blockGrid", () => {
  it("covers the tank with cubes of the given size", () => {
    expect(blockGrid(tank, 0.5)).toEqual({ size: 0.5, columns: 4, layers: 2, rows: 3 });
  });

  it("rounds a part cube up, so the grid reaches every wall", () => {
    expect(blockGrid({ width: 1.1, height: 1, depth: 1 }, 0.5).columns).toBe(3);
  });

  it("does not add a cube for a size that only seems not to divide the tank", () => {
    expect(blockGrid({ width: 0.3, height: 0.3, depth: 0.3 }, 0.1).columns).toBe(3);
  });
});

describe("cellIndex", () => {
  it("counts across first, then from the back to the glass, then up", () => {
    const grid = blockGrid(tank, 0.5);

    expect(cellIndex(grid, 1, 0, 0)).toBe(1);
    expect(cellIndex(grid, 0, 0, 1)).toBe(4);
    expect(cellIndex(grid, 0, 1, 0)).toBe(12);
  });
});

describe("runs", () => {
  it("decodes alternating runs, starting with empty cells", () => {
    const cells = decodeRuns([2, 3, 1], 6);

    expect([...cells]).toEqual([0, 0, 1, 1, 1, 0]);
  });

  it("encodes cells back into the same runs", () => {
    expect(encodeRuns(Uint8Array.from([0, 0, 1, 1, 1, 0]))).toEqual([2, 3, 1]);
  });

  it("starts with a zero run when the first cell is solid", () => {
    expect(encodeRuns(Uint8Array.from([1, 1, 0]))).toEqual([0, 2, 1]);
  });

  it("encodes an empty grid as one run", () => {
    expect(encodeRuns(new Uint8Array(4))).toEqual([4]);
  });

  it("survives a round trip", () => {
    const cells = Uint8Array.from([1, 0, 0, 1, 1, 1, 0, 1]);

    expect([...decodeRuns(encodeRuns(cells), cells.length)]).toEqual([...cells]);
  });

  it("adds up the cells the runs cover", () => {
    expect(runsTotal([2, 3, 1])).toBe(6);
  });
});
