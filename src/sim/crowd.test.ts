import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { createCrowd, type Body } from "./crowd";

const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 0 };

const body = (x: number, z: number, length: number, species: string): Body => ({
  position: new Vector3(x, 1, z),
  length,
  species,
});

describe("personal space", () => {
  it("pushes a fish away from a fish of another species crowding it", () => {
    const small = body(0, -2, 0.1, "tetra");
    const big = body(0.1, -2, 0.4, "angelfish");
    const crowd = createCrowd(bounds);
    crowd.sort([small, big]);

    const out = crowd.addPersonalSpace(small, new Vector3());

    expect(out.x).toBeLessThan(0);
  });

  it("makes the smaller fish give way more", () => {
    const small = body(0, -2, 0.1, "tetra");
    const big = body(0.1, -2, 0.4, "angelfish");
    const crowd = createCrowd(bounds);
    crowd.sort([small, big]);

    const yielded = crowd.addPersonalSpace(small, new Vector3()).length();
    const held = crowd.addPersonalSpace(big, new Vector3()).length();

    expect(yielded).toBeGreaterThan(held);
  });

  it("leaves fish of its own species to their school", () => {
    const one = body(0, -2, 0.1, "tetra");
    const other = body(0.02, -2, 0.1, "tetra");
    const crowd = createCrowd(bounds);
    crowd.sort([one, other]);

    expect(crowd.addPersonalSpace(one, new Vector3()).toArray()).toEqual([0, 0, 0]);
  });

  it("ignores fish beyond its personal space", () => {
    const one = body(0, -2, 0.1, "tetra");
    const other = body(1, -2, 0.1, "angelfish");
    const crowd = createCrowd(bounds);
    crowd.sort([one, other]);

    expect(crowd.addPersonalSpace(one, new Vector3()).toArray()).toEqual([0, 0, 0]);
  });
});

describe("the crowd's grid", () => {
  it("finds the same neighbours as checking every pair", () => {
    const rng = createRng(4);
    const bodies = Array.from({ length: 80 }, (_, index) =>
      body(rng.range(-6, 6), rng.range(-6, 1), rng.range(0.05, 0.6), index % 3 === 0 ? "a" : "b"),
    );
    const crowd = createCrowd(bounds);
    crowd.sort(bodies);
    const everyPair = (subject: Body): Vector3 => {
      const out = new Vector3();
      for (const other of bodies) {
        const alone = createCrowd(bounds);
        alone.sort([subject, other]);
        alone.addPersonalSpace(subject, out);
      }
      return out;
    };

    for (const subject of bodies) {
      const viaGrid = crowd.addPersonalSpace(subject, new Vector3());
      expect(viaGrid.distanceTo(everyPair(subject))).toBeLessThan(1e-9);
    }
  });
});

describe("overlaps", () => {
  it("pulls apart two fish whose bodies overlap, the smaller moving more", () => {
    const small = body(0, -2, 0.1, "tetra");
    const big = body(0.01, -2, 0.4, "angelfish");
    const crowd = createCrowd(bounds);
    crowd.sort([small, big]);

    crowd.separate();

    const gap = big.position.x - small.position.x;
    expect(gap).toBeGreaterThan(0.01);
    expect(-small.position.x).toBeGreaterThan(big.position.x - 0.01);
  });

  it("pulls apart fish of the same species too", () => {
    const one = body(0, -2, 0.1, "tetra");
    const other = body(0.001, -2, 0.1, "tetra");
    const crowd = createCrowd(bounds);
    crowd.sort([one, other]);

    crowd.separate();

    expect(other.position.x - one.position.x).toBeGreaterThan(0.001);
  });

  it("finds neighbours across cells and outside the bounds", () => {
    const one = body(5.4, -2, 0.3, "tetra");
    const other = body(5.45, -2, 0.3, "angelfish");
    const crowd = createCrowd(bounds);
    crowd.sort([one, other]);

    expect(crowd.addPersonalSpace(one, new Vector3()).x).toBeLessThan(0);
  });
});
