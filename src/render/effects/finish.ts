import { Color } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { z } from "zod";
import { hexColor } from "../../scene/schema";
import { FINISH_SHADER } from "../shaders/finishShader";
import { defineEffect } from "./types";

/**
 * Vignette, color grading and anti-banding dither, on display colors. See the
 * shader for details. The grading is neutral by default; a scene's look sets it.
 */
export const finishEffect = defineEffect({
  id: "finish",
  name: "Vignette and dither",
  stage: "display",
  // The dither prevents banding in dark gradients on LED walls.
  startup: "added",
  params: z.object({
    vignette: z.number().min(0).max(1).default(0.4),
    /** Dither amplitude in 1/255 steps; keep ≥ 1 on LED walls. */
    dither: z.number().min(0).max(2).default(1),
    contrast: z.number().min(0.5).max(2).default(1),
    saturation: z.number().min(0).max(2).default(1),
    /** Multiplies the picture, e.g. a cool or warm cast; white leaves it. */
    tint: hexColor.default("#ffffff"),
  }),
  create: (_context, params) => {
    const pass = new ShaderPass(FINISH_SHADER);
    const { uVignette, uDither, uFrame, uContrast, uSaturation, uTint } = pass.uniforms;
    if (uVignette !== undefined) uVignette.value = params.vignette;
    if (uDither !== undefined) uDither.value = params.dither;
    if (uContrast !== undefined) uContrast.value = params.contrast;
    if (uSaturation !== undefined) uSaturation.value = params.saturation;
    // Display colors: the tint is used as written, not converted to linear.
    if (uTint !== undefined) uTint.value = new Color().setStyle(params.tint, "srgb-linear");
    let frame = 0;
    return {
      pass,
      update: () => {
        frame += 1;
        if (uFrame !== undefined) uFrame.value = frame;
      },
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
