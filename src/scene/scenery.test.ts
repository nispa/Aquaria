import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene } from "./parse";
import { applySceneryOverrides, sceneryEntries } from "./scenery";
import type { SceneInput } from "./schema";

const catalog = parseCatalog(catalogFixture());

function sceneWith(changes: Partial<SceneInput>) {
  return parseScene({ ...sceneFixture(), ...changes }, catalog);
}

const reefInput: Partial<SceneInput> = {
  flora: [
    { kind: "kelp", count: 12, bands: [2, 4], height: [1, 3], color: "#3d7a3a" },
    { kind: "anemone", count: 3, bands: [0, 2], height: [0.1, 0.2], color: "#e86aa0" },
  ],
  props: [
    { kind: "rock", count: 5, color: "#666666" },
    { kind: "rock", count: 2, color: "#8a7a6a", name: "Sandstone" },
    { kind: "brain-coral", count: 4, color: "#c9a060" },
  ],
};

describe("sceneryEntries", () => {
  it("lists every flora and prop entry with its count, flora first", () => {
    const entries = sceneryEntries(sceneWith(reefInput));

    expect(entries.map((entry) => [entry.key, entry.count])).toEqual([
      ["kelp", 12],
      ["anemone", 3],
      ["rock", 5],
      ["rock-2", 2],
      ["brain-coral", 4],
    ]);
  });

  it("labels entries by kind unless the scene gives them a name", () => {
    const entries = sceneryEntries(sceneWith(reefInput));

    expect(entries.map((entry) => entry.label)).toEqual([
      "Kelp",
      "Anemones",
      "Rocks",
      "Sandstone",
      "Brain corals",
    ]);
  });

  it("gives each entry the largest count the scene format accepts", () => {
    const entries = sceneryEntries(sceneWith(reefInput));

    expect(entries.map((entry) => entry.max)).toEqual([200, 200, 50, 50, 50]);
  });
});

describe("applySceneryOverrides", () => {
  it("replaces the counts of the entries named by key", () => {
    const scene = applySceneryOverrides(sceneWith(reefInput), { "rock-2": 9, anemone: 0 });

    expect(scene.props.map((prop) => prop.count)).toEqual([5, 9, 4]);
    expect(scene.flora.map((plant) => plant.count)).toEqual([12, 0]);
  });

  it("ignores keys that match no entry", () => {
    const scene = sceneWith(reefInput);

    expect(applySceneryOverrides(scene, { "giant-clam": 3 })).toEqual(scene);
  });

  it("does not modify the original scene", () => {
    const scene = sceneWith(reefInput);

    applySceneryOverrides(scene, { kelp: 1 });

    expect(scene.flora[0]?.count).toBe(12);
  });
});
