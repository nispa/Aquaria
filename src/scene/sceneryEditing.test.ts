import { describe, expect, it } from "vitest";
import { bundledObjects } from "./objectFixtures";
import type { FloraSpec, PropSpec } from "./schema";
import { createRng } from "../core/rng";
import {
  moveItem,
  paintItems,
  recolorEntry,
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
const kelpObject = objects.get("ribbon-kelp");
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

  it("starts a new entry when the one it made is full", () => {
    const full: Scenery = {
      flora: [],
      props: [
        {
          kind: "rock",
          count: 50,
          color: "#888888",
          at: Array.from({ length: 50 }, (_, index) => ({ x: index / 100, z: -0.5 })),
        },
      ],
    };

    const { scenery } = placeItem(full, "rock", rockObject, { x: 0, z: -0.4 });

    expect(scenery.props.map((entry) => entry.count)).toEqual([50, 1]);
  });

  it("keeps positions to the millimeter, so scene files stay tidy", () => {
    const { scenery } = placeItem(empty, "rock", rockObject, { x: 0.123456, z: -0.4004001 });

    expect(scenery.props[0]?.at?.[0]).toEqual({ x: 0.123, z: -0.4 });
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

describe("paintItems", () => {
  const carpet = objects.get("hairgrass");
  if (carpet === undefined) throw new Error("Missing objects.");
  const brush = { x: 0, z: -0.5, radius: 0.1, spacing: 0.03 };
  const ground = () => ({});

  it("sets down items within the brush", () => {
    const { flora } = paintItems(empty, "carpet", carpet, brush, ground, createRng(1));

    const outside = (flora[0]?.at ?? []).filter(
      (spot) => Math.hypot(spot.x - brush.x, spot.z - brush.z) > brush.radius + 1e-9,
    );
    expect([(flora[0]?.at?.length ?? 0) > 3, outside]).toEqual([true, []]);
  });

  it("keeps the items of a stroke apart by the spacing", () => {
    const once = paintItems(empty, "carpet", carpet, brush, ground, createRng(1));
    const twice = paintItems(once, "carpet", carpet, brush, ground, createRng(2));
    const spots = twice.flora[0]?.at ?? [];

    const tooClose = spots.filter((spot, index) =>
      spots.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Math.hypot(spot.x - other.x, spot.z - other.z) < brush.spacing - 0.001,
      ),
    );
    expect(tooClose).toEqual([]);
  });

  it("stands each item on what is under it", () => {
    const { flora } = paintItems(empty, "carpet", carpet, brush, () => ({ y: 0.2 }), createRng(1));

    expect(flora[0]?.at?.every((spot) => spot.y === 0.2)).toBe(true);
  });

  it("leaves out spots where nothing can stand", () => {
    const { flora } = paintItems(empty, "carpet", carpet, brush, () => undefined, createRng(1));

    expect(flora).toEqual([]);
  });

  it("starts another entry when one is full", () => {
    const full: Scenery = {
      flora: [
        {
          kind: "hairgrass",
          count: 200,
          bands: [0, 4],
          height: [0.02, 0.05],
          color: "#6fc23a",
          at: Array.from({ length: 200 }, (_, index) => ({ x: index, z: -10 })),
        },
      ],
      props: [],
    };

    const { flora } = paintItems(full, "carpet", carpet, brush, ground, createRng(1));

    expect([flora.length, flora[0]?.count]).toEqual([2, 200]);
  });
});

describe("recolorEntry", () => {
  it("gives the item's whole entry one color", () => {
    const { scenery, ref } = placeItem(empty, "rock", rockObject, { x: 0, z: -0.4 });

    expect(recolorEntry(scenery, ref, "#123456").props[0]?.color).toBe("#123456");
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
      kind: "ribbon-kelp",
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
