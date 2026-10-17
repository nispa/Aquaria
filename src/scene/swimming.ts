import { z } from "zod";
import { tagSchema } from "./tags";

/**
 * Swimming styles: how a species moves when nothing else (food, a finger on
 * the glass, a fright) calls for its attention. A species picks one style in
 * `swim` and may tune its parameters; every parameter has a default, the
 * look the style was tuned for. The motion itself lives in `sim/behaviors/`,
 * one file per style.
 *
 * Speeds are shares of the species' cruise speed, distances are body
 * lengths, angles radians and durations seconds, so one style suits small
 * and large species alike.
 */

const positive = z.number().positive();
const share = z.number().min(0);
const seconds = (min: number, max: number) =>
  z
    .tuple([positive, positive])
    .refine(([low, high]) => low <= high, "must be written as [min, max].")
    .default([min, max]);

/** Long, smooth laps with a gently varying speed: tangs, schooling fish. */
const cruise = z.strictObject({
  style: z.literal("cruise"),
  /** Spread of the speed around cruise speed, as a share of it. */
  speedVariation: share.max(1).default(0.15),
  /** Heading jitter, radians per square root of a second. */
  turnJitter: share.default(0.5),
  /** Average time between changes of the height a fish swims at. */
  heightChangeSeconds: positive.default(12),
});

/** Dart, glide, slow down, dart again: damsels, guppies, small reef fish. */
const burstCoast = z.strictObject({
  style: z.literal("burst-coast"),
  /** Speed wanted during a burst, as a share of cruise speed (capped at max speed). */
  burstSpeed: positive.default(2.2),
  burstSeconds: positive.default(0.35),
  /** Speed a fish slows down to while coasting, as a share of cruise speed. */
  coastSpeed: share.default(0.35),
  coastSeconds: seconds(1.2, 3.5),
  /** Spread of the change of heading at each burst, radians. */
  burstTurn: share.default(0.9),
  heightChangeSeconds: positive.default(6),
});

/** Station keeping with small corrections and turns on the spot: gobies, grammas, gouramis. */
const hover = z.strictObject({
  style: z.literal("hover"),
  /** Drifting speed, as a share of cruise speed. */
  speed: share.default(0.2),
  /** Time between turns. */
  turnSeconds: seconds(1.5, 5),
  /** Largest turn, radians. */
  turnAngle: positive.max(Math.PI).default(2.2),
  /** How far a fish strays from its spot before turning back, in body lengths. */
  roamBodyLengths: positive.default(4),
  heightChangeSeconds: positive.default(10),
  /**
   * Tag of the place to keep station over, e.g. `anemone` for a clownfish:
   * the nearest one, even outside the habitat. Without it, or when the
   * scene has none, the fish keeps station where it started.
   */
  home: tagSchema.optional(),
});

/** Slow and graceful: wide figure eights while rising and sinking. Angelfish, idols. */
const glide = z.strictObject({
  style: z.literal("glide"),
  speed: share.default(0.7),
  /** Turn rate through each loop of the eight, radians per second. */
  turnRate: positive.default(0.35),
  /** Height swing as a share of the habitat's height. */
  heightSwing: share.max(1).default(0.6),
  /** One rise and fall. */
  heightPeriodSeconds: positive.default(24),
});

/** Laps around a home spot, now one way, now the other: territorial fish. */
const patrol = z.strictObject({
  style: z.literal("patrol"),
  speed: share.default(0.8),
  /** Radius of the lap, in body lengths. */
  radiusBodyLengths: positive.default(6),
  /** Time between changes of direction. */
  reverseSeconds: seconds(15, 40),
});

/**
 * Walks on the floor, following its rise and fall: stops to pick at the
 * ground, then sets off in a new direction. Shrimps; with `sideways` and
 * `swims: false`, crabs; with `fright: "shell"` too, hermit crabs.
 */
const crawl = z.strictObject({
  style: z.literal("crawl"),
  /** Walking speed, as a share of cruise speed. */
  speed: share.default(0.5),
  walkSeconds: seconds(2, 6),
  /** Stops to pick at the ground, standing still. */
  stopSeconds: seconds(1, 4),
  /** Spread of the change of heading after a stop, radians. */
  turnAngle: share.max(Math.PI).default(1.2),
  /** Heading jitter while walking, radians per square root of a second. */
  turnJitter: share.default(0.3),
  /** Walks sideways, its body across the way it goes, like a crab. */
  sideways: z.boolean().default(false),
  /**
   * Whether it may swim off the ground (a shrimp to a plant top, away from
   * a fright). A crab cannot: it runs, feeds and hides on foot.
   */
  swims: z.boolean().default(true),
  /**
   * What it does when frightened: `flee` runs off (or to a shelter, for the
   * species' hiding individuals); `shell` withdraws into its shell where it
   * stands and stays still until calm, like a hermit crab.
   */
  fright: z.enum(["flee", "shell"]).default("flee"),
});

export const swimSchema = z.discriminatedUnion("style", [
  cruise,
  burstCoast,
  hover,
  glide,
  patrol,
  crawl,
]);

export type SwimSpec = z.output<typeof swimSchema>;
export type SwimStyleId = SwimSpec["style"];
/** The parameters of every style, by id. */
export type SwimParamsById = { [Spec in SwimSpec as Spec["style"]]: Spec };
/** The parameters of one style. */
export type SwimParams<Id extends SwimStyleId> = SwimParamsById[Id];

export const SWIM_STYLE_IDS: readonly SwimStyleId[] = swimSchema.options.map(
  (option) => option.shape.style.value,
);
