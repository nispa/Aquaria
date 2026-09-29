import { describe, expect, it } from "vitest";
import { clamp, inverseLerp, lerp, smoothstep } from "./math";

describe("clamp", () => {
  it("keeps values inside the range unchanged", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("limits values below and above the range", () => {
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(3, 0, 1)).toBe(1);
  });
});

describe("lerp", () => {
  it("interpolates linearly between two values", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe("inverseLerp", () => {
  it("returns the position of a value inside a range", () => {
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
  });

  it("returns 0 for an empty range", () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });
});

describe("smoothstep", () => {
  it("is 0 below the lower edge and 1 above the upper edge", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it("is 0.5 halfway between the edges", () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});
