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

/**
 * How a feature joins the look when the aquarium starts: `base` is always
 * on (it costs next to nothing), `added` is switched on by the startup
 * calibration when the GPU has room for it (and on by default when there is
 * no calibration), `manual` stays off until the viewer turns it on.
 */
export type FeatureStartup = "base" | "added" | "manual";

export interface EffectDescriptor {
  readonly id: string;
  /** Label shown in the control panel. */
  readonly name: string;
  readonly stage: EffectStage;
  /** How it joins the look at startup; see `FeatureStartup`. */
  readonly startup: FeatureStartup;
  /** Schema of the effect's parameters, with defaults for every value. */
  readonly params: z.ZodType;
}

export type LookFeatureKind = "lighting" | "effect";

export interface LookFeature {
  readonly id: string;
  readonly name: string;
  readonly kind: LookFeatureKind;
  readonly startup: FeatureStartup;
}

/** Ids of the features the renderer builds in, as opposed to registered effects. */
export type LightingFeatureId =
  "caustics" | "shadows" | "reflections" | "refractive-bubbles" | "light-shafts" | "fluorescence";

/**
 * Lighting features, in the order the startup calibration tries them.
 * Caustics and fluorescence cost next to nothing; light-shaft planes are
 * left to the viewer because the volumetric-light effect draws better shafts.
 */
export const LIGHTING_FEATURES: readonly (LookFeature & { readonly id: LightingFeatureId })[] = [
  { id: "caustics", name: "Caustics", kind: "lighting", startup: "base" },
  { id: "shadows", name: "Shadows", kind: "lighting", startup: "added" },
  { id: "reflections", name: "Water reflections", kind: "lighting", startup: "added" },
  { id: "refractive-bubbles", name: "Refractive bubbles", kind: "lighting", startup: "added" },
  { id: "light-shafts", name: "Light shaft planes", kind: "lighting", startup: "manual" },
  { id: "fluorescence", name: "Coral fluorescence", kind: "lighting", startup: "base" },
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
      startup: effect.startup,
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
      ? (saved[feature.id] ?? feature.startup !== "manual")
      : requested.includes(feature.id),
  );
  return new Set(enabled.map((feature) => feature.id));
}

export interface CalibrationPlan {
  /** The look to start from: the base features and the viewer's own switches. */
  readonly start: Look;
  /** Features to try, one at a time, while the GPU has room; in feature order. */
  readonly candidates: readonly string[];
}

/**
 * What the startup calibration starts from and what it may add. Features
 * the viewer switched on or off keep that choice and are never offered.
 */
export function calibrationPlan(
  features: readonly LookFeature[],
  saved: Readonly<Record<string, boolean>>,
): CalibrationPlan {
  const start = features.filter((feature) => saved[feature.id] ?? feature.startup === "base");
  const candidates = features.filter(
    (feature) => saved[feature.id] === undefined && feature.startup === "added",
  );
  return {
    start: new Set(start.map((feature) => feature.id)),
    candidates: candidates.map((feature) => feature.id),
  };
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
