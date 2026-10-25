import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { sceneFixture } from "../scene/fixtures";
import { createObjectCatalog } from "../scene/objectCatalog";
import { bundledObjects } from "../scene/objectFixtures";
import { parseObjectManifest } from "../scene/objectManifest";
import type { FloraSpec, PropSpec } from "../scene/schema";
import { layoutFlora, layoutProps, type RockSurface } from "./layout";
import { createRockwork } from "./rockwork";
import { bandDepthRange } from "./tank";

const tank = sceneFixture().tank;
const objects = bundledObjects();

describe("layoutFlora", () => {
  const spec: FloraSpec = {
    kind: "kelp",
    count: 30,
    bands: [2, 4],
    height: [1, 3],
    color: "#3d7a3a",
  };

  it("places the requested number of plants", () => {
    const plants = layoutFlora(objects, tank, [spec], createRng(1));

    expect(plants).toHaveLength(30);
  });

  it("keeps plants inside their bands and the tank width", () => {
    const { near, far } = bandDepthRange(tank, spec.bands);

    const plants = layoutFlora(objects, tank, [spec], createRng(1));

    const misplaced = plants.filter(
      (plant) =>
        plant.z > near || plant.z < far || Math.abs(plant.x) > tank.width / 2 || plant.height < 1,
    );
    expect(misplaced).toEqual([]);
  });

  it("draws heights within the requested range", () => {
    const plants = layoutFlora(objects, tank, [spec], createRng(1));

    const heights = plants.map((plant) => plant.height);

    expect(Math.min(...heights)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...heights)).toBeLessThanOrEqual(3);
  });

  it("is deterministic for a given seed", () => {
    expect(layoutFlora(objects, tank, [spec], createRng(5))).toEqual(
      layoutFlora(objects, tank, [spec], createRng(5)),
    );
  });

  it("keeps the kind and color of each group", () => {
    const plants = layoutFlora(objects, tank, [spec], createRng(1));

    expect(plants.every((plant) => plant.kind === "kelp" && plant.color === "#3d7a3a")).toBe(true);
  });
});

describe("layoutProps", () => {
  it("places the requested props on the floor inside the tank", () => {
    const props = layoutProps(
      objects,
      tank,
      [
        { kind: "rock", count: 5, color: "#666666" },
        { kind: "starfish", count: 1, color: "#e8683c" },
      ],
      createRng(2),
    );

    expect(props).toHaveLength(6);
    expect(props.every((prop) => prop.z <= 0 && prop.z >= -tank.depth)).toBe(true);
  });

  it("keeps starfish in the front bands where they can be seen", () => {
    const { far } = bandDepthRange(tank, [0, 1]);

    const props = layoutProps(
      objects,
      tank,
      [{ kind: "starfish", count: 10, color: "#e8683c" }],
      createRng(3),
    );

    expect(props.every((prop) => prop.z >= far)).toBe(true);
  });

  it("gives every prop a positive size and a rotation", () => {
    const props = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 4, color: "#666666" }],
      createRng(4),
    );

    expect(props.every((prop) => prop.size > 0 && Number.isFinite(prop.rotation))).toBe(true);
  });
});

