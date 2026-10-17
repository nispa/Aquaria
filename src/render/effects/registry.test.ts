import { describe, expect, it } from "vitest";
import { lookFeatures } from "../../scene/look";
import { EFFECTS } from "./index";

describe("effect registry", () => {
  it("has unique effect ids", () => {
    const ids = EFFECTS.map((effect) => effect.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every effect a default for each parameter", () => {
    const invalid = EFFECTS.filter((effect) => !effect.params.safeParse({}).success);

    expect(invalid.map((effect) => effect.id)).toEqual([]);
  });

  it("does not reuse the id of a lighting feature", () => {
    expect(() => lookFeatures(EFFECTS)).not.toThrow();
  });

  it("leaves the heavy ambient occlusion, depth of field and SMAA to the viewer", () => {
    const manual = EFFECTS.filter((effect) => effect.startup === "manual").map(
      (effect) => effect.id,
    );

    expect(manual).toEqual(["ambient-occlusion", "depth-of-field", "smaa"]);
  });
});
