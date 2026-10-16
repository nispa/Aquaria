import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { easeToward, MAX_BEND, MAX_EFFORT, MIN_EFFORT, tailEffort, turnBend } from "./posture";

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
