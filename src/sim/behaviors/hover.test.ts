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

describe("hover over a host", () => {
  const anemone = { x: 1, z: -1.5, height: 0.2, tags: ["anemone", "shelter"] };
  const coral = { x: -1, z: -0.5, height: 0.3, tags: ["coral"] };

  it("keeps station just above the nearest place with its home tag", () => {
    const hosted = startStyle(hoverStyle, { home: "anemone" }, 1, [coral, anemone]);

    const { home } = hosted.state;

    expect([home.x, home.z]).toEqual([1, -1.5]);
    expect(home.y).toBeGreaterThan(0.2);
    expect(home.y).toBeLessThan(0.2 + hosted.context.length * 2);
    expect(hosted.state.anchored).toBe(true);
  });

  it("keeps station where it started when no place has its home tag", () => {
    const hovering = startStyle(hoverStyle, { home: "anemone" }, 1, [coral]);

    expect(hovering.state.home.toArray()).toEqual(hovering.context.position.toArray());
    expect(hovering.state.anchored).toBe(false);
  });

  it("stays close to its host, never deeper in it than half a body length", () => {
    const hosted = startStyle(hoverStyle, { home: "anemone" }, 1, [anemone]);
    const roam = hosted.params.roamBodyLengths * hosted.context.length;

    const heights = collect(hosted, 60, (state) => state.height);

    expect(Math.min(...heights)).toBeGreaterThanOrEqual(anemone.height - hosted.context.length / 2);
    expect(Math.max(...heights)).toBeLessThanOrEqual(hosted.state.home.y + roam);
  });

  it("swims home at cruise speed when it is far away", () => {
    const hosted = startStyle(hoverStyle, { home: "anemone" }, 1, [anemone]);
    hosted.context.position.set(-1.5, 1, -1.5);

    hosted.run(1 / 60);

    expect(hosted.state.speed).toBe(1);
    expect(headingGap(hosted.state.yaw, 0)).toBeLessThan(0.1);
  });
});

describe("arriving home", () => {
  it("slows down to hovering as soon as it is back near home", () => {
    const hosted = startStyle(hoverStyle, { home: "anemone" }, 1, [
      { x: 1, z: -1.5, height: 0.2, tags: ["anemone"] },
    ]);
    hosted.context.position.set(-1.5, 1, -1.5);
    hosted.run(1 / 60);

    hosted.context.position.set(1.2, 0.5, -1.5);
    hosted.run(1 / 60);

    expect(hosted.state.speed).toBeLessThan(0.5);
  });
});

describe("far above home", () => {
  it("swims at cruise speed to sink down to its host", () => {
    const hosted = startStyle(hoverStyle, { home: "anemone", roamBodyLengths: 2 }, 1, [
      { x: 0, z: -1, height: 0.2, tags: ["anemone"] },
    ]);
    hosted.context.position.set(0.1, 1.8, -1);

    hosted.run(1 / 60);

    expect(hosted.state.speed).toBe(1);
    expect(hosted.state.height).toBe(hosted.state.home.y);
  });
});

describe("station keeping", () => {
  it("turns back as soon as it drifts out of its spot, without waiting for its next turn", () => {
    const hovering = startStyle(hoverStyle, { roamBodyLengths: 2 });
    const { state, context } = hovering;
    state.yaw = 0;
    state.timer = 10;
    context.position.x = state.home.x + context.length * 2.5;

    hovering.run(1 / 60);

    expect(headingGap(state.yaw, Math.PI)).toBeLessThan(0.1);
  });
});

describe("nestling", () => {
  it("now and then nestles down into its host", () => {
    const anemone = { x: 0, z: -1, height: 0.2, tags: ["anemone"] };
    const hosted = startStyle(hoverStyle, { home: "anemone", heightChangeSeconds: 2 }, 1, [
      anemone,
    ]);

    const heights = collect(hosted, 60, (state) => state.height);

    expect(Math.min(...heights)).toBeLessThan(anemone.height);
  });
});
