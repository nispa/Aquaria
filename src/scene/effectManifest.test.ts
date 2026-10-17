import { describe, expect, it } from "vitest";
import {
  effectShaderUrl,
  parseEffectIndex,
  parseEffectManifest,
  type EffectManifest,
} from "./effectManifest";

const shimmer = {
  name: "Shimmer",
  params: { amount: { min: 0, max: 0.01, default: 0.002 } },
};

describe("parseEffectManifest", () => {
  it("fills in the stage, the startup role and the shader file", () => {
    const manifest = parseEffectManifest({ name: "Shimmer" }, "shimmer");

    expect([manifest.stage, manifest.startup, manifest.shader]).toEqual([
      "display",
      "manual",
      "effect.glsl",
    ]);
  });

  it("keeps each parameter's range and default", () => {
    const manifest = parseEffectManifest(shimmer, "shimmer");

    expect(manifest.params.amount).toEqual({ min: 0, max: 0.01, default: 0.002 });
  });

  it("refuses a default outside its range", () => {
    const input = { name: "Shimmer", params: { amount: { min: 0, max: 1, default: 2 } } };

    expect(() => parseEffectManifest(input, "shimmer")).toThrow(/amount/);
  });

  it("refuses a parameter named like a uniform Aquaria gives every effect", () => {
    const input = { name: "Shimmer", params: { uTime: { min: 0, max: 1, default: 0 } } };

    expect(() => parseEffectManifest(input, "shimmer")).toThrow(/uTime/);
  });

  it("refuses a parameter name that is not a plain GLSL identifier", () => {
    const input = { name: "Shimmer", params: { "wave-size": { min: 0, max: 1, default: 0 } } };

    expect(() => parseEffectManifest(input, "shimmer")).toThrow(/wave-size/);
  });

  it("refuses a shader file outside the effect's folder", () => {
    const input = { name: "Shimmer", shader: "../other/effect.glsl" };

    expect(() => parseEffectManifest(input, "shimmer")).toThrow(/shader/);
  });

  it("names the effect folder in its error messages", () => {
    expect(() => parseEffectManifest({}, "shimmer")).toThrow(/effect "shimmer"/);
  });
});

describe("effectShaderUrl", () => {
  it("finds the shader in the effect's folder", () => {
    const manifest: EffectManifest = parseEffectManifest(shimmer, "shimmer");

    expect(effectShaderUrl("shimmer", manifest)).toBe("effects/shimmer/effect.glsl");
  });
});

describe("parseEffectIndex", () => {
  it("lists the effect folders", () => {
    expect(parseEffectIndex({ effects: ["shimmer", "film-grain"] })).toEqual([
      "shimmer",
      "film-grain",
    ]);
  });

  it("refuses an id that is not a folder name", () => {
    expect(() => parseEffectIndex({ effects: ["../secret"] })).toThrow(/effect index/);
  });
});
