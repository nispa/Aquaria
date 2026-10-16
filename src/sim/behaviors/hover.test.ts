import { describe, expect, it } from "vitest";
import { collect, headingGap, startStyle } from "./harness";
import { hoverStyle } from "./hover";

describe("hover", () => {
  it("drifts far slower than cruise speed", () => {
    const speeds = collect(startStyle(hoverStyle), 30, (state) => state.speed);

    expect(Math.max(...speeds)).toBeLessThan(0.4);
  });

  it("turns on the spot now and then", () => {
    const yaws = collect(startStyle(hoverStyle), 30, (state) => state.yaw);

    const turns = yaws.slice(1).filter((yaw, index) => headingGap(yaw, yaws[index] ?? yaw) > 0.3);
    expect(turns.length).toBeGreaterThan(3);
  });

  it("keeps station where it started", () => {
    const hovering = startStyle(hoverStyle);

    expect(hovering.state.home.toArray()).toEqual(hovering.context.position.toArray());
  });

  it("turns back towards its spot once it has strayed", () => {
    const hovering = startStyle(hoverStyle);
    hovering.context.position.x += 1.5;

    hovering.run(6);

    expect(headingGap(hovering.state.yaw, Math.PI)).toBeLessThan(0.6);
  });

  it("works its tail gently", () => {
    const thrusts = collect(startStyle(hoverStyle), 5, (state) => state.thrust);

    expect(Math.max(...thrusts)).toBeLessThan(1);
  });
});
