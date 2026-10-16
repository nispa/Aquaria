import type { Vector3 } from "three";

/**
 * What a finger (or mouse) on the glass is drawing: circles or quick
 * scribbles. Tracked from the finger's path across the glass (x, y), smoothed
 * over a fraction of a second, so it works whatever the pointer's event rate.
 */

/** Smoothing time of the measures, s. */
const SMOOTHING_SECONDS = 0.3;
/** Moves shorter than this, m, are jitter: they neither turn nor count. */
const MIN_MOVE = 0.002;
/** Circles: fast enough (m/s) and turning steadily one way (rad/s). */
const CIRCLE_SPEED = 0.4;
const CIRCLE_TURN = 3;
/** Share of all the turning that must go one way for circles. */
const CIRCLE_STEADINESS = 0.6;
/** Scribbles: fast (m/s), turning a lot (rad/s), but not steadily one way. */
const SCRIBBLE_SPEED = 0.6;
const SCRIBBLE_TURN = 5;
const SCRIBBLE_STEADINESS = 0.35;
/**
 * A turn sharper than this between two moves, radians, is a reversal: it has
 * no way round (a hair of wobble decides its sign), so it adds to turning
 * but not to spin.
 */
const REVERSAL = 2.6;

export interface Gesture {
  /** Smoothed finger speed across the glass, m/s. */
  speed: number;
  /** Smoothed turning of its path, rad/s, positive counterclockwise. */
  spin: number;
  /** Smoothed turning regardless of the way, rad/s. */
  turning: number;
  /** Where the finger was last seen moving. */
  lastX: number;
  lastY: number;
  /** Heading of its last move, radians, or NaN before it has moved. */
  heading: number;
  /** Seconds since its last move. */
  sinceMove: number;
  /** Whether the finger is on the glass. */
  present: boolean;
}

export function createGesture(): Gesture {
  return {
    speed: 0,
    spin: 0,
    turning: 0,
    lastX: 0,
    lastY: 0,
    heading: Number.NaN,
    sinceMove: 0,
    present: false,
  };
}

function smooth(current: number, target: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-deltaSeconds / SMOOTHING_SECONDS));
}

/** Angle from `from` to `to`, folded into -π..π. */
function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Follows the finger for one step; `point` is undefined when nobody touches the glass. */
export function trackFinger(
  gesture: Gesture,
  point: Vector3 | undefined,
  deltaSeconds: number,
): void {
  if (point === undefined) {
    Object.assign(gesture, createGesture());
    return;
  }
  if (!gesture.present) {
    gesture.present = true;
    gesture.lastX = point.x;
    gesture.lastY = point.y;
  }
  gesture.sinceMove += deltaSeconds;
  const moveX = point.x - gesture.lastX;
  const moveY = point.y - gesture.lastY;
  const distance = Math.hypot(moveX, moveY);
  let speed = 0;
  let turn = 0;
  let spin = 0;
  if (distance >= MIN_MOVE) {
    const heading = Math.atan2(moveY, moveX);
    speed = distance / gesture.sinceMove;
    if (!Number.isNaN(gesture.heading)) {
      const angle = turnBetween(gesture.heading, heading);
      turn = Math.abs(angle) / gesture.sinceMove;
      if (Math.abs(angle) < REVERSAL) spin = angle / gesture.sinceMove;
    }
    gesture.heading = heading;
    gesture.lastX = point.x;
    gesture.lastY = point.y;
    gesture.sinceMove = 0;
  } else if (gesture.sinceMove < SMOOTHING_SECONDS) {
    // Between pointer events: keep the last measures rather than read a stop.
    return;
  }
  gesture.speed = smooth(gesture.speed, speed, deltaSeconds);
  gesture.spin = smooth(gesture.spin, spin, deltaSeconds);
  gesture.turning = smooth(gesture.turning, turn, deltaSeconds);
}

/** 1 for circles drawn counterclockwise, -1 clockwise, 0 for anything else. */
export function spinOf(gesture: Gesture): number {
  const steady = Math.abs(gesture.spin) >= gesture.turning * CIRCLE_STEADINESS;
  if (gesture.speed < CIRCLE_SPEED || Math.abs(gesture.spin) < CIRCLE_TURN || !steady) return 0;
  return Math.sign(gesture.spin);
}

/** Whether the finger is scribbling: quick strokes this way and that. */
export function isScribbling(gesture: Gesture): boolean {
  return (
    gesture.speed >= SCRIBBLE_SPEED &&
    gesture.turning >= SCRIBBLE_TURN &&
    Math.abs(gesture.spin) < gesture.turning * SCRIBBLE_STEADINESS
  );
}
