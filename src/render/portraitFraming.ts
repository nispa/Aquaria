type Triple = readonly [number, number, number];

/** An axis-aligned box, e.g. the bounds of a fish body. */
export interface Box {
  readonly min: Triple;
  readonly max: Triple;
}

export interface PortraitFraming {
  readonly position: Triple;
  readonly target: Triple;
}

/** Camera elevation over the fish, relative to the distance in front of it. */
const ELEVATION = 0.3;
/** Empty space around the body, as a share of its size. */
const MARGIN = 1.18;
const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Where a perspective camera stands to show a whole fish in a card: in front
 * of the body and a little above it, just far enough for the body's width and
 * height to fit the field of view, with a small margin.
 */
export function portraitFraming(box: Box, aspect: number, fovDegrees: number): PortraitFraming {
  const target: Triple = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const halfWidth = ((box.max[0] - box.min[0]) / 2) * MARGIN;
  const halfHeight = ((box.max[1] - box.min[1]) / 2) * MARGIN;
  const halfDepth = (box.max[2] - box.min[2]) / 2;
  const tanVertical = Math.tan((fovDegrees / 2) * DEGREES_TO_RADIANS);
  // The near face of the box is the one that must fit.
  const distance =
    Math.max(halfWidth / (tanVertical * aspect), halfHeight / tanVertical) + halfDepth;
  const length = Math.hypot(ELEVATION, 1);
  return {
    position: [
      target[0],
      target[1] + (distance * ELEVATION) / length,
      target[2] + distance / length,
    ],
    target,
  };
}
