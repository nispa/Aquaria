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
  tableCoralGeometry,
  mushroomCoralGeometry,
  leatherCoralGeometry,
  algaeBushGeometry,
  driftwoodGeometry,
  dragonStoneGeometry,
  mossCushionGeometry,
  pebbleGeometry,
  fernFrondGeometry,
  stemPlantGeometry,
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
  "table coral": () => tableCoralGeometry(createRng(1)),
  "mushroom coral": () => mushroomCoralGeometry(createRng(1)),
  "leather coral": () => leatherCoralGeometry(createRng(1)),
  driftwood: () => driftwoodGeometry(createRng(1)),
  "dragon stone": () => dragonStoneGeometry(createRng(1)),
  "moss cushion": () => mossCushionGeometry(createRng(1)),
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

describe("new corals and algae", () => {
  const height = (geometry: BufferGeometry) => {
    const box = bounds(geometry);
    return { tall: box.max.y - box.min.y, wide: box.max.x - box.min.x };
  };

  it("spreads a table coral into a plate much wider than it is tall", () => {
    const { tall, wide } = height(tableCoralGeometry(createRng(1)));

    expect(tall).toBeLessThan(wide * 0.45);
  });

  it("keeps a mushroom coral low, like a disc on the rock", () => {
    const { tall, wide } = height(mushroomCoralGeometry(createRng(1)));

    expect(tall).toBeLessThan(wide * 0.3);
  });

  it("raises a leather coral's cap on a stalk", () => {
    const { tall, wide } = height(leatherCoralGeometry(createRng(1)));

    expect(tall).toBeGreaterThan(wide * 0.4);
  });

  it("builds an algae bush one unit tall from y = 0, as the plant sway expects", () => {
    const box = bounds(algaeBushGeometry(createRng(1)));

    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1, 1);
  });

  it("gives an algae bush many leaves, not a single blade", () => {
    const bush = algaeBushGeometry(createRng(1));

    expect(bush.getAttribute("position").count).toBeGreaterThan(500);
  });
});

describe("aquascape pieces", () => {
  const extent = (geometry: BufferGeometry) => {
    const box = bounds(geometry);
    return {
      tall: box.max.y - box.min.y,
      wide: Math.max(box.max.x - box.min.x, box.max.z - box.min.z),
    };
  };

  it("sprawls driftwood sideways rather than up like a coral", () => {
    const { tall, wide } = extent(driftwoodGeometry(createRng(1)));

    expect(wide).toBeGreaterThan(tall);
  });

  it("raises a dragon stone into a spire taller than it is wide", () => {
    const { tall, wide } = extent(dragonStoneGeometry(createRng(1)));

    expect(tall).toBeGreaterThan(wide * 1.2);
  });

  it("keeps a moss cushion a low dome", () => {
    const { tall, wide } = extent(mossCushionGeometry(createRng(1)));

    expect(tall).toBeLessThan(wide * 0.7);
  });

  it("makes pebbles flat and smooth", () => {
    const { tall, wide } = extent(pebbleGeometry(createRng(1)));

    expect(tall).toBeLessThan(wide * 0.6);
  });

  it.each([
    ["fern frond", () => fernFrondGeometry(createRng(1))],
    ["stem plant", () => stemPlantGeometry(createRng(1))],
  ])("builds a %s one unit tall from y = 0, as the plant sway expects", (_, make) => {
    const box = bounds(make());

    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1, 1);
  });

  it("gives a fern frond leaflets on both sides of its stem", () => {
    const box = bounds(fernFrondGeometry(createRng(1)));

    expect(box.min.x).toBeLessThan(-0.05);
    expect(box.max.x).toBeGreaterThan(0.05);
  });
});