describe("stable layout", () => {
  const kelp: FloraSpec = {
    kind: "kelp",
    count: 5,
    bands: [2, 4],
    height: [1, 3],
    color: "#3d7a3a",
  };
  const grass: FloraSpec = {
    kind: "seagrass",
    count: 8,
    bands: [0, 4],
    height: [0.1, 0.3],
    color: "#79ad4e",
  };

  it("keeps existing plants in place when a count grows", () => {
    const before = layoutFlora(objects, tank, [kelp], createRng(7));

    const after = layoutFlora(objects, tank, [{ ...kelp, count: 6 }], createRng(7));

    expect(after.slice(0, 5)).toEqual(before);
  });

  it("does not move other entries when one entry's count changes", () => {
    const before = layoutFlora(objects, tank, [kelp, grass], createRng(7));

    const after = layoutFlora(objects, tank, [{ ...kelp, count: 1 }, grass], createRng(7));

    expect(after.filter((plant) => plant.kind === "seagrass")).toEqual(
      before.filter((plant) => plant.kind === "seagrass"),
    );
  });

  it("keeps existing props in place when a count grows", () => {
    const rocks: PropSpec = { kind: "rock", count: 3, color: "#666666" };
    const before = layoutProps(objects, tank, [rocks], createRng(7));

    const after = layoutProps(objects, tank, [{ ...rocks, count: 4 }], createRng(7));

    expect(after.slice(0, 3)).toEqual(before);
  });

  it("gives every plant and prop its own integer seed for renderer details", () => {
    const plants = layoutFlora(objects, tank, [kelp], createRng(7));
    const props = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 3, color: "#666666" }],
      createRng(7),
    );

    const seeds = [...plants, ...props].map((item) => item.seed);

    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0)).toBe(true);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("scenery kinds", () => {
  const layoutOne = (kind: PropSpec["kind"]) =>
    layoutProps(objects, tank, [{ kind, count: 20, color: "#ffffff" }], createRng(9));

  it("keeps shells near the glass where they can be seen", () => {
    const { far } = bandDepthRange(tank, [0, 1]);

    expect(layoutOne("shell").every((prop) => prop.z >= far)).toBe(true);
  });

  it("keeps fan corals towards the back, where they frame the scene", () => {
    const { near } = bandDepthRange(tank, [2, 4]);

    expect(layoutOne("fan-coral").every((prop) => prop.z <= near)).toBe(true);
  });

  it("lets a scene choose the bands of a prop entry", () => {
    const { near, far } = bandDepthRange(tank, [4, 4]);

    const props = layoutProps(
      objects,
      tank,
      [{ kind: "branch-coral", count: 10, color: "#ff8866", bands: [4, 4] }],
      createRng(9),
    );

    expect(props.every((prop) => prop.z <= near && prop.z >= far)).toBe(true);
  });

  it("sizes shells smaller than brain corals", () => {
    const largestShell = Math.max(...layoutOne("shell").map((prop) => prop.size));
    const smallestCoral = Math.min(...layoutOne("brain-coral").map((prop) => prop.size));

    expect(largestShell).toBeLessThan(smallestCoral);
  });
});

describe("visible width", () => {
  const rocks: PropSpec = { kind: "rock", count: 60, color: "#666666" };
  /** A view that widens with depth, like a perspective camera. */
  const widening = (z: number): number => 4 + -z * 1.5;

  it("spreads props across the width the camera sees at their depth", () => {
    const props = layoutProps(objects, tank, [rocks], createRng(3), widening);

    expect(props.every((prop) => Math.abs(prop.x) <= widening(prop.z))).toBe(true);
    expect(Math.max(...props.map((prop) => Math.abs(prop.x)))).toBeGreaterThan(tank.width / 2);
  });

  it("spreads plants across the width the camera sees at their depth", () => {
    const kelp: FloraSpec = {
      kind: "kelp",
      count: 60,
      bands: [3, 4],
      height: [1, 2],
      color: "#3d7a3a",
    };

    const plants = layoutFlora(objects, tank, [kelp], createRng(3), widening);

    expect(plants.every((plant) => Math.abs(plant.x) <= widening(plant.z))).toBe(true);
    expect(Math.max(...plants.map((plant) => Math.abs(plant.x)))).toBeGreaterThan(tank.width / 2);
  });

  it("keeps items at the same depth and side, only further out, when the view widens", () => {
    const narrow = layoutProps(objects, tank, [rocks], createRng(3), () => 2);

    const wide = layoutProps(objects, tank, [rocks], createRng(3), () => 4);

    const moved = wide.filter((prop, index) => {
      const before = narrow[index];
      return (
        prop.z !== before?.z ||
        Math.sign(prop.x) !== Math.sign(before.x) ||
        Math.abs(prop.x) < Math.abs(before.x)
      );
    });
    expect(moved).toEqual([]);
  });
});

