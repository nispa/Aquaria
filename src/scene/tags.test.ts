import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene } from "./parse";
import { FLORA_KINDS, PROP_KINDS } from "./schema";
import { DEFAULT_TAGS, tagsOf } from "./tags";

const catalog = parseCatalog(catalogFixture());

describe("tags of scenery", () => {
  it("gives anemones the anemone and shelter tags", () => {
    expect(DEFAULT_TAGS.anemone).toEqual(["anemone", "shelter"]);
  });

  it("declares tags for every flora and prop kind", () => {
    const kinds = [...FLORA_KINDS, ...PROP_KINDS];

    expect(kinds.filter((kind) => !(kind in DEFAULT_TAGS))).toEqual([]);
  });

  it("uses the kind's tags for an entry that sets none", () => {
    const scene = parseScene(sceneFixture(), catalog);

    expect(tagsOf(scene.props[0] ?? { kind: "rock" })).toEqual(DEFAULT_TAGS.starfish);
  });

  it("lets a scene entry set its own tags", () => {
    const input = sceneFixture();
    input.props = [{ kind: "rock", count: 1, color: "#888888", tags: ["shelter"] }];

    const scene = parseScene(input, catalog);

    expect(tagsOf(scene.props[0] ?? { kind: "rock" })).toEqual(["shelter"]);
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
