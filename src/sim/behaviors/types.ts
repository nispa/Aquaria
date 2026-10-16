import { Vector3, type Box3 } from "three";
import type { Rng } from "../../core/rng";
import type { SwimParams, SwimStyleId } from "../../scene/swimming";

/**
 * What a fish wants from its swimming style, renewed every step. The
 * simulation turns it into steering: a heading force towards `yaw`, a
 * vertical pull towards `height`, a speed target and the tail's effort.
 */
export interface SwimState {
  /** Wanted heading seen from above, radians: 0 is +x, π/2 is +z (towards the glass). */
  yaw: number;
  /** Wanted height above the floor, m. */
  height: number;
  /** Wanted speed as a share of cruise speed. */
  speed: number;
  /** How quickly the fish reaches that speed, 1/s. */
  response: number;
  /** How hard the tail works, 0 still (gliding) .. 1 full beat. */
  thrust: number;
  /** Seconds left in the style's current phase. */
  timer: number;
  /** Seconds left before a new height is picked. */
  heightTimer: number;
  /** Seconds since the style started, for periodic motions. */
  clock: number;
  /** The style's current phase, e.g. bursting or coasting. */
  phase: number;
  /** 1 or -1: the way round a fish laps or loops. */
  turn: number;
  /** The spot a fish keeps station at or patrols around. */
  readonly home: Vector3;
}

/** What a style may look at. */
export interface SwimContext {
  readonly position: Vector3;
  /** The part of the habitat a fish can roam without being pushed back by its walls. */
  readonly room: Box3;
  /** Body length of the individual, m. */
  readonly length: number;
  readonly rng: Rng;
}

/**
 * One swimming style. Methods (not function properties) on purpose: a table
 * of styles is then usable as styles of any id, see `SWIM_STYLES`.
 */
export interface SwimStyle<Id extends SwimStyleId> {
  readonly id: Id;
  /** Sets up a fish that starts swimming freely, keeping its current `yaw`. */
  start(state: SwimState, params: SwimParams<Id>, context: SwimContext): void;
  /** Advances the style by one step. Must not allocate. */
  step(state: SwimState, params: SwimParams<Id>, context: SwimContext, deltaSeconds: number): void;
}

/** A state for a fish heading along `yaw`, cruising, before any style has started. */
export function createSwimState(yaw = 0): SwimState {
  return {
    yaw,
    height: 0,
    speed: 1,
    response: 1.5,
    thrust: 1,
    timer: 0,
    heightTimer: 0,
    clock: 0,
    phase: 0,
    turn: 1,
    home: new Vector3(),
  };
}
