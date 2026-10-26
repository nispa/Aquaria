import { z } from "zod";
import { activitiesSchema } from "./activities";
import { blockGrid, cellCount, MAX_BLOCK_SIZE, MIN_BLOCK_SIZE, runsTotal } from "./blocks";
import { lightsSchema } from "./lights";
import { swimSchema } from "./swimming";
import { TANK_SIZES } from "./tankMeasures";
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

export const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Expected a hex color such as #1f5fd6.");

const positive = z.number().positive();
const unit = z.number().min(0).max(1);
const band = z
  .number()
  .int()
  .min(0)
  .max(DEPTH_BAND_COUNT - 1);

export const orderedPair = (item: z.ZodNumber, label: string) =>
  z
    .tuple([item, item])
    .refine(([min, max]) => min <= max, `${label} must be written as [min, max].`);

export const bandRange = orderedPair(band, "bands");
const heightRange = orderedPair(unit, "heightRange");

const bodyColors = z
  .object({
    base: hexColor,
    accent: hexColor,
    /** Third color for richer patterns; defaults to the accent. */
    detail: hexColor.optional(),
  })
  .transform((colors) => ({ ...colors, detail: colors.detail ?? colors.accent }));

const proceduralFishBody = z.object({
  type: z.literal("procedural"),
  category: z.literal("fish").default("fish"),
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
  colors: bodyColors,
});

const proceduralCrustaceanBody = z.object({
  type: z.literal("procedural"),
  category: z.literal("crustacean"),
  /**
   * Bodies that walk on the bottom: shrimp, crab, hermit crab, and the
   * starfish, which is no crustacean but creeps the same way.
   */
  shape: z.enum(["shrimp", "crab", "hermit-crab", "starfish"]),
  pattern: z.enum(["solid", "translucent", "spotted", "banded"]).default("solid"),
  colors: bodyColors,
});

const proceduralBody = z.preprocess(
  (data) => {
    if (typeof data === "object" && data !== null && !("category" in data)) {
      return { category: "fish", ...data };
    }
    return data;
  },
  z.discriminatedUnion("category", [proceduralFishBody, proceduralCrustaceanBody]),
);

/** A 3D model: a folder in `public/assets/species/` with a glTF file and a `model.json`. */
const modelFolder = z
  .string()
  .regex(/^[a-z0-9-]+$/, "model is a folder name: lowercase letters, digits and dashes.");

/** Most colorings one model lists and one species mixes: layers of one texture array on the GPU. */
export const MAX_COLORINGS = 8;

/** A coloring of a 3D model, as its `model.json` names it. */
export const coloringId = z
  .string()
  .regex(/^[a-z0-9-]+$/, "A coloring id uses lowercase letters, digits and dashes.");

/**
 * Which colorings of its model a species wears: one id, or several with
 * weights, each fish wearing one of them (strains of guppies, platies).
 * Always a list once parsed.
 */
const coloring = z
  .union([
    coloringId.transform((id) => [{ id, weight: 1 }]),
    z
      .array(z.object({ id: coloringId, weight: positive.default(1) }))
      .min(1)
      .max(MAX_COLORINGS),
  ])
  .optional();

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
  /**
   * How it takes the viewer's torch, -1..1: above 0 it gathers in the beam
   * (sardines to a lamp), below 0 it leaves it and, if it hides, hides.
   */
  torch: z.number().min(-1).max(1).default(0),
});

export const speciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Species ids use lowercase letters, digits and dashes."),
  name: z.string().min(1),
  /** Always present: drawn when 3D models are off, still loading or missing. */
  body: proceduralBody,
  /** Optional realistic 3D model; the viewer can switch it off per species. */
  model: modelFolder.optional(),
  /** Colorings of the model the fish wear; without it, the model's own colors. */
  coloring,
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
      if (entry.coloring !== undefined && entry.model === undefined) {
        context.addIssue({
          code: "custom",
          path: ["species", index, "coloring"],
          message: `Species "${entry.id}" has a coloring but no model to wear it.`,
        });
      }
    }
  });

