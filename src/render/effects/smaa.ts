import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { z } from "zod";
import { defineEffect } from "./types";

/**
 * Subpixel morphological anti-aliasing: smooths the edges multisampling
 * misses, such as thin grass blades and fins, and shader-made detail. Runs
 * on display colors, before the dither so the grain is not taken for edges.
 */
export const smaaEffect = defineEffect({
  id: "smaa",
  name: "SMAA anti-aliasing",
  stage: "display",
  // Costs a few milliseconds at 4K; multisampling already smooths most edges.
  enabledByDefault: false,
  params: z.object({}),
  create: () => {
    const pass = new SMAAPass();
    return {
      pass,
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
