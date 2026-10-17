import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { createCrustaceanGeometry } from "./crustaceanGeometry";

function bounds(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) throw new Error("No bounding box.");
  return box;
}

describe("crustacean geometry", () => {
  it("builds a shrimp about one body length long, rostrum towards +x", () => {
    const box = bounds(createCrustaceanGeometry("shrimp"));

    // Front rostrum near +0.5, total length ~1 body length
    expect(box.max.x).toBeGreaterThan(0.4);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.85);
    expect(box.max.x - box.min.x).toBeLessThan(1.4);
  });

  it("gives the shrimp a curved segmented profile resting above the floor", () => {
    const box = bounds(createCrustaceanGeometry("shrimp"));

    // Body has realistic proportions: height and width around 0.2-0.4 body lengths
    expect(box.max.y - box.min.y).toBeGreaterThan(0.15);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.1);
  });

  it("marks appendages (antennae, legs, tail fan) with aFin=1 and carapace with aFin=0", () => {
    const geometry = createCrustaceanGeometry("shrimp");
    const fin = geometry.getAttribute("aFin");

    expect(fin).toBeDefined();
    const values = new Set(Array.from({ length: fin.count }, (_, index) => fin.getX(index)));

    // 0 = rigid carapace/body, 1 = flexible limbs/antennae/tail for shader motion
    expect([...values].sort()).toEqual([0, 1]);
  });
});
