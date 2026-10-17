import { z } from "zod";
import { defineTrait } from "./defineTrait";

const share = z.number().min(0).max(4);

/**
 * Solid: fish swim round it. The shape is an ellipsoid, each measure a share
 * of the object's size (its rough diameter): cheap, and close enough that a
 * fish brushing past seems to touch it.
 */
export const collision = defineTrait({
  id: "collision",
  summary: "fish swim round it instead of through it",
  schema: z.object({
    /** False for soft things fish may swim through, like plants. */
    solid: z.boolean().default(true),
    /** Half the width (x), as a share of the size. */
    across: share.default(0.5),
    /** Half the height (y), as a share of the size. */
    up: share.default(0.5),
    /** Half the depth (z), as a share of the size. */
    along: share.default(0.5),
    /** How far the base sinks into the sand, as a share of the size (< 0 sinks). */
    sink: z.number().min(-1).max(1).default(0),
    /** Height of the ellipsoid's middle above the base, as a share of the size. */
    lift: share.default(0),
  }),
});
