import { describe, expect, it } from "vitest";
import { coloringIndex } from "./coloring";

const strains = [{ weight: 3 }, { weight: 1 }];

describe("coloringIndex", () => {
  it("wears the first coloring for a share in its part of the weights", () => {
    expect(coloringIndex(strains, 0.7)).toBe(0);
  });

  it("wears a later coloring for a share past the earlier weights", () => {
    expect(coloringIndex(strains, 0.8)).toBe(1);
  });

  it("wears the model's own colors when the species names none", () => {
    expect(coloringIndex(undefined, 0.8)).toBe(0);
  });
});
