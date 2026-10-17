import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { blockGrid, cellCount, cellIndex } from "../scene/blocks";
import { blockyMesh, isometricView } from "./editorFraming";

const tank = { width: 1.2, height: 0.5, depth: 0.45 };
const grid = blockGrid(tank, 0.05);

const solid = (...blocks: readonly [number, number, number][]): Uint8Array => {
  const cells = new Uint8Array(cellCount(grid));
  for (const [column, layer, row] of blocks) cells[cellIndex(grid, column, layer, row)] = 1;
  return cells;
};

describe("blockyMesh", () => {
  it("draws the six faces of a lone block", () => {
    const mesh = blockyMesh(tank, grid, solid([3, 0, 4]));

    expect(mesh.indices.length / 6).toBe(6);
  });

  it("leaves out the faces two blocks share", () => {
    const mesh = blockyMesh(tank, grid, solid([3, 0, 4], [4, 0, 4]));

    expect(mesh.indices.length / 6).toBe(10);
  });

  it("hides the layers above the slice", () => {
    const mesh = blockyMesh(tank, grid, solid([3, 0, 4], [3, 1, 4]), 0);

    expect(mesh.indices.length / 6).toBe(6);
  });

  it("puts a block where the grid says, from the back wall", () => {
    const mesh = blockyMesh(tank, grid, solid([0, 0, 0]));
    const zs = Array.from(mesh.positions).filter((_, index) => index % 3 === 2);

    expect([Math.min(...zs), Math.max(...zs)]).toEqual([
      expect.closeTo(-0.45, 6),
      expect.closeTo(-0.4, 6),
    ]);
  });
});

describe("isometricView", () => {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (corner) =>
      new Vector3(
        corner & 1 ? tank.width / 2 : -tank.width / 2,
        corner & 2 ? tank.height : 0,
        corner & 4 ? 0 : -tank.depth,
      ),
  );

  it("shows the whole tank", () => {
    const view = isometricView(tank, 0, 16 / 9);
    const right = new Vector3().crossVectors(view.forward, new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(right, view.forward);

    const outside = corners.filter((corner) => {
      const offset = corner.clone().sub(view.target);
      return (
        Math.abs(offset.dot(right)) > view.halfHeight * (16 / 9) ||
        Math.abs(offset.dot(up)) > view.halfHeight
      );
    });
    expect(outside).toEqual([]);
  });

  it("looks down from the front at first", () => {
    const view = isometricView(tank, 0, 1);

    expect([view.forward.y < 0, view.forward.z < 0]).toEqual([true, true]);
  });

  it("comes back round after four quarter turns", () => {
    const first = isometricView(tank, 0, 1);
    const fourth = isometricView(tank, 4, 1);

    expect(fourth.forward.distanceTo(first.forward)).toBeCloseTo(0, 9);
  });
});
