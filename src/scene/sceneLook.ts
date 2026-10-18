import { z } from "zod";
import type { EffectDescriptor, Look, LookFeature } from "./look";
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

/** The id of the look without a file: every effect at its default. */
export const PLAIN_LOOK_ID = "none";
export const PLAIN_LOOK: SceneLook = sceneLookSchema.parse({ name: "None" });

/**
 * The viewer's own changes to a look, from the panel's sliders: the
 * exposure, the sun, and single effect parameters. Saved per look id.
 */
export const lookTweakSchema = z.object({
  exposure: z.number().positive().max(4).optional(),
  sun: direction.optional(),
  effects: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type LookTweak = z.output<typeof lookTweakSchema>;

/**
 * The look to draw with: the viewer's choice (a look id or PLAIN_LOOK_ID)
 * when there is one and it exists, else the scene's own, else the plain one.
 */
export function chooseLook(
  sceneLookId: string | undefined,
  choice: string | undefined,
  looks: ReadonlyMap<string, SceneLook>,
): { readonly id: string; readonly look: SceneLook } {
  const pick = (id: string | undefined): SceneLook | undefined =>
    id === PLAIN_LOOK_ID ? PLAIN_LOOK : id === undefined ? undefined : looks.get(id);
  for (const id of [choice, sceneLookId]) {
    const look = pick(id);
    if (id !== undefined && look !== undefined) return { id, look };
  }
  return { id: PLAIN_LOOK_ID, look: PLAIN_LOOK };
}

/** Effect parameters of `over` laid on those of `under`, effect by effect. */
function mergeEffects(
  under: Readonly<Record<string, Record<string, unknown>>>,
  over: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const effects: Record<string, Record<string, unknown>> = { ...under };
  for (const [id, params] of Object.entries(over)) {
    effects[id] = { ...(effects[id] ?? {}), ...params };
  }
  return effects;
}

/** Newer tweaks laid over earlier ones, parameter by parameter. */
export function mergeTweaks(earlier: LookTweak | undefined, newer: LookTweak): LookTweak {
  return {
    ...earlier,
    ...newer,
    effects: mergeEffects(earlier?.effects ?? {}, newer.effects ?? {}),
  };
}

/** The look with the viewer's tweaks laid over it, parameter by parameter. */
export function tweakLook(look: SceneLook, tweak: LookTweak | undefined): SceneLook {
  if (tweak === undefined) return look;
  const effects = mergeEffects(look.effects, tweak.effects ?? {});
  return {
    ...look,
    exposure: tweak.exposure ?? look.exposure,
    ...(tweak.sun === undefined ? {} : { sun: tweak.sun }),
    effects,
  };
}

const DEGREES = 180 / Math.PI;

/**
 * A sun direction from its height above the horizon and its turn around
 * the tank, degrees: turn 0 is behind the tank, 90 to the right.
 */
export function sunFromAngles(height: number, turn: number): [number, number, number] {
  const up = height / DEGREES;
  const around = turn / DEGREES;
  return [Math.cos(up) * Math.sin(around), Math.sin(up), -Math.cos(up) * Math.cos(around)];
}

/** The height and turn of a sun direction, degrees; see `sunFromAngles`. */
export function sunAngles(sun: readonly [number, number, number]): {
  readonly height: number;
  readonly turn: number;
} {
  const [x, y, z] = sun;
  return {
    height: Math.atan2(y, Math.hypot(x, z)) * DEGREES,
    turn: Math.atan2(x, -z) * DEGREES,
  };
}

/** Validates a look file; `id` is its name in `looks/`, used in messages. */
export function parseSceneLook(input: unknown, id: string): SceneLook {
  const result = sceneLookSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`look "${id}"`, result.error));
  }
  return result.data;
}

const lookIndexSchema = z.object({
  looks: z.array(z.string().regex(/^[a-z0-9-]+$/, "Look ids are file names: lowercase, digits, dashes.")),
});

/** Validates `public/looks/index.json`: the looks offered in the panel. */
export function parseLookIndex(input: unknown): readonly string[] {
  const result = lookIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("look index", result.error));
  }
  return result.data.looks;
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

/**
 * The features on after the viewer picks another look in the panel: what
 * the new look starts on or off is set so, what only the old one had set
 * goes off, and everything else (the viewer's own switches, what the GPU
 * fitting added) stays as it was.
 */
export function switchLookFeatures(
  current: Look,
  before: SceneLook,
  after: SceneLook,
  saved: Readonly<Record<string, boolean>>,
): Look {
  const next = new Set(current);
  for (const id of Object.keys(before.features)) {
    if (saved[id] === undefined && after.features[id] === undefined && before.features[id] === true) {
      next.delete(id);
    }
  }
  for (const [id, on] of Object.entries(after.features)) {
    if (saved[id] !== undefined) continue;
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
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
