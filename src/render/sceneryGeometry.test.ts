import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import {
  anemoneTentacleGeometry,
  branchCoralGeometry,
  brainCoralGeometry,
  fanCoralGeometry,
  rockGeometry,
  shellGeometry,
  starfishGeometry,
} from "./sceneryGeometry";

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
  "brain coral": () => brainCoralGeometry(createRng(1)),
  "branching coral": () => branchCoralGeometry(createRng(1)),
  "sea fan": () => fanCoralGeometry(createRng(1)),
  shell: () => shellGeometry(createRng(1)),
  starfish: () => starfishGeometry(createRng(1)),
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

  it("gives different seeds different branching corals", () => {
    const first = branchCoralGeometry(createRng(1)).getAttribute("position").count;
    const second = branchCoralGeometry(createRng(2)).getAttribute("position").count;
    const third = branchCoralGeometry(createRng(3)).getAttribute("position").count;

    expect(new Set([first, second, third]).size).toBeGreaterThan(1);
  });

  it("keeps a sea fan flat, like a lace screen", () => {
    const box = bounds(fanCoralGeometry(createRng(1)));

    expect(box.max.z - box.min.z).toBeLessThan((box.max.x - box.min.x) * 0.25);
  });

  it("builds tentacles one unit tall from y = 0, as the plant sway expects", () => {
    const box = bounds(anemoneTentacleGeometry());

    expect([box.min.y, box.max.y]).toEqual([0, 1]);
  });
});

describe("starfish", () => {
  it("lies flat on the sand, far wider than tall", () => {
    const box = bounds(starfishGeometry(createRng(1)));

    expect(box.max.y - box.min.y).toBeLessThan((box.max.x - box.min.x) * 0.25);
  });

  it("bends its arms differently for each seed", () => {
    const first = bounds(starfishGeometry(createRng(1)));
    const second = bounds(starfishGeometry(createRng(2)));

    expect(first.max.x).not.toBeCloseTo(second.max.x, 3);
  });
});

describe("rock", () => {
  it("shares vertices between faces, so displacement cannot tear it open", () => {
    const geometry = rockGeometry(createRng(1));

    expect(geometry.index).not.toBeNull();
    expect(geometry.getAttribute("position").count).toBeLessThan(geometry.index?.count ?? 0);
  });
});
