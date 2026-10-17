import { describe, expect, it } from "vitest";
import { bundledObjects } from "./objectFixtures";
import type { FloraSpec, PropSpec } from "./schema";
import {
  moveItem,
  pickItem,
  placeItem,
  removeItem,
  resizeItem,
  settleItems,
  turnItem,
  type LaidOutItem,
  type Scenery,
} from "./sceneryEditing";

const objects = bundledObjects();
const rockObject = objects.get("rock");
const kelpObject = objects.get("kelp");
if (rockObject === undefined || kelpObject === undefined) throw new Error("Missing objects.");

const randomRocks: PropSpec = { kind: "rock", count: 2, color: "#888888" };
const laidOut: readonly LaidOutItem[] = [
  { x: 0.1, z: -0.5, rotation: Math.PI / 2, size: 0.3 },
  { x: -0.2, z: -0.7, rotation: 0, size: 0.4, elevation: 0.1 },
];
const empty: Scenery = { flora: [], props: [] };

describe("placeItem", () => {
  it("adds an object the scene does not hold as a new entry at the spot", () => {
    const { scenery, ref } = placeItem(empty, "rock", rockObject, { x: 0.2, z: -0.4 });

    expect([scenery.props[0]?.at, scenery.props[0]?.count, ref]).toEqual([
      [{ x: 0.2, z: -0.4 }],
      1,
      { section: "props", entry: 0, item: 0 },
    ]);
  });

  it("adds to the entry it made before for the same object", () => {
    const first = placeItem(empty, "kelp", kelpObject, { x: 0, z: -0.4 }).scenery;

    const { scenery, ref } = placeItem(first, "kelp", kelpObject, { x: 0.3, z: -0.4 });

    expect([scenery.flora.length, scenery.flora[0]?.count, ref.item]).toEqual([1, 2, 1]);
  });

  it("keeps a spot's height above the sand, e.g. on a block", () => {
    const { scenery } = placeItem(empty, "rock", rockObject, { x: 0, z: -0.4, y: 0.2 });

    expect(scenery.props[0]?.at?.[0]?.y).toBe(0.2);
  });
});

describe("moving an item of a random entry", () => {
  const scenery: Scenery = { flora: [], props: [randomRocks] };
  const ref = { section: "props", entry: 0, item: 1 } as const;

  it("turns the entry's items into chosen spots where they stood", () => {
    const moved = moveItem(scenery, ref, laidOut, { x: 0.5, z: -0.3 });

    expect(moved.props[0]?.at?.[0]).toEqual({ x: 0.1, z: -0.5, rotation: 90, size: 0.3 });
  });

  it("moves the item, standing it where it lands", () => {
    const moved = moveItem(scenery, ref, laidOut, { x: 0.5, z: -0.3 });

    expect(moved.props[0]?.at?.[1]).toEqual({ x: 0.5, z: -0.3, rotation: 0, size: 0.4 });
  });
});

describe("turnItem and resizeItem", () => {
  const placed = placeItem(empty, "rock", rockObject, { x: 0, z: -0.4, rotation: 350, size: 0.3 });

  it("turns by degrees, keeping the angle within a turn", () => {
    const turned = turnItem(placed.scenery, placed.ref, [], 30);

    expect(turned.props[0]?.at?.[0]?.rotation).toBe(20);
  });

  it("scales an object's size", () => {
    const resized = resizeItem(placed.scenery, placed.ref, [], 1.5);

    expect(resized.props[0]?.at?.[0]?.size).toBeCloseTo(0.45);
  });

  it("scales a plant's height", () => {
    const plant = placeItem(empty, "kelp", kelpObject, { x: 0, z: -0.4, height: 1 });

    const resized = resizeItem(plant.scenery, plant.ref, [], 0.5);

    expect(resized.flora[0]?.at?.[0]?.height).toBe(0.5);
  });
});

describe("removeItem", () => {
  it("takes the item out of its entry", () => {
    const scenery: Scenery = { flora: [], props: [randomRocks] };

    const removed = removeItem(scenery, { section: "props", entry: 0, item: 0 }, laidOut);

    expect([removed.props[0]?.count, removed.props[0]?.at?.map((spot) => spot.x)]).toEqual([
      1,
      [-0.2],
    ]);
  });
});

describe("settleItems", () => {
  it("lets an item whose support went fall to the next one below", () => {
    const placed = placeItem(empty, "rock", rockObject, { x: 0, z: -0.4, y: 0.3 }).scenery;

    const settled = settleItems(placed, () => 0.1);

    expect(settled.props[0]?.at?.[0]?.y).toBe(0.1);
  });

  it("stands an item on the sand when nothing is left under it", () => {
    const placed = placeItem(empty, "rock", rockObject, { x: 0, z: -0.4, y: 0.3 }).scenery;

    const settled = settleItems(placed, () => 0);

    expect(settled.props[0]?.at?.[0]).toEqual({ x: 0, z: -0.4 });
  });

  it("leaves random entries alone", () => {
    const scenery: Scenery = { flora: [], props: [randomRocks] };

    expect(settleItems(scenery, () => 0)).toEqual(scenery);
  });
});

describe("pickItem", () => {
  const items = [
    { x: 0, y: 0.1, z: -0.5, radius: 0.1 },
    { x: 0, y: 0.1, z: -1, radius: 0.1 },
  ];

  it("finds the nearest item the ray passes through", () => {
    expect(pickItem(items, { x: 0, y: 0.1, z: 1 }, { x: 0, y: 0, z: -1 })).toBe(0);
  });

  it("finds nothing when the ray passes by", () => {
    expect(pickItem(items, { x: 1, y: 0.1, z: 1 }, { x: 0, y: 0, z: -1 })).toBeUndefined();
  });
});

describe("plants and objects stay apart", () => {
  it("adds plants to the flora", () => {
    const { scenery } = placeItem(empty, "kelp", kelpObject, { x: 0, z: -0.4 });

    expect([scenery.flora.length, scenery.props.length]).toEqual([1, 0]);
  });

  it("does not add to a random entry of the same object", () => {
    const random: FloraSpec = {
      kind: "kelp",
      count: 3,
      bands: [0, 4],
      height: [1, 2],
      color: "#3d7a3a",
    };

    const { scenery } = placeItem({ flora: [random], props: [] }, "kelp", kelpObject, {
      x: 0,
      z: -0.4,
    });

    expect(scenery.flora.map((entry) => entry.count)).toEqual([3, 1]);
  });
});