describe("color palettes", () => {
  const palette = ["#9a6fc2", "#c9a27a", "#e08fb0"];

  it("gives each prop one color from its entry's palette", () => {
    const props = layoutProps(
      objects,
      tank,
      [{ kind: "branch-coral", count: 30, color: palette }],
      createRng(4),
    );

    expect(props.every((prop) => palette.includes(prop.color))).toBe(true);
    expect(new Set(props.map((prop) => prop.color)).size).toBe(3);
  });

  it("gives each plant one color from its entry's palette", () => {
    const plants = layoutFlora(
      objects,
      tank,
      [{ kind: "anemone", count: 30, bands: [0, 2], height: [0.1, 0.2], color: palette }],
      createRng(4),
    );

    expect(new Set(plants.map((plant) => plant.color))).toEqual(new Set(palette));
  });
});

describe("placement on rock within an entry's bands", () => {
  /** Rock with two spots: one by the glass and one at the back. */
  const twoSpots = (): RockSurface => {
    let call = 0;
    return {
      randomPoint: () => {
        call += 1;
        return call % 2 === 1 ? [0, -0.3] : [0.5, -tank.depth + 0.4];
      },
      heightAt: () => 0.5,
    };
  };

  it("keeps an entry on the rock inside its bands", () => {
    const corals = layoutProps(
      objects,
      tank,
      [{ kind: "brain-coral", count: 6, color: "#b89a5e", on: "rockwork", bands: [3, 4] }],
      createRng(6),
      undefined,
      twoSpots(),
    );
    const near = bandDepthRange(tank, [3, 4]).near;

    expect(corals.filter((coral) => coral.z > near || coral.elevation !== 0.5)).toEqual([]);
  });

  it("keeps a plant on the rock inside its bands", () => {
    const plants = layoutFlora(
      objects,
      tank,
      [{ kind: "kelp", count: 6, bands: [0, 1], height: [1, 2], color: "#3d7a3a", on: "rockwork" }],
      createRng(6),
      undefined,
      twoSpots(),
    );
    const far = bandDepthRange(tank, [0, 1]).far;

    expect(plants.filter((plant) => plant.z < far)).toEqual([]);
  });
});

describe("placement on rockwork", () => {
  const rockwork = createRockwork(
    tank,
    {
      bands: [1, 3],
      height: [0.3, 0.9],
      coverage: 0.85,
      thickness: 0.9,
      rocks: 20,
      color: "#888888",
    },
    createRng(5),
    () => tank.width / 2,
  );

  it("sets corals on the ridge surface instead of the sand", () => {
    const corals = layoutProps(
      objects,
      tank,
      [{ kind: "brain-coral", count: 20, color: "#b89a5e", on: "rockwork" }],
      createRng(6),
      undefined,
      rockwork,
    );

    const offRidge = corals.filter(
      (coral) =>
        (coral.elevation ?? 0) <= 0 ||
        Math.abs((coral.elevation ?? 0) - rockwork.heightAt(coral.x, coral.z)) > 1e-9,
    );
    expect(offRidge).toEqual([]);
  });

  it("sets anemones on the ridge surface", () => {
    const anemones = layoutFlora(
      objects,
      tank,
      [
        {
          kind: "anemone",
          count: 10,
          bands: [0, 4],
          height: [0.1, 0.2],
          color: "#c98fd6",
          on: "rockwork",
        },
      ],
      createRng(6),
      undefined,
      rockwork,
    );

    expect(anemones.every((plant) => (plant.elevation ?? 0) > 0)).toBe(true);
  });

  it("falls back to the sand when the rock has no spot to offer", () => {
    const bare = { randomPoint: () => undefined, heightAt: () => 0 };

    const corals = layoutProps(
      objects,
      tank,
      [{ kind: "brain-coral", count: 5, color: "#b89a5e", on: "rockwork" }],
      createRng(6),
      undefined,
      bare,
    );

    expect(corals.every((coral) => coral.elevation === undefined)).toBe(true);
  });

  it("keeps sand entries on the sand", () => {
    const shells = layoutProps(
      objects,
      tank,
      [{ kind: "shell", count: 5, color: "#ffffff" }],
      createRng(6),
      undefined,
      rockwork,
    );

    expect(shells.every((shell) => shell.elevation === undefined)).toBe(true);
  });
});

