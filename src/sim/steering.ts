import { Vector3, type Box3 } from "three";
import type { ObstacleField } from "./obstacles";

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

/** Below this, a direction counts as zero length. */
const NEGLIGIBLE = 1e-9;

/**
 * Turns a fish towards the heading `yaw` (radians seen from above: 0 is +x,
 * π/2 is +z) with a force of unit strength at most. The force is across the
 * velocity, so it turns the fish without speeding it up; speed is the
 * caller's to set. A heading behind the fish turns it at full strength. A
 * fish that is not moving is pulled straight along the heading.
 */
export function addHeading(velocity: Vector3, yaw: number, out: Vector3): Vector3 {
  const wantedX = Math.cos(yaw);
  const wantedZ = Math.sin(yaw);
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < NEGLIGIBLE) {
    out.x += wantedX;
    out.z += wantedZ;
    return out;
  }
  const forwardX = velocity.x / speed;
  const forwardZ = velocity.z / speed;
  const along = wantedX * forwardX + wantedZ * forwardZ;
  let acrossX = wantedX - along * forwardX;
  let acrossZ = wantedZ - along * forwardZ;
  if (along < 0) {
    const across = Math.hypot(acrossX, acrossZ);
    if (across < NEGLIGIBLE) {
      // Exactly behind: either way round will do.
      acrossX = -forwardZ;
      acrossZ = forwardX;
    } else {
      acrossX /= across;
      acrossZ /= across;
    }
  }
  out.x += acrossX;
  out.z += acrossZ;
  return out;
}

const surfaceNormal = new Vector3();
const lookout = new Vector3();

/**
 * Keeps a fish clear of the solid scenery. It looks `lookAhead` m along its
 * course: an obstacle there within `clearance` turns it aside, across its
 * velocity (towards the open side, or over a head-on obstacle), so it swerves
 * without slowing. An obstacle already within `clearance` of the fish pushes
 * it straight away. Both grow linearly the closer the surface. Allocation-free.
 */
export function addObstacleAvoidance(
  position: Vector3,
  velocity: Vector3,
  field: ObstacleField,
  lookAhead: number,
  clearance: number,
  out: Vector3,
): Vector3 {
  const near = field.distance(position, surfaceNormal, clearance);
  if (near < clearance) out.addScaledVector(surfaceNormal, (clearance - near) / clearance);
  const speed = velocity.length();
  if (speed < NEGLIGIBLE || lookAhead <= 0) return out;
  lookout.copy(position).addScaledVector(velocity, lookAhead / speed);
  const ahead = field.distance(lookout, surfaceNormal, clearance);
  if (ahead >= clearance) return out;
  // The surface normal less its part along the course: which way is open.
  const along = surfaceNormal.dot(velocity) / speed;
  surfaceNormal.addScaledVector(velocity, -along / speed);
  const across = surfaceNormal.length();
  if (across < NEGLIGIBLE) surfaceNormal.set(-velocity.z, 0, velocity.x).normalize();
  else surfaceNormal.divideScalar(across);
  return out.addScaledVector(surfaceNormal, Math.min((clearance - ahead) / clearance, 1));
}
