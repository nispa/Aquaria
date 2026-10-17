import { z } from "zod";
import { ALLOWED_MODEL_LICENSES } from "./modelManifest";
import { formatIssues, SceneValidationError } from "./parse";
import { FLORA_KINDS, PROP_KINDS } from "./schema";
import { parseTraits, type ObjectTraits } from "./traits";

/**
 * A plant or an object is a folder in `public/assets/objects/<id>/`: this
 * manifest, `object.json`, and optionally a standard 3D model (`.glb`) any
 * program opens. The manifest is the source of truth: what the object is
 * called, how Aquaria draws it (the model, or one of its generators, the
 * recipe), its material, and its traits, the Aquaria features a 3D file
 * cannot say (see scene/traits). See docs/OBJECTS.md.
 */
export const OBJECTS_FOLDER = "assets/objects";
export const OBJECT_MANIFEST_FILE = "object.json";
/** All asset paths must stay inside this folder of the site. */
const ASSETS_ROOT = "assets";

/** Aquaria's generators: the procedural plants and objects it draws in code. */
export const OBJECT_GENERATORS = [...FLORA_KINDS, ...PROP_KINDS] as const;

const SEED_MAX = 2 ** 32 - 1;

const modelFile = z
  .string()
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.(?:glb|gltf)$/,
    "model must be a .glb or .gltf path inside the object folder.",
  );

const materialFile = z
  .string()
  .regex(/^[\w./-]+\/material\.json$/, "material must be a path to a material.json file.");

const seed = z.number().int().min(0).max(SEED_MAX);

export const objectManifestSchema = z
  .object({
    name: z.string().min(1),
    /** Plants grow and sway; objects are things set down. */
    category: z.enum(["plant", "object"]),
    /** The 3D model, a file in the folder. */
    model: modelFile.optional(),
    /** The surface, a path to a `material.json`, relative to this file. */
    material: materialFile.optional(),
    /** Drawn by one of Aquaria's generators, a different variant per seed. */
    recipe: z
      .object({
        generator: z.enum(OBJECT_GENERATORS),
        /** The seeds variants are drawn from. */
        seeds: z.tuple([seed, seed]).default([0, SEED_MAX]),
        /** Settings of the generator, if it has any. */
        params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
      })
      .optional(),
    /** Aquaria features by trait id; checked by parseTraits. */
    traits: z.record(z.string(), z.unknown()).default({}),
    credit: z
      .object({
        author: z.string().min(1),
        source: z.url(),
        license: z.enum(ALLOWED_MODEL_LICENSES),
      })
      .optional(),
  })
  .refine((object) => object.model !== undefined || object.recipe !== undefined, {
    message: "An object needs a model or a recipe.",
    path: ["model"],
  })
  .refine((object) => object.model === undefined || object.credit !== undefined, {
    message: "A model needs a credit: author, source and license.",
    path: ["credit"],
  });

export type ObjectManifest = Omit<z.output<typeof objectManifestSchema>, "traits"> & {
  readonly traits: ObjectTraits;
};

export interface ParsedObject {
  readonly manifest: ObjectManifest;
  /** Things skipped rather than refused, e.g. traits Aquaria does not know. */
  readonly warnings: readonly string[];
}

/** Validates an object's `object.json`; `id` is its folder, used in messages. */
export function parseObjectManifest(input: unknown, id: string): ParsedObject {
  const result = objectManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`object "${id}"`, result.error));
  }
  const { traits, warnings } = parseTraits(result.data.traits, id);
  return { manifest: { ...result.data, traits }, warnings };
}

/** Folder of an object, relative to the site root. */
export function objectFolderUrl(id: string): string {
  return `${OBJECTS_FOLDER}/${id}`;
}

/**
 * A path relative to a folder of the site, resolved and normalized; undefined
 * when it would leave the assets, so a manifest cannot reach other files.
 */
export function resolveAssetPath(folder: string, relative: string): string | undefined {
  const parts = folder.split("/");
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts[0] === ASSETS_ROOT && parts.length > 1 ? parts.join("/") : undefined;
}

/** The object's material file from the site root, when it has one inside the assets. */
export function objectMaterialUrl(id: string, manifest: ObjectManifest): string | undefined {
  return manifest.material === undefined
    ? undefined
    : resolveAssetPath(objectFolderUrl(id), manifest.material);
}
