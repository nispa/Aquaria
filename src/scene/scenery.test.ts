import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { bundledObjects } from "./objectFixtures";
import { parseCatalog, parseScene } from "./parse";
import {
  addableScenery,
  addedSceneryKeys,
  applySceneryOverrides,
  sceneryAlone,
  sceneryEntries,
  withAddedScenery,
} from "./scenery";
import type { SceneInput } from "./schema";

const catalog = parseCatalog(catalogFixture());
const objects = bundledObjects();

function sceneWith(changes: Partial<SceneInput>) {
  return parseScene({ ...sceneFixture(), ...changes }, catalog);
}

const reefInput: Partial<SceneInput> = {
  flora: [
    { kind: "ribbon-kelp", count: 12, bands: [2, 4], height: [1, 3], color: "#3d7a3a" },
    { kind: "bubble-tip-anemone", count: 3, bands: [0, 2], height: [0.1, 0.2], color: "#e86aa0" },
  ],
  props: [
    { kind: "rock", count: 5, color: "#666666" },
    { kind: "rock", count: 2, color: "#8a7a6a", name: "Sandstone" },
    { kind: "platygyra", count: 4, color: "#c9a060" },
  ],
};

describe("sceneryEntries", () => {
  it("lists every flora and prop entry with its count, flora first", () => {
    const entries = sceneryEntries(sceneWith(reefInput), objects);

    expect(entries.map((entry) => [entry.key, entry.count])).toEqual([
      ["ribbon-kelp", 12],
      ["bubble-tip-anemone", 3],
      ["rock", 5],
      ["rock-2", 2],
      ["platygyra", 4],
    ]);
  });

  it("labels entries by kind unless the scene gives them a name", () => {
    const entries = sceneryEntries(sceneWith(reefInput), objects);

    expect(entries.map((entry) => entry.label)).toEqual([
      "Ribbon kelp",
      "Bubble-tip anemone",
      "Rocks",
      "Sandstone",
      "Brain coral (living)",
    ]);
  });

  it("gives each entry the largest count the scene format accepts", () => {
    const entries = sceneryEntries(sceneWith(reefInput), objects);

    expect(entries.map((entry) => entry.max)).toEqual([200, 200, 50, 50, 50]);
  });

  it("lets an entry at chosen spots show at most one item per spot", () => {
    const entries = sceneryEntries(
      sceneWith({
        props: [
          {
            kind: "rock",
            count: 2,
            color: "#666666",
            at: [
              { x: 0, z: -1 },
              { x: 1, z: -1 },
            ],
          },
        ],
      }),
      objects,
    );

    expect(entries.find((entry) => entry.key === "rock")?.max).toBe(2);
  });
});

describe("applySceneryOverrides", () => {
  it("never asks for more items than an entry has chosen spots", () => {
    const scene = applySceneryOverrides(
      sceneWith({ props: [{ kind: "rock", count: 1, color: "#666666", at: [{ x: 0, z: -1 }] }] }),
      { rock: 9 },
    );

    expect(scene.props[0]?.count).toBe(1);
  });

  it("replaces the counts of the entries named by key", () => {
    const scene = applySceneryOverrides(sceneWith(reefInput), {
      "rock-2": 9,
      "bubble-tip-anemone": 0,
    });

    expect(scene.props.map((prop) => prop.count)).toEqual([5, 9, 4]);
    expect(scene.flora.map((plant) => plant.count)).toEqual([12, 0]);
  });

  it("ignores keys that match no entry", () => {
    const scene = sceneWith(reefInput);

    expect(applySceneryOverrides(scene, { "giant-clam": 3 })).toEqual(scene);
  });

  it("does not modify the original scene", () => {
    const scene = sceneWith(reefInput);

    applySceneryOverrides(scene, { "ribbon-kelp": 1 });

    expect(scene.flora[0]?.count).toBe(12);
  });
});

describe("sceneryAlone", () => {
  it("keeps one item of the chosen entry and nothing else", () => {
    const alone = sceneryAlone(sceneWith(reefInput), "rock-2");

    expect([alone.flora, alone.props.map((entry) => [entry.name, entry.count])]).toEqual([
      [],
      [["Sandstone", 1]],
    ]);
  });

  it("shows an entry the viewer has emptied", () => {
    const emptied = applySceneryOverrides(sceneWith(reefInput), { "ribbon-kelp": 0 });

    expect(sceneryAlone(emptied, "ribbon-kelp").flora.map((entry) => entry.count)).toEqual([1]);
  });

  it("is empty for an unknown key", () => {
    const alone = sceneryAlone(sceneWith(reefInput), "sea-monster");

    expect([alone.flora, alone.props]).toEqual([[], []]);
  });
});

