import { describe, expect, it } from "vitest";
import { withdrawal } from "./walkingBodies";

describe("withdrawal", () => {
  it("pulls the body into its shell over a short while", () => {
    const halfway = withdrawal(0, true, 0.1);

    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
  });

  it("is all the way in after a second", () => {
    expect(withdrawal(0, true, 1)).toBe(1);
  });

  it("comes out again once the animal is no longer hiding", () => {
    expect(withdrawal(1, false, 0.1)).toBeLessThan(1);
  });
});
