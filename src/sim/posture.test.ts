import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  easeToward,
  MAX_BEND,
  MAX_EFFORT,
  MIN_EFFORT,
  tailEffort,
  turnBend,
  CALM_TURN_ACCELERATION,
  CALM_TURN_RATE,
  turnWithInertia,
  MAX_TURN_RATE,
  MIN_TURN_RATE,
  maxTurnRate,
} from "./posture";

const STEP = 0.1;

describe("turnBend", () => {
  it("is zero when the fish swims straight", () => {
    expect(turnBend(new Vector3(1, 0, 0), new Vector3(1.2, 0, 0), STEP, 0.1)).toBe(0);
  });

  it("is positive when the fish turns left (towards -z when heading +x)", () => {
    expect(turnBend(new Vector3(1, 0, 0), new Vector3(1, 0, -0.1), STEP, 0.1)).toBeGreaterThan(0);
  });

  it("is negative when the fish turns right (towards +z when heading +x)", () => {
    expect(turnBend(new Vector3(1, 0, 0), new Vector3(1, 0, 0.1), STEP, 0.1)).toBeLessThan(0);
  });

  it("is the path curvature times the body length", () => {
    // Lateral acceleration 1 m/s² at 1 m/s: curvature 1/m, so a 0.2 m fish bends 0.2.
    expect(turnBend(new Vector3(1, 0, 0), new Vector3(1, 0, -0.1), STEP, 0.2)).toBeCloseTo(0.2, 1);
  });

  it("bends a longer fish more on the same path", () => {
    const short = turnBend(new Vector3(1, 0, 0), new Vector3(1, 0, -0.1), STEP, 0.1);
    const long = turnBend(new Vector3(1, 0, 0), new Vector3(1, 0, -0.1), STEP, 0.3);
    expect(long).toBeGreaterThan(short);
  });

  it("is limited to a tight C shape on violent turns", () => {
    expect(turnBend(new Vector3(0.1, 0, 0), new Vector3(0, 0, -5), STEP, 1)).toBe(MAX_BEND);
  });

  it("ignores climbing and diving", () => {
    expect(turnBend(new Vector3(1, 0, 0), new Vector3(1, 0.3, 0), STEP, 0.1)).toBe(0);
  });

  it("is zero for a fish hovering in place", () => {
    expect(turnBend(new Vector3(), new Vector3(), STEP, 0.1)).toBe(0);
  });
});

describe("tailEffort", () => {
  it("is one when cruising at steady speed", () => {
    expect(tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.2, 0, 0), STEP, 0.2)).toBeCloseTo(1);
  });

  it("is larger while the fish accelerates", () => {
    const steady = tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.2, 0, 0), STEP, 0.2);
    const bursting = tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.25, 0, 0), STEP, 0.2);
    expect(bursting).toBeGreaterThan(steady);
  });

  it("is smaller while the fish slows down to a hover", () => {
    expect(tailEffort(new Vector3(0.1, 0, 0), new Vector3(0.08, 0, 0), STEP, 0.2)).toBeLessThan(1);
  });

  it("never stops the tail completely", () => {
    expect(tailEffort(new Vector3(0.2, 0, 0), new Vector3(), STEP, 0.2)).toBe(MIN_EFFORT);
  });

  it("is limited during an escape burst", () => {
    expect(tailEffort(new Vector3(), new Vector3(3, 0, 0), STEP, 0.2)).toBe(MAX_EFFORT);
  });

  it("follows the thrust a swimming style puts in", () => {
    const full = tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.2, 0, 0), STEP, 0.2, 1);
    const half = tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.2, 0, 0), STEP, 0.2, 0.5);
    expect(half).toBeCloseTo(full / 2);
  });

  it("holds the tail still while gliding without thrust", () => {
    expect(tailEffort(new Vector3(0.2, 0, 0), new Vector3(0.1, 0, 0), STEP, 0.2, 0)).toBe(0);
  });
});

describe("easeToward", () => {
  it("moves part of the way towards the target", () => {
    const eased = easeToward(0, 1, 0.5, STEP);
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(1);
  });

  it("covers about 63% of the gap after one response time", () => {
    expect(easeToward(0, 1, 0.5, 0.5)).toBeCloseTo(0.632, 3);
  });

  it("jumps to the target when there is no response time", () => {
    expect(easeToward(0, 1, 0, STEP)).toBe(1);
  });
});

