import { describe, expect, it } from "vitest";
import { pingPong } from "./oscillation";

describe("pingPong", () => {
  it("starts at zero", () => {
    expect(pingPong(0, 4)).toBe(0);
  });

  it("reaches one halfway through the period", () => {
    expect(pingPong(2, 4)).toBeCloseTo(1);
  });

  it("comes back to zero after a whole period", () => {
    expect(pingPong(4, 4)).toBeCloseTo(0);
  });

  it("stays between zero and one", () => {
    const values = Array.from({ length: 100 }, (_, index) => pingPong(index * 0.37, 3));

    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });
});
