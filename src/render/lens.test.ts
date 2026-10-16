import { describe, expect, it } from "vitest";
import { lensDiscScale, lensFov } from "./lens";

describe("the magnifier", () => {
  it("shows what lies under it, magnified: a third of its own width at 3x", () => {
    // A 300-pixel lens on a 900-pixel screen covers a third of its height.
    const covered = Math.tan(((lensFov(45, 3, 300, 900) / 2) * Math.PI) / 180);
    const screen = Math.tan(((45 / 2) * Math.PI) / 180);

    expect(covered / screen).toBeCloseTo(1 / 9);
  });

  it("draws a round disc of the same size in pixels on any screen shape", () => {
    const scale = lensDiscScale(150, 1600, 900);

    // Half the screen spans 1 in normalized coordinates on each axis.
    expect(scale.x * (1600 / 2)).toBeCloseTo(150);
    expect(scale.y * (900 / 2)).toBeCloseTo(150);
  });
});
