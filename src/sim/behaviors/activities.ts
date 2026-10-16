import { ACTIVITY_IDS, type ActivitiesSpec, type ActivityId } from "../../scene/activities";
import { inspectActivity } from "./inspect";
import { peckActivity } from "./peck";
import { restActivity } from "./rest";
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
  rest: restActivity,
};

export function activityOf(id: ActivityId): Activity<ActivityId> {
  return ACTIVITIES[id];
}

/**
 * Whether a species does anything but wander in its active hours. Those that
 * do not skip activities altogether (outside realistic mode, where they may
 * rest): no work per frame, no random numbers drawn.
 */
export function doesMoreThanWander(activities: ActivitiesSpec): boolean {
  return ACTIVITY_IDS.some(
    (id) => id !== "wander" && !ACTIVITIES[id].restful && activities[id].weight > 0,
  );
}

/** Whether a species ever rests, given when it is active. */
export function evenRests(activities: ActivitiesSpec, active: "day" | "night" | "always"): boolean {
  return (
    active !== "always" &&
    ACTIVITY_IDS.some((id) => ACTIVITIES[id].restful && activities[id].weight > 0)
  );
}