describe("withAddedScenery", () => {
  it("adds a plant the scene does not hold, with the count the viewer chose", () => {
    const scene = withAddedScenery(sceneWith(reefInput), { "java-fern": 7 }, objects);

    expect(scene.flora.map((entry) => [entry.kind, entry.count])).toEqual([
      ["ribbon-kelp", 12],
      ["bubble-tip-anemone", 3],
      ["java-fern", 7],
    ]);
  });

  it("adds an object the scene does not hold among the props", () => {
    const scene = withAddedScenery(sceneWith(reefInput), { shell: 2 }, objects);

    expect(scene.props.at(-1)).toMatchObject({ kind: "shell", count: 2 });
  });

  it("keeps the keys of the scene's own entries", () => {
    const before = sceneryEntries(sceneWith(reefInput), objects).map((entry) => entry.key);

    const scene = withAddedScenery(sceneWith(reefInput), { "java-fern": 7, shell: 2 }, objects);

    expect(sceneryEntries(scene, objects).map((entry) => entry.key)).toEqual([
      ...before.slice(0, 2),
      "java-fern",
      ...before.slice(2),
      "shell",
    ]);
  });

  it("ignores keys of the scene's own entries and names that are no object", () => {
    const scene = sceneWith(reefInput);

    expect(
      withAddedScenery(scene, { "ribbon-kelp": 1, "rock-2": 0, "giant-clam": 3 }, objects),
    ).toEqual(scene);
  });

  it("never asks for more items than the scene format accepts", () => {
    const scene = withAddedScenery(sceneWith(reefInput), { shell: 500 }, objects);

    expect(scene.props.at(-1)?.count).toBe(sceneryEntries(scene, objects).at(-1)?.max);
  });
});

describe("withAddedScenery in a small tank", () => {
  /** A quarter of the height the catalog's sizes are made for. */
  const nano = (): ReturnType<typeof sceneWith> => ({
    ...sceneWith(reefInput),
    tank: { width: 1, height: 0.75, depth: 0.7 },
  });

  it("makes an added plant as much smaller as the tank is lower than a big one", () => {
    const [low = 0, high = 0] =
      withAddedScenery(nano(), { "java-fern": 1 }, objects).flora.at(-1)?.height ?? [];

    expect([low, high]).toEqual([expect.closeTo(0.03), expect.closeTo(0.0625)]);
  });

  it("makes an added object as much smaller as the tank is lower than a big one", () => {
    const [low = 0, high = 0] =
      withAddedScenery(nano(), { shell: 1 }, objects).props.at(-1)?.size ?? [];

    expect([low, high]).toEqual([expect.closeTo(0.02), expect.closeTo(0.035)]);
  });

  it("keeps the object's own size in a big tank", () => {
    const scene = withAddedScenery(sceneWith(reefInput), { shell: 1 }, objects);

    expect(scene.props.at(-1)?.size).toEqual([0.08, 0.14]);
  });
});

describe("addedSceneryKeys", () => {
  it("names the entries the viewer added, not the scene's own", () => {
    const keys = addedSceneryKeys(
      sceneWith(reefInput),
      { "java-fern": 7, "ribbon-kelp": 2, "giant-clam": 1 },
      objects,
    );

    expect([...keys]).toEqual(["java-fern"]);
  });
});

describe("addableScenery", () => {
  it("offers every plant and object of the catalog the scene does not hold yet", () => {
    const offered = addableScenery(sceneWith(reefInput), objects).map((item) => item.id);

    expect(offered).toContain("java-fern");
    expect(offered).toContain("shell");
    expect(offered).not.toContain("ribbon-kelp");
    expect(offered).not.toContain("platygyra");
  });

  it("names each item as its object does and lists plants before objects", () => {
    const offered = addableScenery(sceneWith(reefInput), objects);
    const fern = offered.find((item) => item.id === "java-fern");
    const firstObject = offered.findIndex((item) => item.category === "object");

    expect(fern).toEqual({ id: "java-fern", name: "Java fern", category: "plant" });
    expect(offered.slice(firstObject).every((item) => item.category === "object")).toBe(true);
  });
});
