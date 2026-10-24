import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene } from "./parse";
import type { Scene, SceneInput } from "./schema";
import {
  canResize,
  resizeScene,
  sceneSize,
  tankSizeOf,
  TANK_SIZE_MEASURES,
  TANK_SIZES,
} from "./tankSize";

const catalog = parseCatalog(catalogFixture());

function planted(overrides: Partial<SceneInput> = {}): Scene {
  return parseScene(
    {
      ...sceneFixture(),
      id: "planted",
      tank: { width: 2.4, height: 1.1, depth: 1 },
      flora: [
        { kind: "hairgrass", count: 200, bands: [0, 2], height: [0.04, 0.08], color: "#fff" },
        { kind: "rotala", count: 11, bands: [3, 4], height: [0.4, 0.75], color: "#fff" },
        { kind: "anubias", count: 3, bands: [1, 3], height: [0.1, 0.16], color: "#fff" },
      ],
      props: [
        { kind: "rock", count: 5, color: "#555", size: [0.12, 0.3] },
        { kind: "pebble", count: 20, color: "#777" },
      ],
      fauna: [
        { species: "blue-tang", count: 2 },
        { species: "sardine", count: 25 },
      ],
      ...overrides,
    },
    catalog,
  );
}

describe("tank sizes", () => {
  it("lists the sizes from the smallest to the largest tank", () => {
    const volumes = TANK_SIZES.map(
      (size) =>
        TANK_SIZE_MEASURES[size].width *
        TANK_SIZE_MEASURES[size].height *
        TANK_SIZE_MEASURES[size].depth,
    );

    expect(volumes).toEqual([...volumes].sort((a, b) => a - b));
  });

  it("names the size whose volume a tank is closest to", () => {
    expect(tankSizeOf({ width: 1, height: 0.75, depth: 0.7 })).toBe("medium");
    expect(tankSizeOf({ width: 2.2, height: 1.1, depth: 1 })).toBe("large");
    expect(tankSizeOf({ width: 6, height: 2.6, depth: 2.4 })).toBe("ocean");
  });

  it("takes the size a scene declares over the one its measures suggest", () => {
    expect(sceneSize({ ...planted(), size: "small" })).toBe("small");
    expect(sceneSize(planted())).toBe("large");
  });
});

describe("resizeScene", () => {
  it("gives the tank the measures of the size", () => {
    const resized = resizeScene(planted(), "nano");

    expect(resized.tank).toEqual(TANK_SIZE_MEASURES.nano);
    expect(resized.size).toBe("nano");
  });

  it("returns the scene unchanged for its own size", () => {
    const scene = planted();

    expect(resizeScene(scene, "large")).toBe(scene);
  });

  it("keeps fewer fish, in proportion to the square root of the volume", () => {
    const resized = resizeScene(planted(), "small");
    const sardines = resized.fauna.find((entry) => entry.species === "sardine");

    expect(sardines?.count).toBeLessThan(25);
    expect(sardines?.count).toBeGreaterThanOrEqual(3);
  });

  it("drops species that no longer fit but never leaves the tank empty", () => {
    const resized = resizeScene(planted(), "nano");

    expect(resized.fauna.map((entry) => entry.species)).toEqual(["sardine"]);
    expect(resized.fauna.every((entry) => entry.count >= 1)).toBe(true);
  });

  it("keeps a school of at least three when many were asked for", () => {
    const resized = resizeScene(planted(), "nano");

    expect(resized.fauna[0]?.count).toBeGreaterThanOrEqual(3);
  });

  it("keeps the density of the plants: their count follows the floor area", () => {
    const resized = resizeScene(planted(), "small");
    const carpet = resized.flora[0];

    expect(carpet?.count).toBe(Math.round((200 * 0.6 * 0.4) / (2.4 * 1)));
  });

  it("leaves at least one plant of every kind", () => {
    const resized = resizeScene(planted(), "nano");

    expect(resized.flora.map((entry) => entry.count).every((count) => count >= 1)).toBe(true);
  });

  it("keeps tall plants below the water", () => {
    const resized = resizeScene(planted(), "nano");
    const tallest = Math.max(...resized.flora.map((entry) => entry.height[1]));

    expect(tallest).toBeLessThanOrEqual(TANK_SIZE_MEASURES.nano.height * 0.8);
  });

  it("keeps a carpet short, not microscopic", () => {
    const carpet = resizeScene(planted(), "nano").flora[0];

    expect(carpet?.height[0]).toBeGreaterThan(0.01);
  });

  it("makes stones smaller in a smaller tank and larger in a larger one", () => {
    const [low, high] = planted().props[0]?.size ?? [0, 0];
    const small = resizeScene(planted(), "small").props[0]?.size;
    const big = resizeScene(planted({ tank: { width: 1.2, height: 0.6, depth: 0.5 } }), "large")
      .props[0]?.size;

    expect(small?.[1]).toBeLessThan(high);
    expect(big?.[0]).toBeGreaterThan(low);
  });

  it("moves chosen spots with the tank's width and depth", () => {
    const scene = planted({
      props: [{ kind: "rock", count: 1, color: "#555", at: [{ x: 1.2, z: -0.5, size: 0.3 }] }],
    });
    const spot = resizeScene(scene, "small").props[0]?.at?.[0];

    expect(spot?.x).toBeCloseTo(0.3);
    expect(spot?.z).toBeCloseTo(-0.2);
  });

  it("keeps no more chosen spots than plants", () => {
    const scene = planted({
      flora: [
        {
          kind: "anubias",
          count: 3,
          bands: [1, 3],
          height: [0.1, 0.16],
          color: "#fff",
          at: [
            { x: 0, z: -0.2 },
            { x: 0.5, z: -0.4 },
            { x: -0.5, z: -0.6 },
          ],
        },
      ],
    });
    const resized = resizeScene(scene, "nano").flora[0];

    expect(resized?.at?.length).toBe(resized?.count);
  });

  it("is deterministic: the same scene and size give the same scene", () => {
    expect(resizeScene(planted(), "small")).toEqual(resizeScene(planted(), "small"));
  });

  it("does not change the scene it is given", () => {
    const scene = planted();
    const before = structuredClone(scene);

    resizeScene(scene, "nano");

    expect(scene).toEqual(before);
  });

  it("scales a rockwork's height, thickness and rocks", () => {
    const scene = planted({
      rockwork: { bands: [1, 3], height: [0.4, 0.8], thickness: 0.9, rocks: 40, color: "#777" },
    });
    const rockwork = resizeScene(scene, "small").rockwork;

    expect(rockwork?.height[1]).toBeLessThan(0.8);
    expect(rockwork?.thickness).toBeLessThan(0.9);
    expect(rockwork?.rocks).toBeLessThan(40);
  });

  it("refuses a scene built of blocks, which have a fixed shape", () => {
    const scene: Scene = { ...planted(), blocks: { size: 0.5, runs: [0], color: "#777" } };

    expect(canResize(scene)).toBe(false);
    expect(resizeScene(scene, "nano")).toBe(scene);
  });
});
