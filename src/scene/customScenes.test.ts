import { describe, expect, it } from "vitest";
import {
  customSceneId,
  exportScene,
  importScene,
  isCustomSceneId,
  readCustomScenes,
  slugify,
  writeCustomScene,
} from "./customScenes";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene, SceneValidationError } from "./parse";

const catalog = parseCatalog(catalogFixture());
const scene = parseScene(sceneFixture(), catalog);

describe("slugify", () => {
  it("turns a display name into a file-safe id", () => {
    expect(slugify("Mio Acquario! 2")).toBe("mio-acquario-2");
  });

  it("drops accents", () => {
    expect(slugify("Barriera più bella")).toBe("barriera-piu-bella");
  });

  it("falls back to 'scene' when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("scene");
  });
});

describe("customSceneId", () => {
  it("prefixes custom scenes so they never clash with bundled ones", () => {
    expect(customSceneId("Reef", [])).toBe("my-reef");
  });

  it("adds a number when the id is taken", () => {
    expect(customSceneId("Reef", ["my-reef", "my-reef-2"])).toBe("my-reef-3");
  });

  it("recognises custom ids", () => {
    expect([isCustomSceneId("my-reef"), isCustomSceneId("reef")]).toEqual([true, false]);
  });
});

describe("exportScene", () => {
  it("writes pretty JSON whose id is ready to drop into public/scenes", () => {
    const json = exportScene({ ...scene, id: "my-night-reef", name: "Night reef" });

    const data = JSON.parse(json) as { id: string; name: string };
    expect([data.id, data.name]).toEqual(["night-reef", "Night reef"]);
    expect(json).toContain("\n  ");
  });
});

describe("importScene", () => {
  it("validates a scene file and gives it a new custom id", () => {
    const imported = importScene(exportScene({ ...scene, name: "Imported" }), catalog, []);

    expect(imported.id).toBe("my-reef");
    expect(imported.scene.name).toBe("Imported");
  });

  it("reports the exact field of an invalid scene", () => {
    const broken = JSON.stringify({ ...scene, tank: { ...scene.tank, width: -1 } });

    expect(() => importScene(broken, catalog, [])).toThrow(/tank\.width/);
  });

  it("reports files that are not JSON", () => {
    expect(() => importScene("not json", catalog, [])).toThrow(SceneValidationError);
  });
});

describe("custom scene storage", () => {
  it("stores and reads back a scene", () => {
    const stored = writeCustomScene(null, { ...scene, id: "my-reef" });

    expect(readCustomScenes(stored, catalog)).toEqual({ "my-reef": { ...scene, id: "my-reef" } });
  });

  it("drops stored scenes that no longer validate, keeping the others", () => {
    const stored = JSON.stringify({
      "my-good": { ...scene, id: "my-good" },
      "my-bad": { ...scene, id: "my-bad", tank: "broken" },
    });

    expect(Object.keys(readCustomScenes(stored, catalog))).toEqual(["my-good"]);
  });

  it("reads nothing from missing or corrupted storage", () => {
    expect([readCustomScenes(null, catalog), readCustomScenes("{oops", catalog)]).toEqual([{}, {}]);
  });

  it("removes a scene when it is written as deleted", () => {
    const stored = writeCustomScene(null, { ...scene, id: "my-reef" });

    expect(readCustomScenes(writeCustomScene(stored, "my-reef", "delete"), catalog)).toEqual({});
  });
});
