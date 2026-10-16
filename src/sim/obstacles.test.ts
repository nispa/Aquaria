import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Prop } from "./layout";
import { createObstacleField, obstacleOf, openYaw, PROP_SHAPES, propTop } from "./obstacles";
import { floorHeight } from "./terrain";

const prop = (kind: Prop["kind"], x: number, z: number, size: number, rotation = 0): Prop => ({
  kind,
  color: "#888888",
  x,
  z,
  size,
  rotation,
  seed: 0,
  tags: [],
});

describe("obstacleOf", () => {
  it("stands a prop on the sand, sunk as the renderer sinks it", () => {
    const rock = obstacleOf(prop("brain-coral", 1, -2, 0.4));

    const base = floorHeight(1, -2) + PROP_SHAPES["brain-coral"].sink * 0.4;
    expect(rock.center.toArray()).toEqual([1, base, -2]);
  });

  it("stands a prop set on rockwork on the rock", () => {
    const rock = obstacleOf({ ...prop("rock", 0, -2, 0.4), elevation: 0.3 });

    expect(rock.center.y).toBeCloseTo(floorHeight(0, -2) + 0.3);
  });

  it("scales its kind's shape by its size", () => {
    const stone = obstacleOf(prop("dragon-stone", 0, -2, 0.2));

    expect(stone.radii.y).toBeCloseTo(PROP_SHAPES["dragon-stone"].up * 0.2);
  });
});

describe("propTop", () => {
  it("is the top of the prop's shape above the sand, plate and all", () => {
    const table = obstacleOf(prop("table-coral", 0, -2, 0.5));

    expect(propTop("table-coral", 0.5)).toBeCloseTo(
      table.center.y + table.radii.y - floorHeight(0, -2),
    );
  });
});

describe("an obstacle field", () => {
  const normal = new Vector3();

  it("measures how far above an obstacle a point is, pointing up", () => {
    const rock = obstacleOf(prop("rock", 0, -2, 1));
    const field = createObstacleField([rock]);
    const point = new Vector3(0, rock.center.y + rock.radii.y + 0.2, -2);

    const distance = field.distance(point, normal, 1);

    expect(distance).toBeCloseTo(0.2, 2);
    expect(normal.y).toBeCloseTo(1);
  });

  it("is negative inside an obstacle, pointing out of it", () => {
    const rock = obstacleOf(prop("rock", 0, -2, 1));
    const field = createObstacleField([rock]);
    const point = new Vector3(0.1, rock.center.y, -2);

    const distance = field.distance(point, normal, 1);

    expect(distance).toBeLessThan(0);
    expect(normal.x).toBeGreaterThan(0.9);
  });

  it("points up out of an obstacle's very centre", () => {
    const rock = obstacleOf(prop("rock", 0, -2, 1));
    const field = createObstacleField([rock]);

    const distance = field.distance(rock.center.clone(), normal, 1);

    expect(distance).toBeLessThan(0);
    expect(normal.toArray()).toEqual([0, 1, 0]);
  });

  it("turns with its prop: a fan is thin across its face", () => {
    const fan = obstacleOf(prop("fan-coral", 0, -2, 1, Math.PI / 2));
    const field = createObstacleField([fan]);
    const height = fan.center.y + 0.3;

    const acrossFace = field.distance(new Vector3(0.3, height, -2), normal, 1);
    const alongFace = field.distance(new Vector3(0, height, -2 + 0.3), normal, 1);

    expect(acrossFace).toBeGreaterThan(0.2);
    expect(alongFace).toBeLessThan(0);
  });

  it("measures to the nearest obstacle", () => {
    const near = obstacleOf(prop("rock", 0, -2, 0.4));
    const far = obstacleOf(prop("rock", 2, -2, 0.4));
    const field = createObstacleField([far, near]);

    field.distance(new Vector3(0.5, near.center.y, -2), normal, 2);

    expect(normal.x).toBeCloseTo(1);
  });

  it("ignores obstacles farther than asked", () => {
    const field = createObstacleField([obstacleOf(prop("rock", 0, -2, 0.4))]);

    expect(field.distance(new Vector3(3, 0, -2), normal, 1)).toBe(Infinity);
  });
});

describe("openYaw", () => {
  const rock = (x: number, z: number) => ({
    center: new Vector3(x, 1, z),
    radii: new Vector3(0.4, 0.4, 0.4),
    cos: 1,
    sin: 0,
    reach: 0.4,
  });

  it("points out of a pocket, the way that is open", () => {
    // Closed on +x, -z and +z: open towards -x.
    const field = createObstacleField([rock(0.6, 0), rock(0, -0.6), rock(0, 0.6)]);

    const yaw = openYaw(field, new Vector3(0, 1, 0), 0.6);

    expect(Math.abs(Math.atan2(Math.sin(yaw - Math.PI), Math.cos(yaw - Math.PI)))).toBeLessThan(
      0.5,
    );
  });
});
