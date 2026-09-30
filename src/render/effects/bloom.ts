import { Vector2 } from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { z } from "zod";
import { defineEffect } from "./types";

/** Soft glow around the brightest pixels (surface highlights, bubbles, lit sand). */
export const bloomEffect = defineEffect({
  id: "bloom",
  stage: "hdr",
  params: z.object({
    strength: z.number().min(0).max(3).default(0.28),
    radius: z.number().min(0).max(1).default(0.55),
    threshold: z.number().min(0).default(0.82),
  }),
  create: (_context, params) => {
    // The size is replaced by the composer's own setSize on the first resize.
    const pass = new UnrealBloomPass(
      new Vector2(1, 1),
      params.strength,
      params.radius,
      params.threshold,
    );
    return {
      pass,
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
