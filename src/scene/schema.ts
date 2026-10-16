import { z } from "zod";
import { activitiesSchema } from "./activities";
import { lightsSchema } from "./lights";
import { swimSchema } from "./swimming";
import { tagSchema } from "./tags";

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
  /**
   * Built-in body shapes generated in code: `tall` is a high disc with a
   * pointed snout and large soft fins (butterflyfish, angelfish, damsels);
   * `banner` adds the long trailing dorsal filament of a moorish idol.
   */
  shape: z.enum(["disc", "slender", "round", "tall", "banner"]),
  /**
   * Where the accent (and detail) colors go: a light belly, the tail,
   * vertical bands, a front/back split, a bar through the eye with a spot
   * near the tail, thin lengthwise stripes, three broad bars, or the moorish
   * idol's black-white-yellow pattern.
   */
  pattern: z
    .enum(["belly", "tail", "bands", "split", "eye-bar", "stripes", "bars", "idol"])
    .default("belly"),
  colors: z
    .object({
      base: hexColor,
      accent: hexColor,
      /** Third color for richer patterns; defaults to the accent. */
      detail: hexColor.optional(),
    })
    .transform((colors) => ({ ...colors, detail: colors.detail ?? colors.accent })),
});

/** A 3D model: a folder in `public/assets/species/` with a glTF file and a `model.json`. */
const modelFolder = z
  .string()
  .regex(/^[a-z0-9-]+$/, "model is a folder name: lowercase letters, digits and dashes.");

/** How keen a species is on food when it is not fed (0 = ignores it, 1 = greedy). */
export const DEFAULT_APPETITE = 0.6;
/** Share of a species' individuals that come to look at a finger on the glass. */
export const DEFAULT_CURIOSITY = 0.3;
/** How easily a species is startled by a tap on the glass (0 = bold, 1 = flees from afar). */
export const DEFAULT_SHYNESS = 0.5;

/** How a species reacts to the viewer and to food. Every trait has a default. */
const behavior = z.object({
  appetite: unit.default(DEFAULT_APPETITE),
  curiosity: unit.default(DEFAULT_CURIOSITY),
  shyness: unit.default(DEFAULT_SHYNESS),
  /**
   * When the species is up and about: by `day` (most reef and aquarium
   * fish), by `night`, or `always`. In realistic mode it rests the rest of
   * the time.
   */
  active: z.enum(["day", "night", "always"]).default("day"),
  /**
   * Share of its individuals that run for the nearest shelter when startled,
   * rather than only darting away (always the same individuals).
   */
  hiding: unit.default(0),
});

export const speciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Species ids use lowercase letters, digits and dashes."),
  name: z.string().min(1),
  /** Always present: drawn when 3D models are off, still loading or missing. */
  body: proceduralBody,
  /** Optional realistic 3D model; the viewer can switch it off per species. */
  model: modelFolder.optional(),
  /** Most individuals a tank may hold, e.g. 1 or 2 for a solitary, detailed fish. */
  maxCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_INDIVIDUALS_PER_SPECIES)
    .default(MAX_INDIVIDUALS_PER_SPECIES),
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
  behavior: behavior.prefault({}),
  /** How the species swims when nothing calls for its attention; see scene/swimming. */
  swim: swimSchema.prefault({ style: "cruise" }),
  /** What the species does besides swimming about; see scene/activities. */
  activities: activitiesSchema.prefault({}),
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

/** Every kind of plant a scene can grow; the scene designer lists them. */
export const FLORA_KINDS = [
  "kelp",
  "seagrass",
  "anemone",
  "bush",
  "carpet",
  "fern",
  "stem",
] as const;

/** Every kind of object a scene can place; the scene designer lists them. */
export const PROP_KINDS = [
  "rock",
  "starfish",
  "shell",
  "brain-coral",
  "branch-coral",
  "fan-coral",
  "table-coral",
  "mushroom-coral",
  "leather-coral",
  "driftwood",
  "dragon-stone",
  "moss",
  "pebble",
] as const;

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
  /**
   * Anemones are short, swaying tentacle clumps and bushes are grape-like
   * macroalgae; both use the same sway as plants.
   */
  kind: z.enum(FLORA_KINDS),
  /** Label in the control panel; defaults to the kind. */
  name: z.string().min(1).optional(),
  count: z.number().int().min(0).max(MAX_FLORA_PER_ENTRY),
  bands: bandRange,
  /** Plant height range in meters. */
  height: orderedPair(z.number().positive(), "height"),
  color: colorOrPalette,
  /** Color the leaves turn towards the top (red-tipped stem plants); none when absent. */
  tipColor: hexColor.optional(),
  on: placement,
  /** What the plants are to fish; the kind's tags when absent (see scene/tags). */
  tags: z.array(tagSchema).optional(),
});

const prop = z.object({
  kind: z.enum(PROP_KINDS),
  /** Label in the control panel; defaults to the kind. */
  name: z.string().min(1).optional(),
  count: z.number().int().min(0).max(MAX_PROPS_PER_ENTRY),
  color: colorOrPalette,
  on: placement,
  /** Depth bands to place the entry in; each kind has a sensible default. */
  bands: bandRange.optional(),
  /** Size range (rough diameter, m); each kind has a sensible default. */
  size: orderedPair(z.number().positive(), "size").optional(),
  material: surfaceMaterial.optional(),
  /** What the items are to fish; the kind's tags when absent (see scene/tags). */
  tags: z.array(tagSchema).optional(),
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
    water: z.object({
      color: hexColor,
      fogDensity: z.number().min(0).max(1),
      /**
       * How visible the rippling underside of the surface is: 1 for the open
       * sea, low for aquariums, where it is only a thin bright band.
       */
      surface: unit.default(1),
      /** Bubble streams rising from rocks; planted aquariums usually have none. */
      bubbles: z.boolean().default(true),
    }),
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
    /** LED channels and daily cycle; the recommended reef setup when absent. */
    lights: lightsSchema,
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
