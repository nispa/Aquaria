import { describe, expect, it } from "vitest";
import { createFrameLimiter } from "./frameLimiter";

/** How many of the display's refreshes over one second draw a frame. */
function framesDrawn(limit: number, refreshHz: number, jitterMs = 0): number {
  const limiter = createFrameLimiter(limit);
  let drawn = 0;
  for (let tick = 0; tick < refreshHz; tick += 1) {
    const jitter = tick % 2 === 0 ? jitterMs : -jitterMs;
    if (limiter.due((tick * 1000) / refreshHz + jitter)) drawn += 1;
  }
  return drawn;
}

describe("the frame limiter", () => {
  it("draws every refresh without a limit", () => {
    expect(framesDrawn(0, 144)).toBe(144);
  });

  it("draws every other refresh of a 60 Hz display at 30 fps", () => {
    expect(framesDrawn(30, 60)).toBe(30);
  });

  it("draws every refresh of a 60 Hz display at 60 fps, even when they arrive unevenly", () => {
    expect(framesDrawn(60, 60, 1)).toBe(60);
  });

  it("keeps a 144 Hz display to about 60 frames a second", () => {
    expect(framesDrawn(60, 144)).toBeGreaterThanOrEqual(55);
    expect(framesDrawn(60, 144)).toBeLessThanOrEqual(62);
  });
});
