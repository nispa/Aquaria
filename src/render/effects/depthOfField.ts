import type { IUniform } from "three";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { z } from "zod";
import { defineEffect, hideDuringRender } from "./types";

/**
 * Depth of field: keeps a plane inside the tank sharp and blurs what is
 * nearer or further, like an underwater camera lens.
 */
export const depthOfFieldEffect = defineEffect({
  id: "depth-of-field",
  stage: "hdr",
  params: z.object({
    /** Distance of the sharp plane behind the glass, m. */
    focus: z.number().min(0).default(1.8),
    /** Larger values give a shallower depth of field. */
    aperture: z.number().positive().max(0.05).default(0.004),
    /** Maximum blur, as a fraction of the screen. */
    maxBlur: z.number().min(0).max(0.03).default(0.006),
  }),
  create: (context, params) => {
    const pass = new BokehPass(context.scene, context.camera, {
      focus: context.camera.position.z + params.focus,
      aperture: params.aperture,
      maxblur: params.maxBlur,
    });
    // The typings declare `uniforms` as a plain object; it is the Bokeh shader's uniform map.
    const uniforms = pass.uniforms as Record<string, IUniform<number> | undefined>;
    const focusUniform = uniforms.focus ?? { value: 0 };
    // Plants stay in the depth pass: their bases are in place, and without them
    // whole blades would take the depth of the water behind and blur away.
    hideDuringRender(pass, [context.shaderAnimated.particles]);
    return {
      pass,
      update: () => {
        // The camera moves when the window aspect changes; keep focus inside the tank.
        focusUniform.value = context.camera.position.z + params.focus;
      },
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
