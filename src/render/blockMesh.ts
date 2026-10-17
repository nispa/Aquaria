import { hashToUnit } from "../core/rng";
import type { BlockGrid } from "../scene/blocks";

/**
 * Smooth rock from blocks (scene/blocks): a surface net over the cells, one
 * vertex per corner of the grid where solid and empty blocks meet, relaxed
 * toward its neighbours and roughened with noise. Pure, so the renderer only
 * wraps the arrays in a geometry. The rock runs on under the sand instead of
 * closing at the floor, so its foot never shows a seam.
 */

export interface BlockMesh {
  /** x, y, z per vertex, tank coordinates (m). */
  readonly positions: Float32Array;
  /** Three vertices per triangle, counterclockwise seen from outside. */
  readonly indices: Uint32Array;
}

export interface BlockMeshOptions {
  /** Relaxation passes: 0 keeps the blocks' bevelled look. */
  readonly smoothing: number;
  /** Largest shift of the surface by noise, m. */
  readonly roughness: number;
  readonly seed: number;
}

/** How far a vertex moves toward its neighbours' middle in one pass. */
const RELAXATION = 0.5;
/** Spacing of the noise lattice, m: lumps about a fist wide. */
const NOISE_SPACING = 0.06;
/** A second, finer octave on top, as a share of the first. */
const DETAIL_WEIGHT = 0.35;
const DETAIL_SCALE = 2.7;
const HASH_X = 73856093;
const HASH_Y = 19349663;
const HASH_Z = 83492791;

/** Value noise in [-1, 1], smooth between lattice points. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fade = (t: number): number => t * t * (3 - 2 * t);
  const u = fade(x - x0);
  const v = fade(y - y0);
  const w = fade(z - z0);
  const corner = (dx: number, dy: number, dz: number): number =>
    hashToUnit(
      Math.imul(x0 + dx, HASH_X) ^ Math.imul(y0 + dy, HASH_Y) ^ Math.imul(z0 + dz, HASH_Z) ^ seed,
    );
  const along = (dy: number, dz: number): number =>
    corner(0, dy, dz) * (1 - u) + corner(1, dy, dz) * u;
  const lower = along(0, 0) * (1 - w) + along(0, 1) * w;
  const upper = along(1, 0) * (1 - w) + along(1, 1) * w;
  return (lower * (1 - v) + upper * v) * 2 - 1;
}

function roughNoise(x: number, y: number, z: number, seed: number): number {
  const coarse = valueNoise(x / NOISE_SPACING, y / NOISE_SPACING, z / NOISE_SPACING, seed);
  const fine = valueNoise(
    (x * DETAIL_SCALE) / NOISE_SPACING,
    (y * DETAIL_SCALE) / NOISE_SPACING,
    (z * DETAIL_SCALE) / NOISE_SPACING,
    seed + 1,
  );
  return (coarse + fine * DETAIL_WEIGHT) / (1 + DETAIL_WEIGHT);
}

/** The 12 edges of a grid cube, as pairs of corner numbers (bit 0 x, 1 y, 2 z). */
const CUBE_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * The surface of the solid blocks of `grid` over `tank`: the grid starts at
 * the floor, the left wall (x = -width / 2) and the back wall (z = -depth).
 */
