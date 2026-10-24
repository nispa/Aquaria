import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";
import { coloringId, hexColor, MAX_COLORINGS } from "./schema";

/**
 * A fish as data: `public/assets/species/<id>/fish.json`, built into the
 * model and its colorings by `scripts/blender/fishbuild.py` (see
 * docs/FISH_MODELS.md). Lengths are body lengths in Blender's frame: +x the
 * snout, +z the back, +y the fish's left. The builder trusts what passes
 * here; the fish maker page edits it.
 */

/** A point of a side view: x along the fish, z up. */
const sidePoint = z.tuple([z.number(), z.number()]);
const outline = z.array(sidePoint).min(2);
const range = z.tuple([z.number(), z.number()]);
const share = z.number().min(0).max(1);
/** Mesh resolution: steps along the fin's base and out to its edge. */
const steps = z.tuple([z.number().int().min(1).max(400), z.number().int().min(1).max(200)]);
const partId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "A part id uses lowercase letters, digits and dashes.");

const thickness = z.object({
  /** Half the thickness at the widest, body lengths. */
  half: z.number().positive().max(0.5),
  /** Share of the body (0 snout .. 1 peduncle) over which it grows to that. */
  rise: z.number().positive().max(1),
  /** How the growth curves: 0.5 round, 1 straight. */
  power: z.number().positive().max(3),
  /** Share it loses towards the peduncle, from `taperFrom` on. */
  taper: share,
  taperFrom: share,
  /** Never thinner than this, body lengths. */
  min: z.number().min(0).max(0.2),
});

const bodyFin = z.object({
  id: partId,
  type: z.literal("body"),
  /** Along the top (dorsal) or the bottom (anal, gonopodium). */
  upper: z.boolean(),
  start: z.number(),
  end: z.number(),
  outline,
  steps: steps.optional(),
  bulge: z.number().min(0).max(0.1).optional(),
});

const tailFin = z.object({
  id: partId,
  type: z.literal("tail"),
  /** Where its base stands behind the peduncle, body lengths. */
  root: z.number(),
  baseHeight: z.number().positive(),
  outline,
  steps: steps.optional(),
  bulge: z.number().min(0).max(0.1).optional(),
  ruffle: z.number().min(0).max(0.1).optional(),
});

/** Degrees above the backward direction of the fan's highest and lowest ray. */
const fanAngles = z.tuple([z.number().min(-180).max(180), z.number().min(-180).max(180)]);

const pectoralFin = z.object({
  id: partId,
  type: z.literal("pectoral"),
  root: sidePoint,
  /** The base, from the root: how far back and how tall. */
  base: sidePoint,
  length: z.number().positive(),
  angles: fanAngles,
  roundness: share.optional(),
  /** Degrees it stands out from the body (model.json `rest`). */
  lean: z.number().min(0).max(90).optional(),
  steps: steps.optional(),
});

const pelvicFin = z.object({
  id: partId,
  type: z.literal("pelvic"),
  /** x, then how far out to the side, then z. */
  root: z.tuple([z.number(), z.number(), z.number()]),
  base: sidePoint,
  edge: z.union([
    z.object({
      fan: z.object({
        length: z.number().positive(),
        angles: fanAngles,
        roundness: share.optional(),
      }),
    }),
    z.object({ line: z.tuple([sidePoint, sidePoint]) }),
  ]),
  /** How far the edge stands out to the side. */
  out: z.number().min(0).max(0.1).optional(),
  steps,
});

const filamentPoints = z.array(z.tuple([z.number(), z.number(), z.number()])).min(2);

const filamentFin = z.object({
  id: partId,
  type: z.literal("filament"),
  /** The path of each filament (x, out to the side, z), which may differ in length. */
  points: z.object({ left: filamentPoints, right: filamentPoints }),
  /** Width at the root and at the tip. */
  width: range,
  steps,
});

const fin = z.discriminatedUnion("type", [bodyFin, tailFin, pectoralFin, pelvicFin, filamentFin]);

const band = z.object({
  axis: z.enum(["x", "z", "up", "absUp", "absZ"]),
  /** A smoothstep over it; from > to falls instead of rising. */
  range,
  invert: z.boolean().optional(),
  /** For absZ: the height the distance is measured from. */
  offset: z.number().optional(),
});
const bands = z.array(band).min(1);

