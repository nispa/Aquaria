import { ambientOcclusionEffect } from "./ambientOcclusion";
import { bloomEffect } from "./bloom";
import { depthOfFieldEffect } from "./depthOfField";
import { finishEffect } from "./finish";
import type { EffectDefinition } from "./types";
import { volumetricLightEffect } from "./volumetricLight";

/**
 * Every post-processing effect, in rendering order within its stage. Each one
 * is a switch in the control panel. To add an effect, create it with
 * `defineEffect` and list it here.
 */
export const EFFECTS: readonly EffectDefinition[] = [
  ambientOcclusionEffect,
  volumetricLightEffect,
  depthOfFieldEffect,
  bloomEffect,
  finishEffect,
];
