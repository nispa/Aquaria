import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { addAlignment, addCohesion, addContainment, addSeparation } from "./steering";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe("addSeparation", () => {
  it("pushes away from a neighbour that is too close", () => {
    const force = addSeparation(v(0, 0, 0), [v(0.1, 0, 0)], 0.5, new Vector3());

    expect(force.x).toBeLessThan(0);
  });

  it("ignores neighbours outside the radius", () => {
    const force = addSeparation(v(0, 0, 0), [v(2, 0, 0)], 0.5, new Vector3());

    expect(force.length()).toBe(0);
  });

  it("pushes harder the closer the neighbour is", () => {
    const near = addSeparation(v(0, 0, 0), [v(0.1, 0, 0)], 0.5, new Vector3());
    const far = addSeparation(v(0, 0, 0), [v(0.4, 0, 0)], 0.5, new Vector3());

    expect(near.length()).toBeGreaterThan(far.length());
  });

  it("ignores a neighbour at the exact same position", () => {
    const force = addSeparation(v(1, 1, 1), [v(1, 1, 1)], 0.5, new Vector3());

    expect(force.length()).toBe(0);
  });
});

describe("addCohesion", () => {
  it("pulls towards the centre of nearby neighbours", () => {
    const force = addCohesion(v(0, 0, 0), [v(1, 0, 0), v(1, 2, 0)], 5, new Vector3());

    expect(force.toArray()).toEqual([1, 1, 0]);
  });

  it("returns no force without neighbours in range", () => {
    const force = addCohesion(v(0, 0, 0), [v(10, 0, 0)], 5, new Vector3());

    expect(force.length()).toBe(0);
  });
});

describe("addAlignment", () => {
  it("steers towards the average heading of nearby neighbours", () => {
    const force = addAlignment(
      v(0, 0, 0),
      v(0, 0, 0),
      [
        { position: v(1, 0, 0), velocity: v(0, 0, 2) },
        { position: v(0, 1, 0), velocity: v(0, 0, 4) },
      ],
      5,
      new Vector3(),
    );

    expect(force.toArray()).toEqual([0, 0, 3]);
  });

  it("returns no force without neighbours in range", () => {
    const force = addAlignment(
      v(0, 0, 0),
      v(1, 0, 0),
      [{ position: v(9, 0, 0), velocity: v(0, 1, 0) }],
      5,
      new Vector3(),
    );

    expect(force.length()).toBe(0);
  });
});

describe("addContainment", () => {
  const box = new Box3(v(-5, 0, -5), v(5, 4, 0));

  it("applies no force well inside the box", () => {
    const force = addContainment(v(0, 2, -2.5), box, 1, new Vector3());

    expect(force.length()).toBe(0);
  });

  it("pushes back inside near a wall", () => {
    const force = addContainment(v(4.8, 2, -2.5), box, 1, new Vector3());

    expect(force.x).toBeLessThan(0);
  });

  it("pushes up when too close to the floor", () => {
    const force = addContainment(v(0, 0.1, -2.5), box, 1, new Vector3());

    expect(force.y).toBeGreaterThan(0);
  });

  it("pushes harder the further outside the box", () => {
    const edge = addContainment(v(4.5, 2, -2.5), box, 1, new Vector3());
    const outside = addContainment(v(7, 2, -2.5), box, 1, new Vector3());

    expect(outside.length()).toBeGreaterThan(edge.length());
  });

  it("can ignore the x axis for fish entering or leaving the tank", () => {
    const force = addContainment(v(9, 2, -2.5), box, 1, new Vector3(), { ignoreX: true });

    expect(force.length()).toBe(0);
  });
});
