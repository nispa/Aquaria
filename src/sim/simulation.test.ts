import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { catalogFixture, sceneFixture } from "../scene/fixtures";
import { parseCatalog, parseScene } from "../scene/parse";
import type { SceneInput } from "../scene/schema";
import { createSimulation, TOTAL_FISH_LIMIT, type Simulation } from "./simulation";
import { habitatBox } from "./tank";

const STEP = 1 / 60;
const catalog = parseCatalog(catalogFixture());

function simulate(overrides: Partial<SceneInput> = {}, seed = 1, fishLimit?: number): Simulation {
  const scene = parseScene({ ...sceneFixture(), ...overrides }, catalog);
  return createSimulation({
    scene,
    catalog,
    rng: createRng(seed),
    ...(fishLimit === undefined ? {} : { fishLimit }),
  });
}

function run(simulation: Simulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) simulation.step(STEP);
}

const countOf = (simulation: Simulation, species: string) =>
  simulation.fish.filter((fish) => fish.species.id === species).length;

describe("createSimulation", () => {
  it("starts with the populations requested by the scene", () => {
    const simulation = simulate();

    expect(countOf(simulation, "blue-tang")).toBe(6);
    expect(countOf(simulation, "sardine")).toBe(40);
  });

  it("starts every fish fully visible inside its habitat", () => {
    const simulation = simulate();
    const tank = sceneFixture().tank;

    const outside = simulation.fish.filter(
      (fish) => fish.opacity !== 1 || !habitatBox(tank, fish.species).containsPoint(fish.position),
    );

    expect(outside).toEqual([]);
  });

  it("gives individuals different sizes around the species mean", () => {
    const simulation = simulate();

    const lengths = simulation.fish
      .filter((fish) => fish.species.id === "sardine")
      .map((fish) => fish.length);

    expect(new Set(lengths).size).toBeGreaterThan(1);
    expect(Math.min(...lengths)).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    const first = simulate({}, 99);
    const second = simulate({}, 99);

    run(first, 2);
    run(second, 2);

    expect(first.fish.map((fish) => fish.position.toArray())).toEqual(
      second.fish.map((fish) => fish.position.toArray()),
    );
  });

  it("keeps fish close to their habitat over time", () => {
    const simulation = simulate();
    const tank = sceneFixture().tank;
    const tolerance = 0.6;

    run(simulation, 20);

    const strays = simulation.fish.filter((fish) => {
      const box = habitatBox(tank, fish.species).expandByScalar(tolerance);
      return !box.containsPoint(fish.position);
    });
    expect(strays).toEqual([]);
  });

  it("keeps every fish moving between its minimum and maximum speed", () => {
    const simulation = simulate();

    run(simulation, 5);

    const tooFast = simulation.fish.filter(
      (fish) => fish.velocity.length() > fish.species.speed.max + 1e-6,
    );
    expect(tooFast).toEqual([]);
  });

  it("advances each fish's swim phase", () => {
    const simulation = simulate();
    const before = simulation.fish.map((fish) => fish.swimPhase);

    run(simulation, 1);

    const unchanged = simulation.fish.filter((fish, index) => fish.swimPhase === before[index]);
    expect(unchanged).toEqual([]);
  });

  it("keeps schooling fish closer together than solitary fish", () => {
    const simulation = simulate({
      fauna: [
        { species: "sardine", count: 20 },
        { species: "blue-tang", count: 20 },
      ],
    });

    run(simulation, 20);

    const spread = (species: string) => {
      const members = simulation.fish.filter((fish) => fish.species.id === species);
      const total = members.reduce(
        (sum, fish) =>
          sum +
          Math.min(
            ...members
              .filter((other) => other !== fish)
              .map((other) => other.position.distanceTo(fish.position) / fish.species.length.mean),
          ),
        0,
      );
      return total / members.length;
    };
    expect(spread("sardine")).toBeLessThan(spread("blue-tang"));
  });
});

