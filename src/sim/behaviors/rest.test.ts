import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { headingGap, startActivity } from "./harness";
import { restActivity } from "./rest";

const shelter = new Vector3(1, 0.4, -1);
const NO_PLACE = -1;

describe("rest", () => {
  it("swims to its shelter", () => {
    const resting = startActivity(restActivity, {}, shelter, 0.4);

    resting.run(1 / 60);

    expect(headingGap(resting.wishes.yaw, 0)).toBeLessThan(0.05);
    expect(resting.wishes.speed).toBeGreaterThan(0.3);
  });

  it("settles beside the shelter, halfway up, barely moving", () => {
    const resting = startActivity(restActivity, {}, shelter, 0.4);
    resting.context.position.set(0.8, 0.3, -1);

    resting.run(1);

    expect(resting.wishes.speed).toBeLessThan(0.15);
    expect(resting.wishes.height).toBeCloseTo(0.2);
    expect(resting.wishes.thrust).toBeLessThan(0.5);
  });

  it("sinks to the bottom of its room without a shelter", () => {
    const resting = startActivity(restActivity, {}, new Vector3(), NO_PLACE);

    resting.run(1);

    expect(resting.wishes.height).toBe(resting.context.room.min.y);
    expect(resting.wishes.speed).toBeLessThan(0.15);
  });

  it("keeps a steady heading while it rests", () => {
    const resting = startActivity(restActivity, {}, new Vector3(), NO_PLACE);
    resting.run(0.5);
    const before = resting.wishes.yaw;

    resting.run(2);

    expect(headingGap(resting.wishes.yaw, before)).toBeLessThan(0.5);
  });

  it("lasts a while, then lets the fish choose again", () => {
    const resting = startActivity(restActivity, { seconds: [5, 6] }, new Vector3(), NO_PLACE);

    const ended = resting.run(20);

    expect(ended).toBeGreaterThanOrEqual(5);
    expect(ended).toBeLessThanOrEqual(6.05);
  });
});
