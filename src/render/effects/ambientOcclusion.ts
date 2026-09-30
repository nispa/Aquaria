import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { z } from "zod";
import { defineEffect, hideDuringRender } from "./types";

/**
 * Ground-truth ambient occlusion: darkens creases and contact areas (fish
 * over sand, the base of rocks and plants) so objects feel grounded.
 */
export const ambientOcclusionEffect = defineEffect({
  id: "ambient-occlusion",
  name: "Ambient occlusion",
  stage: "hdr",
  // It re-renders the whole scene for normals: about 18 ms per frame at 1080p
  // on a mid-range GPU, for little visible gain in foggy water.
  enabledByDefault: false,
  params: z.object({
    /** World-space sampling radius, m. */
    radius: z.number().positive().max(2).default(0.35),
    /** 0 = no effect, 1 = full occlusion. */
    intensity: z.number().min(0).max(1).default(0.75),
    samples: z.number().int().min(4).max(32).default(12),
    thickness: z.number().positive().default(1),
  }),
  create: (context, params) => {
    const pass = new GTAOPass(context.scene, context.camera);
    pass.blendIntensity = params.intensity;
    pass.updateGtaoMaterial({
      radius: params.radius,
      samples: params.samples,
      thickness: params.thickness,
      distanceFallOff: 1,
      scale: 1,
    });
    // Ambient occlusion from un-swayed plants would darken empty water.
    hideDuringRender(pass, [
      context.shaderAnimated.plants,
      context.shaderAnimated.particles,
      ...context.overlays,
    ]);
    return {
      pass,
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
