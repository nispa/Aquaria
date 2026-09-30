import type { Vector3 } from "three";

/**
 * Eye movement: a fish glances the way it is about to turn, in quick jumps
 * (saccades) rather than smooth tracking. Gaze runs from -1 (right) to 1 (left).
 */

/**
 * Which way a fish is about to turn: the sideways share of its steering force,
 * seen from above. 1 = hard left (towards -z when heading +x), -1 = hard right.
 * The force comes before the body turns, so the eyes lead the turn.
 */
export function turnIntent(velocity: Vector3, force: Vector3): number {
  const sideways = velocity.z * force.x - velocity.x * force.z;
  const scale = Math.hypot(velocity.x, velocity.z) * Math.hypot(force.x, force.z);
  if (scale === 0) return 0;
  return Math.min(Math.max(sideways / scale, -1), 1);
}

/** The eye holds still until the target is more than `threshold` away, then jumps to it. */
export function nextGaze(current: number, target: number, threshold: number): number {
  return Math.abs(target - current) > threshold ? target : current;
}
