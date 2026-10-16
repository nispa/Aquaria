import { Box3, Vector3 } from "three";
import { createRng } from "../../core/rng";
import { swimSchema, type SwimParams, type SwimStyleId } from "../../scene/swimming";
import { activitiesSchema, type ActivityId, type ActivityParams } from "../../scene/activities";
import { createPlaceFinder, type Place } from "../places";
import {
  createActivityState,
  createSwimState,
  type Activity,
  type ActivityState,
  type SwimContext,
  type SwimState,
  type SwimStyle,
} from "./types";

/** Test support: drives one style for a fish that stays where the test puts it. */

export const HARNESS_STEP = 1 / 60;
const BODY_LENGTH = 0.2;
/** Two body lengths a second, like a calm reef fish. */
const CRUISE = 0.4;

export interface StyleRun<Id extends SwimStyleId> {
  readonly state: SwimState;
  readonly context: SwimContext & { readonly position: Vector3 };
  readonly params: SwimParams<Id>;
  /** Steps for `seconds`, calling `sample` after every step. */
  run(seconds: number, sample?: (state: SwimState) => void): void;
}

/**
 * Starts `style` with its default parameters plus `overrides`, in a 4 × 2 × 2 m
 * room over flat sand, among `places`.
 */
export function startStyle<Id extends SwimStyleId>(
  style: SwimStyle<Id>,
  overrides: Partial<SwimParams<Id>> = {},
  seed = 1,
  places: readonly Place[] = [],
): StyleRun<Id> {
  // The schema fills in the defaults; the cast only restores the style's own type.
  const params = swimSchema.parse({ ...overrides, style: style.id }) as SwimParams<Id>;
  const context = {
    position: new Vector3(0, 1, -1),
    velocity: new Vector3(CRUISE, 0, 0),
    room: new Box3(new Vector3(-2, 0, -2), new Vector3(2, 2, 0)),
    length: BODY_LENGTH,
    cruise: CRUISE,
    rng: createRng(seed),
    places: createPlaceFinder(
      () => places,
      () => 0,
    ),
  };
  const state = createSwimState();
  style.start(state, params, context);
  return {
    state,
    context,
    params,
    run(seconds, sample) {
      for (let elapsed = 0; elapsed < seconds; elapsed += HARNESS_STEP) {
        style.step(state, params, context, HARNESS_STEP);
        sample?.(state);
      }
    },
  };
}

/** Collects one value of the state after every step. */
export function collect<Id extends SwimStyleId>(
  styleRun: StyleRun<Id>,
  seconds: number,
  read: (state: SwimState) => number,
): number[] {
  const values: number[] = [];
  styleRun.run(seconds, (state) => values.push(read(state)));
  return values;
}

/** Angle between two headings, folded into 0..π. */
export function headingGap(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

export interface ActivityRun<Id extends ActivityId> {
  readonly state: ActivityState;
  readonly wishes: SwimState;
  readonly context: SwimContext & { readonly position: Vector3 };
  readonly params: ActivityParams<Id>;
  /**
   * Steps for up to `seconds`, calling `sample` after every step. Returns the
   * time at which the activity ended, or undefined if it went on.
   */
  run(seconds: number, sample?: (wishes: SwimState) => void): number | undefined;
}

/**
 * Starts `activity` with its default parameters plus `overrides`, about a
 * place whose top is `target` and whose height is `size`, for a fish of body
 * length 0.2 m at (0, 1, -1).
 */
export function startActivity<Id extends ActivityId>(
  activity: Activity<Id>,
  overrides: Partial<ActivityParams<Id>> = {},
  target = new Vector3(1, 0.3, -1),
  size = 0.3,
  seed = 1,
): ActivityRun<Id> {
  const params = activitiesSchema.parse({ [activity.id]: overrides })[
    activity.id
  ] as ActivityParams<Id>;
  const context = {
    position: new Vector3(0, 1, -1),
    velocity: new Vector3(CRUISE, 0, 0),
    room: new Box3(new Vector3(-2, 0, -2), new Vector3(2, 2, 0)),
    length: BODY_LENGTH,
    cruise: CRUISE,
    rng: createRng(seed),
    places: createPlaceFinder(
      () => [],
      () => 0,
    ),
  };
  const state = createActivityState();
  state.target.copy(target);
  state.targetSize = size;
  const wishes = createSwimState();
  activity.start(state, params, context);
  return {
    state,
    wishes,
    context,
    params,
    run(seconds, sample) {
      for (let elapsed = 0; elapsed < seconds; elapsed += HARNESS_STEP) {
        const going = activity.step(state, wishes, params, context, HARNESS_STEP);
        sample?.(wishes);
        if (!going) return elapsed + HARNESS_STEP;
      }
      return undefined;
    },
  };
}
