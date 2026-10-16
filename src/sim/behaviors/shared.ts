import { clamp } from "../../core/math";
import type { SwimContext, SwimState } from "./types";

/** Usual speed response, 1/s: a fish settles on a new speed within a second or so. */
export const CRUISE_RESPONSE = 1.5;
/** Random durations are drawn between these shares of their mean. */
const DURATION_SPREAD: readonly [number, number] = [0.5, 1.5];
/** How hard a fish off a lap steers back onto it, relative to following it. */
const LAP_RADIAL_GAIN = 1;
/** Below this distance from a lap's centre, m, the lap has no direction. */
const AT_CENTRE = 1e-6;

/** A duration drawn around `meanSeconds`. */
export function drawDuration(context: SwimContext, meanSeconds: number): number {
  return context.rng.range(meanSeconds * DURATION_SPREAD[0], meanSeconds * DURATION_SPREAD[1]);
}

/** A height anywhere in the fish's room. */
export function drawHeight(context: SwimContext): number {
  return context.rng.range(context.room.min.y, context.room.max.y);
}

/** Starts at the height the fish is at, and keeps it for about `meanSeconds`. */
export function startHeight(state: SwimState, context: SwimContext, meanSeconds: number): void {
  const { position, room } = context;
  state.height = clamp(position.y, room.min.y, room.max.y);
  state.heightTimer = drawDuration(context, meanSeconds);
}

/** Now and then picks a new height to swim at, about every `meanSeconds`. */
export function driftHeight(
  state: SwimState,
  context: SwimContext,
  meanSeconds: number,
  deltaSeconds: number,
): void {
  state.heightTimer -= deltaSeconds;
  if (state.heightTimer > 0) return;
  state.height = drawHeight(context);
  state.heightTimer = drawDuration(context, meanSeconds);
}

/** Random walk of the heading: `jitter` radians per square root of a second. */
export function jitterYaw(
  state: SwimState,
  context: SwimContext,
  jitter: number,
  deltaSeconds: number,
): void {
  state.yaw += context.rng.normal(0, jitter * Math.sqrt(deltaSeconds));
}

/** The heading from the fish towards (x, z), radians. */
export function yawTowards(context: SwimContext, x: number, z: number): number {
  return Math.atan2(z - context.position.z, x - context.position.x);
}

/** -1 or 1, evenly. */
export function drawSide(context: SwimContext): number {
  return context.rng.next() < 0.5 ? -1 : 1;
}

/**
 * The heading that follows a circle of `radius` around (x, z), the way round
 * `turn` (1 or -1), steering back onto it from inside or outside. Keeps
 * `current` right at the centre, where the circle has no direction.
 */
export function lapYaw(
  context: SwimContext,
  x: number,
  z: number,
  radius: number,
  turn: number,
  current: number,
): number {
  const awayX = context.position.x - x;
  const awayZ = context.position.z - z;
  const distance = Math.hypot(awayX, awayZ);
  if (distance < AT_CENTRE) return current;
  // Along the circle (the tangent), plus back onto it (the radial term).
  const inward = (LAP_RADIAL_GAIN * (radius - distance)) / radius / distance;
  const headingX = (-turn * awayZ) / distance + inward * awayX;
  const headingZ = (turn * awayX) / distance + inward * awayZ;
  return Math.atan2(headingZ, headingX);
}

/** Shuts the mouth and levels out: what an activity at a place leaves behind. */
export function settleDown(wishes: SwimState): void {
  wishes.mouth = 0;
  wishes.steep = false;
}
