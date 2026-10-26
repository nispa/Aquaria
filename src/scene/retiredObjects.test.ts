import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { bundledObjects } from "./objectFixtures";
import { parseCatalog, parseScene } from "./parse";
import { parseRetiredObjects, retireObjects } from "./retiredObjects";

const objects = bundledObjects();
const catalog = parseCatalog(catalogFixture());
const species = ["red-sea-star"];
const retired = parseRetiredObjects({
  objects: [],
  retired: {
    "old-kelp": "ribbon-kelp",
    "old-fan": null,
    "old-leather": "sarcophyton",
    "old-star": { species: "red-sea-star" },
  },
});

function sceneWith(flora: unknown[], props: unknown[]) {
  return parseScene({ ...sceneFixture(), flora, props }, catalog);
}

describe("retired objects", () => {
  it("replaces a retired plant with its successor, keeping the rest of the entry", () => {
    const scene = sceneWith(
      [{ kind: "old-kelp", count: 6, bands: [3, 4], height: [1, 2], color: "#5a9a3e" }],
      [],
    );

    const upgraded = retireObjects(scene, retired, objects, species);

    expect(upgraded.flora).toEqual([
      { kind: "ribbon-kelp", count: 6, bands: [3, 4], height: [1, 2], color: "#5a9a3e" },
    ]);
  });

  it("drops an entry whose object is retired without a successor", () => {
    const scene = sceneWith([], [{ kind: "old-fan", count: 3, color: "#8e3b8a" }]);

    expect(retireObjects(scene, retired, objects, species).props).toEqual([]);
  });

  it("moves an object to the plants when its successor is a plant, sizes becoming heights", () => {
    const scene = sceneWith(
      [],
      [{ kind: "old-leather", count: 4, color: "#c8b47a", size: [0.3, 0.5], tags: ["coral"] }],
    );

    const upgraded = retireObjects(scene, retired, objects, species);

    expect([upgraded.props, upgraded.flora]).toEqual([
      [],
      [
        {
          kind: "sarcophyton",
          count: 4,
          bands: [0, 4],
          height: [0.3, 0.5],
          color: "#c8b47a",
          tags: ["coral"],
        },
      ],
    ]);
  });

  it("turns a still object into the animals its successor names", () => {
    const scene = sceneWith([], [{ kind: "old-star", count: 1, color: "#e8683c" }]);

    const upgraded = retireObjects(scene, retired, objects, species);

    expect([upgraded.props, upgraded.fauna.at(-1)]).toEqual([
      [],
      { species: "red-sea-star", count: 1 },
    ]);
  });

  it("drops a still object whose animal the catalog does not have", () => {
    const scene = sceneWith([], [{ kind: "old-star", count: 1, color: "#e8683c" }]);

    const upgraded = retireObjects(scene, retired, objects, []);

    expect([upgraded.props, upgraded.fauna]).toEqual([[], scene.fauna]);
  });

  it("leaves a scene without retired objects as it is", () => {
    const scene = sceneWith(
      [{ kind: "ribbon-kelp", count: 6, bands: [3, 4], height: [1, 2], color: "#5a9a3e" }],
      [],
    );

    expect(retireObjects(scene, retired, objects, species)).toBe(scene);
  });
});
