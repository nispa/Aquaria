/**
 * Rockwork built from blocks: a grid of cubes over the whole tank, each
 * solid or empty, the way the scene editor lets the viewer build caves and
 * overhangs. Stored run-length encoded, so a mostly empty tank stays small.
 * The renderer smooths the blocks into rock; fish swim around them.
 */

/** Smallest and largest block edge, m. */
export const MIN_BLOCK_SIZE = 0.05;
export const MAX_BLOCK_SIZE = 0.5;

/** Below this share of a block, a remainder is rounding, not a part block. */
const ROUNDING = 1e-6;

export interface BlockGrid {
  /** Edge of one block, m. */
  readonly size: number;
  /** Blocks across the tank (x). */
  readonly columns: number;
  /** Blocks up from the floor (y). */
  readonly layers: number;
  /** Blocks from the back wall to the glass (z). */
  readonly rows: number;
}

interface TankSize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

const countAlong = (length: number, size: number): number =>
  Math.max(Math.ceil(length / size - ROUNDING), 1);

/**
 * The grid of blocks of edge `size` over a tank: it starts at the floor, the
 * left wall (x = -width / 2) and the back wall (z = -depth), and reaches every
 * wall, a part block counting as a whole one.
 */
export function blockGrid(tank: TankSize, size: number): BlockGrid {
  return {
    size,
    columns: countAlong(tank.width, size),
    layers: countAlong(tank.height, size),
    rows: countAlong(tank.depth, size),
  };
}

/** How many blocks the grid holds. */
export function cellCount(grid: BlockGrid): number {
  return grid.columns * grid.layers * grid.rows;
}

/**
 * Where a block lies in the cells: across first, then from the back wall to
 * the glass, then layer by layer from the floor up.
 */
export function cellIndex(grid: BlockGrid, column: number, layer: number, row: number): number {
  return (layer * grid.rows + row) * grid.columns + column;
}

/**
 * Cells from runs: lengths of alternating empty and solid stretches, the
 * first one empty (0 when the first cell is solid). Runs beyond `count`
 * cells are ignored; cells the runs do not reach stay empty.
 */
export function decodeRuns(runs: readonly number[], count: number): Uint8Array {
  const cells = new Uint8Array(count);
  let at = 0;
  runs.forEach((run, index) => {
    const end = Math.min(at + run, count);
    if (index % 2 === 1) cells.fill(1, at, end);
    at = end;
  });
  return cells;
}

/** Runs from cells; see `decodeRuns`. */
export function encodeRuns(cells: Uint8Array): number[] {
  const runs: number[] = [];
  let solid = 0;
  let run = 0;
  for (const cell of cells) {
    const value = cell === 0 ? 0 : 1;
    if (value === solid) {
      run += 1;
      continue;
    }
    runs.push(run);
    solid = value;
    run = 1;
  }
  runs.push(run);
  return runs;
}

/** How many cells runs cover. */
export function runsTotal(runs: readonly number[]): number {
  return runs.reduce((sum, run) => sum + run, 0);
}
