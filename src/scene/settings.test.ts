import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

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
