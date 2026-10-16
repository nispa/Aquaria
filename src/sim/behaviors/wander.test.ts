import { describe, expect, it } from "vitest";
import { startActivity } from "./harness";
import { createSwimState } from "./types";
import { wanderActivity } from "./wander";

describe("wander", () => {
  it("lasts a time drawn from its range, then ends", () => {
    const wandering = startActivity(wanderActivity, { seconds: [2, 3] });

    const ended = wandering.run(10);

    expect(ended).toBeGreaterThanOrEqual(2);
    expect(ended).toBeLessThanOrEqual(3.05);
  });

  it("leaves the wishes to the swimming style", () => {
    const wandering = startActivity(wanderActivity);

    wandering.run(1);

    expect(wandering.wishes).toEqual(createSwimState());
  });
});
