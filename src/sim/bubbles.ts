import type { Vector3 } from "three";
import type { Prop } from "./layout";

/** A column of bubbles rising from a point on the floor. */
export interface BubbleStream {
  readonly x: number;
  readonly z: number;
  /** Height where bubbles appear, m. */
  readonly baseY: number;
  /** Height where bubbles burst, m. */
  readonly surfaceY: number;
}

/** How far downstream the current carries a bubble per meter risen (bubbles are slow to drift). */
const DRIFT_PER_METER = 3;
/** Side-to-side wobble, m, and its frequency along the rise, 1/m. */
const WOBBLE_AMPLITUDE = 0.04;
const WOBBLE_FREQUENCY = 6;

/**
 * Position of one bubble. Pure and time-based, so any number of bubbles can
 * be placed each frame without state; `seed` (0..1) staggers the bubbles of
 * a stream along its height.
 */
export function bubblePosition(
  stream: BubbleStream,
  seed: number,
  timeSeconds: number,
  current: Vector3,
  riseSpeed: number,
  out: Vector3,
): Vector3 {
  const travel = stream.surfaceY - stream.baseY;
  const risen = (((timeSeconds * riseSpeed + seed * travel) % travel) + travel) % travel;
  const wobblePhase = risen * WOBBLE_FREQUENCY + seed * 20;
  return out.set(
    stream.x + current.x * risen * DRIFT_PER_METER + Math.sin(wobblePhase) * WOBBLE_AMPLITUDE,
    stream.baseY + risen,
    stream.z + current.z * risen * DRIFT_PER_METER + Math.cos(wobblePhase * 0.8) * WOBBLE_AMPLITUDE,
  );
}

/** Bubbles leave a rock a little below its top, which sits at about 0.3 of its size. */
const ROCK_TOP_RATIO = 0.3;

/** One bubble stream per rock, at most `limit`; none when the scene turns bubbles off. */
export function bubbleStreamsFromProps(
  props: readonly Prop[],
  surfaceY: number,
  limit: number,
  enabled = true,
): BubbleStream[] {
  if (!enabled) return [];
  return props
    .filter((prop) => prop.kind === "rock")
    .slice(0, limit)
    .map((rock) => ({ x: rock.x, z: rock.z, baseY: rock.size * ROCK_TOP_RATIO, surfaceY }));
}
