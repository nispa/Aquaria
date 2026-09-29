import { z } from "zod";

/**
 * Schemas for the two external data files: the species catalog and a scene.
 * Everything the engine renders is described here; adding a species or a
 * scene should only ever mean writing JSON that passes these schemas.
 */

/** Depth bands: 0 is right behind the glass, 4 is the far back of the tank. */
export const DEPTH_BAND_COUNT = 5;
/** Upper limit per species; the population manager relies on it for budgets. */
export const MAX_INDIVIDUALS_PER_SPECIES = 50;

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Expected a hex color such as #1f5fd6.");

const positive = z.number().positive();
const unit = z.number().min(0).max(1);
const band = z
  .number()
  .int()
  .min(0)
  .max(DEPTH_BAND_COUNT - 1);

const orderedPair = (item: z.ZodNumber, label: string) =>
  z
    .tuple([item, item])
    .refine(([min, max]) => min <= max, `${label} must be written as [min, max].`);

const bandRange = orderedPair(band, "bands");
const heightRange = orderedPair(unit, "heightRange");

const proceduralBody = z.object({
  type: z.literal("procedural"),
  /** Built-in body shapes generated in code. */
  shape: z.enum(["disc", "slender", "round"]),
  /**
   * Where the accent color goes: a light belly, the tail, vertical bands,
   * or a front/back split.
   */
  pattern: z.enum(["belly", "tail", "bands", "split"]).default("belly"),
  colors: z.object({ base: hexColor, accent: hexColor }),
});

const gltfBody = z.object({
  type: z.literal("gltf"),
  url: z.string().min(1),
});

export const speciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Species ids use lowercase letters, digits and dashes."),
  name: z.string().min(1),
  body: z.discriminatedUnion("type", [proceduralBody, gltfBody]),
  /** Body length in meters. Individuals are drawn from a normal distribution. */
  length: z.object({ mean: positive, standardDeviation: z.number().min(0) }),
  /** Speeds in meters per second. */
  speed: z
    .object({ cruise: positive, max: positive })
    .refine(({ cruise, max }) => cruise <= max, "speed.cruise must not exceed speed.max."),
  /** 0 = solitary, 1 = tight school. */
  schooling: unit,
  bands: bandRange,
  /** Vertical range as a fraction of the tank height (0 = floor, 1 = surface). */
  heightRange: heightRange,
});

export const speciesCatalogSchema = z
  .object({ species: z.array(speciesSchema).min(1) })
  .superRefine(({ species }, context) => {
    const seen = new Set<string>();
    for (const [index, entry] of species.entries()) {
      if (seen.has(entry.id)) {
        context.addIssue({
          code: "custom",
          path: ["species", index, "id"],
          message: `Duplicate species id "${entry.id}".`,
        });
      }
      seen.add(entry.id);
    }
  });

const vector3 = z
  .tuple([z.number(), z.number(), z.number()])
  .refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, "direction must not be a zero vector.");

const backdrop = z.discriminatedUnion("type", [
  z.object({ type: z.literal("gradient"), top: hexColor, bottom: hexColor }),
  z.object({
    type: z.literal("image"),
    /** Layers from far to near; `distance` is relative (1 = far wall). */
    layers: z.array(z.object({ url: z.string().min(1), distance: unit })).min(1),
  }),
]);

const flora = z.object({
  kind: z.enum(["kelp", "seagrass"]),
  count: z.number().int().min(0).max(200),
  bands: bandRange,
  /** Plant height range in meters. */
  height: orderedPair(z.number().positive(), "height"),
  color: hexColor,
});

const prop = z.object({
  kind: z.enum(["starfish", "rock"]),
  count: z.number().int().min(0).max(50),
  color: hexColor,
});

const fauna = z.object({
  species: z.string(),
  count: z.number().int().min(0).max(MAX_INDIVIDUALS_PER_SPECIES),
});

export const sceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  seed: z.number().int().nonnegative(),
  /** Tank size in meters: x = width, y = height, z = depth away from the glass. */
  tank: z.object({ width: positive, height: positive, depth: positive }),
  water: z.object({ color: hexColor, fogDensity: z.number().min(0).max(1) }),
  light: z.object({
    color: hexColor,
    intensity: z.number().min(0),
    caustics: z.object({ intensity: z.number().min(0), scale: positive }),
  }),
  current: z.object({
    direction: vector3,
    /** Drift speed in meters per second. */
    strength: z.number().min(0),
    /** 0 = laminar, 1 = very turbulent. */
    turbulence: unit,
  }),
  backdrop,
  floor: z.object({ color: hexColor }),
  flora: z.array(flora).default([]),
  props: z.array(prop).default([]),
  fauna: z.array(fauna),
});

export type SpeciesCatalogInput = z.input<typeof speciesCatalogSchema>;
export type SpeciesCatalog = z.output<typeof speciesCatalogSchema>;
export type Species = z.output<typeof speciesSchema>;
export type SceneInput = z.input<typeof sceneSchema>;
export type Scene = z.output<typeof sceneSchema>;
export type FloraSpec = z.output<typeof flora>;
export type PropSpec = z.output<typeof prop>;