const vector3 = z
  .tuple([z.number(), z.number(), z.number()])
  .refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, "direction must not be a zero vector.");

const backdrop = z.discriminatedUnion("type", [
  /** Open water: the floor runs on into the distance, towards a far gradient. */
  z.object({ type: z.literal("gradient"), top: hexColor, bottom: hexColor }),
  /**
   * A home tank: a panel glued to the back glass (black, frosted white or a
   * gradient), where the floor ends.
   */
  z.object({ type: z.literal("panel"), top: hexColor, bottom: hexColor }),
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

/** Aquaria's plant generators: the plants it draws in code (an object's `recipe`). */
export const PLANT_GENERATORS = [
  "kelp",
  "seagrass",
  "anemone",
  "bush",
  "carpet",
  "fern",
  "stem",
] as const;

/** Aquaria's object generators: the objects it draws in code (an object's `recipe`). */
export const PROP_GENERATORS = [
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
export const colorOrPalette = z.union([hexColor, z.array(hexColor).min(1)]);

/** Where an entry grows: on the sand (when absent) or on the scene's rockwork ridge. */
const placement = z.enum(["sand", "rockwork"]).optional();

/**
 * Life on the rock, painted over its texture: algae on the faces turned to
 * the light, crusts of pink coralline algae in patches, darker crevices
 * underneath. Live rock in a reef looks like this; bare rock when absent.
 */
export const growthSchema = z.object({
  /** Share of the upward faces covered by algae. */
  algae: unit.default(0.6),
  algaeColor: hexColor.default("#4d6b2c"),
  /** Share of the rock crusted with coralline algae. */
  coralline: unit.default(0.3),
  corallineColor: hexColor.default("#b4708e"),
  /** Size of the patches, m. */
  patch: positive.max(2).default(0.35),
});

export type Growth = z.output<typeof growthSchema>;
export const DEFAULT_GROWTH: Growth = growthSchema.parse({});

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
  growth: growthSchema.optional(),
});

/**
 * Rockwork built from blocks (see scene/blocks): cubes of edge `size` over
 * the whole tank, each solid or empty, written as runs of alternating empty
 * and solid cells, the first one empty. The scene editor writes them.
 */
/**
 * Pores of live rock: pits dug into the surface of block rock, as deep as
 * `depth`, about half a `cell` wide, both m. Coralline crusts their rims and
 * their bottoms are dark.
 */
export const poresSchema = z.object({
  depth: z.number().positive().max(0.1).default(0.015),
  cell: z.number().positive().max(0.5).default(0.04),
});

const blocks = z.object({
  /** Edge of one block, m. */
  size: z.number().min(MIN_BLOCK_SIZE).max(MAX_BLOCK_SIZE),
  runs: z.array(z.number().int().nonnegative()),
  color: hexColor,
  material: surfaceMaterial.optional(),
  growth: growthSchema.optional(),
  /** Live rock full of pores, instead of smooth rock. */
  pores: poresSchema.optional(),
});

/** Largest count per flora entry; also the top of its panel slider. */
export const MAX_FLORA_PER_ENTRY = 200;
/** Largest count per prop entry; also the top of its panel slider. */
export const MAX_PROPS_PER_ENTRY = 50;

/**
 * A plant or object of `public/assets/objects/`, by its folder; the app
 * checks it exists (scene/objectCatalog).
 */
const objectId = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Object ids are folder names: lowercase, digits, dashes.");

/**
 * A chosen spot for one plant or object, as the scene editor writes it,
 * instead of a random one in the depth bands. What it leaves out is drawn
 * from the entry as usual.
 */
const spot = {
  /** Across the tank, m (0 = middle). */
  x: z.number(),
  /** Toward the glass, m (0 = the glass, -depth = the back wall). */
  z: z.number(),
  /**
   * Height of the base above the sand, m, e.g. on the floor of a cave;
   * when absent, it stands on the rock under the spot, or on the sand.
   */
  y: z.number().min(0).optional(),
  /** Turn around the vertical axis, degrees. */
  rotation: z.number().optional(),
  /**
   * Which of the object's shapes it takes (0, 1, 2…), e.g. the leaning
   * stone of an iwagumi; one drawn at random when absent.
   */
  variant: z.number().int().min(0).optional(),
};

const flora = z.object({
  /**
   * Anemones are short, swaying tentacle clumps and bushes are grape-like
   * macroalgae; both use the same sway as plants.
   */
  kind: objectId,
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
  /** Chosen spots, one plant each, at most `count`; random spots when absent. */
  at: z
    .array(z.object({ ...spot, /** Plant height, m. */ height: positive.optional() }))
    .max(MAX_FLORA_PER_ENTRY)
    .optional(),
});

const prop = z.object({
  kind: objectId,
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
  /** Chosen spots, one item each, at most `count`; random spots when absent. */
  at: z
    .array(z.object({ ...spot, /** Rough diameter, m. */ size: positive.optional() }))
    .max(MAX_PROPS_PER_ENTRY)
    .optional(),
});

const fauna = z.object({
  species: z.string(),
  count: z.number().int().min(0).max(MAX_INDIVIDUALS_PER_SPECIES),
});

/**
 * The waves of the surface, seen from below (the "Surface waves" lighting
 * feature). Every value has a default: gentle waves on a calm sea.
 */
export const wavesSchema = z.object({
  /** Height of the tallest waves, crest to trough, m. */
  height: z.number().min(0).max(0.5).default(0.04),
  /** Length of the longest waves, m; shorter ones ride on them. */
  length: positive.max(10).default(1.6),
  /** How fast they travel: 1 is as fast as real waves of their length. */
  speed: z.number().min(0).max(4).default(0.6),
  /** Strength of the sun's glare through the waves (0 none). */
  glare: z.number().min(0).max(3).default(1),
  /**
   * How readily the sky shows through: 0 is true to physics (from a tank the
   * surface mostly mirrors the water), higher opens bright patches where the
   * waves tilt, as in photographs of the open sea.
   */
  window: unit.default(0.35),
});

export type Waves = z.output<typeof wavesSchema>;
export const DEFAULT_WAVES: Waves = wavesSchema.parse({});

/** The fewest seconds between two passes of a visitor: they are rare by nature. */
const MIN_VISIT_INTERVAL = 10;

/**
 * Scenery fauna: animals that swim past far behind the tank now and then,
 * in the haze, such as sea turtles. They have no card, cannot be tapped and
 * take no notice of the fish. `model` is a folder in public/assets/animals.
 */
const visitor = z.object({
  model: z.string().regex(/^[a-z0-9-]+$/),
  /** How many of them, each coming on its own. */
  count: z.number().int().min(1).max(4).default(1),
  /** Body length, m. */
  length: positive.max(3).default(1),
  /** Cruising speed, m/s. */
  speed: positive.max(2).default(0.35),
  /** Seconds between passes, drawn in this range; never in the first seconds. */
  every: orderedPair(z.number().min(MIN_VISIT_INTERVAL), "every").default([40, 120]),
  /** How far behind the back of the tank they pass, m. */
  distance: orderedPair(positive, "distance").default([4, 9]),
  /** At what height, as a share of the tank height. */
  height: heightRange.default([0.3, 0.8]),
});

export type Visitor = z.output<typeof visitor>;

export const sceneSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    seed: z.number().int().nonnegative(),
    /** A look in `public/looks/` (exposure, sun, effect parameters); see scene/sceneLook. */
    look: z
      .string()
      .regex(/^[a-z0-9-]+$/, "look is a file name: lowercase letters, digits and dashes.")
      .optional(),
    /** Tank size in meters: x = width, y = height, z = depth away from the glass. */
    tank: z.object({ width: positive, height: positive, depth: positive }),
    /**
     * The size class the scene is written for (see scene/tankSize); the one
     * its `tank` measures are closest to when absent. The viewer can see the
     * scene at another size.
     */
    size: z.enum(TANK_SIZES).optional(),
    water: z.object({
      color: hexColor,
      fogDensity: z.number().min(0).max(1),
      /**
       * How visible the rippling underside of the surface is: 1 for the open
       * sea, low for aquariums, where it is only a thin bright band.
       */
      surface: unit.default(1),
      waves: wavesSchema.default(DEFAULT_WAVES),
      /** Bubble streams rising from rocks; planted aquariums usually have none. */
      bubbles: z.boolean().default(true),
      /**
       * How much the plants pearl on a bright afternoon, 0..1: tiny oxygen
       * bubbles rising from the leaves of a planted tank (see sim/pearling).
       */
      pearling: unit.default(0),
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
    floor: z.object({
      color: hexColor,
      material: surfaceMaterial.optional(),
      /**
       * How high the floor climbs from the front glass to the back, as a
       * share of the tank height: 0.15 for the slope of a planted tank.
       */
      rise: z.number().min(0).max(0.5).default(0),
      /** The sand dunes: 1 for the usual ones of a tank this size, 0 for a flat floor. */
      dunes: z.number().min(0).max(2).default(1),
      /**
       * Contact shadows: how much the sand darkens round the foot of the
       * rock and of what stands on it, 0 none to 1 black.
       */
      contact: unit.default(0),
    }),
    /** LED channels and daily cycle; the recommended reef setup when absent. */
    lights: lightsSchema,
    rockwork: rockwork.optional(),
    blocks: blocks.optional(),
    flora: z.array(flora).default([]),
    props: z.array(prop).default([]),
    fauna: z.array(fauna),
    visitors: z.array(visitor).default([]),
  })
  .superRefine((scene, context) => {
    if (scene.blocks !== undefined) {
      const cells = cellCount(blockGrid(scene.tank, scene.blocks.size));
      const covered = runsTotal(scene.blocks.runs);
      if (covered !== cells) {
        context.addIssue({
          code: "custom",
          path: ["blocks", "runs"],
          message: `The runs cover ${String(covered)} cells, but the tank's grid has ${String(cells)}.`,
        });
      }
    }
    const { width, height, depth } = scene.tank;
    for (const section of ["flora", "props"] as const) {
      scene[section].forEach((entry, index) => {
        entry.at?.forEach((place, spotIndex) => {
          const inside =
            Math.abs(place.x) <= width / 2 &&
            place.z <= 0 &&
            place.z >= -depth &&
            (place.y ?? 0) <= height;
          if (inside) return;
          context.addIssue({
            code: "custom",
            path: [section, index, "at", spotIndex],
            message: "The spot is outside the tank.",
          });
        });
      });
    }
    // Blocks are rockwork too: plants and objects may grow on them.
    if (scene.rockwork !== undefined || scene.blocks !== undefined) return;
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
export type PlantGenerator = (typeof PLANT_GENERATORS)[number];
export type PropGenerator = (typeof PROP_GENERATORS)[number];
export type FloraSpec = z.output<typeof flora>;
export type PropSpec = z.output<typeof prop>;
export type SurfaceMaterialSpec = z.output<typeof surfaceMaterial>;
export type RockworkSpec = z.output<typeof rockwork>;
export type BlocksSpec = z.output<typeof blocks>;
export type ProceduralFishBody = z.output<typeof proceduralFishBody>;
export type ProceduralCrustaceanBody = z.output<typeof proceduralCrustaceanBody>;
export type ProceduralBody = z.output<typeof proceduralBody>;
