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

const DEGREES = Math.PI / 180;
/**
 * Fastest turn of a calm fish that cruises one body length per second, rad/s,
 * and how quickly it can get into or out of one, rad/s². Limits scale with a
 * species' agility (cruise speed in body lengths per second): small, quick
 * fish turn faster than large, stately ones.
 */
export const CALM_TURN_RATE = 150 * DEGREES;
export const CALM_TURN_ACCELERATION = 600 * DEGREES;
/** The same for a frightened fish: a C-start escape. */
export const ESCAPE_TURN_RATE = 600 * DEGREES;
export const ESCAPE_TURN_ACCELERATION = 4000 * DEGREES;
/** Whatever the species, turns stay within these, rad/s and rad/s². */
export const MIN_TURN_RATE = 40 * DEGREES;
export const MAX_TURN_RATE = 1000 * DEGREES;
const MIN_TURN_ACCELERATION = 150 * DEGREES;
const MAX_TURN_ACCELERATION = 8000 * DEGREES;

/** A fish's rotation about the vertical, kept from step to step. */
export interface Turning {
  /** Yaw rate, rad/s, positive from +x towards +z. */
  turnRate: number;
}

/** Fastest turn, rad/s, for an agility (body lengths per second) and fear (0..1). */
export function maxTurnRate(agility: number, fear: number): number {
  const rate = (CALM_TURN_RATE + (ESCAPE_TURN_RATE - CALM_TURN_RATE) * fear) * agility;
  return clamp(rate, MIN_TURN_RATE, MAX_TURN_RATE);
}

function maxTurnAcceleration(agility: number, fear: number): number {
  const acceleration =
    (CALM_TURN_ACCELERATION + (ESCAPE_TURN_ACCELERATION - CALM_TURN_ACCELERATION) * fear) * agility;
  return clamp(acceleration, MIN_TURN_ACCELERATION, MAX_TURN_ACCELERATION);
}

/**
 * Rotational inertia. Steering may ask for any heading at once; a body turns
 * at a limited rate, and gets into and out of a turn gradually, braking in
 * time to stop on the wanted heading. Rotates `next` (the velocity after
 * steering) from the heading of `previous` accordingly, keeping its speed and
 * climb. `agility` is the species' cruise speed in body lengths per second;
 * `fear` (0..1) raises the limits up to an escape.
 */
export function turnWithInertia(
  previous: Vector3,
  next: Vector3,
  turning: Turning,
  agility: number,
  fear: number,
  deltaSeconds: number,
): void {
  const across = Math.hypot(next.x, next.z);
  if (across === 0 || deltaSeconds === 0 || (previous.x === 0 && previous.z === 0)) return;
  const from = Math.atan2(previous.z, previous.x);
  const to = Math.atan2(next.z, next.x);
  const angle = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const maxRate = maxTurnRate(agility, fear);
  const maxAcceleration = maxTurnAcceleration(agility, fear);
  // The rate from which it can still brake to a stop on the wanted heading.
  const remaining = Math.abs(angle);
  const target =
    Math.sign(angle) *
    Math.min(maxRate, Math.sqrt(2 * maxAcceleration * remaining), remaining / deltaSeconds);
  const step = maxAcceleration * deltaSeconds;
  turning.turnRate = clamp(
    turning.turnRate + clamp(target - turning.turnRate, -step, step),
    -maxRate,
    maxRate,
  );
  const yaw = from + turning.turnRate * deltaSeconds;
  next.x = Math.cos(yaw) * across;
  next.z = Math.sin(yaw) * across;
}
