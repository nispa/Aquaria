import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { bundledObjects } from "./objectFixtures";
import { parseCatalog, parseScene } from "./parse";
import { tagsOf } from "./tags";

const catalog = parseCatalog(catalogFixture());
const objects = bundledObjects();
const tagsOfObject = (id: string): readonly string[] | undefined => objects.get(id)?.traits.tags;

describe("tags of scenery", () => {
  it("gives anemones the anemone and shelter tags", () => {
    expect(tagsOfObject("anemone")).toEqual(["anemone", "shelter"]);
  });

  it("offers dense plants as shelter, for freshwater fish to hide in", () => {
    expect([tagsOfObject("bush"), tagsOfObject("fern"), tagsOfObject("stem")]).toEqual([
      expect.arrayContaining(["shelter"]),
      expect.arrayContaining(["shelter"]),
      expect.arrayContaining(["shelter"]),
    ]);
  });

  it("uses the object's tags for an entry that sets none", () => {
    const scene = parseScene(sceneFixture(), catalog);
    const entry = scene.props[0] ?? { kind: "starfish", tags: undefined };

    expect(tagsOf(entry, objects.get(entry.kind))).toEqual(["starfish"]);
  });

  it("lets a scene entry set its own tags", () => {
    const input = sceneFixture();
    input.props = [{ kind: "rock", count: 1, color: "#888888", tags: ["shelter"] }];

    const scene = parseScene(input, catalog);

    expect(tagsOf(scene.props[0] ?? {}, objects.get("rock"))).toEqual(["shelter"]);
  });

  it("gives no tags to an entry whose object is missing", () => {
    expect(tagsOf({}, undefined)).toEqual([]);
  });

  it("rejects tags that are not lowercase words", () => {
    const input = sceneFixture();
    input.flora = [
      {
        kind: "kelp",
        count: 1,
        bands: [0, 1],
        height: [1, 2],
        color: "#3d7a3a",
        tags: ["Big Kelp"],
      },
    ];

    expect(() => parseScene(input, catalog)).toThrow(/tags/);
  });
});