const edgeShape = {
  at: z.number(),
  width: z.number().positive(),
  slant: z.number().optional(),
  below: z.number().optional(),
  noise: z
    .object({ z: z.number(), x: z.number(), seed: z.number().int(), amount: z.number() })
    .optional(),
};

const marksShape = {
  marks: z.array(z.tuple([z.number(), z.number(), z.number().positive()])).min(1),
  softness: share.optional(),
  axis: z.enum(["z", "up"]).optional(),
  ySquash: z.number().positive().optional(),
};

/** What every pattern may have: how much, and the bands it stays within. */
const strength = { amount: z.number().min(0).max(2).optional(), where: bands.optional() };

const noiseShape = {
  scale: z.number().positive(),
  seed: z.number().int(),
  octaves: z.number().int().min(1).max(8).optional(),
};

/** Each pattern's own fields, by type: a share 0..1 per texel (scripts/blender/fishpaint.py). */
const patternShapes = {
  patch: { bands: bands.optional() },
  edge: edgeShape,
  marks: marksShape,
  noise: { ...noiseShape, range },
  noiseLines: { ...noiseShape, width: range },
  eyeLine: { slope: z.number(), width: range, x: range },
  rays: { centre: sidePoint, count: z.number().positive(), power: z.number().positive() },
  gillCurve: { x: z.number(), curve: z.number(), width: range },
} as const;

const pattern = z.discriminatedUnion("type", [
  z.object({ type: z.literal("patch"), ...patternShapes.patch, ...strength }),
  z.object({ type: z.literal("edge"), ...patternShapes.edge, ...strength }),
  z.object({ type: z.literal("marks"), ...patternShapes.marks, ...strength }),
  z.object({ type: z.literal("noise"), ...patternShapes.noise, ...strength }),
  z.object({ type: z.literal("noiseLines"), ...patternShapes.noiseLines, ...strength }),
  z.object({ type: z.literal("eyeLine"), ...patternShapes.eyeLine, ...strength }),
  z.object({ type: z.literal("rays"), ...patternShapes.rays, ...strength }),
  z.object({ type: z.literal("gillCurve"), ...patternShapes.gillCurve, ...strength }),
]);

const colored = { color: hexColor, ...strength };

/** A pattern in a color; a patch may instead take the largest of several patterns (`any`). */
const coloredLayer = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("patch"),
      ...patternShapes.patch,
      any: z.array(pattern).min(1).optional(),
      ...colored,
    })
    .refine((layer) => (layer.bands === undefined) !== (layer.any === undefined), {
      message: "A patch has either bands or any.",
    }),
  z.object({
    type: z.literal("edge"),
    ...patternShapes.edge,
    /** Behind the edge, the color shaded towards another by bands. */
    behind: z
      .object({ color: hexColor, bands, amount: z.number().min(0).max(1).optional() })
      .optional(),
    ...colored,
  }),
  z.object({ type: z.literal("marks"), ...patternShapes.marks, ...colored }),
  z.object({ type: z.literal("noise"), ...patternShapes.noise, ...colored }),
  z.object({ type: z.literal("noiseLines"), ...patternShapes.noiseLines, ...colored }),
  z.object({ type: z.literal("eyeLine"), ...patternShapes.eyeLine, ...colored }),
  z.object({ type: z.literal("rays"), ...patternShapes.rays, ...colored }),
  z.object({ type: z.literal("gillCurve"), ...patternShapes.gillCurve, ...colored }),
]);

const bodyLayer = z.union([
  z.object({ type: z.literal("fill"), color: hexColor }),
  z.object({
    type: z.literal("scales"),
    size: z.number().positive().max(0.2),
    rim: share.optional(),
  }),
  coloredLayer,
]);

