/**
 * How big a tank is, from a nano cube on a desk to the open sea. A scene is
 * written for one size; the viewer can see it at another (`resizeScene`).
 */
export const TANK_SIZES = ["nano", "small", "medium", "large", "ocean"] as const;
export type TankSize = (typeof TANK_SIZES)[number];

export interface TankMeasures {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** The measures of each size, m: x = width, y = height, z = depth away from the glass. */
export const TANK_SIZE_MEASURES: Readonly<Record<TankSize, TankMeasures>> = {
  nano: { width: 0.4, height: 0.3, depth: 0.3 },
  small: { width: 0.6, height: 0.4, depth: 0.4 },
  medium: { width: 1.2, height: 0.6, depth: 0.5 },
  large: { width: 2.4, height: 1.1, depth: 1 },
  ocean: { width: 6, height: 3.2, depth: 3.2 },
};
