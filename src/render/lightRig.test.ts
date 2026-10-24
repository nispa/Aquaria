import { describe, expect, it } from "vitest";
import { nightFill } from "./lightRig";

describe("nightFill", () => {
  it("leaves a moonless night nearly dark", () => {
    expect(nightFill(0)).toBeLessThan(0.05);
  });

  it("keeps the recommended moon's night as it always was", () => {
    expect(nightFill(0.2)).toBeCloseTo(0.12);
  });

  it("lights the night more under a brighter moon", () => {
    expect(nightFill(1)).toBeGreaterThan(0.4);
  });
});
