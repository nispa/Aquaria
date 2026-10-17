import { z } from "zod";
import { ALLOWED_MODEL_LICENSES } from "./modelManifest";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * A surface material is a folder in `public/assets/materials/<id>/`: two
 * KTX2 textures, a normal map and a packed map (R displacement, G roughness,
 * B brightness detail), and this manifest, `material.json`, with its name,
 * its tile size and who made it. Objects point at it by a relative path.
 */
export const MATERIALS_FOLDER = "assets/materials";
export const MATERIAL_MANIFEST_FILE = "material.json";

const textureFile = z
  .string()
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.ktx2$/,
    "Textures must be .ktx2 files inside the material folder.",
  );

export const materialManifestSchema = z.object({
  name: z.string().min(1),
  textures: z
    .object({
      normal: textureFile.default("normal.ktx2"),
      surface: textureFile.default("surface.ktx2"),
    })
    .default({ normal: "normal.ktx2", surface: "surface.ktx2" }),
  /** Size of one texture tile, m, unless a scene sets its own. */
  tileSize: z.number().positive().default(1),
  credit: z.object({
    author: z.string().min(1),
    source: z.url(),
    license: z.enum(ALLOWED_MODEL_LICENSES),
  }),
});

export type MaterialManifest = z.output<typeof materialManifestSchema>;

/** Validates a material's `material.json`; `id` is its folder, used in messages. */
export function parseMaterialManifest(input: unknown, id: string): MaterialManifest {
  const result = materialManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`material "${id}"`, result.error));
  }
  return result.data;
}

/** The material's textures, relative to the site root. */
export function materialTextureUrls(
  id: string,
  manifest: MaterialManifest,
): { readonly normal: string; readonly surface: string } {
  const folder = `${MATERIALS_FOLDER}/${id}`;
  return {
    normal: `${folder}/${manifest.textures.normal}`,
    surface: `${folder}/${manifest.textures.surface}`,
  };
}
