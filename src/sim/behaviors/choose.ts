import { Vector3, type Box3 } from "three";
import { ACTIVITY_IDS, type ActivitiesSpec, type ActivityId } from "../../scene/activities";
import { activityOf } from "./activities";
import { settleDown } from "./shared";
import type { ActivityState, SwimContext, SwimState } from "./types";

/**
 * In its hours of rest a fish is this much more drawn to rest than a weight
 * of 1 would make it, so it rests most of the night.
 */
const REST_PULL = 10;

/**
 * How much a species wants to rest at a given daylight (0 night .. 1 day):
 * 0 in its active hours, 1 in the middle of its hours of rest.
 */
export function restfulness(active: "day" | "night" | "always", daylight: number): number {
  if (active === "always") return 0;
  return active === "day" ? 1 - daylight : daylight;
}

/** A fish notices places within this many body lengths… */
const SENSE_BODY_LENGTHS = 12;
/** …and never fewer than this many meters, so small fish still find some. */
const MIN_SENSE_RADIUS = 0.6;

/** Picks what a fish does next. */
export interface ActivityChooser {
  /**
   * Starts the next activity, drawn in proportion to the weights among those
   * the fish can do now: wandering always, an activity at a place only with
   * an interesting place nearby whose top lies `within` where it may go.
   * `restfulness` (see `restfulness()`) draws it to rest and away from the
   * rest.
   */
  choose(
    state: ActivityState,
    wishes: SwimState,
    activities: ActivitiesSpec,
    context: SwimContext,
    within: Box3,
    restfulness?: number,
  ): void;
  /** Calls off the current activity and wanders, e.g. when startled. */
  wander(
    state: ActivityState,
    wishes: SwimState,
    activities: ActivitiesSpec,
    context: SwimContext,
  ): void;
}

/** One chooser serves every fish; its scratch space keeps choosing allocation-free. */
export function createActivityChooser(): ActivityChooser {
  const spots = new Map<ActivityId, Vector3>(ACTIVITY_IDS.map((id) => [id, new Vector3()]));
  const sizes = new Map<ActivityId, number>();
  const weights = new Map<ActivityId, number>();

  const begin = (
    id: ActivityId,
    state: ActivityState,
    wishes: SwimState,
    activities: ActivitiesSpec,
    context: SwimContext,
  ): void => {
    settleDown(wishes);
    state.id = id;
    const spot = spots.get(id);
    if (spot !== undefined) state.target.copy(spot);
    state.targetSize = sizes.get(id) ?? 0;
    activityOf(id).start(state, activities[id], context);
  };

  /** How much the fish wants to do `id` now: its weight, or 0 when it cannot. */
  const appeal = (
    id: ActivityId,
    activities: ActivitiesSpec,
    context: SwimContext,
    within: Box3,
    rest: number,
  ): number => {
    const activity = activityOf(id);
    const params = activities[id];
    const weight = params.weight * (activity.restful ? REST_PULL * rest : 1 - rest);
    sizes.set(id, -1);
    if (weight === 0) return 0;
    const spot = spots.get(id);
    if (!activity.atPlace || !("tags" in params) || spot === undefined) return weight;
    const radius = Math.max(SENSE_BODY_LENGTHS * context.length, MIN_SENSE_RADIUS);
    const size = context.places.pick(
      params.tags,
      context.position,
      radius,
      within,
      context.rng,
      spot,
    );
    sizes.set(id, size);
    return size >= 0 || !activity.needsPlace ? weight : 0;
  };

  return {
    choose(state, wishes, activities, context, within, rest = 0) {
      let total = 0;
      for (const id of ACTIVITY_IDS) {
        const weight = appeal(id, activities, context, within, rest);
        weights.set(id, weight);
        total += weight;
      }
      let draw = context.rng.next() * total;
      let chosen: ActivityId = "wander";
      for (const id of ACTIVITY_IDS) {
        const weight = weights.get(id) ?? 0;
        if (weight === 0) continue;
        chosen = id;
        draw -= weight;
        if (draw <= 0) break;
      }
      begin(chosen, state, wishes, activities, context);
    },
    wander(state, wishes, activities, context) {
      begin("wander", state, wishes, activities, context);
    },
  };
}
