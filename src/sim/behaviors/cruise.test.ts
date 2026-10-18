import { describe, expect, it } from "vitest";
import { cruiseStyle } from "./cruise";
import { collect, headingGap, startStyle } from "./harness";

describe("cruise", () => {
  it("varies its speed around cruise speed", () => {
    const speeds = collect(startStyle(cruiseStyle), 60, (state) => state.speed);

    expect(Math.min(...speeds)).toBeLessThan(0.95);
    expect(Math.max(...speeds)).toBeGreaterThan(1.05);
  });

  it("never crawls nor races while cruising", () => {
    const speeds = collect(startStyle(cruiseStyle), 120, (state) => state.speed);

    expect(Math.min(...speeds)).toBeGreaterThan(0.5);
    expect(Math.max(...speeds)).toBeLessThan(1.5);
  });

  it("changes the height it swims at, within its room", () => {
    const cruising = startStyle(cruiseStyle);

    const heights = collect(cruising, 60, (state) => state.height);

    expect(new Set(heights).size).toBeGreaterThan(2);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(cruising.context.room.min.y);
    expect(Math.max(...heights)).toBeLessThanOrEqual(cruising.context.room.max.y);
  });

  it("turns gradually, never on the spot", () => {
    const yaws = collect(startStyle(cruiseStyle), 30, (state) => state.yaw);

    const jumps = yaws.slice(1).map((yaw, index) => headingGap(yaw, yaws[index] ?? yaw));
    expect(Math.max(...jumps)).toBeLessThan(0.4);
  });

  it("keeps the tail beating fully by default, or at the thrust the species sets", () => {
    const defaultThrusts = collect(startStyle(cruiseStyle), 10, (state) => state.thrust);
    const finThrusts = collect(
      startStyle(cruiseStyle, { thrust: 0.25 }),
      10,
      (state) => state.thrust,
    );

    expect(new Set(defaultThrusts)).toEqual(new Set([1]));
    expect(new Set(finThrusts)).toEqual(new Set([0.25]));
  });
});
