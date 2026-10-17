import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { describe, expect, it } from "vitest";
import { parseEffectManifest } from "../../scene/effectManifest";
import { createFileEffect, fileEffectFragment } from "./fileEffect";
import type { EffectContext } from "./types";
import { neutralWaterUniforms } from "../uniforms";

const manifest = parseEffectManifest(
  {
    name: "Shimmer",
    stage: "hdr",
    startup: "added",
    params: {
      amount: { min: 0, max: 0.01, default: 0.002 },
      speed: { min: 0, max: 3, default: 0.8 },
    },
  },
  "shimmer",
);
const body = "void main() { gl_FragColor = texture2D(tDiffuse, vUv) * amount; }";

describe("fileEffectFragment", () => {
  it("declares the frame, time, resolution, frame count and every parameter before the body", () => {
    const source = fileEffectFragment(manifest, body);

    expect([
      source.includes("uniform sampler2D tDiffuse;"),
      source.includes("uniform float uTime;"),
      source.includes("uniform vec2 uResolution;"),
      source.includes("uniform float uFrame;"),
      source.includes("uniform float amount;"),
      source.includes("uniform float speed;"),
      source.includes("varying vec2 vUv;"),
      source.endsWith(body),
    ]).toEqual([true, true, true, true, true, true, true, true]);
  });
});

describe("createFileEffect", () => {
  const water = neutralWaterUniforms();
  const context = { water } as unknown as EffectContext;

  it("is a switch like Aquaria's own effects, with the manifest's name, stage and startup role", () => {
    const effect = createFileEffect("shimmer", manifest, body);

    expect([effect.id, effect.name, effect.stage, effect.startup]).toEqual([
      "shimmer",
      "Shimmer",
      "hdr",
      "added",
    ]);
  });

  it("starts every parameter at its tuned default", () => {
    const effect = createFileEffect("shimmer", manifest, body);
    const pass = effect.create(context, {}).pass as ShaderPass;

    expect([pass.uniforms.amount?.value, pass.uniforms.speed?.value]).toEqual([0.002, 0.8]);
  });

  it("follows the aquarium's clock", () => {
    const effect = createFileEffect("shimmer", manifest, body);
    const pass = effect.create(context, {}).pass as ShaderPass;

    water.uTime.value = 12.5;

    expect(pass.uniforms.uTime?.value).toBe(12.5);
  });
});
