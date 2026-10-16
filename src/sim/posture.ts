import type { Vector3 } from "three";
import { clamp } from "../core/math";

/**
 * Body posture: how a fish's body bends into its turns and how hard its tail
 * beats. Renderers use these like the joints of a rig: `bend` curves the body
 * into an arc, `effort` scales the tail sweep.
 */

/** Tightest bend, as curvature times body length: a C-start escape. */
export const MAX_BEND = 2.5;
/** A swimming fish never stops its tail completely: it keeps station with small beats. */
export const MIN_EFFORT = 0.5;
/** Strongest tail sweep, relative to cruising, during an escape burst. */
export const MAX_EFFORT = 2.2;
/** How much acceleration adds to the effort: seconds of acceleration per cruise speed. */
const ACCELERATION_EFFORT_SECONDS = 0.3;

/**
 * How much a fish's body bends into its turn: the curvature of its path seen
 * from above (yaw rate over speed) times its body length, so the body follows
 * the arc it swims. Positive turning left (towards -z when heading +x), the
 * same sign as gaze. Clamped to ±MAX_BEND.
 */
export function turnBend(
  previous: Vector3,
  next: Vector3,
  deltaSeconds: number,
  length: number,
): number {
  const speed = (Math.hypot(previous.x, previous.z) + Math.hypot(next.x, next.z)) / 2;
  if (speed === 0 || deltaSeconds === 0) return 0;
  const cross = previous.z * next.x - previous.x * next.z;
  const dot = previous.x * next.x + previous.z * next.z;
  const yawRate = Math.atan2(cross, dot) / deltaSeconds;
  return clamp((yawRate / speed) * length, -MAX_BEND, MAX_BEND);
}

/**
 * Tail-beat amplitude relative to cruising: grows with speed and with
 * acceleration (a burst), shrinks while slowing to a hover. `thrust` is how
 * much the swimming style works the tail (0 gliding .. 1 swimming), so a
 * coasting fish can hold its tail still.
 */
export function tailEffort(
  previous: Vector3,
  next: Vector3,
  deltaSeconds: number,
  cruiseSpeed: number,
  thrust = 1,
): number {
  const speed = next.length();
  const acceleration = deltaSeconds === 0 ? 0 : (speed - previous.length()) / deltaSeconds;
  const effort = (speed + acceleration * ACCELERATION_EFFORT_SECONDS) / cruiseSpeed;
  return clamp(effort, MIN_EFFORT, MAX_EFFORT) * thrust;
}

/**
 * Exponential smoothing: covers 1 - 1/e of the gap to `target` every
 * `responseSeconds`, independent of the step size.
 */
export function easeToward(
  current: number,
  target: number,
  responseSeconds: number,
  deltaSeconds: number,
): number {
  if (responseSeconds <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-deltaSeconds / responseSeconds));
}
