import { describe, expect, it } from "vitest";
import { snowCount } from "./particles";

describe("snowCount", () => {
  it("draws no specks at all in crystal clear water", () => {
    expect(snowCount(0)).toBe(0);
  });

  it("draws twice the specks for twice the marine snow", () => {
    expect(snowCount(2)).toBe(snowCount(1) * 2);
  });
});
