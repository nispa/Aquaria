import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";
import type { SpeciesCatalog } from "./schema";

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
    /** Morph target (Blender shape key) that opens the mouth; without it the mouth stays shut. */
    mouth: z.object({ morphTarget: z.string().min(1) }).optional(),
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

/** The model folders the catalog's glTF species use, each once. */
export function modelIdsOf(catalog: SpeciesCatalog): string[] {
  const ids = catalog.species.flatMap((species) =>
    species.body.type === "gltf" ? [species.body.model] : [],
  );
  return [...new Set(ids)];
}
