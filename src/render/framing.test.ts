import { describe, expect, it } from "vitest";
import { cameraFraming } from "./framing";

const tank = { width: 9, height: 5, depth: 6 };

describe("cameraFraming", () => {
  it("places the camera in front of the glass at mid height", () => {
    const framing = cameraFraming(tank, 16 / 9, 38);

    expect(framing.position[2]).toBeGreaterThan(0);
    expect(framing.position[1]).toBeCloseTo(tank.height / 2);
  });

  it("fills a 16:9 screen with the front of the tank", () => {
    const framing = cameraFraming(tank, 16 / 9, 38);
    const halfHeight = Math.tan(((38 / 2) * Math.PI) / 180) * framing.position[2];

    expect(halfHeight * 2).toBeLessThanOrEqual(tank.height);
    expect(halfHeight * 2 * (16 / 9)).toBeLessThanOrEqual(tank.width);
  });

  it("moves closer on very wide screens so the glass still fills the view", () => {
    const wide = cameraFraming(tank, 21 / 9, 38);
    const standard = cameraFraming(tank, 16 / 9, 38);

    expect(wide.position[2]).toBeLessThan(standard.position[2]);
  });

  it("looks into the tank", () => {
    const framing = cameraFraming(tank, 16 / 9, 38);

    expect(framing.target[2]).toBeLessThan(0);
  });
});
