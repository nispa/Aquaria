import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene } from "./parse";
import {
  applyCountOverrides,
  DEFAULT_MSAA_SAMPLES,
  autoResolutionOf,
  DEFAULT_SETTINGS,
  defaultRenderHeight,
  frameLimitOf,
  parseSettings,
  soundOf,
  volumeOf,
} from "./settings";

describe("parseSettings", () => {
  it("returns the defaults when nothing was saved", () => {
    expect(parseSettings(null)).toEqual({ settings: DEFAULT_SETTINGS, valid: true });
  });

  it("starts in playful mode, not realistic", () => {
    expect(DEFAULT_SETTINGS.realistic).not.toBe(true);
  });

  it("remembers realistic mode", () => {
    expect(parseSettings({ realistic: true }).settings.realistic).toBe(true);
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

  it("starts at the given default render height when nothing was saved", () => {
    expect(parseSettings(null, 720).settings.renderHeight).toBe(720);
  });

  it("uses the given default render height when the saved settings have none", () => {
    expect(parseSettings({ showFps: true }, 720).settings.renderHeight).toBe(720);
  });

  it("keeps a saved render height over the given default", () => {
    expect(parseSettings({ renderHeight: 1080 }, 720).settings.renderHeight).toBe(1080);
  });

  it("uses the given default render height for corrupted settings", () => {
    expect(parseSettings({ renderHeight: "huge" }, 720).settings.renderHeight).toBe(720);
  });

  it("rejects render heights outside the supported range", () => {
    expect(parseSettings({ renderHeight: 8000 }).valid).toBe(false);
  });

  it("limits frames to a safe 60 a second unless told otherwise", () => {
    expect(frameLimitOf(DEFAULT_SETTINGS)).toBe(60);
  });

  it("remembers a frame limit of 30, or none", () => {
    expect(frameLimitOf(parseSettings({ frameLimit: 30 }).settings)).toBe(30);
    expect(frameLimitOf(parseSettings({ frameLimit: 0 }).settings)).toBe(0);
  });

  it("rejects a frame limit it does not offer", () => {
    expect(parseSettings({ frameLimit: 45 }).valid).toBe(false);
  });

  it("makes its sounds at a gentle volume unless told otherwise", () => {
    expect(soundOf(DEFAULT_SETTINGS)).toBe(true);
    expect(volumeOf(DEFAULT_SETTINGS)).toBeLessThan(1);
  });

  it("remembers sound switched off and the volume", () => {
    const { settings } = parseSettings({ sound: false, volume: 0.3 });

    expect([soundOf(settings), volumeOf(settings)]).toEqual([false, 0.3]);
  });

  it("adapts the resolution to the GPU unless told not to", () => {
    expect(autoResolutionOf(DEFAULT_SETTINGS)).toBe(true);
    expect(autoResolutionOf(parseSettings({ autoResolution: false }).settings)).toBe(false);
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

describe("look preference", () => {
  it("has no saved feature choices by default, so each feature uses its default", () => {
    expect(DEFAULT_SETTINGS.look).toBeUndefined();
  });

  it("keeps the saved on/off choice of each feature", () => {
    const look = { shadows: false, "ambient-occlusion": true };

    expect(parseSettings({ look }).settings.look).toEqual(look);
  });

  it("rejects feature choices that are not on/off values", () => {
    expect(parseSettings({ look: { shadows: "maybe" } }).valid).toBe(false);
  });

  it("keeps settings saved when the look was a shader pack", () => {
    const { settings, valid } = parseSettings({ shaderPack: "classic", showFps: true });

    expect([valid, settings.showFps]).toEqual([true, true]);
  });
});

describe("scenery preference", () => {
  it("keeps saved scenery counts per scene", () => {
    const scenery = { reef: { rock: 3, "fan-coral": 0 } };

    expect(parseSettings({ scenery }).settings.scenery).toEqual(scenery);
  });

  it("rejects negative scenery counts", () => {
    expect(parseSettings({ scenery: { reef: { rock: -1 } } }).valid).toBe(false);
  });
});

describe("3D model preference", () => {
  it("keeps the body chosen per species", () => {
    const fishModels = { "neon-tetra": false, guppy: true };

    expect(parseSettings({ fishModels }).settings.fishModels).toEqual(fishModels);
  });
});

describe("fish size preference", () => {
  it("keeps a saved size balance", () => {
    expect(parseSettings({ sizeBalance: 0.8 }).settings.sizeBalance).toBe(0.8);
  });

  it("rejects a balance above 1", () => {
    expect(parseSettings({ sizeBalance: 1.5 }).valid).toBe(false);
  });
});

describe("lights preference", () => {
  it("has no custom lights by default, so the scene's lights are used", () => {
    expect(DEFAULT_SETTINGS.lights).toBeUndefined();
  });

  it("keeps a saved custom light setup, filling missing fields", () => {
    const { settings } = parseSettings({ lights: { cycle: { mode: "clock" } } });

    expect(settings.lights?.cycle.mode).toBe("clock");
    expect(settings.lights?.channels.white.level).toBeGreaterThan(0);
  });
});

describe("scene preference", () => {
  it("remembers the last chosen scene", () => {
    expect(parseSettings({ scene: "home-reef" }).settings.scene).toBe("home-reef");
  });

  it("rejects scene ids that could escape the scenes folder", () => {
    expect(parseSettings({ scene: "../x" }).valid).toBe(false);
  });
});

describe("panel sections", () => {
  it("remembers which panel sections the viewer opened or closed", () => {
    const saved = { panelSections: { fauna: false, time: true } };

    expect(parseSettings(saved).settings.panelSections).toEqual({ fauna: false, time: true });
  });

  it("rejects section states that are not open/closed values", () => {
    expect(parseSettings({ panelSections: { time: "open" } }).valid).toBe(false);
  });
});

describe("anti-aliasing preference", () => {
  it("defaults to 2x multisampling", () => {
    expect(DEFAULT_SETTINGS.msaaSamples ?? DEFAULT_MSAA_SAMPLES).toBe(2);
  });

  it("accepts off, 2x, 4x and 8x", () => {
    const valid = [0, 2, 4, 8].map((msaaSamples) => parseSettings({ msaaSamples }).valid);

    expect(valid).toEqual([true, true, true, true]);
  });

  it("rejects other sample counts", () => {
    expect(parseSettings({ msaaSamples: 3 }).valid).toBe(false);
  });
});

describe("defaultRenderHeight", () => {
  it("reads a configured render height", () => {
    expect(defaultRenderHeight("720")).toBe(720);
  });

  it("falls back to 4K when nothing is configured", () => {
    expect(defaultRenderHeight(undefined)).toBe(2160);
  });

  it("falls back to 4K for a configured height outside the supported range", () => {
    expect(defaultRenderHeight("100")).toBe(2160);
  });

  it("falls back to 4K for a configured height that is not a number", () => {
    expect(defaultRenderHeight("hd")).toBe(2160);
  });
});