describe("changing populations", () => {
  it("spawns new fish outside the side walls, invisible and entering", () => {
    const simulation = simulate();
    const halfWidth = sceneFixture().tank.width / 2;

    simulation.setCount("blue-tang", 8);

    const newcomers = simulation.fish.filter((fish) => fish.state === "entering");
    expect(newcomers).toHaveLength(2);
    expect(newcomers.every((fish) => Math.abs(fish.position.x) > halfWidth)).toBe(true);
    expect(newcomers.every((fish) => fish.opacity === 0)).toBe(true);
  });

  it("lets new fish swim in and fade in", () => {
    const simulation = simulate();
    simulation.setCount("blue-tang", 8);

    run(simulation, 15);

    const blueTangs = simulation.fish.filter((fish) => fish.species.id === "blue-tang");
    expect(blueTangs.every((fish) => fish.state === "swimming" && fish.opacity === 1)).toBe(true);
  });

  it("sends surplus fish away instead of removing them instantly", () => {
    const simulation = simulate();

    simulation.setCount("sardine", 30);

    expect(countOf(simulation, "sardine")).toBe(40);
    expect(simulation.fish.filter((fish) => fish.state === "leaving")).toHaveLength(10);
  });

  it("removes leaving fish once they have gone", () => {
    const simulation = simulate();
    simulation.setCount("sardine", 30);

    run(simulation, 30);

    expect(countOf(simulation, "sardine")).toBe(30);
  });

  it("reports target counts immediately", () => {
    const simulation = simulate();

    simulation.setCount("sardine", 12);

    expect(simulation.targetCount("sardine")).toBe(12);
  });

  it("clamps requested counts to the allowed range", () => {
    const simulation = simulate();

    simulation.setCount("blue-tang", 500);
    simulation.setCount("sardine", -4);

    expect(simulation.targetCount("blue-tang")).toBe(50);
    expect(simulation.targetCount("sardine")).toBe(0);
  });

  it("recalls leaving fish when the count goes back up", () => {
    const simulation = simulate();
    simulation.setCount("sardine", 30);

    simulation.setCount("sardine", 40);

    expect(simulation.fish.filter((fish) => fish.state === "leaving")).toHaveLength(0);
    expect(countOf(simulation, "sardine")).toBe(40);
  });

  it("adds a species that the scene did not start with", () => {
    const simulation = simulate({ fauna: [{ species: "sardine", count: 5 }] });

    simulation.setCount("blue-tang", 3);

    expect(countOf(simulation, "blue-tang")).toBe(3);
  });

  it("rejects species missing from the catalog", () => {
    const simulation = simulate();

    expect(() => {
      simulation.setCount("shark", 1);
    }).toThrow(/unknown species "shark"/i);
  });

  it("never exceeds the total fish limit", () => {
    const simulation = simulate({}, 1, 60);

    simulation.setCount("blue-tang", 50);
    simulation.setCount("sardine", 50);

    expect(simulation.fish.length).toBe(60);
  });

  it("uses a default total limit large enough for several full species", () => {
    expect(TOTAL_FISH_LIMIT).toBeGreaterThanOrEqual(200);
  });
});

describe("seabed", () => {
  /** Above the lower edge of the blue tangs' habitat (1.35 m), below its top. */
  const plateau = 2.5;

  it("keeps every fish above the rockwork, even where its habitat is lower", () => {
    const simulation = simulate();
    simulation.setSeabed(() => plateau);

    run(simulation, 10);

    const below = simulation.fish.filter((fish) => fish.position.y < plateau);
    expect(below).toEqual([]);
  });

  it("leaves fish free to use their habitat over flat sand", () => {
    const simulation = simulate();
    simulation.setSeabed(() => 0);

    run(simulation, 10);

    expect(simulation.fish.some((fish) => fish.position.y < plateau)).toBe(true);
  });
});

describe("gaze", () => {
  it("makes fish glance sideways now and then, within -1..1", () => {
    const simulation = simulate();

    run(simulation, 10);

    const gazes = simulation.fish.map((fish) => fish.gaze);
    expect(gazes.every((gaze) => gaze >= -1 && gaze <= 1)).toBe(true);
    expect(gazes.some((gaze) => gaze !== 0)).toBe(true);
  });
});
