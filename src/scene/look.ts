import type { z } from "zod";

/**
 * The aquarium's look: a set of features the viewer switches on and off one
 * by one. Lighting features are built into the renderer; post-processing
 * effects are implemented in `render/effects/` and registered there. This
 * module only knows their ids, names and defaults, so the look can be
 * resolved and tested without a GPU.
 */

/** Where a pass runs: on the linear HDR image, or after tone mapping on display colors. */
export type EffectStage = "hdr" | "display";

export interface EffectDescriptor {
  readonly id: string;
  /** Label shown in the control panel. */
  readonly name: string;
  readonly stage: EffectStage;
  /** Whether a viewer who never touched the panel sees this effect. */
  readonly enabledByDefault: boolean;
  /** Schema of the effect's parameters, with defaults for every value. */
  readonly params: z.ZodType;
}

export type LookFeatureKind = "lighting" | "effect";

export interface LookFeature {
  readonly id: string;
  readonly name: string;
  readonly kind: LookFeatureKind;
  readonly enabledByDefault: boolean;
}

/** Ids of the features the renderer builds in, as opposed to registered effects. */
export type LightingFeatureId =
  "caustics" | "shadows" | "reflections" | "refractive-bubbles" | "light-shafts";

/**
 * Lighting features. Defaults favour frame rate: cheap light-shaft planes are
 * off because the volumetric-light effect draws better shafts.
 */
export const LIGHTING_FEATURES: readonly (LookFeature & { readonly id: LightingFeatureId })[] = [
  { id: "caustics", name: "Caustics", kind: "lighting", enabledByDefault: true },
  { id: "shadows", name: "Shadows", kind: "lighting", enabledByDefault: true },
  { id: "reflections", name: "Water reflections", kind: "lighting", enabledByDefault: true },
  {
    id: "refractive-bubbles",
    name: "Refractive bubbles",
    kind: "lighting",
    enabledByDefault: true,
  },
  { id: "light-shafts", name: "Light shaft planes", kind: "lighting", enabledByDefault: false },
];

/** Ids of the enabled features. */
export type Look = ReadonlySet<string>;

/** Every switchable feature: lighting first, then the registered effects in order. */
export function lookFeatures(effects: readonly EffectDescriptor[]): readonly LookFeature[] {
  const lightingIds = new Set<string>(LIGHTING_FEATURES.map((feature) => feature.id));
  const effectFeatures = effects.map((effect): LookFeature => {
    if (lightingIds.has(effect.id)) {
      throw new Error(`Effect id "${effect.id}" clashes with a lighting feature.`);
    }
    return {
      id: effect.id,
      name: effect.name,
      kind: "effect",
      enabledByDefault: effect.enabledByDefault,
    };
  });
  return [...LIGHTING_FEATURES, ...effectFeatures];
}

/**
 * Decides which features are on. A requested list (from the URL) is used as
 * is; otherwise each feature takes the viewer's saved choice or its default.
 * Unknown ids are ignored so a renamed feature never stops the aquarium.
 */
export function resolveLook(
  features: readonly LookFeature[],
  saved: Readonly<Record<string, boolean>>,
  requested?: readonly string[],
): Look {
  const enabled = features.filter((feature) =>
    requested === undefined
      ? (saved[feature.id] ?? feature.enabledByDefault)
      : requested.includes(feature.id),
  );
  return new Set(enabled.map((feature) => feature.id));
}

const STAGE_ORDER: Readonly<Record<EffectStage, number>> = { hdr: 0, display: 1 };

/** The enabled effects in rendering order: HDR stage first, registry order within a stage. */
export function lookPasses<Effect extends EffectDescriptor>(
  effects: readonly Effect[],
  look: Look,
): readonly Effect[] {
  return effects
    .filter((effect) => look.has(effect.id))
    .map((effect, index) => ({ effect, index }))
    .sort((a, b) => STAGE_ORDER[a.effect.stage] - STAGE_ORDER[b.effect.stage] || a.index - b.index)
    .map(({ effect }) => effect);
}