describe("item sources", () => {
  it("says which entry and which of its items each plant and prop is", () => {
    const props = layoutProps(
      objects,
      tank,
      [
        { kind: "rock", count: 1, color: "#888888" },
        { kind: "shell", count: 2, color: "#ffffff" },
      ],
      createRng(1),
    );

    expect(props.map((prop) => prop.source)).toEqual([
      { section: "props", entry: 0, item: 0 },
      { section: "props", entry: 1, item: 0 },
      { section: "props", entry: 1, item: 1 },
    ]);
  });
});

describe("placement at chosen spots", () => {
  const fern: FloraSpec = {
    kind: "fern",
    count: 2,
    bands: [0, 4],
    height: [0.1, 0.2],
    color: "#2f7a3a",
    at: [
      { x: 0.5, z: -1, rotation: 90, height: 0.3 },
      { x: -0.5, z: -2 },
    ],
  };

  it("grows one plant at each spot, as the spot sets it", () => {
    const [first] = layoutFlora(objects, tank, [fern], createRng(1));

    expect([first?.x, first?.z, first?.rotation, first?.height]).toEqual([
      0.5,
      -1,
      Math.PI / 2,
      0.3,
    ]);
  });

  it("uses no more spots than the count", () => {
    const plants = layoutFlora(objects, tank, [{ ...fern, count: 1 }], createRng(1));

    expect(plants).toHaveLength(1);
  });

  it("draws what a spot leaves out from the entry's ranges", () => {
    const [, second] = layoutFlora(objects, tank, [fern], createRng(1));

    expect(second?.height).toBeGreaterThanOrEqual(0.1);
    expect(second?.height).toBeLessThanOrEqual(0.2);
  });

  it("stands an item on the rock under its spot", () => {
    const rock = { randomPoint: () => undefined, heightAt: () => 0.3 };

    const [stone] = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 1, color: "#888888", at: [{ x: 0, z: -1 }] }],
      createRng(1),
      undefined,
      rock,
    );

    expect(stone?.elevation).toBe(0.3);
  });

  it("sets an item at a spot's own height, e.g. on the floor of a cave", () => {
    const rock = { randomPoint: () => undefined, heightAt: () => 0.3 };

    const [stone] = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 1, color: "#888888", at: [{ x: 0, z: -1, y: 0, size: 0.2 }] }],
      createRng(1),
      undefined,
      rock,
    );

    expect([stone?.elevation, stone?.size]).toEqual([undefined, 0.2]);
  });

  it("gives an item the shape variant its spot names", () => {
    const [stone] = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 1, color: "#888888", at: [{ x: 0, z: -1, variant: 2 }] }],
      createRng(1),
    );

    expect(stone?.variant).toBe(2);
  });

  it("leaves the shape variant to the item's seed when its spot names none", () => {
    const [stone] = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 1, color: "#888888", at: [{ x: 0, z: -1 }] }],
      createRng(1),
    );

    expect(stone?.variant).toBeUndefined();
  });
});

describe("tip color", () => {
  it("passes an entry's tip color on to its plants", () => {
    const plants = layoutFlora(
      objects,
      tank,
      [
        {
          kind: "stem",
          count: 3,
          bands: [2, 4],
          height: [0.2, 0.4],
          color: "#3a8a2a",
          tipColor: "#e0402a",
        },
      ],
      createRng(2),
    );

    expect(plants.every((plant) => plant.tipColor === "#e0402a")).toBe(true);
  });

  it("gives plants without a tip color none", () => {
    const plants = layoutFlora(
      objects,
      tank,
      [{ kind: "fern", count: 3, bands: [2, 4], height: [0.2, 0.4], color: "#3a8a2a" }],
      createRng(2),
    );

    expect(plants.every((plant) => plant.tipColor === undefined)).toBe(true);
  });
});

describe("size override", () => {
  it("uses an entry's own size range instead of the kind's default", () => {
    const props = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 20, color: "#666666", size: [0.1, 0.15] }],
      createRng(3),
    );

    expect(props.every((prop) => prop.size >= 0.1 && prop.size <= 0.15)).toBe(true);
  });
});

