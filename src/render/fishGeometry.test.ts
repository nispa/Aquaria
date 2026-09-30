import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { BODY_PROPORTIONS, createFishGeometry } from "./fishGeometry";

function bounds(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) throw new Error("No bounding box.");
  return box;
}

const shapes = Object.keys(BODY_PROPORTIONS) as (keyof typeof BODY_PROPORTIONS)[];

describe("fish geometry", () => {
  it.each(shapes)("builds a %s fish about one body length long, nose at +x", (shape) => {
    const box = bounds(createFishGeometry(shape));

    expect(box.max.x).toBeCloseTo(0.5, 1);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.9);
    expect(box.max.x - box.min.x).toBeLessThan(1.3);
  });

  it("makes butterflyfish and angelfish bodies much taller than sardines", () => {
    const tall = bounds(createFishGeometry("tall"));
    const slender = bounds(createFishGeometry("slender"));

    expect(tall.max.y - tall.min.y).toBeGreaterThan((slender.max.y - slender.min.y) * 2.5);
  });

  it("gives tall fish an anal fin below the body, not just a dorsal fin above", () => {
    const box = bounds(createFishGeometry("tall"));

    expect(-box.min.y).toBeGreaterThan(BODY_PROPORTIONS.tall.height / 2);
  });

  it("gives the moorish idol a banner fin rising far above its body", () => {
    const banner = bounds(createFishGeometry("banner"));
    const tall = bounds(createFishGeometry("tall"));

    expect(banner.max.y).toBeGreaterThan(tall.max.y * 1.4);
  });

  it("keeps every fish flat enough to swim, thinner than it is tall", () => {
    const thick = shapes.filter((shape) => {
      const box = bounds(createFishGeometry(shape));
      return box.max.z - box.min.z > box.max.y - box.min.y;
    });

    expect(thick).toEqual([]);
  });
});

describe("fin marking", () => {
  it.each(shapes)("marks the fins of a %s fish apart from its body, for the shader", (shape) => {
    const fin = createFishGeometry(shape).getAttribute("aFin");

    const values = new Set(Array.from({ length: fin.count }, (_, index) => fin.getX(index)));

    expect([...values].sort()).toEqual([0, 1]);
  });
});
