import { ambientOcclusionEffect } from "./ambientOcclusion";
import { bloomEffect } from "./bloom";
import { depthOfFieldEffect } from "./depthOfField";
import { finishEffect } from "./finish";
import { smaaEffect } from "./smaa";
import type { EffectDefinition } from "./types";
import { underwaterEffect } from "./underwater";
import { volumetricLightEffect } from "./volumetricLight";

/**
 * Every post-processing effect, in rendering order within its stage. Each one
 * is a switch in the control panel. To add an effect, create it with
 * `defineEffect` and list it here. The deep-water light comes first: it reads
 * the depth the scene pass leaves beside the frame.
 */
export const EFFECTS: readonly EffectDefinition[] = [
  underwaterEffect,
  ambientOcclusionEffect,
  volumetricLightEffect,
  depthOfFieldEffect,
  bloomEffect,
  smaaEffect,
  finishEffect,
];
