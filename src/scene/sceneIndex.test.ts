import { describe, expect, it } from "vitest";
import { parseSceneIndex, sceneName, selectSceneId } from "./sceneIndex";
import { SceneValidationError } from "./parse";

describe("parseSceneIndex", () => {
  it("reads the listed scene ids, the first being the default", () => {
    const index = parseSceneIndex({ scenes: ["reef", "home-reef"] });

    expect(index).toEqual({ scenes: ["reef", "home-reef"], defaultScene: "reef" });
  });

  it("rejects an empty list", () => {
    expect(() => parseSceneIndex({ scenes: [] })).toThrow(SceneValidationError);
  });

  it("rejects ids that could escape the scenes folder", () => {
    expect(() => parseSceneIndex({ scenes: ["../secret"] })).toThrow(SceneValidationError);
  });
});

describe("selectSceneId", () => {
  const index = parseSceneIndex({ scenes: ["reef", "home-reef"] });

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
