import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";
import { hexColor, type SpeciesCatalog } from "./schema";

/**
 * A 3D fish model is a folder in `public/assets/species/<id>/`: a glTF file
 * (a self-contained `.glb`, or a `.gltf` with its `.bin` and textures next to
 * it) plus this manifest, `model.json`, which says how the model is oriented,
 * how it swims and who made it.
 */
export const SPECIES_MODELS_FOLDER = "assets/species";
export const MODEL_MANIFEST_FILE = "model.json";

/**
 * Licenses that let anyone reuse, change and redistribute the model, also
 * commercially, so the project can stay open and free. SPDX identifiers.
 */
export const ALLOWED_MODEL_LICENSES = [
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
] as const;

/** Tail sweep of a model that does not set one, in body lengths. */
export const DEFAULT_MODEL_SWIM_AMPLITUDE = 0.07;
const MAX_SWIM_AMPLITUDE = 0.2;
/** How far an eye turns at full gaze unless the manifest says, degrees. */
const DEFAULT_EYE_TURN = 20;
/** Fish eyes turn a few tens of degrees; more would show the back of the eyeball. */
const MAX_EYE_TURN = 45;
/** The pupil's share of a painted eye's radius unless the manifest says. */
const DEFAULT_PUPIL_SHARE = 0.65;
/** How far a jaw drops at most unless the manifest says, body lengths. */
const DEFAULT_JAW_DROP = 0.02;
/** How far the gill covers lift at most unless the manifest says, body lengths. */
const DEFAULT_GILL_OPEN = 0.006;
/** Breaths a second unless the manifest says; small fish breathe about once a second. */
const DEFAULT_GILL_RATE = 1.1;

/**
 * A place on the fish, in the fish frame every model is brought to: one body
 * length along x, snout at +0.5, tail at -0.5, dorsal fin up (+y). Measure it
 * on a side view of the model; docs/FISH_MODELS.md shows how.
 */
const bodyLengths = z.number().min(-0.6).max(0.6);

const axis = z.enum(["+x", "-x", "+y", "-y", "+z", "-z"]);

const relativeFile = z
  .string()
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.(?:glb|gltf)$/,
    "file must be a .glb or .gltf path inside the model folder.",
  );

export const modelManifestSchema = z
  .object({
    name: z.string().min(1),
    file: relativeFile.default("model.glb"),
    /** Axis of the model the snout points along. */
    forward: axis.default("+x"),
    /** Axis of the model that points to the dorsal fin. */
    up: axis.default("+y"),
    /** Tail sweep while cruising, in body lengths. */
    swimAmplitude: z.number().min(0).max(MAX_SWIM_AMPLITUDE).default(DEFAULT_MODEL_SWIM_AMPLITUDE),
    /**
     * How the mouth opens when the fish eats: a morph target (Blender shape
     * key) with the mouth wide open, or, for a model without one, a jaw:
     * the points ahead of `start` and below the mouth `line` (fish frame)
     * drop by up to `drop` at the tip of the snout. Without it the mouth
     * stays shut.
     */
    mouth: z
      .object({
        morphTarget: z.string().min(1).optional(),
        jaw: z
          .object({
            start: bodyLengths,
            line: bodyLengths,
            drop: z.number().min(0).max(0.1).default(DEFAULT_JAW_DROP),
          })
          .optional(),
      })
      .refine((mouth) => (mouth.morphTarget === undefined) !== (mouth.jaw === undefined), {
        message: "A mouth is either a morphTarget or a jaw.",
      })
      .optional(),
    /**
     * Eyes that glance the way the fish is about to turn. Either the bones
     * (Blender armature bones) the eyeballs are weighted to, their heads at
     * the eyeballs' centres, turning up to `turn` degrees; or, for a model
     * whose eyes are only painted on, an eye `painted` over them: its centre
     * (x, y in the fish frame, on both sides), radius, iris color and the
     * pupil's share of the radius; the pupil slides with the gaze. Without
     * it the eyes stay as modelled.
     */
    eyes: z
      .object({
        bones: z.array(z.string().min(1)).min(1).max(2).optional(),
        painted: z
          .object({
            center: z.tuple([bodyLengths, bodyLengths]),
            radius: z.number().positive().max(0.1),
            pupil: z.number().min(0.2).max(0.9).default(DEFAULT_PUPIL_SHARE),
            iris: hexColor,
          })
          .optional(),
        turn: z.number().min(0).max(MAX_EYE_TURN).default(DEFAULT_EYE_TURN),
      })
      .refine((eyes) => (eyes.bones === undefined) !== (eyes.painted === undefined), {
        message: "Eyes are either bones or painted.",
      })
      .optional(),
    /**
     * Gill covers that breathe: the cover's rear edge (x) and how far it
     * reaches up and down (y, fish frame); it lifts away from the body by up
     * to `open` body lengths, `rate` times a second, each fish at its own
     * moment. Without it the gills stay shut.
     */
    gills: z
      .object({
        edge: bodyLengths,
        top: bodyLengths,
        bottom: bodyLengths,
        open: z.number().min(0).max(0.03).default(DEFAULT_GILL_OPEN),
        rate: z.number().positive().max(4).default(DEFAULT_GILL_RATE),
        /**
         * How the edge bends: it lies at edge + curve * (y - middle)^2, so a
         * positive curve sets it furthest back halfway up, as on most fish.
         */
        curve: z.number().min(0).max(20).default(0),
      })
      .refine((gills) => gills.top > gills.bottom, { message: "top must be above bottom." })
      .optional(),
    credit: z.object({
      author: z.string().min(1),
      source: z.url(),
      license: z.enum(ALLOWED_MODEL_LICENSES),
    }),
  })
  .refine(({ forward, up }) => forward[1] !== up[1], {
    message: "up must be perpendicular to forward.",
    path: ["up"],
  });

export type ModelAxis = z.output<typeof axis>;
export type ModelManifest = z.output<typeof modelManifestSchema>;

/** Validates a model's `model.json`; `id` is the model folder, used in error messages. */
export function parseModelManifest(input: unknown, id: string): ModelManifest {
  const result = modelManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`model manifest "${id}"`, result.error));
  }
  return result.data;
}

/** Folder of a model, relative to the site root. */
export function modelFolderUrl(id: string): string {
  return `${SPECIES_MODELS_FOLDER}/${id}`;
}

/** The glTF file of a model, relative to the site root. */
export function modelFileUrl(id: string, manifest: ModelManifest): string {
  return `${modelFolderUrl(id)}/${manifest.file}`;
}

/** The model folders the catalog's species use, each once. */
export function modelIdsOf(catalog: SpeciesCatalog): string[] {
  const ids = catalog.species.flatMap((species) =>
    species.model === undefined ? [] : [species.model],
  );
  return [...new Set(ids)];
}
