import { describe, expect, it } from "vitest";
import { burstCoastStyle } from "./burstCoast";
import { collect, HARNESS_STEP, headingGap, startStyle } from "./harness";

/**
 * Lengths of the runs of equal values in `values`, in seconds, by value. The
 * first and last runs are cut short by the sampling, so they are left out.
 */
function runLengths(values: readonly number[]): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  let start = values.findIndex((value) => value !== values[0]);
  for (let index = start + 1; index < values.length; index += 1) {
    if (values[index] === values[start]) continue;
    const value = values[start] ?? 0;
    runs.set(value, [...(runs.get(value) ?? []), (index - start) * HARNESS_STEP]);
    start = index;
  }
  return runs;
}

describe("burst-coast", () => {
  it("darts faster than cruise speed, then coasts slower", () => {
    const speeds = collect(startStyle(burstCoastStyle), 30, (state) => state.speed);

    expect(Math.max(...speeds)).toBeGreaterThan(1.5);
    expect(Math.min(...speeds)).toBeLessThan(0.5);
  });

  it("coasts for longer than it bursts", () => {
    const runs = runLengths(collect(startStyle(burstCoastStyle), 60, (state) => state.thrust));

    const bursts = runs.get(1) ?? [];
    const coasts = [...runs.entries()].filter(([thrust]) => thrust < 1).flatMap(([, run]) => run);
    expect(bursts.length).toBeGreaterThan(5);
    expect(Math.max(...bursts)).toBeLessThan(Math.min(...coasts));
  });

  it("stills its tail while coasting", () => {
    const thrusts = collect(startStyle(burstCoastStyle), 10, (state) => state.thrust);

    expect(Math.min(...thrusts)).toBeLessThan(0.3);
  });

  it("darts off in a new direction", () => {
    const yaws = collect(startStyle(burstCoastStyle), 30, (state) => state.yaw);

    const jumps = yaws.slice(1).map((yaw, index) => headingGap(yaw, yaws[index] ?? yaw));
    expect(Math.max(...jumps)).toBeGreaterThan(0.3);
  });

  it("reaches its burst speed quickly", () => {
    const responses = collect(startStyle(burstCoastStyle), 10, (state) => state.response);

    expect(Math.max(...responses)).toBeGreaterThan(4);
  });
});
