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

/**
 * A photographic surface from `public/assets/materials/<id>/`: a normal map
 * and a packed map (displacement, roughness, brightness detail). The entry's
 * color still sets the hue; the textures add relief and grain.
 */
const surfaceMaterial = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Material ids use lowercase letters, digits and dashes."),
  /** Size of one texture tile, m. */
  tileSize: positive.default(1),
  /** How far the relief pushes the surface out, m. Needs a finely divided shape. */
  displacement: z.number().min(0).max(0.2).default(0),
});

/** One color, or a palette: each item then takes one of the colors. */
const colorOrPalette = z.union([hexColor, z.array(hexColor).min(1)]);

/** Where an entry grows: on the sand (when absent) or on the scene's rockwork ridge. */
const placement = z.enum(["sand", "rockwork"]).optional();

/** Largest number of loose rocks piled on a rockwork ridge. */
export const MAX_ROCKWORK_ROCKS = 150;

/**
 * A reef ridge ("aquascape"): a continuous mound of live rock running across
 * the tank, with loose rocks piled on it. Corals and anemones can grow on it.
 */
const rockwork = z.object({
  /** Depth bands the ridge runs through. */
  bands: bandRange,
  /** Height range of the crest above the sand, m. */
  height: orderedPair(z.number().positive(), "height"),
  /** Share of the visible width the ridge spans. */
  coverage: unit.default(0.85),
  /** Front-to-back width of the ridge base, m. */
  thickness: positive.default(0.9),
  /** Loose rocks piled on the ridge. */
  rocks: z.number().int().min(0).max(MAX_ROCKWORK_ROCKS).default(40),
  color: hexColor,
  material: surfaceMaterial.optional(),
});

/** Largest count per flora entry; also the top of its panel slider. */
export const MAX_FLORA_PER_ENTRY = 200;
/** Largest count per prop entry; also the top of its panel slider. */
export const MAX_PROPS_PER_ENTRY = 50;

const flora = z.object({
  /** Anemones are short, swaying tentacle clumps; they use the same sway as plants. */
  kind: z.enum(["kelp", "seagrass", "anemone"]),
  /** Label in the control panel; defaults to the kind. */
  name: z.string().min(1).optional(),
  count: z.number().int().min(0).max(MAX_FLORA_PER_ENTRY),
  bands: bandRange,
  /** Plant height range in meters. */
  height: orderedPair(z.number().positive(), "height"),
  color: colorOrPalette,
  on: placement,
});

const prop = z.object({
  kind: z.enum(["rock", "starfish", "shell", "brain-coral", "branch-coral", "fan-coral"]),
  /** Label in the control panel; defaults to the kind. */
  name: z.string().min(1).optional(),
  count: z.number().int().min(0).max(MAX_PROPS_PER_ENTRY),
  color: colorOrPalette,
  on: placement,
  /** Depth bands to place the entry in; each kind has a sensible default. */
  bands: bandRange.optional(),
  material: surfaceMaterial.optional(),
});

const fauna = z.object({
  species: z.string(),
  count: z.number().int().min(0).max(MAX_INDIVIDUALS_PER_SPECIES),
});

export const sceneSchema = z
  .object({
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
    floor: z.object({ color: hexColor, material: surfaceMaterial.optional() }),
    rockwork: rockwork.optional(),
    flora: z.array(flora).default([]),
    props: z.array(prop).default([]),
    fauna: z.array(fauna),
  })
  .superRefine((scene, context) => {
    if (scene.rockwork !== undefined) return;
    for (const section of ["flora", "props"] as const) {
      scene[section].forEach((entry, index) => {
        if (entry.on === "rockwork") {
          context.addIssue({
            code: "custom",
            path: [section, index, "on"],
            message: "Placed on rockwork, but the scene has no rockwork.",
          });
        }
      });
    }
  });

export type SpeciesCatalogInput = z.input<typeof speciesCatalogSchema>;
export type SpeciesCatalog = z.output<typeof speciesCatalogSchema>;
export type Species = z.output<typeof speciesSchema>;
export type SceneInput = z.input<typeof sceneSchema>;
export type Scene = z.output<typeof sceneSchema>;
export type FloraSpec = z.output<typeof flora>;
export type PropSpec = z.output<typeof prop>;
export type SurfaceMaterialSpec = z.output<typeof surfaceMaterial>;
export type RockworkSpec = z.output<typeof rockwork>;
