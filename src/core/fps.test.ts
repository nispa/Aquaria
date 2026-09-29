import { describe, expect, it } from "vitest";
import { createFpsMeter } from "./fps";

describe("createFpsMeter", () => {
  it("reports no reading before a full sampling window has passed", () => {
    const meter = createFpsMeter(1);

    meter.frame(0.5);

    expect(meter.fps).toBeUndefined();
  });

  it("reports frames per second over the sampling window", () => {
    const meter = createFpsMeter(1);

    for (let frame = 0; frame < 60; frame += 1) meter.frame(1 / 60);

    expect(meter.fps).toBe(60);
  });

  it("updates with the most recent window", () => {
    const meter = createFpsMeter(1);
    for (let frame = 0; frame < 60; frame += 1) meter.frame(1 / 60);

    for (let frame = 0; frame < 30; frame += 1) meter.frame(1 / 30);

    expect(meter.fps).toBe(30);
  });
});
