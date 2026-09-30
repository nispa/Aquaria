import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { sceneFixture } from "../scene/fixtures";
import type { FloraSpec, PropSpec } from "../scene/schema";
import { layoutFlora, layoutProps } from "./layout";
import { createRockwork } from "./rockwork";
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

describe("stable layout", () => {
  const kelp: FloraSpec = {
    kind: "kelp",
    count: 5,
    bands: [2, 4],
    height: [1, 3],
    color: "#3d7a3a",
  };
  const grass: FloraSpec = {
    kind: "seagrass",
    count: 8,
    bands: [0, 4],
    height: [0.1, 0.3],
    color: "#79ad4e",
  };

  it("keeps existing plants in place when a count grows", () => {
    const before = layoutFlora(tank, [kelp], createRng(7));

    const after = layoutFlora(tank, [{ ...kelp, count: 6 }], createRng(7));

    expect(after.slice(0, 5)).toEqual(before);
  });

  it("does not move other entries when one entry's count changes", () => {
    const before = layoutFlora(tank, [kelp, grass], createRng(7));

    const after = layoutFlora(tank, [{ ...kelp, count: 1 }, grass], createRng(7));

    expect(after.filter((plant) => plant.kind === "seagrass")).toEqual(
      before.filter((plant) => plant.kind === "seagrass"),
    );
  });

  it("keeps existing props in place when a count grows", () => {
    const rocks: PropSpec = { kind: "rock", count: 3, color: "#666666" };
    const before = layoutProps(tank, [rocks], createRng(7));

    const after = layoutProps(tank, [{ ...rocks, count: 4 }], createRng(7));

    expect(after.slice(0, 3)).toEqual(before);
  });

  it("gives every plant and prop its own integer seed for renderer details", () => {
    const plants = layoutFlora(tank, [kelp], createRng(7));
    const props = layoutProps(tank, [{ kind: "rock", count: 3, color: "#666666" }], createRng(7));

    const seeds = [...plants, ...props].map((item) => item.seed);

    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0)).toBe(true);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("scenery kinds", () => {
  const layoutOne = (kind: PropSpec["kind"]) =>
    layoutProps(tank, [{ kind, count: 20, color: "#ffffff" }], createRng(9));

  it("keeps shells near the glass where they can be seen", () => {
    const { far } = bandDepthRange(tank, [0, 1]);

    expect(layoutOne("shell").every((prop) => prop.z >= far)).toBe(true);
  });

  it("keeps fan corals towards the back, where they frame the scene", () => {
    const { near } = bandDepthRange(tank, [2, 4]);

    expect(layoutOne("fan-coral").every((prop) => prop.z <= near)).toBe(true);
  });

  it("lets a scene choose the bands of a prop entry", () => {
    const { near, far } = bandDepthRange(tank, [4, 4]);

    const props = layoutProps(
      tank,
      [{ kind: "branch-coral", count: 10, color: "#ff8866", bands: [4, 4] }],
      createRng(9),
    );

    expect(props.every((prop) => prop.z <= near && prop.z >= far)).toBe(true);
  });

  it("sizes shells smaller than brain corals", () => {
    const largestShell = Math.max(...layoutOne("shell").map((prop) => prop.size));
    const smallestCoral = Math.min(...layoutOne("brain-coral").map((prop) => prop.size));

    expect(largestShell).toBeLessThan(smallestCoral);
  });
});

describe("visible width", () => {
  const rocks: PropSpec = { kind: "rock", count: 60, color: "#666666" };
  /** A view that widens with depth, like a perspective camera. */
  const widening = (z: number): number => 4 + -z * 1.5;

  it("spreads props across the width the camera sees at their depth", () => {
    const props = layoutProps(tank, [rocks], createRng(3), widening);

    expect(props.every((prop) => Math.abs(prop.x) <= widening(prop.z))).toBe(true);
    expect(Math.max(...props.map((prop) => Math.abs(prop.x)))).toBeGreaterThan(tank.width / 2);
  });

  it("spreads plants across the width the camera sees at their depth", () => {
    const kelp: FloraSpec = {
      kind: "kelp",
      count: 60,
      bands: [3, 4],
      height: [1, 2],
      color: "#3d7a3a",
    };

    const plants = layoutFlora(tank, [kelp], createRng(3), widening);

    expect(plants.every((plant) => Math.abs(plant.x) <= widening(plant.z))).toBe(true);
    expect(Math.max(...plants.map((plant) => Math.abs(plant.x)))).toBeGreaterThan(tank.width / 2);
  });

  it("keeps items at the same depth and side, only further out, when the view widens", () => {
    const narrow = layoutProps(tank, [rocks], createRng(3), () => 2);

    const wide = layoutProps(tank, [rocks], createRng(3), () => 4);

    const moved = wide.filter((prop, index) => {
      const before = narrow[index];
      return (
        prop.z !== before?.z ||
        Math.sign(prop.x) !== Math.sign(before.x) ||
        Math.abs(prop.x) < Math.abs(before.x)
      );
    });
    expect(moved).toEqual([]);
  });
});

describe("color palettes", () => {
  const palette = ["#9a6fc2", "#c9a27a", "#e08fb0"];

  it("gives each prop one color from its entry's palette", () => {
    const props = layoutProps(
      tank,
      [{ kind: "branch-coral", count: 30, color: palette }],
      createRng(4),
    );

    expect(props.every((prop) => palette.includes(prop.color))).toBe(true);
    expect(new Set(props.map((prop) => prop.color)).size).toBe(3);
  });

  it("gives each plant one color from its entry's palette", () => {
    const plants = layoutFlora(
      tank,
      [{ kind: "anemone", count: 30, bands: [0, 2], height: [0.1, 0.2], color: palette }],
      createRng(4),
    );

    expect(new Set(plants.map((plant) => plant.color))).toEqual(new Set(palette));
  });
});

describe("placement on rockwork", () => {
  const rockwork = createRockwork(
    tank,
    {
      bands: [1, 3],
      height: [0.3, 0.9],
      coverage: 0.85,
      thickness: 0.9,
      rocks: 20,
      color: "#888888",
    },
    createRng(5),
    () => tank.width / 2,
  );

  it("sets corals on the ridge surface instead of the sand", () => {
    const corals = layoutProps(
      tank,
      [{ kind: "brain-coral", count: 20, color: "#b89a5e", on: "rockwork" }],
      createRng(6),
      undefined,
      rockwork,
    );

    const offRidge = corals.filter(
      (coral) =>
        (coral.elevation ?? 0) <= 0 ||
        Math.abs((coral.elevation ?? 0) - rockwork.heightAt(coral.x, coral.z)) > 1e-9,
    );
    expect(offRidge).toEqual([]);
  });

  it("sets anemones on the ridge surface", () => {
    const anemones = layoutFlora(
      tank,
      [
        {
          kind: "anemone",
          count: 10,
          bands: [0, 4],
          height: [0.1, 0.2],
          color: "#c98fd6",
          on: "rockwork",
        },
      ],
      createRng(6),
      undefined,
      rockwork,
    );

    expect(anemones.every((plant) => (plant.elevation ?? 0) > 0)).toBe(true);
  });

  it("keeps sand entries on the sand", () => {
    const shells = layoutProps(
      tank,
      [{ kind: "shell", count: 5, color: "#ffffff" }],
      createRng(6),
      undefined,
      rockwork,
    );

    expect(shells.every((shell) => shell.elevation === undefined)).toBe(true);
  });
});

describe("tip color", () => {
  it("passes an entry's tip color on to its plants", () => {
    const plants = layoutFlora(
      tank,
      [
        {
          kind: "stem",
          count: 3,
          bands: [2, 4],
          height: [0.2, 0.4],
          color: "#3a8a2a",
          tipColor: "#e0402a",
        },
      ],
      createRng(2),
    );

    expect(plants.every((plant) => plant.tipColor === "#e0402a")).toBe(true);
  });

  it("gives plants without a tip color none", () => {
    const plants = layoutFlora(
      tank,
      [{ kind: "fern", count: 3, bands: [2, 4], height: [0.2, 0.4], color: "#3a8a2a" }],
      createRng(2),
    );

    expect(plants.every((plant) => plant.tipColor === undefined)).toBe(true);
  });
});

describe("size override", () => {
  it("uses an entry's own size range instead of the kind's default", () => {
    const props = layoutProps(
      tank,
      [{ kind: "rock", count: 20, color: "#666666", size: [0.1, 0.15] }],
      createRng(3),
    );

    expect(props.every((prop) => prop.size >= 0.1 && prop.size <= 0.15)).toBe(true);
  });
});
