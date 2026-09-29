import { Box3, Vector3 } from "three";
import { DEPTH_BAND_COUNT } from "../scene/schema";

export interface TankSize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface DepthRange {
  /** z closest to the glass (larger value). */
  readonly near: number;
  /** z furthest from the glass (smaller value). */
  readonly far: number;
}

/**
 * Tank coordinates: x in [-width/2, width/2], y from floor (0) to surface
 * (height), z from the glass (0) back to -depth. The camera looks down -z.
 */
export function bandDepthRange(tank: TankSize, bands: readonly [number, number]): DepthRange {
  const bandDepth = tank.depth / DEPTH_BAND_COUNT;
  // `0 - x` avoids -0, which would surprise equality checks and snapshots.
  return { near: 0 - bands[0] * bandDepth, far: 0 - (bands[1] + 1) * bandDepth };
}

export interface Habitat {
  readonly bands: readonly [number, number];
  readonly heightRange: readonly [number, number];
}

/** The region of the tank a species lives in. */
export function habitatBox(tank: TankSize, habitat: Habitat): Box3 {
  const { near, far } = bandDepthRange(tank, habitat.bands);
  const halfWidth = tank.width / 2;
  return new Box3(
    new Vector3(-halfWidth, habitat.heightRange[0] * tank.height, far),
    new Vector3(halfWidth, habitat.heightRange[1] * tank.height, near),
  );
}
