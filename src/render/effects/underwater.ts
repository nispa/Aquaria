import { Color, Matrix4, ShaderMaterial, Vector3, type Texture } from "three";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { z } from "zod";
import { hexColor } from "../../scene/schema";
import { UNDERWATER_SHADER } from "../shaders/underwaterShader";
import { defineEffect } from "./types";

const absorption = z.number().min(0).max(2);

/**
 * Light in deep water: red fades first, far things dissolve into the light
 * the water scatters, bright towards the surface and the sun. See the shader.
 * Off (strength 0) unless a scene's look tunes it, so other scenes keep
 * their colors; it costs one full-screen pass reading the depth.
 */
export const underwaterEffect = defineEffect({
  id: "underwater",
  name: "Deep water light",
  stage: "hdr",
  startup: "base",
  params: z.object({
    /** 0 leaves the frame untouched and skips the pass. */
    strength: z.number().min(0).max(1).default(0),
    /** How fast red, green and blue fade with distance, 1/m. */
    absorption: z.tuple([absorption, absorption, absorption]).default([0.45, 0.14, 0.09]),
    /** Distance given to open water, where nothing stands, m. */
    farDistance: z.number().positive().max(80).default(40),
    /** Water behind the glass that stays clear before the haze begins, m. */
    clearWater: z.number().min(0).max(5).default(0),
    /** Light lost per meter below the surface: deeper things are darker. */
    depthDarkening: z.number().min(0).max(1).default(0),
    /** Scattered light looking down, level and up. */
    deep: hexColor.default("#021219"),
    horizon: hexColor.default("#0b4f5c"),
    surface: hexColor.default("#3fa9b5"),
    /** Brightness of the scattered light. */
    brightness: z.number().min(0).max(4).default(1),
    sunColor: hexColor.default("#fff1d6"),
    /** Brightness of the sun's halo. */
    sunGlow: z.number().min(0).max(20).default(2),
    /** How tight the halo is: higher is smaller. */
    sunFocus: z.number().min(1).max(2000).default(30),
    /** Strength of the sunbeams fanning out from the sun; 0 none. */
    shafts: z.number().min(0).max(3).default(0),
    /** How many sunbeams around the sun. */
    shaftCount: z.number().min(4).max(200).default(48),
  }),
  create: (context, params) => {
    const linear = (hex: string, scale: number): Color => new Color(hex).multiplyScalar(scale);
    const uniforms = {
      tDiffuse: { value: null as Texture | null },
      tDepth: { value: null as Texture | null },
      uProjectionInverse: { value: new Matrix4() },
      uCameraWorld: { value: new Matrix4() },
      uAbsorption: { value: new Vector3(...params.absorption) },
      uFarDistance: { value: params.farDistance },
      uClearWater: { value: params.clearWater },
      uDepthDarkening: { value: params.depthDarkening },
      uSurfaceY: context.water.uSurfaceY,
      uDeep: { value: linear(params.deep, params.brightness) },
      uHorizon: { value: linear(params.horizon, params.brightness) },
      uSurface: { value: linear(params.surface, params.brightness) },
      uSunDirection: { value: new Vector3() },
      uSunColor: { value: linear(params.sunColor, params.sunGlow) },
      uSunFocus: { value: params.sunFocus },
      uShafts: { value: params.shafts },
      uShaftCount: { value: params.shaftCount },
      uTime: context.water.uTime,
      // Shared with the light rig: the water darkens at night.
      uDaylight: context.water.uDaylight,
      uStrength: { value: params.strength },
    };
    // A material of our own: ShaderPass would clone the uniforms, unlinking uDaylight.
    const pass = new ShaderPass(
      new ShaderMaterial({
        name: UNDERWATER_SHADER.name,
        uniforms,
        vertexShader: UNDERWATER_SHADER.vertexShader,
        fragmentShader: UNDERWATER_SHADER.fragmentShader,
      }),
    );
    pass.enabled = params.strength > 0;
    // The scene pass leaves its depth beside the frame; this pass runs first, so it is there.
    const render = pass.render.bind(pass);
    pass.render = (...args: Parameters<Pass["render"]>) => {
      const [, , readBuffer] = args;
      uniforms.tDepth.value = readBuffer.depthTexture;
      render(...args);
    };
    const tankCenter = new Vector3(0, context.tank.height / 2, -context.tank.depth / 2);
    return {
      pass,
      update: () => {
        uniforms.uProjectionInverse.value.copy(context.camera.projectionMatrixInverse);
        uniforms.uCameraWorld.value.copy(context.camera.matrixWorld);
        uniforms.uSunDirection.value.copy(context.sunPosition).sub(tankCenter).normalize();
      },
      dispose: () => {
        pass.dispose();
      },
    };
  },
});
