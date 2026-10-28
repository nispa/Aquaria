import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { pebbleGeometry, rockGeometry, shellGeometry } from "./sceneryGeometry";

function bounds(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) throw new Error("No bounding box.");
  return box;
}

function allFinite(geometry: BufferGeometry): boolean {
  const positions = geometry.getAttribute("position").array;
  const normals = geometry.getAttribute("normal").array;
  return [...positions, ...normals].every((value) => Number.isFinite(value));
}

const generators = {
  shell: () => shellGeometry(createRng(1)),
  pebble: () => pebbleGeometry(createRng(1)),
};

describe("scenery geometry", () => {
  it.each(Object.entries(generators))(
    "builds a %s with finite positions and normals",
    (_, make) => {
      expect(allFinite(make())).toBe(true);
    },
  );

  it.each(Object.entries(generators))("sits a %s on the floor at y = 0", (_, make) => {
    expect(bounds(make()).min.y).toBeCloseTo(0, 1);
  });

  it.each(Object.entries(generators))("fits a %s in a unit-wide footprint", (_, make) => {
    const box = bounds(make());

    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(1.05);
  });
});

describe("rock", () => {
  it("shares vertices between faces, so displacement cannot tear it open", () => {
    const geometry = rockGeometry(createRng(1));

    expect(geometry.index).not.toBeNull();
    expect(geometry.getAttribute("position").count).toBeLessThan(geometry.index?.count ?? 0);
  });
});

describe("pebble", () => {
  it("makes pebbles flat and smooth", () => {
    const box = bounds(pebbleGeometry(createRng(1)));
    const tall = box.max.y - box.min.y;
    const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

    expect(tall).toBeLessThan(wide * 0.6);
  });
});
