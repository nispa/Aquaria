import { z } from "zod";
import { defineTrait } from "./defineTrait";

/**
 * GlTF attribute (custom attributes start with `_`) with how much each point
 * of a model sways, 0 (still, the base) to 1 (free, the tips). Blender paints
 * it as a vertex attribute. Without it, a point sways more the higher it is.
 */
export const SWAY_ATTRIBUTE = "_SWAY";

/** Sways in the current like a plant: the tips move, the base stays put. */
export const sway = defineTrait({
  id: "sway",
  summary: "sways in the current like a plant",
  schema: z.object({
    /** How far the tips move, as a share of the height. */
    amount: z.number().min(0).max(1).default(0.05),
    /** Sways per second at a steady current. */
    speed: z.number().positive().max(5).default(0.6),
    /** The per-point weights in the model; see SWAY_ATTRIBUTE. */
    attribute: z
      .string()
      .regex(/^_[A-Z0-9_]+$/, "Custom glTF attributes are written like _SWAY.")
      .default(SWAY_ATTRIBUTE),
  }),
});
