import { cellIndex, type BlockGrid } from "./blocks";

/**
 * Editing rock built from blocks (scene/blocks): which block a ray through
 * the view meets, and painting blocks in or out with a round brush. Pure,
 * so the scene editor's tools are tested without a browser.
 */

export interface BlockCell {
  readonly column: number;
  readonly layer: number;
  readonly row: number;
}

export interface BlockPick {
  /** The solid block the ray met; none when it reached the floor. */
  readonly hit?: BlockCell;
  /** The empty cell where a new block goes: on the face met, or on the floor. */
  readonly place?: BlockCell;
  /** Where the ray met the block's face or the floor, tank coordinates (m). */
  readonly point: Point;
  /** Whether that face looks up (a block's top, or the floor): things stand on it. */
  readonly up: boolean;
}

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface TankSize {
  readonly width: number;
  readonly depth: number;
}

/** Nudges the entry point into the grid, so the first cell is the right one. */
const ENTRY_NUDGE = 1e-9;

/**
 * The first block a ray meets in the grid (Amanatides and Woo's traversal),
 * blocks above `topLayer` counting as empty: slicing shows and edits the
 * layers below. Undefined when the ray misses the grid.
 */
export function pickBlock(
  tank: TankSize,
  grid: BlockGrid,
  cells: Uint8Array,
  origin: Point,
  direction: Point,
  topLayer = grid.layers - 1,
): BlockPick | undefined {
  const { size, columns, rows } = grid;
  const layers = Math.min(topLayer + 1, grid.layers);
  type Triple = [number, number, number];
  // In blocks, from the grid's corner at the floor, the left and back walls.
  const start: Triple = [
    (origin.x + tank.width / 2) / size,
    origin.y / size,
    (origin.z + tank.depth) / size,
  ];
  const way: Triple = [direction.x, direction.y, direction.z];
  const bounds: Triple = [columns, layers, rows];

  // Where the ray enters the grid's box (slab method).
  let enter = 0;
  let leave = Infinity;
  /** The axis of the face the ray crossed last, or -1 when it starts inside. */
  let crossed = -1;
  for (const axis of [0, 1, 2] as const) {
    if (way[axis] === 0) {
      if (start[axis] < 0 || start[axis] > bounds[axis]) return undefined;
      continue;
    }
    const near = (0 - start[axis]) / way[axis];
    const far = (bounds[axis] - start[axis]) / way[axis];
    if (Math.min(near, far) > enter) crossed = axis;
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
  }
  if (enter > leave) return undefined;

  const [startX, startY, startZ] = start;
  const [wayX, wayY, wayZ] = way;
  const entry = (from: number, step: number, limit: number): number =>
    Math.min(Math.max(Math.floor(from + step * (enter + ENTRY_NUDGE)), 0), limit - 1);
  const cell: Triple = [
    entry(startX, wayX, columns),
    entry(startY, wayY, layers),
    entry(startZ, wayZ, rows),
  ];
  const stepOf: Triple = [Math.sign(wayX), Math.sign(wayY), Math.sign(wayZ)];
  const across = (value: number): number => (value === 0 ? Infinity : Math.abs(1 / value));
  const delta: Triple = [across(wayX), across(wayY), across(wayZ)];
  /** The ray's distance to the next boundary of its cell along one axis. */
  const boundary = (index: number, from: number, value: number): number =>
    value === 0 ? Infinity : ((value > 0 ? index + 1 : index) - from) / value;
  const next: Triple = [
    boundary(cell[0], startX, wayX),
    boundary(cell[1], startY, wayY),
    boundary(cell[2], startZ, wayZ),
  ];

  /** The point of the ray at parameter t (in blocks along `way`), m. */
  const pointAt = (t: number): Point => ({
    x: origin.x + direction.x * t * size,
    y: origin.y + direction.y * t * size,
    z: origin.z + direction.z * t * size,
  });
  /** Whether the face crossed along `axis` looks up: the ray came down through it. */
  const upward = (axis: number): boolean => axis === 1 && stepOf[1] < 0;

  let previous: BlockCell | undefined;
  let reached = enter;
  for (;;) {
    const here: BlockCell = { column: cell[0], layer: cell[1], row: cell[2] };
    if (cells[cellIndex(grid, here.column, here.layer, here.row)] === 1) {
      const met = { point: pointAt(reached), up: upward(crossed) };
      return previous === undefined
        ? { hit: here, ...met }
        : { hit: here, place: previous, ...met };
    }
    // Step across the nearest cell boundary.
    const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
    reached = next[axis];
    crossed = axis;
    cell[axis] += stepOf[axis];
    next[axis] += delta[axis];
    previous = here;
    if (cell[axis] < 0 || cell[axis] >= bounds[axis]) {
      // Out through the floor: the last cell, on the floor, takes a block.
      return axis === 1 && cell[axis] < 0
        ? { place: here, point: pointAt(reached), up: true }
        : undefined;
    }
  }
}

/**
 * Fills (`solid` 1) or empties (0) the blocks within `radius` blocks of
 * `center`, up to `topLayer`. True when any block changed.
 */
export function paintBlocks(
  grid: BlockGrid,
  cells: Uint8Array,
  center: BlockCell,
  radius: number,
  solid: 0 | 1,
  topLayer = grid.layers - 1,
): boolean {
  const reach = Math.floor(radius);
  const top = Math.min(topLayer, grid.layers - 1);
  let changed = false;
  for (
    let layer = Math.max(center.layer - reach, 0);
    layer <= Math.min(center.layer + reach, top);
    layer += 1
  ) {
    for (
      let row = Math.max(center.row - reach, 0);
      row <= Math.min(center.row + reach, grid.rows - 1);
      row += 1
    ) {
      for (
        let column = Math.max(center.column - reach, 0);
        column <= Math.min(center.column + reach, grid.columns - 1);
        column += 1
      ) {
        const away = Math.hypot(column - center.column, layer - center.layer, row - center.row);
        if (away > radius) continue;
        const index = cellIndex(grid, column, layer, row);
        if (cells[index] === solid) continue;
        cells[index] = solid;
        changed = true;
      }
    }
  }
  return changed;
}
