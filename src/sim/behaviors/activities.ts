import { ACTIVITY_IDS, type ActivitiesSpec, type ActivityId } from "../../scene/activities";
import { inspectActivity } from "./inspect";
import { peckActivity } from "./peck";
import type { Activity } from "./types";
import { wanderActivity } from "./wander";

/**
 * Every activity, by id. To add one, declare its parameters in
 * `scene/activities.ts`, write it in a file of its own here and list it
 * below; the type makes sure no declared activity is left without one.
 */
export const ACTIVITIES: { readonly [Id in ActivityId]: Activity<Id> } = {
  wander: wanderActivity,
  inspect: inspectActivity,
  peck: peckActivity,
};

export function activityOf(id: ActivityId): Activity<ActivityId> {
  return ACTIVITIES[id];
}

/**
 * Whether a species ever does anything but wander. Those that do not skip
 * activities altogether: no work per frame, no random numbers drawn.
 */
export function doesMoreThanWander(activities: ActivitiesSpec): boolean {
  return ACTIVITY_IDS.some((id) => id !== "wander" && activities[id].weight > 0);
}
