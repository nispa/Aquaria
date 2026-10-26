import { squaredDistances } from "../core/distanceTransform";

/**
 * Contact shadows on the sand: where a rock or a coral stands on the floor,
 * little light reaches the sand round its foot, so the sand darkens there and
 * brightens again a few centimetres away. Without it everything seems to
 * float. A grid over the tank's floor holds the share of light left on the
 * sand (1 lit, lower shaded); the floor's shader multiplies its colour by it.
 */

/** Something standing on the sand: a circle round (x, z), m. */
export interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ContactGrid {
  /** Left (x) and back (z) edges of the grid, m: it covers the tank's floor. */
  readonly minX: number;
  readonly minZ: number;
  /** Edge of one cell, m. */
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** Share of light left on the sand per cell, across first, from the back. */
  readonly values: Float32Array;
}

/** How far from a foot the shade reaches, m. */
export const CONTACT_REACH = 0.08;
/** Cells across the widest tank, at most; a small tank gets 5 mm cells. */
const MAX_CELLS = 512;
const MIN_CELL = 0.005;

interface TankSize {
  readonly width: number;
  readonly depth: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The shade on the sand of a tank round `footprints`: `strength` of the
 * light is gone right at a foot (0 none, 1 black), fading out over
 * CONTACT_REACH.
 */
export function contactShade(
  tank: TankSize,
  footprints: readonly Footprint[],
  strength: number,
): ContactGrid {
  const cell = Math.max(MIN_CELL, Math.max(tank.width, tank.depth) / MAX_CELLS);
  const columns = Math.ceil(tank.width / cell);
  const rows = Math.ceil(tank.depth / cell);
  const minX = -tank.width / 2;
  const minZ = -tank.depth;
  const values = new Float32Array(columns * rows).fill(1);
  if (strength <= 0 || footprints.length === 0) {
    return { minX, minZ, cell, columns, rows, values };
  }
  const marked = new Uint8Array(columns * rows);
  for (const { x, z, radius } of footprints) {
    const fromColumn = Math.max(Math.floor((x - radius - minX) / cell), 0);
    const toColumn = Math.min(Math.ceil((x + radius - minX) / cell), columns - 1);
    const fromRow = Math.max(Math.floor((z - radius - minZ) / cell), 0);
    const toRow = Math.min(Math.ceil((z + radius - minZ) / cell), rows - 1);
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const dx = minX + (column + 0.5) * cell - x;
        const dz = minZ + (row + 0.5) * cell - z;
        if (dx * dx + dz * dz <= radius * radius) marked[row * columns + column] = 1;
      }
    }
  }
  const distances = squaredDistances(marked, [columns, rows, 1]);
  for (let index = 0; index < values.length; index += 1) {
    const away = Math.sqrt(distances[index] ?? Infinity) * cell;
    values[index] = 1 - strength * (1 - smoothstep(0, CONTACT_REACH, away));
  }
  return { minX, minZ, cell, columns, rows, values };
}

/** The share of light left on the sand at (x, z); 1 outside the grid. */
export function shadeAt(grid: ContactGrid, x: number, z: number): number {
  const column = Math.floor((x - grid.minX) / grid.cell);
  const row = Math.floor((z - grid.minZ) / grid.cell);
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return 1;
  return grid.values[row * grid.columns + column] ?? 1;
}

/** A rock block's shade spreads a little past its own square, as share of its edge. */
const BLOCK_FOOT = 0.6;
/** The base of a coral on the sand, as a share of its size: its middle, not its reach. */
const PROP_FOOT = 0.35;
/** Pebbles and shells smaller than this, m, cast no shade: it would ring them. */
const MIN_SHADING_SIZE = 0.06;

interface Blocks {
  readonly grid: {
    readonly size: number;
    readonly columns: number;
    readonly layers: number;
    readonly rows: number;
  };
  readonly cells: Uint8Array;
}

/** The blocks of rock lying on the floor (the lowest layer), one footprint each. */
export function rockFootprints(blocks: Blocks, tank: TankSize): Footprint[] {
  const { size, columns, rows } = blocks.grid;
  const footprints: Footprint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (blocks.cells[row * columns + column] !== 1) continue;
      footprints.push({
        x: -tank.width / 2 + (column + 0.5) * size,
        z: -tank.depth + (row + 0.5) * size,
        radius: size * BLOCK_FOOT,
      });
    }
  }
  return footprints;
}

interface Standing {
  readonly x: number;
  readonly z: number;
  readonly size: number;
  /** Set when it stands on the rock, not on the sand. */
  readonly elevation?: number;
}

/** What stands on the sand, one footprint each; things on the rock, and pebbles, cast none there. */
export function propFootprints(props: readonly Standing[]): Footprint[] {
  return props
    .filter((prop) => prop.elevation === undefined && prop.size >= MIN_SHADING_SIZE)
    .map((prop) => ({ x: prop.x, z: prop.z, radius: prop.size * PROP_FOOT }));
}