describe("tags", () => {
  it("gives every plant its kind's tags", () => {
    const anemones: FloraSpec = {
      kind: "anemone",
      count: 2,
      bands: [0, 1],
      height: [0.1, 0.2],
      color: "#d98fb0",
    };

    const plants = layoutFlora(objects, tank, [anemones], createRng(1));

    expect(plants.map((plant) => plant.tags)).toEqual([
      ["anemone", "shelter"],
      ["anemone", "shelter"],
    ]);
  });

  it("gives props the tags their entry sets", () => {
    const rocks: PropSpec = { kind: "rock", count: 1, color: "#888888", tags: ["shelter"] };

    const props = layoutProps(objects, tank, [rocks], createRng(1));

    expect(props[0]?.tags).toEqual(["shelter"]);
  });
});

describe("model objects", () => {
  const credit = {
    author: "A. Modeller",
    source: "https://example.com/model",
    license: "CC0-1.0",
  };

  it("lets a plant that keeps little clearance grow up to the glass, as a carpet does", () => {
    const { manifest } = parseObjectManifest(
      {
        name: "Carpet",
        category: "plant",
        model: "model.glb",
        traits: { placement: { clearance: 0.02 } },
        credit,
      },
      "carpet",
    );
    const catalog = createObjectCatalog([["carpet", manifest]]);

    const plants = layoutFlora(
      catalog,
      tank,
      [{ kind: "carpet", count: 200, bands: [0, 0], height: [0.05, 0.05], color: "#4a8a3a" }],
      createRng(1),
    );

    expect(Math.max(...plants.map((plant) => plant.z))).toBeGreaterThan(-0.1);
  });

  it("keeps objects away from the glass by default", () => {
    const props = layoutProps(
      objects,
      tank,
      [{ kind: "rock", count: 50, bands: [0, 0], color: "#888888" }],
      createRng(1),
    );

    expect(Math.max(...props.map((prop) => prop.z))).toBeLessThanOrEqual(-0.2);
  });

  it("places a plant made of a 3D model alone, with its sway settings", () => {
    const { manifest } = parseObjectManifest(
      {
        name: "Vallisneria",
        category: "plant",
        model: "model.glb",
        traits: { sway: { amount: 0.12, speed: 1.5, attribute: "_BEND" }, tags: ["plant"] },
        credit,
      },
      "vallisneria",
    );
    const catalog = createObjectCatalog([["vallisneria", manifest]]);

    const [plant] = layoutFlora(
      catalog,
      tank,
      [{ kind: "vallisneria", count: 1, bands: [1, 3], height: [0.3, 0.5], color: "#4a8a3a" }],
      createRng(1),
    );

    expect([
      plant?.generator,
      plant?.model,
      plant?.sway,
      plant?.swaySpeed,
      plant?.swayAttribute,
      plant?.tags,
    ]).toEqual([undefined, "assets/objects/vallisneria/model.glb", 0.12, 1.5, "_BEND", ["plant"]]);
  });

  it("places an object made of a 3D model alone, with its collision shape and tags", () => {
    const { manifest } = parseObjectManifest(
      {
        name: "Amphora",
        category: "object",
        model: "model.glb",
        traits: { collision: { across: 0.4, up: 0.6, along: 0.4 }, tags: ["shelter"] },
        credit,
      },
      "amphora",
    );
    const catalog = createObjectCatalog([["amphora", manifest]]);

    const [prop] = layoutProps(
      catalog,
      tank,
      [{ kind: "amphora", count: 1, color: "#b87a52" }],
      createRng(1),
    );

    expect([prop?.generator, prop?.model, prop?.shape.up, prop?.solid, prop?.tags]).toEqual([
      undefined,
      "assets/objects/amphora/model.glb",
      0.6,
      true,
      ["shelter"],
    ]);
  });

  it("keeps both the recipe generator and the fallback model when an object has both", () => {
    const { manifest } = parseObjectManifest(
      {
        name: "Kelp",
        category: "plant",
        model: "model.glb",
        recipe: { generator: "kelp" },
        credit,
      },
      "kelp",
    );
    const catalog = createObjectCatalog([["kelp", manifest]]);

    const [plant] = layoutFlora(
      catalog,
      tank,
      [{ kind: "kelp", count: 1, bands: [1, 3], height: [1, 2], color: "#4a8a3a" }],
      createRng(1),
    );

    expect([plant?.generator, plant?.model]).toEqual(["kelp", "assets/objects/kelp/model.glb"]);
  });
});
