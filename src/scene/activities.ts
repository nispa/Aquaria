import { z } from "zod";
import { tagSchema } from "./tags";

/**
 * Activities: what a fish is doing. Each has a weight; when one ends, the next
 * is drawn among those the fish can do right now, in proportion to their
 * weights. `wander` lets the swimming style lead; activities at a place
 * (`inspect`, `peck`) need a place nearby with a tag the species cares about,
 * and say how much each tag interests it (0..1). A species that declares
 * nothing only wanders. The motion lives in `sim/behaviors/`.
 */

const weight = z.number().min(0);
const range = (min: number, max: number, item: z.ZodNumber) =>
  z
    .tuple([item, item])
    .refine(([low, high]) => low <= high, "must be written as [min, max].")
    .default([min, max]);
const seconds = (min: number, max: number) => range(min, max, z.number().positive());
/** How much each tag interests the species, 0..1. */
const interests = z.record(tagSchema, z.number().min(0).max(1)).default({});

/** Swimming in the species' own style. */
const wander = z.strictObject({
  weight: weight.default(1),
  /** How long a fish wanders before choosing again. */
  seconds: seconds(12, 30),
});

/** Swims up to a place, circles it or hovers facing it, then leaves. */
const inspect = z.strictObject({
  weight: weight.default(0),
  tags: interests,
  /** Time spent looking, once there. */
  seconds: seconds(4, 10),
  /** How far from the place it looks from, in body lengths. */
  distanceBodyLengths: z.number().positive().default(2),
});

/** Swims down to a place and picks at it: short darts with the mouth open. */
const peck = z.strictObject({
  weight: weight.default(0),
  tags: interests,
  /** Number of pecks before leaving. */
  pecks: range(3, 7, z.number().int().positive()),
});

export const activitiesSchema = z.strictObject({
  wander: wander.prefault({}),
  inspect: inspect.prefault({}),
  peck: peck.prefault({}),
});

export type ActivitiesSpec = z.output<typeof activitiesSchema>;
export type ActivityId = keyof ActivitiesSpec;
/** The parameters of one activity. */
export type ActivityParams<Id extends ActivityId> = ActivitiesSpec[Id];

export const ACTIVITY_IDS = Object.keys(activitiesSchema.shape) as ActivityId[];
