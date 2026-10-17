import { describe, expect, it } from "vitest";
import { bundledObjects } from "./objectFixtures";
import { checkSceneObjects, parseObjectIndex } from "./objectCatalog";
import { parseCatalog, parseScene } from "./parse";
import { catalogFixture, sceneFixture } from "./fixtures";

const objects = bundledObjects();
const species = parseCatalog(catalogFixture());

describe("parseObjectIndex", () => {
  it("lists the object folders", () => {
    expect(parseObjectIndex({ objects: ["rock", "kelp"] })).toEqual(["rock", "kelp"]);
  });

  it("rejects an id that is not a folder name", () => {
    expect(() => parseObjectIndex({ objects: ["../rock"] })).toThrow(/objects\.0/);
  });
});

describe("object catalog", () => {
  it("finds an object by id", () => {
    expect(objects.get("table-coral")?.name).toBe("Table corals");
  });

  it("lists the plants and the objects apart", () => {
    expect([objects.ids("plant").includes("kelp"), objects.ids("object").includes("kelp")]).toEqual(
      [true, false],
    );
  });
});

describe("checkSceneObjects", () => {
  it("accepts a scene whose entries are all known objects", () => {
    const scene = parseScene(
      { ...sceneFixture(), props: [{ kind: "rock", count: 2, color: "#888888" }] },
      species,
    );

    expect(() => {
      checkSceneObjects(scene, objects);
    }).not.toThrow();
  });

  it("names an entry whose object is missing", () => {
    const scene = parseScene(
      { ...sceneFixture(), props: [{ kind: "lamp", count: 1, color: "#888888" }] },
      species,
    );

    expect(() => {
      checkSceneObjects(scene, objects);
    }).toThrow(/props\.0\.kind.*"lamp"/s);
  });

  it("refuses an object among the plants", () => {
    const scene = parseScene(
      {
        ...sceneFixture(),
        flora: [{ kind: "rock", count: 1, bands: [0, 4], height: [0.1, 0.2], color: "#888888" }],
      },
      species,
    );

    expect(() => {
      checkSceneObjects(scene, objects);
    }).toThrow(/flora\.0\.kind.*not a plant/s);
  });
});
