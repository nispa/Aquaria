import { describe, expect, it } from "vitest";
import type { AddableScenery } from "../scene/scenery";
import { matchesSearch } from "./sceneryPicker";

const brainCorals: AddableScenery = {
  id: "grooved-brain-coral",
  name: "Grooved brain corals",
  category: "object",
};

describe("matchesSearch", () => {
  it("finds an item by a word of its name, whatever the case", () => {
    expect(matchesSearch(brainCorals, "BRAIN")).toBe(true);
  });

  it("needs every word of the search", () => {
    expect(matchesSearch(brainCorals, "brain kelp")).toBe(false);
  });

  it("finds an item by its id", () => {
    expect(matchesSearch(brainCorals, "grooved-brain")).toBe(true);
  });

  it("shows everything for an empty search", () => {
    expect(matchesSearch(brainCorals, "")).toBe(true);
  });
});
