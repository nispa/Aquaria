import { Vector3, type Box3 } from "three";
import { ACTIVITY_IDS, type ActivitiesSpec, type ActivityId } from "../../scene/activities";
import { activityOf } from "./activities";
import { settleDown } from "./shared";
import type { ActivityState, SwimContext, SwimState } from "./types";

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
   */
  choose(
    state: ActivityState,
    wishes: SwimState,
    activities: ActivitiesSpec,
    context: SwimContext,
    within: Box3,
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
  ): number => {
    const activity = activityOf(id);
    const params = activities[id];
    if (params.weight === 0 || !activity.atPlace || !("tags" in params)) {
      return activity.atPlace ? 0 : params.weight;
    }
    const spot = spots.get(id);
    if (spot === undefined) return 0;
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
    return size < 0 ? 0 : params.weight;
  };

  return {
    choose(state, wishes, activities, context, within) {
      let total = 0;
      for (const id of ACTIVITY_IDS) {
        const weight = appeal(id, activities, context, within);
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
