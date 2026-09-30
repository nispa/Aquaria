import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * Shader packs: a "look" for the aquarium, chosen at runtime. A pack lists
 * lighting options and post-processing passes by effect id. Effects are
 * implemented in `render/effects/` and registered there; this module only
 * knows their ids, stages and parameter schemas, so packs can be validated
 * without a GPU.
 */

/** Where a pass runs: on the linear HDR image, or after tone mapping on display colors. */
export type EffectStage = "hdr" | "display";

export interface EffectDescriptor {
  readonly id: string;
  readonly stage: EffectStage;
  /** Schema of the effect's parameters, with defaults for every optional value. */
  readonly params: z.ZodType;
}

const PACK_ID = /^[a-z0-9-]+$/;
const SHADOW_MAP_SIZES = [512, 1024, 2048, 4096] as const;
const DEFAULT_SHADOW_MAP_SIZE = 2048;

const shaderPackSchema = z.object({
  id: z.string().regex(PACK_ID, "Pack ids use lowercase letters, digits and dashes."),
  name: z.string().min(1),
  description: z.string().optional(),
  lighting: z
    .object({
      shadows: z
        .object({
          enabled: z.boolean().default(false),
          mapSize: z
            .union(SHADOW_MAP_SIZES.map((size) => z.literal(size)))
            .default(DEFAULT_SHADOW_MAP_SIZE),
        })
        .default({ enabled: false, mapSize: DEFAULT_SHADOW_MAP_SIZE }),
      /** Image-based lighting from the water around the tank (reflections, sheen). */
      environment: z.boolean().default(false),
      /** Tone-mapping exposure multiplier. */
      exposure: z.number().positive().default(1),
    })
    .default({
      shadows: { enabled: false, mapSize: DEFAULT_SHADOW_MAP_SIZE },
      environment: false,
      exposure: 1,
    }),
  /** Sprites are cheap; refractive bubbles bend and reflect the scene behind them. */
  bubbles: z.enum(["sprite", "refractive"]).default("sprite"),
  /**
   * Cheap light-shaft planes. Packs using screen-space volumetric light turn
   * them off: the planes would double the shafts and show up in depth passes.
   */
  lightShafts: z.boolean().default(true),
  passes: z.array(
    z.object({
      effect: z.string(),
      params: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
});

export type ShaderPackInput = z.input<typeof shaderPackSchema>;

export interface ResolvedPass {
  readonly effect: EffectDescriptor;
  readonly params: unknown;
}

export interface ShaderPack {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly lighting: z.output<typeof shaderPackSchema>["lighting"];
  readonly bubbles: z.output<typeof shaderPackSchema>["bubbles"];
  readonly lightShafts: boolean;
  /** HDR passes first, then display passes; written order kept within each stage. */
  readonly passes: readonly ResolvedPass[];
}

const STAGE_ORDER: Readonly<Record<EffectStage, number>> = { hdr: 0, display: 1 };

/** Validates a pack file and checks every pass against the registered effects. */
export function resolveShaderPack(
  input: unknown,
  effects: readonly EffectDescriptor[],
): ShaderPack {
  const result = shaderPackSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("shader pack", result.error));
  }
  const pack = result.data;
  const byId = new Map(effects.map((effect) => [effect.id, effect]));

  const passes = pack.passes.map((pass, index): ResolvedPass => {
    const effect = byId.get(pass.effect);
    if (effect === undefined) {
      const available = effects.map((known) => known.id).join(", ");
      throw new SceneValidationError(
        `Invalid shader pack "${pack.id}": unknown effect "${pass.effect}". Available: ${available}.`,
      );
    }
    const params = effect.params.safeParse(pass.params);
    if (!params.success) {
      const prefixed = new z.ZodError(
        params.error.issues.map((issue) => ({
          ...issue,
          path: ["passes", index, "params", ...issue.path],
        })),
      );
      throw new SceneValidationError(formatIssues(`shader pack "${pack.id}"`, prefixed));
    }
    return { effect, params: params.data };
  });

  const ordered = passes
    .map((pass, index) => ({ pass, index }))
    .sort(
      (a, b) =>
        STAGE_ORDER[a.pass.effect.stage] - STAGE_ORDER[b.pass.effect.stage] || a.index - b.index,
    )
    .map(({ pass }) => pass);

  return {
    id: pack.id,
    name: pack.name,
    ...(pack.description === undefined ? {} : { description: pack.description }),
    lighting: pack.lighting,
    bubbles: pack.bubbles,
    lightShafts: pack.lightShafts,
    passes: ordered,
  };
}

const shaderPackIndexSchema = z.object({
  packs: z.array(z.string().regex(PACK_ID)).min(1),
});

export interface ShaderPackIndex {
  readonly packs: readonly string[];
  readonly defaultPack: string;
}

/** Reads `shaderpacks/index.json`; the first listed pack is the default. */
export function parseShaderPackIndex(input: unknown): ShaderPackIndex {
  const result = shaderPackIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("shader pack index", result.error));
  }
  const [defaultPack] = result.data.packs;
  if (defaultPack === undefined) {
    throw new SceneValidationError("Invalid shader pack index: no packs listed.");
  }
  return { packs: result.data.packs, defaultPack };
}

/**
 * Picks the pack to use: the first candidate listed in the index (URL option,
 * then saved preference), otherwise the index default. Unknown ids are skipped
 * so a renamed pack never stops the aquarium from starting.
 */
export function selectPackId(
  index: ShaderPackIndex,
  candidates: readonly (string | undefined)[],
): string {
  return (
    candidates.find(
      (candidate): candidate is string =>
        candidate !== undefined && index.packs.includes(candidate),
    ) ?? index.defaultPack
  );
}
