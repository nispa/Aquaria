import { describe, expect, it } from "vitest";
import { crawlStyle } from "./crawl";
import { collect, headingGap, startStyle } from "./harness";

describe("crawl", () => {
  it("walks on the floor", () => {
    const grounded = collect(startStyle(crawlStyle), 30, (state) => (state.grounded ? 1 : 0));

    expect(Math.min(...grounded)).toBe(1);
  });

  it("walks slower than cruise speed", () => {
    const speeds = collect(startStyle(crawlStyle), 60, (state) => state.speed);

    expect(Math.max(...speeds)).toBeLessThan(1);
  });

  it("stops now and then to pick at the ground", () => {
    const speeds = collect(startStyle(crawlStyle), 60, (state) => state.speed);

    expect(Math.min(...speeds)).toBe(0);
  });

  it("moves its legs, not its tail", () => {
    const thrusts = collect(startStyle(crawlStyle), 60, (state) => state.thrust);

    expect(Math.max(...thrusts)).toBeLessThan(0.3);
  });

  it("sets off in a new direction after a stop", () => {
    const yaws = collect(startStyle(crawlStyle), 60, (state) => state.yaw);

    const jumps = yaws.slice(1).map((yaw, index) => headingGap(yaw, yaws[index] ?? yaw));
    expect(Math.max(...jumps)).toBeGreaterThan(0.3);
  });
});
