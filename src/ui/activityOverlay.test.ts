import { describe, expect, it } from "vitest";
import { createActivityState } from "../sim/behaviors";
import { activityColor, activityLabel } from "./activityOverlay";

describe("activityLabel", () => {
  it("shows how long a fish keeps wandering", () => {
    const activity = createActivityState();
    activity.timer = 12.4;

    expect(activityLabel(activity)).toBe("wander 12s");
  });

  it("shows how many pecks are left", () => {
    const activity = createActivityState();
    activity.id = "peck";
    activity.count = 3;

    expect(activityLabel(activity)).toBe("peck ×3");
  });

  it("names other activities plainly", () => {
    const activity = createActivityState();
    activity.id = "inspect";

    expect(activityLabel(activity)).toBe("inspect");
  });
});

describe("activityColor", () => {
  it("gives every activity its own color", () => {
    const colors = (["wander", "inspect", "peck"] as const).map(activityColor);

    expect(new Set(colors).size).toBe(3);
  });
});
