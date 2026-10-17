import { describe, expect, it } from "vitest";
import { SceneValidationError } from "../parse";
import { parseTraits, TRAITS } from "./index";

describe("parseTraits", () => {
  it("fills in every parameter a trait leaves out", () => {
    const { traits } = parseTraits({ sway: {} }, "kelp");

    expect(traits.sway).toEqual(TRAITS.sway.schema.parse({}));
  });

  it("keeps a trait's own parameters", () => {
    const { traits } = parseTraits({ collision: { across: 0.3 } }, "rock");

    expect(traits.collision?.across).toBe(0.3);
  });

  it("reads tags as a list", () => {
    const { traits } = parseTraits({ tags: ["coral", "shelter"] }, "table-coral");

    expect(traits.tags).toEqual(["coral", "shelter"]);
  });

  it("skips a trait it does not know, with a warning naming it", () => {
    const { traits, warnings } = parseTraits({ glow: { color: "#fff" } }, "lamp");

    expect([Object.keys(traits), warnings]).toEqual([
      [],
      ['Object "lamp": unknown trait "glow" skipped.'],
    ]);
  });

  it("rejects a known trait with wrong parameters, saying where", () => {
    expect(() => parseTraits({ sway: { amount: -1 } }, "kelp")).toThrow(SceneValidationError);
    expect(() => parseTraits({ sway: { amount: -1 } }, "kelp")).toThrow(/kelp.*sway\.amount/s);
  });
});

describe("placement trait", () => {
  it("stands on the sand anywhere in the tank by default", () => {
    expect(TRAITS.placement.schema.parse({})).toMatchObject({ on: ["sand"], bands: [0, 4] });
  });

  it("rejects an inverted size range", () => {
    expect(TRAITS.placement.schema.safeParse({ size: [0.5, 0.2] }).success).toBe(false);
  });
});

describe("collision trait", () => {
  it("is a solid ellipsoid as wide as the object by default", () => {
    expect(TRAITS.collision.schema.parse({})).toEqual({
      solid: true,
      across: 0.5,
      up: 0.5,
      along: 0.5,
      sink: 0,
      lift: 0,
    });
  });
});
