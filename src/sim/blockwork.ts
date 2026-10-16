import type { Vector3 } from "three";
import { squaredDistances } from "../core/distanceTransform";
import type { Rng } from "../core/rng";
import { blockGrid, cellCount, cellIndex, decodeRuns, type BlockGrid } from "../scene/blocks";
import type { BlocksSpec } from "../scene/schema";
import type { ObstacleField } from "./obstacles";
import type { TankSize } from "./tank";

/**
 * Rockwork built from blocks (scene/blocks), as the simulation sees it:
 * which blocks are solid, where their tops are for plants and objects to
 * stand on, and how far any point is from the rock, for fish to swim around
 * it and into its caves. The rock the viewer sees is the blocks smoothed, so
 * its surface runs through the faces of the blocks: that is what the
 * distance measures.
 */
export interface Blockwork {
  readonly grid: BlockGrid;
  /** One entry per block (scene/blocks order): 1 solid, 0 empty. */
  readonly cells: Uint8Array;
  /** Whether the block at a point is solid; outside the grid nothing is. */
  solidAt(point: Vector3): boolean;
  /** Height of the top of the highest block over (x, z), m; 0 when there is none. */
  topAt(x: number, z: number): number;
  /** A random spot (x, z) on the top of a column of blocks, or undefined when there are no blocks. */
  randomTop(rng: Rng): readonly [number, number] | undefined;
  /** The distance to the rock's surface, as an obstacle (sim/obstacles). */
  readonly field: ObstacleField;
}

/** Step for estimating the surface normal, as a share of a block. */
const NORMAL_STEP = 0.5;

export function createBlockwork(tank: TankSize, spec: BlocksSpec): Blockwork {
  const grid = blockGrid(tank, spec.size);
  const { size, columns, layers, rows } = grid;
  const cells = decodeRuns(spec.runs, cellCount(grid));
  const minX = -tank.width / 2;
  const minZ = -tank.depth;

  const columnOf = (x: number): number => Math.floor((x - minX) / size);
  const rowOf = (z: number): number => Math.floor((z - minZ) / size);
  const inside = (column: number, layer: number, row: number): boolean =>
    column >= 0 && column < columns && layer >= 0 && layer < layers && row >= 0 && row < rows;

  // Tops: the height of the highest block in each column (x, z), 0 when empty.
  const tops = new Float32Array(columns * rows);
  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (cells[cellIndex(grid, column, layer, row)] === 1) {
          tops[row * columns + column] = (layer + 1) * size;
        }
      }
    }
  }
  const builtUp: number[] = [];
  tops.forEach((top, index) => {
    if (top > 0) builtUp.push(index);
  });

  // Signed distance at the middle of every block, m: the surface runs
  // through the faces between solid and empty blocks.
  const order: [number, number, number] = [columns, rows, layers];
  const toSolid = squaredDistances(cells, order);
  const empty = cells.map((cell) => (cell === 0 ? 1 : 0));
  const toEmpty = squaredDistances(empty, order);
  const signed = new Float32Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const solid = cells[index] === 1;
    const cellsAway = Math.sqrt((solid ? toEmpty[index] : toSolid[index]) ?? Infinity);
    const distance = (cellsAway - 0.5) * size;
    signed[index] = solid ? -distance : distance;
  }

  const at = (column: number, layer: number, row: number): number =>
    signed[cellIndex(grid, column, layer, row)] ?? Infinity;

  const maxX = minX + columns * size;
  const maxY = layers * size;
  const maxZ = minZ + rows * size;
  /** How far a point lies outside the grid, m; 0 inside. */
  const outside = (x: number, y: number, z: number): number =>
    Math.hypot(
      Math.max(minX - x, 0, x - maxX),
      Math.max(-y, 0, y - maxY),
      Math.max(minZ - z, 0, z - maxZ),
    );

  /**
   * The signed distance at a point, trilinear between the middles of the
   * blocks; outside the grid, from its edge plus the way to it.
   */
  const sample = (x: number, y: number, z: number): number => {
    // In blocks, from the middle of the first one, kept inside the grid.
    const u = Math.min(Math.max((x - minX) / size - 0.5, 0), columns - 1);
    const v = Math.min(Math.max(y / size - 0.5, 0), layers - 1);
    const w = Math.min(Math.max((z - minZ) / size - 0.5, 0), rows - 1);
    const c0 = Math.floor(u);
    const l0 = Math.floor(v);
    const r0 = Math.floor(w);
    const c1 = Math.min(c0 + 1, columns - 1);
    const l1 = Math.min(l0 + 1, layers - 1);
    const r1 = Math.min(r0 + 1, rows - 1);
    const fu = u - c0;
    const fv = v - l0;
    const fw = w - r0;
    const lower =
      (at(c0, l0, r0) * (1 - fu) + at(c1, l0, r0) * fu) * (1 - fw) +
      (at(c0, l0, r1) * (1 - fu) + at(c1, l0, r1) * fu) * fw;
    const upper =
      (at(c0, l1, r0) * (1 - fu) + at(c1, l1, r0) * fu) * (1 - fw) +
      (at(c0, l1, r1) * (1 - fu) + at(c1, l1, r1) * fu) * fw;
    return lower * (1 - fv) + upper * fv + outside(x, y, z);
  };

  const step = size * NORMAL_STEP;
  const noBlocks = builtUp.length === 0;
  const field: ObstacleField = {
    distance(point, normal, within) {
      if (noBlocks) return Infinity;
      const distance = sample(point.x, point.y, point.z);
      if (distance >= within) return Infinity;
      const { x, y, z } = point;
      normal
        .set(
          sample(x + step, y, z) - sample(x - step, y, z),
          sample(x, y + step, z) - sample(x, y - step, z),
          sample(x, y, z + step) - sample(x, y, z - step),
        )
        .normalize();
      // Flat between equal neighbours (deep inside): the way out is up.
      if (normal.lengthSq() === 0) normal.set(0, 1, 0);
      return distance;
    },
  };

  return {
    grid,
    cells,
    solidAt(point) {
      const column = columnOf(point.x);
      const layer = Math.floor(point.y / size);
      const row = rowOf(point.z);
      return inside(column, layer, row) && cells[cellIndex(grid, column, layer, row)] === 1;
    },
    topAt(x, z) {
      const column = columnOf(x);
      const row = rowOf(z);
      if (!inside(column, 0, row)) return 0;
      return tops[row * columns + column] ?? 0;
    },
    randomTop(rng) {
      if (noBlocks) return undefined;
      const index = builtUp[rng.int(0, builtUp.length - 1)] ?? 0;
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [minX + (column + rng.next()) * size, minZ + (row + rng.next()) * size];
    },
    field,
  };
}