const finLayer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tint"),
    color: hexColor,
    colorTo: hexColor.optional(),
    edge: z.object(edgeShape).optional(),
  }),
  z.object({
    type: z.literal("dots"),
    color: hexColor,
    cell: z.number().positive(),
    radius: z.number().positive(),
    seed: z.number().int(),
    /** Chance of a dot at the root, and how much it grows to the edge. */
    chance: range,
    fade: range,
    alpha: share.optional(),
  }),
  z.object({
    type: z.literal("noiseLines"),
    color: hexColor,
    scale: z.number().positive(),
    seed: z.number().int(),
    octaves: z.number().int().min(1).max(8).optional(),
    width: range,
    amount: z.number().min(0).max(2).optional(),
    alpha: share.optional(),
  }),
  z.object({
    type: z.literal("marks"),
    color: hexColor,
    ...marksShape,
    amount: z.number().min(0).max(2).optional(),
    alpha: share.optional(),
  }),
]);

const finPainter = z.object({
  rayed: z.object({
    web: hexColor,
    ray: hexColor,
    root: hexColor,
    alphaRoot: share,
    alphaEdge: share,
    rays: z.number().positive(),
    rootShare: share.optional(),
    edgeColor: hexColor.optional(),
  }),
  layers: z.array(finLayer).optional(),
});

const strain = z.object({
  id: coloringId,
  name: z.string().min(1),
  /** The body's layers, in order; the first a fill. */
  body: z.array(bodyLayer).min(1),
  /** A painter per fin id, over the recipe's `finPaint`. */
  fins: z.record(partId, finPainter).optional(),
});

const surface = z.object({ roughness: share, metallic: share });

/** An atlas rectangle: left, bottom, width, height, shares of the texture. */
const rect = z.tuple([share, share, share, share]);

export const fishRecipeSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    body: z.object({
      top: outline,
      bottom: outline,
      thickness,
      roundness: z.number().positive().max(4),
    }),
    eye: z.object({
      x: z.number(),
      z: z.number(),
      radius: z.number().positive().max(0.2),
      /** How far out it sits, as a share of the body's half thickness there. */
      depth: z.number().min(0).max(1.5),
      rim: hexColor,
      iris: hexColor,
      pupil: hexColor,
      /** Degrees from the pupil where the iris and the pupil end. */
      irisEdge: range,
      pupilEdge: range,
    }),
    mouth: z.object({ reach: z.number().positive().max(0.3), drop: z.number().min(0).max(0.2) }),
    /** Where the gill cover ends; printed in the fish frame for model.json. */
    gills: z.object({ edge: z.number(), top: z.number(), bottom: z.number() }).optional(),
    fins: z.array(fin).min(1),
    texture: z.object({
      size: z.number().int().min(64).max(4096),
      /** The model's own texture is the first strain's, one texel in every `ownStep`. */
      ownStep: z.number().int().min(1).max(64).optional(),
      parts: z.record(partId, rect),
    }),
    materials: z.object({ skin: surface, fins: surface, eyes: surface }),
    /** Fin painters every strain shares unless it paints the fin itself. */
    finPaint: z.record(partId, finPainter).optional(),
    strains: z.array(strain).min(1).max(MAX_COLORINGS),
  })
  .superRefine((recipe, context) => {
    const parts = new Set(Object.keys(recipe.texture.parts));
    if (!parts.has("body")) {
      context.addIssue({
        code: "custom",
        path: ["texture", "parts"],
        message: "The texture needs a body part.",
      });
    }
    for (const [index, each] of recipe.fins.entries()) {
      if (!parts.has(each.id)) {
        context.addIssue({
          code: "custom",
          path: ["fins", index, "id"],
          message: `Fin "${each.id}" has no part in the texture.`,
        });
      }
    }
    for (const [index, each] of recipe.strains.entries()) {
      for (const { id } of recipe.fins) {
        if (each.fins?.[id] === undefined && recipe.finPaint?.[id] === undefined) {
          context.addIssue({
            code: "custom",
            path: ["strains", index, "fins"],
            message: `Strain "${each.id}" does not paint fin "${id}".`,
          });
        }
      }
    }
  });

export type FishRecipe = z.output<typeof fishRecipeSchema>;

/** Validates a recipe; `id` is its species folder, used in messages. */
export function parseFishRecipe(input: unknown, id: string): FishRecipe {
  const result = fishRecipeSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`fish recipe "${id}"`, result.error));
  }
  return result.data;
}
