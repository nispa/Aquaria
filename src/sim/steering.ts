import type { Box3, Vector3 } from "three";

/**
 * Classic boids steering terms. Each function adds its force into `out`
 * (so terms can be accumulated without allocating) and returns `out`.
 * A neighbour that is the very same Vector3 instance as `position` is skipped,
 * so callers can pass a whole group including the fish itself.
 */

export interface Mover {
  readonly position: Vector3;
  readonly velocity: Vector3;
}

/** Pushes away from neighbours closer than `radius`, stronger when closer. */
export function addSeparation(
  position: Vector3,
  neighbours: readonly Vector3[],
  radius: number,
  out: Vector3,
): Vector3 {
  for (const other of neighbours) {
    if (other === position) continue;
    const distance = position.distanceTo(other);
    if (distance === 0 || distance >= radius) continue;
    const strength = (radius - distance) / (radius * distance);
    out.x += (position.x - other.x) * strength;
    out.y += (position.y - other.y) * strength;
    out.z += (position.z - other.z) * strength;
  }
  return out;
}

/** Pulls towards the centre of neighbours within `radius`. */
export function addCohesion(
  position: Vector3,
  neighbours: readonly Vector3[],
  radius: number,
  out: Vector3,
): Vector3 {
  let count = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const other of neighbours) {
    if (other === position || position.distanceTo(other) > radius) continue;
    x += other.x;
    y += other.y;
    z += other.z;
    count += 1;
  }
  if (count > 0) {
    out.x += x / count - position.x;
    out.y += y / count - position.y;
    out.z += z / count - position.z;
  }
  return out;
}

/** Steers towards the average velocity of neighbours within `radius`. */
export function addAlignment(
  position: Vector3,
  velocity: Vector3,
  neighbours: readonly Mover[],
  radius: number,
  out: Vector3,
): Vector3 {
  let count = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const other of neighbours) {
    if (other.position === position || position.distanceTo(other.position) > radius) continue;
    x += other.velocity.x;
    y += other.velocity.y;
    z += other.velocity.z;
    count += 1;
  }
  if (count > 0) {
    out.x += x / count - velocity.x;
    out.y += y / count - velocity.y;
    out.z += z / count - velocity.z;
  }
  return out;
}

export interface ContainmentOptions {
  /** Skip the x walls, for fish swimming in from or out to the sides. */
  readonly ignoreX?: boolean;
}

function axisPush(value: number, min: number, max: number, margin: number): number {
  let push = 0;
  if (value < min + margin) push += (min + margin - value) / margin;
  if (value > max - margin) push -= (value - (max - margin)) / margin;
  return push;
}

/** Soft walls: pushes inward within `margin` of the box, growing linearly beyond it. */
export function addContainment(
  position: Vector3,
  box: Box3,
  margin: number,
  out: Vector3,
  options: ContainmentOptions = {},
): Vector3 {
  if (options.ignoreX !== true) {
    out.x += axisPush(position.x, box.min.x, box.max.x, margin);
  }
  out.y += axisPush(position.y, box.min.y, box.max.y, margin);
  out.z += axisPush(position.z, box.min.z, box.max.z, margin);
  return out;
}

/** Height of the seabed (sand and rockwork) at (x, z), m. */
export type SeabedHeight = (x: number, z: number) => number;

/** Step for estimating the seabed slope, m. */
const SLOPE_STEP = 0.05;

/**
 * Keeps fish off the sand and rock: within `clearance` of the seabed, pushes
 * along the surface normal (up, and away from steep rock faces), growing
 * linearly the closer the fish gets.
 */
export function addSeabedClearance(
  position: Vector3,
  seabed: SeabedHeight,
  clearance: number,
  out: Vector3,
): Vector3 {
  const { x, y, z } = position;
  const gap = y - seabed(x, z);
  if (gap >= clearance) return out;
  const push = (clearance - gap) / clearance;
  const slopeX = (seabed(x + SLOPE_STEP, z) - seabed(x - SLOPE_STEP, z)) / (2 * SLOPE_STEP);
  const slopeZ = (seabed(x, z + SLOPE_STEP) - seabed(x, z - SLOPE_STEP)) / (2 * SLOPE_STEP);
  const length = Math.hypot(slopeX, 1, slopeZ);
  out.x += (-slopeX / length) * push;
  out.y += (1 / length) * push;
  out.z += (-slopeZ / length) * push;
  return out;
}
