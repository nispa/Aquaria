import { describe, expect, it } from "vitest";
import { mirrored } from "./environment";

describe("mirrored", () => {
  it("leaves a point inside the walls where it is", () => {
    expect(mirrored(0.3, 1)).toBeCloseTo(0.3);
  });

  it("reflects a point beyond the right wall back inside", () => {
    expect(mirrored(1.25, 1)).toBeCloseTo(0.75);
  });

  it("reflects a point beyond the left wall back inside", () => {
    expect(mirrored(-1.25, 1)).toBeCloseTo(-0.75);
  });

  it("reflects twice a point beyond the reflection of the far wall", () => {
    expect(mirrored(3.5, 1)).toBeCloseTo(-0.5);
  });
});
