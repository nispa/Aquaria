import { clamp } from "../../core/math";
import type { SwimContext, SwimState } from "./types";

/** Usual speed response, 1/s: a fish settles on a new speed within a second or so. */
export const CRUISE_RESPONSE = 1.5;
/** Random durations are drawn between these shares of their mean. */
const DURATION_SPREAD: readonly [number, number] = [0.5, 1.5];

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
