import { describe, expect, it } from "vitest";
import { createFixedStepClock } from "./clock";

const STEP = 1 / 60;

describe("createFixedStepClock", () => {
  it("returns no steps while less than one step has accumulated", () => {
    const clock = createFixedStepClock({ stepSeconds: STEP, maxDeltaSeconds: 0.25 });

    const steps = clock.advance(STEP / 2);

    expect(steps).toBe(0);
  });

  it("carries leftover time into the next frame", () => {
    const clock = createFixedStepClock({ stepSeconds: STEP, maxDeltaSeconds: 0.25 });

    clock.advance(STEP * 0.6);
    const steps = clock.advance(STEP * 0.6);

    expect(steps).toBe(1);
  });

  it("returns several steps for a long frame", () => {
    const clock = createFixedStepClock({ stepSeconds: STEP, maxDeltaSeconds: 0.25 });

    const steps = clock.advance(STEP * 3.2);

    expect(steps).toBe(3);
  });

  it("clamps very long frames to avoid simulation jumps", () => {
    const clock = createFixedStepClock({ stepSeconds: 0.1, maxDeltaSeconds: 0.25 });

    const steps = clock.advance(10);

    expect(steps).toBe(2);
  });

  it("ignores negative deltas", () => {
    const clock = createFixedStepClock({ stepSeconds: STEP, maxDeltaSeconds: 0.25 });

    const steps = clock.advance(-1);

    expect(steps).toBe(0);
  });

  it("tracks total simulated time", () => {
    const clock = createFixedStepClock({ stepSeconds: 0.5, maxDeltaSeconds: 2 });

    clock.advance(1.2);

    expect(clock.elapsedSeconds).toBe(1);
  });

  it("exposes the interpolation factor between steps", () => {
    const clock = createFixedStepClock({ stepSeconds: 1, maxDeltaSeconds: 2 });

    clock.advance(1.25);

    expect(clock.alpha).toBeCloseTo(0.25);
  });

  it("rejects a non-positive step", () => {
    expect(() => createFixedStepClock({ stepSeconds: 0, maxDeltaSeconds: 1 })).toThrow();
  });
});
