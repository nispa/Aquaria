import { Vector3 } from "three";
import { cellIndex, type BlockGrid } from "../scene/blocks";
import type { BlockMesh } from "./blockMesh";

/**
 * Pure parts of the scene editor's view: the blocks as cubes, and the
 * isometric framing of the tank.
 */

interface TankSize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface BlockyMesh extends BlockMesh {
  /** x, y, z per vertex: each face is flat. */
  readonly normals: Float32Array;
}

/** The six faces of a cube: outward normal, and its four corners counterclockwise from outside. */
const FACES: readonly {
  readonly normal: readonly [number, number, number];
  readonly corners: readonly (readonly [number, number, number])[];
}[] = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    normal: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];

/**
 * The solid blocks up to `topLayer` as cubes, each face drawn only where
 * the block beside it is empty (or sliced away).
 */
export function blockyMesh(
  tank: TankSize,
  grid: BlockGrid,
  cells: Uint8Array,
  topLayer = grid.layers - 1,
): BlockyMesh {
  const { size, columns, rows } = grid;
  const layers = Math.min(topLayer + 1, grid.layers);
  const minX = -tank.width / 2;
  const minZ = -tank.depth;
  const solidAt = (column: number, layer: number, row: number): boolean =>
    column >= 0 &&
    column < columns &&
    layer >= 0 &&
    layer < layers &&
    row >= 0 &&
    row < rows &&
    cells[cellIndex(grid, column, layer, row)] === 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (!solidAt(column, layer, row)) continue;
        for (const { normal, corners } of FACES) {
          const [nx, ny, nz] = normal;
          if (solidAt(column + nx, layer + ny, row + nz)) continue;
          const first = positions.length / 3;
          for (const [cx, cy, cz] of corners) {
            positions.push(
              minX + (column + cx) * size,
              (layer + cy) * size,
              minZ + (row + cz) * size,
            );
            normals.push(nx, ny, nz);
          }
          indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

export interface IsometricView {
  /** Where the camera looks: the middle of the tank, m. */
  readonly target: Vector3;
  /** Unit direction the camera looks along. */
  readonly forward: Vector3;
  /** Half the height of the view, m, for an orthographic camera. */
  readonly halfHeight: number;
}

/** Isometric elevation: the camera looks down along a cube's diagonal. */
const ELEVATION = Math.atan(1 / Math.SQRT2);
/** The first view looks from the front left, so the glass side faces the viewer. */
const FIRST_AZIMUTH = Math.PI / 4;
/** Room around the tank, as a share of the view. */
const MARGIN = 1.08;
const QUARTER_TURN = Math.PI / 2;

/**
 * An isometric view of the whole tank, turned round it by `quarter` quarter
 * turns, for an orthographic camera of the given aspect (width / height).
 */
export function isometricView(tank: TankSize, quarter: number, aspect: number): IsometricView {
  const azimuth = FIRST_AZIMUTH + quarter * QUARTER_TURN;
  const forward = new Vector3(
    Math.sin(azimuth) * Math.cos(ELEVATION),
    -Math.sin(ELEVATION),
    -Math.cos(azimuth) * Math.cos(ELEVATION),
  );
  const target = new Vector3(0, tank.height / 2, -tank.depth / 2);
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, forward);
  let across = 0;
  let upward = 0;
  const corner = new Vector3();
  for (let index = 0; index < 8; index += 1) {
    corner
      .set(
        index & 1 ? tank.width / 2 : -tank.width / 2,
        index & 2 ? tank.height : 0,
        index & 4 ? 0 : -tank.depth,
      )
      .sub(target);
    across = Math.max(across, Math.abs(corner.dot(right)));
    upward = Math.max(upward, Math.abs(corner.dot(up)));
  }
  return { target, forward, halfHeight: Math.max(upward, across / aspect) * MARGIN };
}
