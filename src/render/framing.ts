import type { TankSize } from "../sim/tank";

export interface Framing {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/** Keeps the glass edges just outside the view, like a picture frame. */
const OVERSCAN = 0.97;
/** Look slightly down into the tank so the sand is visible at the bottom. */
const TARGET_HEIGHT_RATIO = 0.44;

/**
 * Places the camera so the front glass of the tank fills the whole screen,
 * whatever the aspect ratio: the screen becomes a window into the water.
 */
export function cameraFraming(tank: TankSize, aspect: number, verticalFovDegrees: number): Framing {
  const tanHalf = Math.tan(((verticalFovDegrees / 2) * Math.PI) / 180);
  const fitHeight = tank.height / 2 / tanHalf;
  const fitWidth = tank.width / 2 / (tanHalf * aspect);
  const distance = Math.min(fitHeight, fitWidth) * OVERSCAN;
  return {
    position: [0, tank.height / 2, distance],
    target: [0, tank.height * TARGET_HEIGHT_RATIO, -tank.depth / 2],
  };
}
