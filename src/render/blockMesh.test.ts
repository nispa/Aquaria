import { describe, expect, it } from "vitest";
import { blockGrid, cellCount, cellIndex, type BlockGrid } from "../scene/blocks";
import { blockMesh, type BlockMesh } from "./blockMesh";

const tank = { width: 1, height: 0.5, depth: 1 };
const grid = blockGrid(tank, 0.1);
const smooth = { smoothing: 4, roughness: 0, seed: 1 };

/** Cells with the blocks of a box (inclusive block ranges) solid. */
function boxCells(
  box: BlockGrid,
  columns: readonly [number, number],
  layers: readonly [number, number],
  rows: readonly [number, number],
): Uint8Array {
  const cells = new Uint8Array(cellCount(box));
  for (let layer = layers[0]; layer <= layers[1]; layer += 1) {
    for (let row = rows[0]; row <= rows[1]; row += 1) {
      for (let column = columns[0]; column <= columns[1]; column += 1) {
        cells[cellIndex(box, column, layer, row)] = 1;
      }
    }
  }
  return cells;
}

const slab = boxCells(grid, [2, 7], [0, 1], [2, 7]);

function ys(mesh: BlockMesh): number[] {
  return Array.from(mesh.positions).filter((_, index) => index % 3 === 1);
}

function signedVolume(mesh: BlockMesh): number {
  const { positions, indices } = mesh;
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]].map(
      (vertex) => (vertex ?? 0) * 3,
    ) as [number, number, number];
    const [ax, ay, az] = [positions[a] ?? 0, positions[a + 1] ?? 0, positions[a + 2] ?? 0];
    const [bx, by, bz] = [positions[b] ?? 0, positions[b + 1] ?? 0, positions[b + 2] ?? 0];
    const [cx, cy, cz] = [positions[c] ?? 0, positions[c + 1] ?? 0, positions[c + 2] ?? 0];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

function edgeUses(mesh: BlockMesh): number[] {
  const uses = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const from = mesh.indices[index + corner] ?? 0;
      const to = mesh.indices[index + ((corner + 1) % 3)] ?? 0;
      const key = `${String(Math.min(from, to))}-${String(Math.max(from, to))}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return [...uses.values()];
}

describe("blockMesh", () => {
  it("is empty without solid blocks", () => {
    const mesh = blockMesh(tank, grid, new Uint8Array(cellCount(grid)), smooth);

    expect(mesh.indices.length).toBe(0);
  });

  it("closes the rock: every edge joins exactly two triangles", () => {
    const mesh = blockMesh(tank, grid, slab, smooth);

    expect(new Set(edgeUses(mesh))).toEqual(new Set([2]));
  });

  it("turns its faces outward", () => {
    const mesh = blockMesh(tank, grid, slab, smooth);

    expect(signedVolume(mesh)).toBeGreaterThan(0);
  });

  it("keeps a flat top flat, at the top of the blocks", () => {
    const mesh = blockMesh(tank, grid, slab, smooth);

    expect(Math.max(...ys(mesh))).toBeCloseTo(0.2, 2);
  });

  it("runs on under the sand instead of closing at the floor", () => {
    const mesh = blockMesh(tank, grid, slab, smooth);

    expect(Math.min(...ys(mesh))).toBeLessThan(0);
  });

  it("lies within the blocks it was built from", () => {
    const mesh = blockMesh(tank, grid, slab, smooth);
    const xs = Array.from(mesh.positions).filter((_, index) => index % 3 === 0);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.3 - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.3 + 1e-6);
  });

  it("roughens the surface by at most the roughness", () => {
    const plain = blockMesh(tank, grid, slab, smooth);
    const rough = blockMesh(tank, grid, slab, { ...smooth, roughness: 0.02 });
    const shifts = Array.from(rough.positions).map((value, index) =>
      Math.abs(value - (plain.positions[index] ?? 0)),
    );

    expect(Math.max(...shifts)).toBeGreaterThan(0);
    expect(Math.max(...shifts)).toBeLessThanOrEqual(0.02 + 1e-6);
  });

  it("builds the same rock from the same seed", () => {
    const first = blockMesh(tank, grid, slab, { ...smooth, roughness: 0.02 });
    const second = blockMesh(tank, grid, slab, { ...smooth, roughness: 0.02 });

    expect(second.positions).toEqual(first.positions);
  });

  it("keeps a cave open: blocks around a hollow make two surfaces", () => {
    const shell = boxCells(grid, [2, 7], [0, 4], [2, 7]);
    shell.set(
      boxCells(grid, [4, 5], [1, 3], [4, 5]).map((cell, index) =>
        cell === 1 ? 0 : (shell[index] ?? 0),
      ),
    );

    const mesh = blockMesh(tank, grid, shell, smooth);

    // The hollow's inner surface faces inward, taking volume off the outer one.
    const solid = blockMesh(tank, grid, boxCells(grid, [2, 7], [0, 4], [2, 7]), smooth);
    expect(signedVolume(mesh)).toBeLessThan(signedVolume(solid));
  });
});
