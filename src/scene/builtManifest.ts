import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";
import { coloringId } from "./schema";

/**
 * What `scripts/blender/fishbuild.py` measures on the fish it builds and
 * writes to `model-values.json`: the colorings it painted, and where the
 * pectoral fins and the gill covers are in the fish frame. The fish maker
 * lays them over the species' `model.json` (see docs/FISH_MODELS.md).
 */
const framePoint = z.tuple([z.number(), z.number()]);

const builtValuesSchema = z.object({
  colorings: z.record(
    coloringId,
    z.object({ name: z.string().min(1), texture: z.string().min(1) }),
  ),
  fins: z
    .object({
      pectoral: z.object({
        root: z.tuple([framePoint, framePoint]),
        side: z.number(),
        front: z.number(),
        back: z.number(),
        top: z.number(),
        bottom: z.number(),
      }),
    })
    .optional(),
  gills: z.object({ edge: z.number(), top: z.number(), bottom: z.number() }).optional(),
});

export type BuiltValues = z.output<typeof builtValuesSchema>;

/** Validates a `model-values.json` written by the builder. */
export function parseBuiltValues(input: unknown): BuiltValues {
  const result = builtValuesSchema.safeParse(input);
  if (!result.success) throw new SceneValidationError(formatIssues("model values", result.error));
  return result.data;
}

/** Where the recipes live in the repository, for a new model's credit. */
const REPOSITORY_FILES = "https://github.com/nispa/Aquaria/blob/main/public/assets/species";

type Manifest = Record<string, unknown>;

const objectOr = (value: unknown): Manifest =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Manifest) : {};

/** A new fish's manifest: made by the builder, so its eyes have bones and its mouth a shape key. */
function newManifest(speciesId: string, name: string): Manifest {
  return {
    name,
    file: "model.glb",
    forward: "+x",
    up: "+y",
    mouth: { morphTarget: "MouthOpen" },
    eyes: { bones: ["Eye.L", "Eye.R"] },
    credit: {
      author: "Aquaria (fish.json, built by scripts/blender/fishbuild.py)",
      source: `${REPOSITORY_FILES}/${speciesId}/fish.json`,
      license: "CC0-1.0",
    },
  };
}

/**
 * The species' `model.json` after a build: the builder's values laid over
 * the manifest there was (or a new one), keeping what it does not measure,
 * such as how far the fins sweep or how the gill cover curves.
 */
export function builtManifest(
  existing: unknown,
  speciesId: string,
  name: string,
  values: BuiltValues,
): Manifest {
  const base = existing === undefined ? newManifest(speciesId, name) : objectOr(existing);
  const { credit, ...rest } = base;
  const fins = objectOr(rest.fins);
  return {
    ...rest,
    ...(values.gills === undefined ? {} : { gills: { ...objectOr(rest.gills), ...values.gills } }),
    ...(values.fins === undefined
      ? {}
      : { fins: { ...fins, pectoral: { ...objectOr(fins.pectoral), ...values.fins.pectoral } } }),
    colorings: values.colorings,
    // The credit stays last, as in every manifest.
    ...(credit === undefined ? {} : { credit }),
  };
}
