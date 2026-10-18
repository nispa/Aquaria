import { describe, expect, it } from "vitest";
import { buildShape, shapeKey } from "./sceneryShapes";

describe("scenery shapes", () => {
  it("builds the same shape every time it is asked", () => {
    const request = { kind: "prop", generator: "brain-coral", variant: 1 } as const;

    const first = buildShape(request).getAttribute("position").array;
    const second = buildShape(request).getAttribute("position").array;

    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("tells the variants of a generator apart", () => {
    expect(shapeKey({ kind: "prop", generator: "rock", variant: 0 })).not.toBe(
      shapeKey({ kind: "prop", generator: "rock", variant: 1 }),
    );
  });
});
