import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import type { Visitor } from "../scene/schema";
import { createVisitors, type Visitors } from "./visitors";

const TANK = { width: 6, height: 3, depth: 3 };
const STEP = 0.1;
const TURTLE: Visitor = {
  model: "sea-turtle",
  count: 1,
  length: 1,
  speed: 0.5,
  every: [40, 60],
  distance: [4, 6],
  height: [0.3, 0.8],
};

function run(visitors: Visitors, seconds: number, each?: () => void): void {
  for (let time = 0; time < seconds; time += STEP) {
    visitors.step(STEP);
    each?.();
  }
}

/** Runs until the first visitor shows, at most `seconds`; returns whether it did. */
function untilVisible(visitors: Visitors, seconds: number): boolean {
  for (let time = 0; time < seconds; time += STEP) {
    if (visitors.all[0]?.visible === true) return true;
    visitors.step(STEP);
  }
  return false;
}

describe("createVisitors", () => {
  it("keeps visitors away in the first seconds", () => {
    const visitors = createVisitors([TURTLE], TANK, createRng(1));
    let seen = false;

    run(visitors, 35, () => {
      seen ||= visitors.all.some((visitor) => visitor.visible);
    });

    expect(seen).toBe(false);
  });

  it("passes behind the tank, at its distance and height", () => {
    const visitors = createVisitors([TURTLE], TANK, createRng(2));
    untilVisible(visitors, 120);
    const turtle = visitors.all[0];

    expect([turtle?.position.z ?? 0, turtle?.position.y ?? 0]).toEqual([
      expect.toSatisfy((z: number) => z <= -(TANK.depth + 4) && z >= -(TANK.depth + 6)),
      expect.toSatisfy((y: number) => y > 0.2 * TANK.height && y < 0.9 * TANK.height),
    ]);
  });

  it("crosses from one side to the other, out of sight at both ends", () => {
    const visitors = createVisitors([TURTLE], TANK, createRng(3));
    untilVisible(visitors, 120);
    const turtle = visitors.all[0];
    const start = turtle?.position.x ?? 0;
    let end = start;
    let gone = false;

    run(visitors, 200, () => {
      gone ||= turtle?.visible !== true;
      if (!gone && turtle !== undefined) end = turtle.position.x;
    });

    expect([Math.abs(start) > TANK.width, Math.sign(start) === -Math.sign(end)]).toEqual([
      true,
      true,
    ]);
  });

  it("swims the way it goes, at its speed", () => {
    const visitors = createVisitors([TURTLE], TANK, createRng(4));
    untilVisible(visitors, 120);
    const turtle = visitors.all[0];
    const before = turtle?.position.x ?? 0;

    visitors.step(1);

    const moved = (turtle?.position.x ?? 0) - before;
    expect([Math.abs(moved), Math.sign(moved)]).toEqual([
      expect.closeTo(TURTLE.speed, 2) as number,
      Math.sign(turtle?.velocity.x ?? 0),
    ]);
  });

  it("comes back for another pass", () => {
    const visitors = createVisitors([TURTLE], TANK, createRng(5));
    let passes = 0;
    let wasVisible = false;

    run(visitors, 600, () => {
      const visible = visitors.all[0]?.visible === true;
      if (visible && !wasVisible) passes += 1;
      wasVisible = visible;
    });

    expect(passes).toBeGreaterThan(2);
  });

  it("brings each of a kind on its own", () => {
    const visitors = createVisitors([{ ...TURTLE, count: 3 }], TANK, createRng(6));

    expect(visitors.all.map((visitor) => [visitor.model, visitor.length])).toEqual([
      ["sea-turtle", 1],
      ["sea-turtle", 1],
      ["sea-turtle", 1],
    ]);
  });
});
