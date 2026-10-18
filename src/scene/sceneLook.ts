import { z } from "zod";
import type { EffectDescriptor, LookFeature } from "./look";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * A scene's look: a file in `public/looks/<id>.json` that a scene names
 * (`"look": "hero"`). It sets the exposure, where the sun stands, and the
 * tuned parameters of the effects, so a dark, dramatic open-sea scene and a
 * bright home tank draw with the same effects. It may also say which
 * features a scene starts with; the viewer's own switches still win.
 */
export const LOOKS_FOLDER = "looks";

/** Tone-mapping exposure when the scene names no look. */
export const DEFAULT_EXPOSURE = 1.05;

const direction = z
  .tuple([z.number(), z.number(), z.number()])
  .refine(([x, y, z]) => x !== 0 || y !== 0 || z !== 0, "sun must not be a zero vector.");

export const sceneLookSchema = z.object({
  name: z.string().min(1),
  /** Brightness of the whole picture before tone mapping: below 1 is darker. */
  exposure: z.number().positive().max(4).default(DEFAULT_EXPOSURE),
  /**
   * Where the sunlight comes from, as a direction from the middle of the tank
   * (x right, y up, z towards the glass); the light, its shadows and its glow
   * follow it. Above, a little right and in front when absent.
   */
  sun: direction.optional(),
  /**
   * Features by id the scene starts with on (true) or leaves to the viewer
   * (false), e.g. the surface waves an open-sea look is made for.
   */
  features: z.record(z.string(), z.boolean()).default({}),
  /** Parameters by effect id; effects left out keep their defaults. */
  effects: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type SceneLook = z.output<typeof sceneLookSchema>;

/** Validates a look file; `id` is its name in `looks/`, used in messages. */
export function parseSceneLook(input: unknown, id: string): SceneLook {
  const result = sceneLookSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`look "${id}"`, result.error));
  }
  return result.data;
}

/** The look file of a look id, from the site root. */
export function sceneLookUrl(id: string): string {
  return `${LOOKS_FOLDER}/${id}.json`;
}

/** The parameters an effect is built with: the look's, or none (its defaults). */
export function effectParams(look: SceneLook | undefined, effectId: string): unknown {
  return look?.effects[effectId] ?? {};
}

/**
 * The features as the scene starts them: those the look switches on are
 * always on unless the viewer turned them off, those it switches off wait
 * for the viewer.
 */
export function withLookStartup(
  features: readonly LookFeature[],
  look: SceneLook | undefined,
): readonly LookFeature[] {
  return features.map((feature) => {
    const wanted = look?.features[feature.id];
    if (wanted === undefined) return feature;
    return { ...feature, startup: wanted ? "base" : "manual" };
  });
}

export interface LookParamIssues {
  /** Effects the look names that no one provides (perhaps a missing effect folder). */
  readonly unknown: readonly string[];
  /** One message per effect whose parameters do not pass its schema. */
  readonly invalid: readonly string[];
}

/** Checks a look's parameters against the effects that will draw them. */
export function lookParamIssues(
  look: SceneLook,
  effects: readonly EffectDescriptor[],
): LookParamIssues {
  const byId = new Map(effects.map((effect) => [effect.id, effect]));
  const unknown: string[] = [];
  const invalid: string[] = [];
  for (const [id, params] of Object.entries(look.effects)) {
    const effect = byId.get(id);
    if (effect === undefined) {
      unknown.push(id);
      continue;
    }
    const result = effect.params.safeParse(params);
    if (!result.success) invalid.push(formatIssues(`"${id}" parameters`, result.error));
  }
  return { unknown, invalid };
}
