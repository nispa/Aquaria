import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { z } from "zod";
import { FINISH_SHADER } from "../shaders/finishShader";
import { defineEffect } from "./types";

/** Vignette and anti-banding dither, on display colors. See the shader for details. */
export const finishEffect = defineEffect({
  id: "finish",
  name: "Vignette and dither",
  stage: "display",
  // The dither prevents banding in dark gradients on LED walls.
  enabledByDefault: true,
  params: z.object({
    vignette: z.number().min(0).max(1).default(0.4),
    /** Dither amplitude in 1/255 steps; keep ≥ 1 on LED walls. */
    dither: z.number().min(0).max(2).default(1),
  }),
  create: (_context, params) => {
    const pass = new ShaderPass(FINISH_SHADER);
    const { uVignette, uDither, uFrame } = pass.uniforms;
    if (uVignette !== undefined) uVignette.value = params.vignette;
    if (uDither !== undefined) uDither.value = params.dither;
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
