import { describe, expect, it } from "vitest";
import { isPhone } from "./device";

describe("isPhone", () => {
  it("takes a touch screen with a short side under 600 pixels for a phone", () => {
    expect(isPhone({ coarsePointer: true, shortSide: 412, mobileHint: undefined })).toBe(true);
  });

  it("does not take a tablet for a phone", () => {
    expect(isPhone({ coarsePointer: true, shortSide: 820, mobileHint: undefined })).toBe(false);
  });

  it("does not take a small desktop window for a phone", () => {
    expect(isPhone({ coarsePointer: false, shortSide: 500, mobileHint: undefined })).toBe(false);
  });

  it("believes the browser when it says it runs on a phone", () => {
    expect(isPhone({ coarsePointer: false, shortSide: 900, mobileHint: true })).toBe(true);
  });
});
