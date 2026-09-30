import { Vector3 } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { z } from "zod";
import { VOLUMETRIC_LIGHT_SHADER } from "../shaders/volumetricLightShader";
import { defineEffect } from "./types";

/** Light shafts through the water, occluded by fish and plants. See the shader for details. */
export const volumetricLightEffect = defineEffect({
  id: "volumetric-light",
  stage: "hdr",
  params: z.object({
    density: z.number().min(0).max(1.5).default(0.9),
    decay: z.number().min(0.9).max(1).default(0.965),
    weight: z.number().min(0).max(1).default(0.35),
    exposure: z.number().min(0).max(2).default(0.35),
    threshold: z.number().min(0).max(4).default(0.9),
    samples: z.number().int().min(16).max(96).default(48),
  }),
  create: (context, params) => {
    const pass = new ShaderPass({
      ...VOLUMETRIC_LIGHT_SHADER,
      defines: { SAMPLES: params.samples },
      uniforms: {
        tDiffuse: { value: null },
        uLightUv: { value: [0.5, 1.4] },
        uDensity: { value: params.density },
        uDecay: { value: params.decay },
        uWeight: { value: params.weight },
        uExposure: { value: params.exposure },
        uThreshold: { value: params.threshold },
      },
    });
    const projected = new Vector3();
    const lightUv: number[] = [0.5, 1.4];
    const uniform = pass.uniforms.uLightUv;
    return {
      pass,
      update: () => {
        projected.copy(context.sunPosition).project(context.camera);
        lightUv[0] = projected.x * 0.5 + 0.5;
        lightUv[1] = projected.y * 0.5 + 0.5;
        if (uniform !== undefined) uniform.value = lightUv;
      },
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
