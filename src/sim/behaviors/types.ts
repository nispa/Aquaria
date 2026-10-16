import { Vector3, type Box3 } from "three";
import type { Rng } from "../../core/rng";
import type { ActivityId, ActivityParams } from "../../scene/activities";
import type { SwimParams, SwimStyleId } from "../../scene/swimming";
import type { PlaceFinder } from "../places";

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
  /** How wide the mouth should be, 0 shut .. 1 wide open (pecking). */
  mouth: number;
  /** May climb and dive steeply, head down or up (pecking). */
  steep: boolean;
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
  /**
   * The home is a place in the scenery (an anemone…): the fish may leave its
   * habitat to stay there.
   */
  anchored: boolean;
}

/** What a style may look at. */
export interface SwimContext {
  readonly position: Vector3;
  /** The part of the habitat a fish can roam without being pushed back by its walls. */
  readonly room: Box3;
  /** Body length of the individual, m. */
  readonly length: number;
  readonly rng: Rng;
  /** The scenery's places, by tag. */
  readonly places: PlaceFinder;
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
    mouth: 0,
    steep: false,
    timer: 0,
    heightTimer: 0,
    clock: 0,
    phase: 0,
    turn: 1,
    home: new Vector3(),
    anchored: false,
  };
}

/** What a fish is doing and how far along it is. */
export interface ActivityState {
  id: ActivityId;
  /** Seconds left in the current phase. */
  timer: number;
  /** The activity's current phase, e.g. approaching or looking. */
  phase: number;
  /** Repetitions left, e.g. pecks. */
  count: number;
  /** 1 or -1: the way round, when circling. */
  turn: number;
  /** The top of the place the activity is about. */
  readonly target: Vector3;
  /** Height of that place, m; -1 when an activity that may do without one has none. */
  targetSize: number;
  /** A heading the activity keeps, radians, e.g. while resting. */
  heading: number;
}

/**
 * One activity. Each step it may override the wishes the swimming style has
 * just set, and says whether it goes on.
 */
export interface Activity<Id extends ActivityId> {
  readonly id: Id;
  /** Whether it is about a place, found among those its `tags` interest. */
  readonly atPlace: boolean;
  /** Whether it cannot happen without such a place (resting can). */
  readonly needsPlace: boolean;
  /** Whether it is what a fish does in its hours of rest, rather than in its active hours. */
  readonly restful: boolean;
  /** Begins; an activity at a place finds it in `state.target`. */
  start(state: ActivityState, params: ActivityParams<Id>, context: SwimContext): void;
  /** Sets the wishes for this step; false once the activity is over. Must not allocate. */
  step(
    state: ActivityState,
    wishes: SwimState,
    params: ActivityParams<Id>,
    context: SwimContext,
    deltaSeconds: number,
  ): boolean;
}

/** A fish that has just started wandering, with nothing to time yet. */
export function createActivityState(): ActivityState {
  return {
    id: "wander",
    timer: 0,
    phase: 0,
    count: 0,
    turn: 1,
    target: new Vector3(),
    targetSize: 0,
    heading: 0,
  };
}
