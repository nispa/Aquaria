import { z } from "zod";
import { bandRange, orderedPair } from "../schema";
import { defineTrait } from "./defineTrait";

const meters = z.number().positive();

/**
 * Where it goes when a scene asks for a number of them and leaves the rest
 * to chance, and how big it comes. A scene entry may override any of it.
 */
export const placement = defineTrait({
  id: "placement",
  summary: "where it goes in a tank and how big it comes",
  schema: z.object({
    /** What it may stand on. */
    on: z
      .array(z.enum(["sand", "rock"]))
      .min(1)
      .default(["sand"]),
    /** Depth bands, 0 at the glass to 4 at the back. */
    bands: bandRange.default([0, 4]),
    /** Rough diameter range, m (objects). */
    size: orderedPair(meters, "size").optional(),
    /** Height range, m (plants). */
    height: orderedPair(meters, "height").optional(),
    /**
     * How far it keeps from the glass and the side walls, m, when it goes
     * where chance puts it: a carpet grows right up to the glass.
     */
    clearance: z.number().min(0).max(1).default(0.2),
    /**
     * Lies along the rock it grows on, its top facing out of the slope,
     * as an encrusting coral does; on the sand it stays upright.
     */
    hug: z.boolean().default(false),
  }),
});
