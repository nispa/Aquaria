import { z } from "zod";
import { defineTrait } from "./defineTrait";

/**
 * The item's color tints the model's own colors. Made for museum scans of
 * coral: bleached skeletons whose texture keeps every pore and ridge, brought
 * back to a living color by the object or the scene entry.
 */
export const tint = defineTrait({
  id: "tint",
  summary: "the item's color tints the model, e.g. a bleached coral scan",
  schema: z.object({
    /** 0 keeps the model's colors, 1 multiplies them by the item's color. */
    strength: z.number().min(0).max(1).default(1),
  }),
});
