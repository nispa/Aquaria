import { z } from "zod";
import { describe, expect, it } from "vitest";
import { SceneValidationError } from "./parse";
import {
  parseShaderPackIndex,
  resolveShaderPack,
  selectPackId,
  type EffectDescriptor,
  type ShaderPackInput,
} from "./shaderPack";

const effects: readonly EffectDescriptor[] = [
  { id: "blur", stage: "hdr", params: z.object({ radius: z.number().min(0).default(1) }) },
  { id: "grain", stage: "display", params: z.object({ amount: z.number().default(0.5) }) },
  { id: "glow", stage: "hdr", params: z.object({}) },
];

function packFixture(): ShaderPackInput {
  return {
    id: "test",
    name: "Test look",
    lighting: { shadows: { enabled: true, mapSize: 1024 }, environment: true },
    bubbles: "refractive",
    passes: [{ effect: "grain" }, { effect: "blur", params: { radius: 3 } }, { effect: "glow" }],
  };
}

describe("resolveShaderPack", () => {
  it("attaches each pass to its registered effect with validated params", () => {
    const pack = resolveShaderPack(packFixture(), effects);

    expect(pack.passes.map((pass) => [pass.effect.id, pass.params])).toContainEqual([
      "blur",
      { radius: 3 },
    ]);
  });

  it("fills effect parameters with the effect's defaults", () => {
    const pack = resolveShaderPack(packFixture(), effects);

    const grain = pack.passes.find((pass) => pass.effect.id === "grain");

    expect(grain?.params).toEqual({ amount: 0.5 });
  });

  it("runs HDR passes before display passes, keeping the written order within a stage", () => {
    const pack = resolveShaderPack(packFixture(), effects);

    expect(pack.passes.map((pass) => pass.effect.id)).toEqual(["blur", "glow", "grain"]);
  });

  it("names the available effects when a pass uses an unknown one", () => {
    const input = packFixture();
    input.passes.push({ effect: "raytracing" });

    expect(() => resolveShaderPack(input, effects)).toThrow(
      /unknown effect "raytracing".*blur, grain, glow/i,
    );
  });

  it("reports the path of an invalid effect parameter", () => {
    const input = packFixture();
    input.passes[1] = { effect: "blur", params: { radius: -1 } };

    expect(() => resolveShaderPack(input, effects)).toThrow(/passes\.1\.params\.radius/);
  });

  it("defaults to no shadows, no environment lighting and sprite bubbles", () => {
    const pack = resolveShaderPack({ id: "plain", name: "Plain", passes: [] }, effects);

    expect(pack.lighting).toEqual({
      shadows: { enabled: false, mapSize: 2048 },
      environment: false,
      exposure: 1,
    });
    expect(pack.bubbles).toBe("sprite");
  });

  it("shows the lightweight light-shaft planes unless the pack turns them off", () => {
    const plain = resolveShaderPack({ id: "plain", name: "Plain", passes: [] }, effects);
    const volumetric = resolveShaderPack(
      { id: "volumetric", name: "Volumetric", lightShafts: false, passes: [] },
      effects,
    );

    expect([plain.lightShafts, volumetric.lightShafts]).toEqual([true, false]);
  });

  it("rejects shadow maps that are not a supported power of two", () => {
    const input = packFixture();
    input.lighting = { shadows: { enabled: true, mapSize: 1000 as 1024 } };

    expect(() => resolveShaderPack(input, effects)).toThrow(SceneValidationError);
  });
});

describe("parseShaderPackIndex", () => {
  it("lists pack ids with the first one as the default", () => {
    const index = parseShaderPackIndex({ packs: ["realistic", "classic"] });

    expect(index.defaultPack).toBe("realistic");
  });

  it("rejects an empty list", () => {
    expect(() => parseShaderPackIndex({ packs: [] })).toThrow(SceneValidationError);
  });

  it("rejects ids that could escape the packs folder", () => {
    expect(() => parseShaderPackIndex({ packs: ["../x"] })).toThrow(SceneValidationError);
  });
});

describe("selectPackId", () => {
  const index = parseShaderPackIndex({ packs: ["realistic", "classic"] });

  it("uses the first candidate that exists in the index", () => {
    expect(selectPackId(index, ["missing", "classic"])).toBe("classic");
  });

  it("skips undefined candidates", () => {
    expect(selectPackId(index, [undefined, "classic"])).toBe("classic");
  });

  it("falls back to the index default", () => {
    expect(selectPackId(index, [undefined, "gone"])).toBe("realistic");
  });
});
