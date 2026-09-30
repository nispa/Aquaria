import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  LIGHTING_FEATURES,
  lookFeatures,
  lookPasses,
  resolveLook,
  type EffectDescriptor,
} from "./look";

const effects: readonly EffectDescriptor[] = [
  {
    id: "grain",
    name: "Grain",
    stage: "display",
    enabledByDefault: true,
    params: z.object({ amount: z.number().default(0.5) }),
  },
  {
    id: "blur",
    name: "Blur",
    stage: "hdr",
    enabledByDefault: false,
    params: z.object({ radius: z.number().default(1) }),
  },
  { id: "glow", name: "Glow", stage: "hdr", enabledByDefault: true, params: z.object({}) },
];

describe("lookFeatures", () => {
  it("lists the lighting features first, then every registered effect", () => {
    const ids = lookFeatures(effects).map((feature) => feature.id);

    expect(ids).toEqual([
      ...LIGHTING_FEATURES.map((feature) => feature.id),
      "grain",
      "blur",
      "glow",
    ]);
  });

  it("marks registered effects as post-processing features", () => {
    const blur = lookFeatures(effects).find((feature) => feature.id === "blur");

    expect(blur).toEqual({ id: "blur", name: "Blur", kind: "effect", enabledByDefault: false });
  });

  it("rejects an effect whose id clashes with a lighting feature", () => {
    const clashing: EffectDescriptor = { ...effects[2], id: "shadows" } as EffectDescriptor;

    expect(() => lookFeatures([clashing])).toThrow(/"shadows".*lighting feature/);
  });
});

describe("resolveLook", () => {
  const features = lookFeatures(effects);

  it("enables the features that are on by default", () => {
    const look = resolveLook(features, {});

    expect(look.has("glow")).toBe(true);
    expect(look.has("blur")).toBe(false);
  });

  it("applies the viewer's saved choices over the defaults", () => {
    const look = resolveLook(features, { blur: true, glow: false });

    expect([look.has("blur"), look.has("glow")]).toEqual([true, false]);
  });

  it("ignores saved choices for features that no longer exist", () => {
    const look = resolveLook(features, { raytracing: true });

    expect(look.has("raytracing")).toBe(false);
  });

  it("uses exactly the requested features when a list is given", () => {
    const look = resolveLook(features, { glow: true }, ["blur", "shadows"]);

    expect([...look].sort()).toEqual(["blur", "shadows"]);
  });

  it("drops unknown ids from a requested list", () => {
    const look = resolveLook(features, {}, ["blur", "raytracing"]);

    expect([...look]).toEqual(["blur"]);
  });
});

describe("lookPasses", () => {
  it("returns the enabled effects, HDR stage before display stage, in registry order", () => {
    const passes = lookPasses(effects, new Set(["grain", "glow", "blur", "shadows"]));

    expect(passes.map((effect) => effect.id)).toEqual(["blur", "glow", "grain"]);
  });

  it("leaves out disabled effects and lighting features", () => {
    const passes = lookPasses(effects, new Set(["shadows", "glow"]));

    expect(passes.map((effect) => effect.id)).toEqual(["glow"]);
  });
});
