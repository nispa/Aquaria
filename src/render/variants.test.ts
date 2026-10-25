import { describe, expect, it } from "vitest";
import { variantOf } from "./variants";

describe("variantOf", () => {
  it("takes the variant an item names", () => {
    expect(variantOf({ seed: 7, variant: 2 }, 5)).toBe(2);
  });

  it("wraps a variant beyond the shapes there are", () => {
    expect(variantOf({ seed: 7, variant: 6 }, 4)).toBe(2);
  });

  it("draws one from the item's seed when it names none", () => {
    expect(variantOf({ seed: 7 }, 5)).toBe(variantOf({ seed: 7 }, 5));
  });

  it("stays among the shapes there are", () => {
    const drawn = variantOf({ seed: 12345 }, 3);

    expect(drawn >= 0 && drawn < 3).toBe(true);
  });
});
