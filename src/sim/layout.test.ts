import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { sceneFixture } from "../scene/fixtures";
import type { FloraSpec } from "../scene/schema";
import { layoutFlora, layoutProps } from "./layout";
import { bandDepthRange } from "./tank";

const tank = sceneFixture().tank;

describe("layoutFlora", () => {
  const spec: FloraSpec = {
    kind: "kelp",
    count: 30,
    bands: [2, 4],
    height: [1, 3],
    color: "#3d7a3a",
  };

  it("places the requested number of plants", () => {
    const plants = layoutFlora(tank, [spec], createRng(1));

    expect(plants).toHaveLength(30);
  });

  it("keeps plants inside their bands and the tank width", () => {
    const { near, far } = bandDepthRange(tank, spec.bands);

    const plants = layoutFlora(tank, [spec], createRng(1));

    const misplaced = plants.filter(
      (plant) =>
        plant.z > near || plant.z < far || Math.abs(plant.x) > tank.width / 2 || plant.height < 1,
    );
    expect(misplaced).toEqual([]);
  });

  it("draws heights within the requested range", () => {
    const plants = layoutFlora(tank, [spec], createRng(1));

    const heights = plants.map((plant) => plant.height);

    expect(Math.min(...heights)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...heights)).toBeLessThanOrEqual(3);
  });

  it("is deterministic for a given seed", () => {
    expect(layoutFlora(tank, [spec], createRng(5))).toEqual(
      layoutFlora(tank, [spec], createRng(5)),
    );
  });

  it("keeps the kind and color of each group", () => {
    const plants = layoutFlora(tank, [spec], createRng(1));

    expect(plants.every((plant) => plant.kind === "kelp" && plant.color === "#3d7a3a")).toBe(true);
  });
});

describe("layoutProps", () => {
  it("places the requested props on the floor inside the tank", () => {
    const props = layoutProps(
      tank,
      [
        { kind: "rock", count: 5, color: "#666666" },
        { kind: "starfish", count: 1, color: "#e8683c" },
      ],
      createRng(2),
    );

    expect(props).toHaveLength(6);
    expect(props.every((prop) => prop.z <= 0 && prop.z >= -tank.depth)).toBe(true);
  });

  it("keeps starfish in the front bands where they can be seen", () => {
    const { far } = bandDepthRange(tank, [0, 1]);

    const props = layoutProps(
      tank,
      [{ kind: "starfish", count: 10, color: "#e8683c" }],
      createRng(3),
    );

    expect(props.every((prop) => prop.z >= far)).toBe(true);
  });

  it("gives every prop a positive size and a rotation", () => {
    const props = layoutProps(tank, [{ kind: "rock", count: 4, color: "#666666" }], createRng(4));

    expect(props.every((prop) => prop.size > 0 && Number.isFinite(prop.rotation))).toBe(true);
  });
});
