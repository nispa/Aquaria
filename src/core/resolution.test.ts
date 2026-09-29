import { describe, expect, it } from "vitest";
import {
  FULL_HD_HEIGHT,
  pixelRatioForHeight,
  renderSize,
  resolutionLabel,
  UHD_HEIGHT,
} from "./resolution";

describe("pixelRatioForHeight", () => {
  it("renders 4K on a 1080-pixel-high CSS viewport with a ratio of 2", () => {
    expect(pixelRatioForHeight(UHD_HEIGHT, 1080)).toBe(2);
  });

  it("renders Full HD on a 2160-pixel-high CSS viewport with a ratio of 0.5", () => {
    expect(pixelRatioForHeight(FULL_HD_HEIGHT, 2160)).toBe(0.5);
  });

  it("returns 1 for an empty viewport instead of dividing by zero", () => {
    expect(pixelRatioForHeight(UHD_HEIGHT, 0)).toBe(1);
  });
});

describe("renderSize", () => {
  it("keeps the viewport aspect ratio at the target height", () => {
    expect(renderSize(1920, 1080, UHD_HEIGHT)).toEqual({ width: 3840, height: 2160 });
  });

  it("rounds to whole pixels", () => {
    expect(renderSize(1000, 700, 1080)).toEqual({ width: 1543, height: 1080 });
  });
});

describe("resolutionLabel", () => {
  it("names the standard presets", () => {
    expect(resolutionLabel(FULL_HD_HEIGHT)).toBe("Full HD (1080p)");
    expect(resolutionLabel(UHD_HEIGHT)).toBe("4K (2160p)");
  });

  it("shows other heights as plain progressive resolutions", () => {
    expect(resolutionLabel(1440)).toBe("1440p");
  });
});
