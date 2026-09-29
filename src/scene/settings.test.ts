import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene } from "./parse";
import { applyCountOverrides, DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("returns the defaults when nothing was saved", () => {
    expect(parseSettings(null)).toEqual({ settings: DEFAULT_SETTINGS, valid: true });
  });

  it("defaults to rendering in 4K", () => {
    expect(DEFAULT_SETTINGS.renderHeight).toBe(2160);
  });

  it("keeps valid saved settings", () => {
    const saved = { renderHeight: 1080, showFps: true, counts: { reef: { sardine: 12 } } };

    expect(parseSettings(saved)).toEqual({ settings: saved, valid: true });
  });

  it("fills missing fields with defaults", () => {
    const { settings } = parseSettings({ showFps: true });

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, showFps: true });
  });

  it("falls back to the defaults for corrupted settings instead of failing", () => {
    expect(parseSettings({ renderHeight: "huge" })).toEqual({
      settings: DEFAULT_SETTINGS,
      valid: false,
    });
  });

  it("rejects render heights outside the supported range", () => {
    expect(parseSettings({ renderHeight: 8000 }).valid).toBe(false);
  });
});

describe("applyCountOverrides", () => {
  const catalog = parseCatalog(catalogFixture());
  const scene = parseScene(sceneFixture(), catalog);

  it("replaces the counts of species already in the scene", () => {
    const result = applyCountOverrides(scene, { sardine: 10 }, catalog);

    expect(result.fauna).toContainEqual({ species: "sardine", count: 10 });
  });

  it("adds species from the catalog that the scene did not include", () => {
    const base = parseScene({ ...sceneFixture(), fauna: [] }, catalog);

    const result = applyCountOverrides(base, { "blue-tang": 3 }, catalog);

    expect(result.fauna).toEqual([{ species: "blue-tang", count: 3 }]);
  });

  it("ignores species that are no longer in the catalog", () => {
    const result = applyCountOverrides(scene, { shark: 4 }, catalog);

    expect(result.fauna).toEqual(scene.fauna);
  });

  it("does not modify the original scene", () => {
    applyCountOverrides(scene, { sardine: 1 }, catalog);

    expect(scene.fauna).toContainEqual({ species: "sardine", count: 40 });
  });
});
