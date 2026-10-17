import { describe, expect, it } from "vitest";
import {
  createFeatureCalibration,
  MEASURE_SECONDS,
  SETTLE_SECONDS,
  type FeatureCalibration,
  type FeatureChange,
} from "./featureCalibration";

const BUDGET_MS = 25;
/** A power of two, so frames add up to the settle and measure times exactly. */
const FRAME_SECONDS = 1 / 32;
/** Settling after a change, then measuring: one decision. */
const ONE_TRIAL_SECONDS = SETTLE_SECONDS + MEASURE_SECONDS;

/** Feeds frames of one cost for a while; returns every change asked for. */
function run(
  calibration: FeatureCalibration,
  costMs: number,
  seconds: number,
  frameSeconds = FRAME_SECONDS,
): FeatureChange[] {
  const changes: FeatureChange[] = [];
  const frames = Math.round(seconds / frameSeconds);
  for (let frame = 0; frame < frames; frame += 1) {
    changes.push(...calibration.frame(costMs, frameSeconds));
  }
  return changes;
}

/** Frames of a usual cost with a long hitch every so often. */
function runWithHitches(calibration: FeatureCalibration, seconds: number): FeatureChange[] {
  const changes: FeatureChange[] = [];
  const frames = Math.round(seconds / FRAME_SECONDS);
  for (let frame = 0; frame < frames; frame += 1) {
    const costMs = frame % HITCH_EVERY === 0 ? 100 : 10;
    changes.push(...calibration.frame(costMs, FRAME_SECONDS));
  }
  return changes;
}
const HITCH_EVERY = 5;

describe("createFeatureCalibration", () => {
  it("adds the first candidate once the base look fits the budget", () => {
    const calibration = createFeatureCalibration(["shadows", "bloom"], BUDGET_MS);

    const changes = run(calibration, 10, ONE_TRIAL_SECONDS);

    expect(changes).toEqual([{ id: "shadows", enabled: true }]);
  });

  it("ignores the frames right after a change, when shaders compile", () => {
    const calibration = createFeatureCalibration(["shadows"], BUDGET_MS);
    run(calibration, 10, ONE_TRIAL_SECONDS);

    run(calibration, 200, SETTLE_SECONDS / 2);
    const changes = run(calibration, 10, ONE_TRIAL_SECONDS);

    expect([changes, calibration.done]).toEqual([[], true]);
  });

  it("waits for a few frames after a change, however long the first ones take", () => {
    const calibration = createFeatureCalibration(["shadows"], BUDGET_MS);
    run(calibration, 10, ONE_TRIAL_SECONDS);

    const changes = [
      ...run(calibration, 300, SETTLE_SECONDS * 2, SETTLE_SECONDS / 2),
      ...run(calibration, 10, ONE_TRIAL_SECONDS),
    ];

    expect([changes, calibration.done]).toEqual([[], true]);
  });

  it("judges the usual frame, not the odd hitch", () => {
    const calibration = createFeatureCalibration(["shadows"], BUDGET_MS);

    const changes = runWithHitches(calibration, ONE_TRIAL_SECONDS);

    expect(changes).toEqual([{ id: "shadows", enabled: true }]);
  });

  it("takes away a candidate that runs over the budget and tries the next", () => {
    const calibration = createFeatureCalibration(["volumetric-light", "bloom"], BUDGET_MS);
    run(calibration, 10, ONE_TRIAL_SECONDS);

    const changes = run(calibration, 40, ONE_TRIAL_SECONDS);

    expect(changes).toEqual([
      { id: "volumetric-light", enabled: false },
      { id: "bloom", enabled: true },
    ]);
  });

  it("keeps some room under the budget for busier moments", () => {
    const calibration = createFeatureCalibration(["shadows"], BUDGET_MS);
    run(calibration, 10, ONE_TRIAL_SECONDS);

    const changes = run(calibration, BUDGET_MS * 0.97, ONE_TRIAL_SECONDS);

    expect(changes).toEqual([{ id: "shadows", enabled: false }]);
  });

  it("adds nothing when even the base look runs over the budget", () => {
    const calibration = createFeatureCalibration(["shadows"], BUDGET_MS);

    const changes = run(calibration, 40, ONE_TRIAL_SECONDS);

    expect([changes, calibration.done]).toEqual([[], true]);
  });

  it("is done once every candidate has been tried", () => {
    const calibration = createFeatureCalibration(["shadows", "bloom"], BUDGET_MS);

    run(calibration, 10, ONE_TRIAL_SECONDS * 3);

    expect([calibration.done, calibration.frame(10, FRAME_SECONDS)]).toEqual([true, []]);
  });

  it("is done at once with nothing to try", () => {
    expect(createFeatureCalibration([], BUDGET_MS).done).toBe(true);
  });
});
