import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { nextGaze, turnIntent } from "./gaze";

describe("turnIntent", () => {
  const heading = new Vector3(1, 0, 0);

  it("is zero when the fish is steered straight ahead", () => {
    expect(turnIntent(heading, new Vector3(2, 0, 0))).toBe(0);
  });

  it("is positive when the fish is about to turn left (towards -z)", () => {
    expect(turnIntent(heading, new Vector3(0, 0, -1))).toBeCloseTo(1);
  });

  it("is negative when the fish is about to turn right (towards +z)", () => {
    expect(turnIntent(heading, new Vector3(0, 0, 1))).toBeCloseTo(-1);
  });

  it("ignores climbing and diving", () => {
    expect(turnIntent(heading, new Vector3(0, 3, 0))).toBe(0);
  });

  it("is zero without any steering force", () => {
    expect(turnIntent(heading, new Vector3())).toBe(0);
  });
});

describe("nextGaze", () => {
  it("holds the eye still while the target is close to where it looks", () => {
    expect(nextGaze(0.1, 0.3, 0.35)).toBe(0.1);
  });

  it("jumps straight to the target once it is far enough off, like a saccade", () => {
    expect(nextGaze(0.1, 0.8, 0.35)).toBe(0.8);
  });
});
