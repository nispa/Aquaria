import type { TankSize } from "./tank";

/**
 * LED spots of an aquarium light fixture: a row across the tank, just above
 * the water, over the middle of its depth.
 */

/** Share of the tank width the row of spots covers. */
const ROW_WIDTH = 0.85;
/** Depth of the row, as a share of the tank depth behind the glass. */
const ROW_DEPTH = 0.45;
/** Height of the fixture above the water surface, m. */
const ABOVE_WATER = 0.06;

export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function spotPositions(tank: TankSize, count: number): Spot[] {
  const span = tank.width * ROW_WIDTH;
  return Array.from({ length: count }, (_, index) => ({
    x: count === 1 ? 0 : -span / 2 + (span * index) / (count - 1),
    y: tank.height + ABOVE_WATER,
    z: -tank.depth * ROW_DEPTH,
  }));
}