export function blockMesh(
  tank: { readonly width: number; readonly depth: number },
  grid: BlockGrid,
  cells: Uint8Array,
  options: BlockMeshOptions,
): BlockMesh {
  const { size, columns, layers, rows } = grid;
  const minX = -tank.width / 2;
  const minZ = -tank.depth;
  // Corners are the middles of the blocks, padded with a ring of empty ones
  // and, under the floor, one layer copying the first and one empty below.
  const cornersX = columns + 2;
  const cornersY = layers + 3;
  const cornersZ = rows + 2;
  const solid = new Uint8Array(cornersX * cornersY * cornersZ);
  const cornerIndex = (i: number, j: number, k: number): number =>
    (j * cornersZ + k) * cornersX + i;
  for (let j = 1; j < cornersY; j += 1) {
    const layer = Math.max(j - 2, 0);
    if (layer >= layers) continue;
    for (let k = 1; k <= rows; k += 1) {
      for (let i = 1; i <= columns; i += 1) {
        solid[cornerIndex(i, j, k)] = cells[(layer * rows + k - 1) * columns + i - 1] ?? 0;
      }
    }
  }
  const solidAt = (i: number, j: number, k: number): number => solid[cornerIndex(i, j, k)] ?? 0;
  const cornerX = (i: number): number => minX + (i - 0.5) * size;
  const cornerY = (j: number): number => (j - 1.5) * size;
  const cornerZ = (k: number): number => minZ + (k - 0.5) * size;

  // One vertex per cube of corners the surface crosses, at the middle of the
  // edges it crosses.
  const cubesX = cornersX - 1;
  const cubesZ = cornersZ - 1;
  const cubeIndex = (i: number, j: number, k: number): number => (j * cubesZ + k) * cubesX + i;
  const vertexOf = new Int32Array(cubesX * (cornersY - 1) * cubesZ).fill(-1);
  const positions: number[] = [];
  const cubes: number[] = [];
  for (let j = 0; j < cornersY - 1; j += 1) {
    for (let k = 0; k < cubesZ; k += 1) {
      for (let i = 0; i < cubesX; i += 1) {
        let mask = 0;
        for (let corner = 0; corner < 8; corner += 1) {
          if (solidAt(i + (corner & 1), j + ((corner >> 1) & 1), k + ((corner >> 2) & 1)) === 1) {
            mask |= 1 << corner;
          }
        }
        if (mask === 0 || mask === 255) continue;
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        let crossings = 0;
        for (const [from, to] of CUBE_EDGES) {
          if (((mask >> from) & 1) === ((mask >> to) & 1)) continue;
          sumX += ((from & 1) + (to & 1)) / 2;
          sumY += (((from >> 1) & 1) + ((to >> 1) & 1)) / 2;
          sumZ += (((from >> 2) & 1) + ((to >> 2) & 1)) / 2;
          crossings += 1;
        }
        vertexOf[cubeIndex(i, j, k)] = cubes.length / 3;
        cubes.push(i, j, k);
        positions.push(
          cornerX(i + sumX / crossings),
          cornerY(j + sumY / crossings),
          cornerZ(k + sumZ / crossings),
        );
      }
    }
  }

  // A quad across every edge between a solid and an empty corner, facing the
  // empty one.
  const indices: number[] = [];
  const neighbours: Set<number>[] = Array.from({ length: cubes.length / 3 }, () => new Set());
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    const ring = flip ? [a, d, c, b] : [a, b, c, d];
    const corners = ring.map((cube) => vertexOf[cube] ?? 0);
    const [p = 0, q = 0, r = 0, s = 0] = corners;
    indices.push(p, q, r, p, r, s);
    corners.forEach((vertex, index) => {
      neighbours[vertex]?.add(corners[(index + 1) % 4] ?? vertex);
      neighbours[vertex]?.add(corners[(index + 3) % 4] ?? vertex);
    });
  };
  // The padding is empty along the walls and empty under the floor, so an
  // edge that changes is never on the outer ring across it.
  for (let j = 0; j < cornersY - 1; j += 1) {
    for (let k = 0; k < cornersZ - 1; k += 1) {
      for (let i = 0; i < cornersX - 1; i += 1) {
        const here = solidAt(i, j, k);
        if (here !== solidAt(i + 1, j, k)) {
          quad(
            cubeIndex(i, j - 1, k - 1),
            cubeIndex(i, j, k - 1),
            cubeIndex(i, j, k),
            cubeIndex(i, j - 1, k),
            here === 0,
          );
        }
        if (here !== solidAt(i, j + 1, k)) {
          quad(
            cubeIndex(i - 1, j, k - 1),
            cubeIndex(i - 1, j, k),
            cubeIndex(i, j, k),
            cubeIndex(i, j, k - 1),
            here === 0,
          );
        }
        if (here !== solidAt(i, j, k + 1)) {
          quad(
            cubeIndex(i - 1, j - 1, k),
            cubeIndex(i, j - 1, k),
            cubeIndex(i, j, k),
            cubeIndex(i - 1, j, k),
            here === 0,
          );
        }
      }
    }
  }

  relax(positions, neighbours, cubes, options.smoothing, { cornerX, cornerY, cornerZ });
  if (options.roughness > 0) roughen(positions, indices, options);

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

interface CornerPlace {
  readonly cornerX: (i: number) => number;
  readonly cornerY: (j: number) => number;
  readonly cornerZ: (k: number) => number;
}

/**
 * Moves every vertex toward the middle of its neighbours, kept inside its
 * cube of corners so the surface never folds over itself.
 */
function relax(
  positions: number[],
  neighbours: readonly Set<number>[],
  cubes: readonly number[],
  passes: number,
  place: CornerPlace,
): void {
  const next = positions.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    neighbours.forEach((around, vertex) => {
      if (around.size === 0) return;
      const at = vertex * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        let sum = 0;
        for (const other of around) sum += positions[other * 3 + axis] ?? 0;
        const value = positions[at + axis] ?? 0;
        const moved = value + (sum / around.size - value) * RELAXATION;
        const corner = cubes[at + axis] ?? 0;
        const toPlace = axis === 0 ? place.cornerX : axis === 1 ? place.cornerY : place.cornerZ;
        next[at + axis] = Math.min(Math.max(moved, toPlace(corner)), toPlace(corner + 1));
      }
    });
    for (let index = 0; index < positions.length; index += 1) positions[index] = next[index] ?? 0;
  }
}

/** Shifts every vertex along its normal by noise, at most the roughness. */
function roughen(positions: number[], indices: readonly number[], options: BlockMeshOptions): void {
  const normals = new Float64Array(positions.length);
  const read = (vertex: number, axis: number): number => positions[vertex * 3 + axis] ?? 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] ?? 0;
    const b = indices[index + 1] ?? 0;
    const c = indices[index + 2] ?? 0;
    const abx = read(b, 0) - read(a, 0);
    const aby = read(b, 1) - read(a, 1);
    const abz = read(b, 2) - read(a, 2);
    const acx = read(c, 0) - read(a, 0);
    const acy = read(c, 1) - read(a, 1);
    const acz = read(c, 2) - read(a, 2);
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] = (normals[vertex * 3] ?? 0) + nx;
      normals[vertex * 3 + 1] = (normals[vertex * 3 + 1] ?? 0) + ny;
      normals[vertex * 3 + 2] = (normals[vertex * 3 + 2] ?? 0) + nz;
    }
  }
  for (let at = 0; at < positions.length; at += 3) {
    const nx = normals[at] ?? 0;
    const ny = normals[at + 1] ?? 0;
    const nz = normals[at + 2] ?? 0;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) continue;
    const x = positions[at] ?? 0;
    const y = positions[at + 1] ?? 0;
    const z = positions[at + 2] ?? 0;
    const shift = roughNoise(x, y, z, options.seed) * options.roughness;
    positions[at] = x + (nx / length) * shift;
    positions[at + 1] = y + (ny / length) * shift;
    positions[at + 2] = z + (nz / length) * shift;
  }
}
