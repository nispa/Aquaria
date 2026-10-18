import { describe, expect, it } from "vitest";
import { stepStates } from "./loadingScreen";

const steps = ["scene", "scenery", "models"] as const;

describe("stepStates", () => {
  it("marks the steps before the current one as done and the later ones as waiting", () => {
    expect(stepStates(steps, "scenery")).toEqual(["done", "current", "waiting"]);
  });

  it("marks every step as done once loading is over", () => {
    expect(stepStates(steps, undefined)).toEqual(["done", "done", "done"]);
  });
});