describe("turnWithInertia", () => {
  const yawOf = (velocity: Vector3) => Math.atan2(velocity.z, velocity.x);
  const calm = { turnRate: 0 };

  it("limits how fast a calm fish turns", () => {
    const turn = { turnRate: 0 };
    const next = new Vector3(0, 0, 1);

    for (let step = 0; step < 30; step += 1) {
      turnWithInertia(new Vector3(1, 0, 0), next.set(0, 0, 1), turn, 1, 0, STEP);
    }

    expect(Math.abs(turn.turnRate)).toBeLessThanOrEqual(CALM_TURN_RATE + 1e-9);
  });

  it("builds up a turn gradually instead of snapping into it", () => {
    const turn = { ...calm };
    const next = new Vector3(0, 0, 1);

    turnWithInertia(new Vector3(1, 0, 0), next, turn, 1, 0, STEP);

    expect(Math.abs(turn.turnRate)).toBeLessThanOrEqual(CALM_TURN_ACCELERATION * STEP + 1e-9);
    expect(Math.abs(yawOf(next))).toBeLessThanOrEqual(CALM_TURN_ACCELERATION * STEP * STEP + 1e-9);
  });

  it("keeps the speed and the climb, changing only the heading", () => {
    const turn = { turnRate: 0 };
    const next = new Vector3(0.1, 0.2, 0.3);
    const speed = next.length();

    turnWithInertia(new Vector3(0.3, 0, 0), next, turn, 1, 0, STEP);

    expect(next.length()).toBeCloseTo(speed);
    expect(next.y).toBeCloseTo(0.2);
  });

  it("turns round in a curve rather than flipping over", () => {
    const turn = { turnRate: 0 };
    const previous = new Vector3(1, 0, 0);
    const next = new Vector3();
    const yaws: number[] = [];

    for (let step = 0; step < 120; step += 1) {
      turnWithInertia(previous, next.set(-1, 0, 0.001), turn, 1, 0, STEP);
      yaws.push(yawOf(next));
      previous.copy(next);
    }

    const steps = yaws.slice(1).map((yaw, index) => {
      const before = yaws[index] ?? yaw;
      return Math.abs(Math.atan2(Math.sin(yaw - before), Math.cos(yaw - before)));
    });
    expect(Math.max(...steps)).toBeLessThanOrEqual(CALM_TURN_RATE * STEP + 1e-6);
    expect(Math.abs(yawOf(previous))).toBeGreaterThan(Math.PI * 0.9);
  });

  it("lets a frightened fish turn much faster", () => {
    const calmTurn = { turnRate: 0 };
    const scaredTurn = { turnRate: 0 };

    for (let step = 0; step < 10; step += 1) {
      turnWithInertia(new Vector3(1, 0, 0), new Vector3(0, 0, 1), calmTurn, 1, 0, STEP);
      turnWithInertia(new Vector3(1, 0, 0), new Vector3(0, 0, 1), scaredTurn, 1, 1, STEP);
    }

    expect(Math.abs(scaredTurn.turnRate)).toBeGreaterThan(Math.abs(calmTurn.turnRate) * 2);
  });

  it("lets small, quick species turn faster than slow, large ones", () => {
    const nimble = { turnRate: 0 };
    const stately = { turnRate: 0 };

    for (let step = 0; step < 10; step += 1) {
      turnWithInertia(new Vector3(1, 0, 0), new Vector3(0, 0, 1), nimble, 4, 0, STEP);
      turnWithInertia(new Vector3(1, 0, 0), new Vector3(0, 0, 1), stately, 0.5, 0, STEP);
    }

    expect(Math.abs(nimble.turnRate)).toBeGreaterThan(Math.abs(stately.turnRate) * 3);
  });

  it("keeps turn limits within what any fish can do", () => {
    expect(maxTurnRate(100, 0)).toBe(MAX_TURN_RATE);
    expect(maxTurnRate(0.01, 0)).toBe(MIN_TURN_RATE);
  });

  it("leaves a fish going straight alone", () => {
    const turn = { turnRate: 0 };
    const next = new Vector3(0.3, 0, 0);

    turnWithInertia(new Vector3(0.3, 0, 0), next, turn, 1, 0, STEP);

    expect(next.toArray()).toEqual([0.3, 0, 0]);
  });
});
