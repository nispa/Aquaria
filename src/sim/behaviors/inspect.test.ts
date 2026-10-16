import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { headingGap, startActivity } from "./harness";
import { inspectActivity } from "./inspect";

const place = new Vector3(1, 0.3, -1);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The speed a fish wants half a second after arriving by the place. */
function lookingSpeed(seed: number): number {
  const inspecting = startActivity(inspectActivity, {}, place, 0.3, seed);
  inspecting.context.position.set(1.5, 0.3, -1);
  inspecting.run(0.5);
  return inspecting.wishes.speed;
}

describe("inspect", () => {
  it("swims towards the place at cruise speed", () => {
    const inspecting = startActivity(inspectActivity);

    inspecting.run(1 / 60);

    expect(inspecting.wishes.speed).toBe(1);
    expect(headingGap(inspecting.wishes.yaw, 0)).toBeLessThan(0.05);
  });

  it("slows down to look once close, circling it or hovering facing it", () => {
    const inspecting = startActivity(inspectActivity);
    inspecting.context.position.set(1.5, 0.3, -1);

    inspecting.run(0.5);

    expect(inspecting.wishes.speed).toBeLessThan(1);
  });

  it("looks at the upper part of the place", () => {
    const inspecting = startActivity(inspectActivity);

    inspecting.run(1 / 60);

    expect(inspecting.wishes.height).toBeLessThanOrEqual(place.y);
    expect(inspecting.wishes.height).toBeGreaterThan(place.y - 0.3);
  });

  it("circles some places and hovers facing others", () => {
    const speeds = SEEDS.map(lookingSpeed);

    expect(new Set(speeds).size).toBe(2);
  });

  it("leaves after looking for a while", () => {
    const inspecting = startActivity(inspectActivity, { seconds: [2, 3] });
    inspecting.context.position.set(1.5, 0.3, -1);

    const ended = inspecting.run(10);

    expect(ended).toBeGreaterThanOrEqual(2);
    expect(ended).toBeLessThanOrEqual(3.05);
  });

  it("gives up when it never gets there", () => {
    const inspecting = startActivity(inspectActivity);

    expect(inspecting.run(60)).toBeDefined();
  });
});

describe("diving down", () => {
  it("dives steeply towards a place far below", () => {
    const inspecting = startActivity(inspectActivity);

    inspecting.run(1 / 60);

    expect(inspecting.wishes.steep).toBe(true);
  });

  it("levels out once it looks", () => {
    const inspecting = startActivity(inspectActivity);
    inspecting.context.position.set(1.5, 0.3, -1);

    inspecting.run(0.5);

    expect(inspecting.wishes.steep).toBe(false);
  });
});
