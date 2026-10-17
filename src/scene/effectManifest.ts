import { z } from "zod";
import { ALLOWED_MODEL_LICENSES } from "./modelManifest";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * A post-processing effect made of files: a folder in `public/effects/<id>/`
 * with this manifest, `effect.json`, and a GLSL fragment shader. Aquaria
 * loads it at startup next to its own effects, with a switch in the panel,
 * so an artist can add one without touching the code. GLSL only runs on the
 * GPU, which is why a shader file is safe to load from anywhere.
 */
export const EFFECTS_FOLDER = "effects";
export const EFFECT_MANIFEST_FILE = "effect.json";
const DEFAULT_SHADER_FILE = "effect.glsl";

/**
 * Uniforms Aquaria gives every effect; a parameter may not take their names.
 * tDiffuse: the frame so far; uTime: seconds; uResolution: pixels; uFrame: frame count.
 */
export const EFFECT_UNIFORMS = ["tDiffuse", "uTime", "uResolution", "uFrame"] as const;

/** A parameter becomes a `uniform float` of the same name in the shader. */
const GLSL_NAME = /^[a-z][A-Za-z0-9]*$/;

const shaderFile = z
  .string()
  .regex(/^[\w-]+\.glsl$/, "shader must be a .glsl file in the effect's folder.");

const param = z
  .object({
    min: z.number(),
    max: z.number(),
    default: z.number(),
  })
  .refine((range) => range.min <= range.default && range.default <= range.max, {
    message: "default must lie between min and max.",
  });

export const effectManifestSchema = z.object({
  name: z.string().min(1),
  /** `hdr` runs on the linear image before tone mapping, `display` after. */
  stage: z.enum(["hdr", "display"]).default("display"),
  /** How it joins the look at startup, see scene/look's FeatureStartup. */
  startup: z.enum(["base", "added", "manual"]).default("manual"),
  /** The fragment shader, a file in the folder. */
  shader: shaderFile.default(DEFAULT_SHADER_FILE),
  /** Settings by uniform name, each with its range and the tuned default. */
  params: z
    .record(
      z
        .string()
        .regex(
          GLSL_NAME,
          "A parameter is a GLSL name: a lowercase letter, then letters and digits.",
        )
        .refine((name) => !(EFFECT_UNIFORMS as readonly string[]).includes(name), {
          message: "This name is a uniform Aquaria gives every effect.",
        }),
      param,
    )
    .default({}),
  credit: z
    .object({
      author: z.string().min(1),
      source: z.url(),
      license: z.enum(ALLOWED_MODEL_LICENSES),
    })
    .optional(),
});

export type EffectManifest = z.output<typeof effectManifestSchema>;
export type EffectParam = EffectManifest["params"][string];

/** Validates an effect's `effect.json`; `id` is its folder, used in messages. */
export function parseEffectManifest(input: unknown, id: string): EffectManifest {
  const result = effectManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`effect "${id}"`, result.error));
  }
  return result.data;
}

const effectIndexSchema = z.object({
  effects: z.array(
    z.string().regex(/^[a-z0-9-]+$/, "Effect ids are folder names: lowercase, digits, dashes."),
  ),
});

/** Validates `public/effects/index.json`: the effect folders. */
export function parseEffectIndex(input: unknown): readonly string[] {
  const result = effectIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("effect index", result.error));
  }
  return result.data.effects;
}

/** Folder of an effect, relative to the site root. */
export function effectFolderUrl(id: string): string {
  return `${EFFECTS_FOLDER}/${id}`;
}

/** The effect's shader file from the site root. */
export function effectShaderUrl(id: string, manifest: EffectManifest): string {
  return `${effectFolderUrl(id)}/${manifest.shader}`;
}
