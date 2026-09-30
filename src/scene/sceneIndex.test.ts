import { describe, expect, it } from "vitest";
import { SceneValidationError } from "./parse";
import { parseSceneIndex, sceneName, selectSceneId, withGroup } from "./sceneIndex";

const groups = {
  groups: [
    { name: "Open sea", scenes: ["reef"] },
    { name: "Aquariums", scenes: ["home-reef", "iwagumi"] },
  ],
};

describe("parseSceneIndex", () => {
  it("reads the scenes of every group, the first one being the default", () => {
    const index = parseSceneIndex(groups);

    expect(index.scenes).toEqual(["reef", "home-reef", "iwagumi"]);
    expect(index.defaultScene).toBe("reef");
  });

  it("keeps the groups for the panel", () => {
    expect(parseSceneIndex(groups).groups.map((group) => group.name)).toEqual([
      "Open sea",
      "Aquariums",
    ]);
  });

  it("rejects an index without scenes", () => {
    expect(() => parseSceneIndex({ groups: [{ name: "Empty", scenes: [] }] })).toThrow(
      SceneValidationError,
    );
  });

  it("rejects ids that could escape the scenes folder", () => {
    expect(() => parseSceneIndex({ groups: [{ name: "Bad", scenes: ["../secret"] }] })).toThrow(
      SceneValidationError,
    );
  });

  it("rejects a scene listed twice", () => {
    const twice = {
      groups: [
        { name: "A", scenes: ["reef"] },
        { name: "B", scenes: ["reef"] },
      ],
    };

    expect(() => parseSceneIndex(twice)).toThrow(/listed twice/);
  });
});

describe("selectSceneId", () => {
  const index = parseSceneIndex(groups);

  it("prefers the scene named in the URL", () => {
    expect(selectSceneId(index, "home-reef", "reef")).toBe("home-reef");
  });

  it("opens the scene chosen last time when the URL names none", () => {
    expect(selectSceneId(index, undefined, "home-reef")).toBe("home-reef");
  });

  it("falls back to the default scene", () => {
    expect(selectSceneId(index, undefined, undefined)).toBe("reef");
  });

  it("skips a saved scene that is no longer listed", () => {
    expect(selectSceneId(index, undefined, "deleted-scene")).toBe("reef");
  });

  it("still opens an unlisted scene named in the URL, for scenes in progress", () => {
    expect(selectSceneId(index, "draft", undefined)).toBe("draft");
  });
});

describe("sceneName", () => {
  it("reads the display name of a scene file", () => {
    expect(sceneName({ id: "reef", name: "Tropical reef" }, "reef")).toBe("Tropical reef");
  });

  it("falls back to the id when the file has no usable name", () => {
    expect(sceneName({ nothing: true }, "reef")).toBe("reef");
  });
});

describe("withGroup", () => {
  const index = parseSceneIndex(groups);

  it("adds the viewer's own scenes as a group, so they can be chosen and remembered", () => {
    const extended = withGroup(index, "My scenes", ["my-night-reef"]);

    expect(extended.groups.map((group) => group.name)).toEqual([
      "Open sea",
      "Aquariums",
      "My scenes",
    ]);
    expect(selectSceneId(extended, undefined, "my-night-reef")).toBe("my-night-reef");
  });

  it("adds nothing when there are no scenes for the group", () => {
    expect(withGroup(index, "My scenes", [])).toEqual(index);
  });
});
