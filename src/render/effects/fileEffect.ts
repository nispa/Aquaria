import { ShaderMaterial, Vector2, type IUniform } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { z } from "zod";
import type { EffectManifest } from "../../scene/effectManifest";
import { defineEffect, type EffectDefinition } from "./types";

/** Full-screen triangle pair, as every ShaderPass draws it; vUv runs 0..1 across the frame. */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The fragment shader of an effect made of files: Aquaria declares the
 * uniforms it gives every effect and one `uniform float` per parameter, then
 * the artist's shader follows, from its helper functions to `main()`.
 */
export function fileEffectFragment(manifest: EffectManifest, body: string): string {
  const params = Object.keys(manifest.params).map((name) => `uniform float ${name};`);
  return [
    "uniform sampler2D tDiffuse;",
    "uniform float uTime;",
    "uniform vec2 uResolution;",
    "uniform float uFrame;",
    ...params,
    "varying vec2 vUv;",
    body,
  ].join("\n");
}

/**
 * An effect made of files (scene/effectManifest) as one of Aquaria's own:
 * a switch in the panel, a full-screen pass in the pipeline. `body` is the
 * text of its shader file.
 */
export function createFileEffect(
  id: string,
  manifest: EffectManifest,
  body: string,
): EffectDefinition {
  const schema = z.object(
    Object.fromEntries(
      Object.entries(manifest.params).map(([name, range]) => [
        name,
        z.number().min(range.min).max(range.max).default(range.default),
      ]),
    ),
  );
  const fragmentShader = fileEffectFragment(manifest, body);
  return defineEffect({
    id,
    name: manifest.name,
    stage: manifest.stage,
    startup: manifest.startup,
    params: schema,
    create: (context, params) => {
      const resolution = new Vector2();
      const frame = { value: 0 };
      const uniforms: Record<string, IUniform> = {
        tDiffuse: { value: null },
        // Shared with the water, so the effect keeps the aquarium's time.
        uTime: context.water.uTime,
        uResolution: { value: resolution },
        uFrame: frame,
      };
      for (const [name, value] of Object.entries(params)) uniforms[name] = { value };
      // A material, not a shader object: ShaderPass would clone the uniforms and lose uTime.
      const material = new ShaderMaterial({
        name: `effect-${id}`,
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
      });
      const pass = new ShaderPass(material);
      return {
        pass,
        update: () => {
          context.renderer.getDrawingBufferSize(resolution);
          frame.value += 1;
        },
        dispose: () => {
          pass.dispose();
          material.dispose();
        },
      };
    },
  });
}
