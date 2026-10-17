import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { checkSceneObjects } from "./objectCatalog";
import {
  floraEntryFor,
  paletteScene,
  propEntryFor,
  rockMaterialScene,
  withEnvironment,
} from "./objectEntries";
import { bundledObjects } from "./objectFixtures";
import { parseCatalog, parseScene } from "./parse";
import { sceneryEntries } from "./scenery";

const objects = bundledObjects();
const species = parseCatalog(catalogFixture());
const scene = parseScene(sceneFixture(), species);

const manifest = (id: string) => {
  const found = objects.get(id);
  if (found === undefined) throw new Error(`No object "${id}".`);
  return found;
};

describe("floraEntryFor", () => {
  it("takes a plant's color, tips and height from its object", () => {
    const entry = floraEntryFor("stem", manifest("stem"));

    expect(entry).toMatchObject({
      kind: "stem",
      color: "#3f8f3a",
      tipColor: "#e0553a",
      height: [0.35, 0.75],
      count: 0,
    });
  });
});

describe("propEntryFor", () => {
  it("lays the object's material on as its object says", () => {
    const entry = propEntryFor("rock", manifest("rock"));

    expect(entry.material).toEqual({ id: "reef-rock", tileSize: 0.45, displacement: 0.07 });
  });

  it("leaves out the material of an object that has none", () => {
    expect(propEntryFor("shell", manifest("shell")).material).toBeUndefined();
  });
});

describe("withEnvironment", () => {
  it("takes the water, floor and light of a biome, keeping the rest", () => {
    const reef = parseScene(
      { ...sceneFixture(), water: { color: "#0a4a6a", fogDensity: 0.3 } },
      species,
    );

    const changed = withEnvironment(scene, reef);

    expect([changed.water.color, changed.tank, changed.fauna]).toEqual([
      "#0a4a6a",
      scene.tank,
      scene.fauna,
    ]);
  });
});

describe("rockMaterialScene", () => {
  it("holds one rock of each material, in order", () => {
    const rocks = rockMaterialScene(scene, ["basalt", "limestone"]);

    expect(rocks.props.map((entry) => entry.material?.id)).toEqual(["basalt", "limestone"]);
  });
});

describe("paletteScene", () => {
  const palette = paletteScene(scene, objects);

  it("holds one of every plant and object, keyed by its id", () => {
    const keys = sceneryEntries(palette, objects).map((entry) => entry.key);

    expect(keys).toEqual([...objects.ids("plant"), ...objects.ids("object")]);
  });

  it("is a scene the catalog accepts", () => {
    expect(() => {
      checkSceneObjects(parseScene(palette, species), objects);
    }).not.toThrow();
  });
});
