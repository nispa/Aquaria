import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { catalogFixture, sceneFixture } from "../scene/fixtures";
import { parseCatalog, parseScene } from "../scene/parse";
import type { SceneInput, Species } from "../scene/schema";
import { createSimulation, TOTAL_FISH_LIMIT, type Fish, type Simulation } from "./simulation";
import { FLAKES_PER_PINCH } from "./food";
import { spinOf } from "./gesture";
import { MAX_BEND, MAX_EFFORT, MIN_EFFORT, maxTurnRate } from "./posture";
import { createObstacleField, type Obstacle } from "./obstacles";
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

describe("visitors", () => {
  it("brings the scene's visitors, out of sight at first", () => {
    const simulation = simulate({ visitors: [{ model: "sea-turtle", count: 2 }] });

    expect(simulation.visitors.map((visitor) => [visitor.model, visitor.visible])).toEqual([
      ["sea-turtle", false],
      ["sea-turtle", false],
    ]);
  });

  it("lets a visitor pass as the simulation runs", () => {
    const simulation = simulate({ visitors: [{ model: "sea-turtle", every: [10, 12] }] });

    run(simulation, 13);

    expect(simulation.visitors[0]?.visible).toBe(true);
  });
});

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

  it("never asks for more fish than the species allows", () => {
    const input = catalogFixture();
    input.species[0]!.maxCount = 7;
    const limited = parseCatalog(input);
    const simulation = createSimulation({
      scene: parseScene(sceneFixture(), limited),
      catalog: limited,
      rng: createRng(1),
    });

    simulation.setCount("blue-tang", 20);

    expect(simulation.targetCount("blue-tang")).toBe(7);
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

describe("posture", () => {
  it("bends fish into their turns, both ways, within the C-start limit", () => {
    const simulation = simulate();

    run(simulation, 10);

    const bends = simulation.fish.map((fish) => fish.bend);
    expect(bends.every((bend) => Math.abs(bend) <= MAX_BEND)).toBe(true);
    expect(bends.some((bend) => bend > 0)).toBe(true);
    expect(bends.some((bend) => bend < 0)).toBe(true);
  });

  it("varies the tail beat between fish, within its limits", () => {
    const simulation = simulate();

    run(simulation, 10);

    const efforts = simulation.fish.map((fish) => fish.effort);
    expect(efforts.every((effort) => effort >= MIN_EFFORT && effort <= MAX_EFFORT)).toBe(true);
    expect(new Set(efforts).size).toBeGreaterThan(1);
  });

  it("starts every fish straight and cruising", () => {
    const simulation = simulate();

    expect(simulation.fish.every((fish) => fish.bend === 0 && fish.effort === 1)).toBe(true);
  });
});

describe("feeding", () => {
  const eatenCount = (simulation: Simulation) =>
    simulation.food.pellets.filter((pellet) => !pellet.active).length;

  it("has no food in the water until some is dropped", () => {
    const simulation = simulate();

    expect(simulation.food.pellets.some((pellet) => pellet.active)).toBe(false);
  });

  it("lets fish find and eat flakes dropped above them", () => {
    const simulation = simulate();
    simulation.dropFood(0, -2.5);

    run(simulation, 30);

    expect(simulation.fish.some((fish) => fish.satiety > 0)).toBe(true);
    expect(eatenCount(simulation)).toBeGreaterThan(0);
  });

  it("makes fish open their mouths as they close in on food", () => {
    const simulation = simulate();
    simulation.dropFood(0, -2.5);
    let widest = 0;

    for (let elapsed = 0; elapsed < 30; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) widest = Math.max(widest, fish.mouth);
    }

    expect(widest).toBeGreaterThan(0.5);
  });

  it("keeps mouths closed while there is nothing to eat", () => {
    const simulation = simulate();

    run(simulation, 10);

    expect(simulation.fish.every((fish) => fish.mouth === 0)).toBe(true);
  });

  it("makes fish that are full lose interest in food", () => {
    const simulation = simulate();
    for (const fish of simulation.fish) fish.satiety = 1;
    simulation.dropFood(0, -2.5);

    run(simulation, 30);

    expect(simulation.food.pellets.filter((pellet) => pellet.active)).toHaveLength(
      FLAKES_PER_PINCH,
    );
  });

  it("lets fish get hungry again over time", () => {
    const simulation = simulate();
    for (const fish of simulation.fish) fish.satiety = 1;

    run(simulation, 10);

    expect(simulation.fish.every((fish) => fish.satiety < 1)).toBe(true);
  });
});

describe("viewer at the glass", () => {
  const finger = new Vector3(0, 2.5, 0);

  function simulateWithBehavior(behavior: Partial<Species["behavior"]>): Simulation {
    const input = catalogFixture();
    for (const species of input.species) species.behavior = behavior;
    const tuned = parseCatalog(input);
    return createSimulation({
      scene: parseScene(sceneFixture(), tuned),
      catalog: tuned,
      rng: createRng(1),
    });
  }

  const meanDistanceTo = (simulation: Simulation, point: Vector3) =>
    simulation.fish.reduce((sum, fish) => sum + fish.position.distanceTo(point), 0) /
    simulation.fish.length;

  const closeTo = (simulation: Simulation, point: Vector3) =>
    simulation.fish.filter((fish) => fish.position.distanceTo(point) < 1.5).length;

  const nearestToGlass = (simulation: Simulation) =>
    simulation.fish.reduce((best, fish) => (fish.position.z > best.position.z ? fish : best));

  it("draws curious fish to a finger on the glass", () => {
    const watched = simulateWithBehavior({ curiosity: 1 });
    const unwatched = simulateWithBehavior({ curiosity: 1 });
    watched.setFinger(finger);

    run(watched, 20);
    run(unwatched, 20);

    // The tangs live near the glass; the sardines stay out in open water.
    expect(closeTo(watched, finger)).toBeGreaterThanOrEqual(5);
    expect(closeTo(unwatched, finger)).toBeLessThanOrEqual(1);
  });

  it("leaves species without curiosity swimming as if nobody were there", () => {
    const watched = simulateWithBehavior({ curiosity: 0 });
    const unwatched = simulateWithBehavior({ curiosity: 0 });
    watched.setFinger(finger);

    run(watched, 5);
    run(unwatched, 5);

    expect(watched.fish.map((fish) => fish.position.x)).toEqual(
      unwatched.fish.map((fish) => fish.position.x),
    );
  });

  it("lets fish swim off again once the finger is gone", () => {
    const simulation = simulateWithBehavior({ curiosity: 1 });
    simulation.setFinger(finger);
    run(simulation, 20);
    const gathered = meanDistanceTo(simulation, finger);

    simulation.setFinger(undefined);
    run(simulation, 20);

    expect(meanDistanceTo(simulation, finger)).toBeGreaterThan(gathered);
  });

  it("makes fish near a tap on the glass dart away", () => {
    const simulation = simulateWithBehavior({ shyness: 1 });
    run(simulation, 1);
    const target = nearestToGlass(simulation);
    const tap = new Vector3(target.position.x, target.position.y, 0);
    const before = target.position.distanceTo(tap);

    simulation.tap(tap);
    run(simulation, 0.5);

    expect(target.fear).toBeGreaterThan(0);
    expect(target.position.distanceTo(tap)).toBeGreaterThan(before);
    expect(target.velocity.length()).toBeGreaterThan(target.species.speed.cruise);
  });

  it("calms startled fish down within a few seconds", () => {
    const simulation = simulateWithBehavior({ shyness: 1 });
    simulation.tap(finger);

    run(simulation, 10);

    expect(simulation.fish.every((fish) => fish.fear === 0)).toBe(true);
  });

  it("startles shy species from farther away than bold ones", () => {
    const shy = simulateWithBehavior({ shyness: 1 });
    const bold = simulateWithBehavior({ shyness: 0 });

    shy.tap(finger);
    bold.tap(finger);

    const frightened = (simulation: Simulation) =>
      simulation.fish.filter((fish) => fish.fear > 0).length;
    expect(frightened(shy)).toBeGreaterThan(frightened(bold));
  });
});

describe("swimming styles", () => {
  function simulateSwimming(swim: unknown, species = "blue-tang", count = 6): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) => (entry.id === species ? { ...entry, swim } : entry)),
    });
    return createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species, count }] }, tuned),
      catalog: tuned,
      rng: createRng(3),
    });
  }

  /** Calls `sample` with every fish after each step for `seconds`. */
  function watch(simulation: Simulation, seconds: number, sample: (fish: Fish) => void): void {
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      simulation.step(STEP);
      simulation.fish.forEach(sample);
    }
  }

  it("lets cruising fish swim towards and away from the glass, not only sideways", () => {
    const simulation = simulateSwimming({ style: "cruise" });
    let across = 0;
    let deep = 0;

    watch(simulation, 60, (fish) => {
      across += Math.abs(fish.velocity.x);
      deep += Math.abs(fish.velocity.z);
    });

    expect(deep / across).toBeGreaterThan(0.5);
  });

  it("makes fish use the height of their habitat", () => {
    const simulation = simulateSwimming({ style: "cruise" });
    const tank = sceneFixture().tank;
    const lowest = new Map<number, number>();
    const highest = new Map<number, number>();

    watch(simulation, 90, (fish) => {
      lowest.set(fish.id, Math.min(lowest.get(fish.id) ?? Infinity, fish.position.y));
      highest.set(fish.id, Math.max(highest.get(fish.id) ?? -Infinity, fish.position.y));
    });

    const box = habitatBox(tank, { bands: [1, 3], heightRange: [0.3, 0.8] });
    const spans = [...highest].map(([id, top]) => top - (lowest.get(id) ?? top));
    const meanSpan = spans.reduce((sum, span) => sum + span, 0) / spans.length;
    expect(meanSpan).toBeGreaterThan((box.max.y - box.min.y) * 0.3);
  });

  it("keeps hovering fish slow", () => {
    const simulation = simulateSwimming({ style: "hover" });
    let total = 0;
    let samples = 0;

    watch(simulation, 30, (fish) => {
      total += fish.velocity.length() / fish.species.speed.cruise;
      samples += 1;
    });

    expect(total / samples).toBeLessThan(0.5);
  });

  it("stills the tail while coasting and beats it hard in a burst", () => {
    const simulation = simulateSwimming({ style: "burst-coast" });
    const efforts: number[] = [];

    watch(simulation, 20, (fish) => efforts.push(fish.effort));

    expect(Math.min(...efforts)).toBeLessThan(MIN_EFFORT / 2);
    expect(Math.max(...efforts)).toBeGreaterThan(1.5);
  });

  it("keeps crawling fish on the floor, wherever their habitat is", () => {
    const simulation = simulateSwimming({ style: "crawl" });
    simulation.setSeabed((x) => 0.2 + 0.05 * x);
    let highest = 0;

    run(simulation, 10);
    watch(simulation, 20, (fish) => {
      const seabed = 0.2 + 0.05 * fish.position.x;
      highest = Math.max(highest, (fish.position.y - seabed) / fish.length);
    });

    expect(highest).toBeLessThan(0.5);
  });

  it("keeps patrolling fish close to their home spot", () => {
    const simulation = simulateSwimming({ style: "patrol", radiusBodyLengths: 4 });
    const cruising = simulateSwimming({ style: "cruise" });
    const starts = new Map(simulation.fish.map((fish) => [fish.id, fish.position.clone()]));
    const cruisingStarts = new Map(cruising.fish.map((fish) => [fish.id, fish.position.clone()]));

    run(simulation, 60);
    run(cruising, 60);

    const meanDrift = (sim: Simulation, from: Map<number, Vector3>) =>
      sim.fish.reduce(
        (sum, fish) => sum + fish.position.distanceTo(from.get(fish.id) ?? fish.position),
        0,
      ) / sim.fish.length;
    expect(meanDrift(simulation, starts)).toBeLessThan(meanDrift(cruising, cruisingStarts));
  });
});

describe("hosts", () => {
  const anemone = { x: 1, z: -2, height: 0.2, tags: ["anemone", "shelter"] };
  const habitatFloor = 0.3 * sceneFixture().tank.height;

  function simulateHosted(): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) =>
        entry.id === "blue-tang"
          ? { ...entry, swim: { style: "hover", home: "anemone", roamBodyLengths: 2 } }
          : entry,
      ),
    });
    return createSimulation({
      // A pair, like clownfish: more large fish would push each other away.
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 2 }] }, tuned),
      catalog: tuned,
      rng: createRng(5),
    });
  }

  const farthestFrom = (simulation: Simulation, x: number, z: number) =>
    Math.max(
      ...simulation.fish.map((fish) => Math.hypot(fish.position.x - x, fish.position.z - z)),
    );

  it("brings fish to the nearest anemone and keeps them there, below their habitat", () => {
    const simulation = simulateHosted();
    const places = [anemone];
    simulation.setPlaces(() => places);

    run(simulation, 40);

    expect(farthestFrom(simulation, anemone.x, anemone.z)).toBeLessThan(1);
    expect(Math.max(...simulation.fish.map((fish) => fish.position.y))).toBeLessThan(habitatFloor);
  });

  it("moves fish to another anemone when the scenery changes", () => {
    const simulation = simulateHosted();
    let places = [anemone];
    simulation.setPlaces(() => places);
    run(simulation, 20);

    places = [{ ...anemone, x: -2 }];
    run(simulation, 40);

    const closerToTheOld = simulation.fish.filter(
      (fish) => Math.abs(fish.position.x - anemone.x) < Math.abs(fish.position.x + 2),
    );
    expect(closerToTheOld).toEqual([]);
  });
});

describe("activities", () => {
  const rock = { x: 1, z: -2, height: 0.3, tags: ["rock", "algae"] };

  function simulateActive(activities: unknown, swim?: unknown): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) =>
        entry.id === "blue-tang" ? { ...entry, activities, ...(swim ? { swim } : {}) } : entry,
      ),
    });
    const simulation = createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 4 }] }, tuned),
      catalog: tuned,
      rng: createRng(2),
    });
    // The same list on every step, as the view gives it: a new one means the scenery changed.
    const places = [rock];
    simulation.setPlaces(() => places);
    return simulation;
  }

  /** Every activity seen and the closest any fish came to the rock with its mouth open. */
  function observe(simulation: Simulation, seconds: number) {
    const seen = new Set<string>();
    let closestOpen = Infinity;
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        seen.add(fish.activity.id);
        if (fish.mouth > 0.5) {
          const distance = Math.hypot(fish.position.x - rock.x, fish.position.z - rock.z);
          closestOpen = Math.min(closestOpen, distance);
        }
      }
    }
    return { seen, closestOpen };
  }

  it("leaves the activity of species that can only wander untouched", () => {
    const simulation = simulateActive({});

    run(simulation, 10);

    expect(simulation.fish.every((fish) => fish.activity.timer === 0)).toBe(true);
  });

  it("keeps species that declare no activities wandering", () => {
    const { seen } = observe(simulateActive({}), 30);

    expect(seen).toEqual(new Set(["wander"]));
  });

  it("lets fish go down to peck at an interesting place, mouth open", () => {
    const simulation = simulateActive({
      wander: { seconds: [1, 2] },
      peck: { weight: 3, tags: { algae: 1 } },
    });

    const { seen, closestOpen } = observe(simulation, 60);

    expect(seen).toContain("peck");
    expect(closestOpen).toBeLessThan(0.3);
  });

  it("lets walkers peck at a low place on foot, without leaving the floor", () => {
    const simulation = simulateActive(
      { wander: { seconds: [1, 2] }, peck: { weight: 3, tags: { shell: 1 } } },
      { style: "crawl" },
    );
    simulation.setPlaces(() => [{ x: 1, z: -2, height: 0.02, tags: ["shell"] }]);
    let pecking = 0;
    let highest = 0;

    for (let elapsed = 0; elapsed < 120; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.activity.id !== "peck" || elapsed < 20) continue;
        pecking += 1;
        highest = Math.max(highest, fish.position.y / fish.length);
      }
    }

    expect(pecking).toBeGreaterThan(0);
    expect(highest).toBeLessThan(0.5);
  });

  it("brings the mouth of a pecking fish to the place it pecks at", () => {
    const simulation = simulateActive({
      wander: { seconds: [1, 2] },
      peck: { weight: 3, tags: { algae: 1 } },
    });
    const mouth = new Vector3();
    let gaps = 0;
    let darts = 0;

    for (let elapsed = 0; elapsed < 90; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.activity.id !== "peck" || fish.mouth < 0.9) continue;
        // The mouth leads the body by half its length.
        mouth
          .copy(fish.velocity)
          .setLength(fish.length / 2)
          .add(fish.position);
        gaps += mouth.distanceTo(fish.activity.target) / fish.length;
        darts += 1;
      }
    }

    expect(darts).toBeGreaterThan(0);
    expect(gaps / darts).toBeLessThan(0.4);
  });

  it("lets fish come and look at a place they care about", () => {
    const simulation = simulateActive({
      wander: { seconds: [1, 2] },
      inspect: { weight: 3, tags: { rock: 1 } },
    });
    let closest = Infinity;

    for (let elapsed = 0; elapsed < 40; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.activity.id !== "inspect") continue;
        closest = Math.min(closest, Math.hypot(fish.position.x - rock.x, fish.position.z - rock.z));
      }
    }

    expect(closest).toBeLessThan(1);
  });

  it("calls an activity off when the fish is startled", () => {
    const simulation = simulateActive({
      wander: { weight: 0 },
      peck: { weight: 1, tags: { algae: 1 } },
    });
    // Long enough for every fish to finish its first, randomly cut wander.
    run(simulation, 32);
    const busy = simulation.fish.find((fish) => fish.activity.id === "peck");

    simulation.tap(busy?.position ?? new Vector3());
    simulation.step(STEP);

    expect(busy?.activity.id).toBe("wander");
    expect(busy?.swim.mouth).toBe(0);
  });
});

describe("playing with the viewer", () => {
  const straightIn = new Vector3(0, 0, -1);

  function oneFish(): { simulation: Simulation; fish: Fish } {
    const simulation = simulate({ fauna: [{ species: "blue-tang", count: 1 }] }, 4);
    const [fish] = simulation.fish;
    if (fish === undefined) throw new Error("The scene has no fish.");
    return { simulation, fish };
  }

  /** Moves the finger along `path` (offsets from the fish, on the glass) for `seconds`. */
  function draw(
    simulation: Simulation,
    fish: Fish,
    path: (time: number) => readonly [number, number],
    seconds: number,
  ): void {
    const point = new Vector3();
    for (let time = 0; time < seconds; time += STEP) {
      const [x, y] = path(time);
      simulation.setFinger(point.set(fish.position.x + x, fish.position.y + y, 0), straightIn);
      simulation.step(STEP);
    }
  }

  const circles = (offset: number) => (time: number) =>
    [offset + 0.25 * Math.cos(9 * time), 0.25 * Math.sin(9 * time)] as const;
  const scribble = (time: number) => [0.15 * Math.sin(Math.PI * 5 * time), 0] as const;

  it("hypnotizes a fish when circles are drawn in front of it", () => {
    const { simulation, fish } = oneFish();

    draw(simulation, fish, circles(0), 2);

    expect(fish.play.hypnosis).toBeGreaterThan(0.9);
    expect(fish.velocity.length()).toBeLessThan(fish.species.speed.cruise * 0.3);
    expect(fish.roll).not.toBe(0);
  });

  it("leaves it dizzy once the circles stop", () => {
    const { simulation, fish } = oneFish();
    draw(simulation, fish, circles(0), 2);

    simulation.setFinger(undefined);
    run(simulation, 1);

    expect(fish.play.dizzy).toBeGreaterThan(0);
  });

  it("tells what the finger is drawing", () => {
    const { simulation, fish } = oneFish();

    draw(simulation, fish, circles(0), 1);

    expect(spinOf(simulation.gesture)).toBe(1);
  });

  it("leaves fish alone when the circles are drawn far from them", () => {
    const { simulation, fish } = oneFish();

    draw(simulation, fish, circles(2), 2);

    expect(fish.play.hypnosis).toBe(0);
  });

  it("tickles a fish when scribbling right over it: it flips belly up", () => {
    const { simulation, fish } = oneFish();
    draw(simulation, fish, scribble, 0.7);

    simulation.setFinger(undefined);
    run(simulation, 0.6);

    expect(fish.play.tickled).toBeGreaterThan(0);
    expect(Math.abs(fish.roll)).toBeGreaterThan(2.5);
  });
});

describe("day and night", () => {
  function simulateActiveBy(active: "day" | "night" | "always"): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) => ({
        ...entry,
        behavior: { active },
        activities: { wander: { seconds: [1, 2] } },
      })),
    });
    return createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 6 }] }, tuned),
      catalog: tuned,
      rng: createRng(6),
    });
  }

  const restingShare = (simulation: Simulation) =>
    simulation.fish.filter((fish) => fish.activity.id === "rest").length / simulation.fish.length;

  it("lets fish active by day rest at night, in realistic mode", () => {
    const simulation = simulateActiveBy("day");
    simulation.setRealistic(true);
    simulation.setDaylight(() => 0);

    run(simulation, 40);

    expect(restingShare(simulation)).toBeGreaterThan(0.6);
  });

  it("keeps them awake by day", () => {
    const simulation = simulateActiveBy("day");
    simulation.setRealistic(true);
    simulation.setDaylight(() => 1);

    run(simulation, 40);

    expect(restingShare(simulation)).toBe(0);
  });

  it("lets nocturnal species rest by day instead", () => {
    const simulation = simulateActiveBy("night");
    simulation.setRealistic(true);
    simulation.setDaylight(() => 1);

    run(simulation, 40);

    expect(restingShare(simulation)).toBeGreaterThan(0.6);
  });

  it("never sends species that are always active to rest", () => {
    const simulation = simulateActiveBy("always");
    simulation.setRealistic(true);
    simulation.setDaylight(() => 0);

    run(simulation, 40);

    expect(restingShare(simulation)).toBe(0);
  });

  it("keeps every fish awake at night outside realistic mode", () => {
    const simulation = simulateActiveBy("day");
    simulation.setDaylight(() => 0);

    run(simulation, 40);

    expect(restingShare(simulation)).toBe(0);
  });

  it("slows resting fish down", () => {
    const simulation = simulateActiveBy("day");
    simulation.setRealistic(true);
    simulation.setDaylight(() => 0);
    run(simulation, 40);

    const resting = simulation.fish.filter((fish) => fish.activity.id === "rest");
    const meanSpeed =
      resting.reduce((sum, fish) => sum + fish.velocity.length() / fish.species.speed.cruise, 0) /
      resting.length;

    expect(meanSpeed).toBeLessThan(0.4);
  });

  it("casts no spells in realistic mode", () => {
    const simulation = simulate({ fauna: [{ species: "blue-tang", count: 1 }] }, 4);
    simulation.setRealistic(true);
    const [fish] = simulation.fish;
    const point = new Vector3();

    for (let time = 0; time < 2; time += STEP) {
      const x = (fish?.position.x ?? 0) + 0.25 * Math.cos(9 * time);
      const y = (fish?.position.y ?? 0) + 0.25 * Math.sin(9 * time);
      simulation.setFinger(point.set(x, y, 0), new Vector3(0, 0, -1));
      simulation.step(STEP);
    }

    expect(fish?.play.hypnosis).toBe(0);
  });
});

describe("shelters", () => {
  const coral = { x: 1, z: -2, height: 0.5, tags: ["coral", "shelter"] };

  function simulateHiding(hiding: number, swim?: unknown, places = [coral]): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) =>
        entry.id === "blue-tang"
          ? { ...entry, behavior: { hiding, shyness: 1 }, ...(swim === undefined ? {} : { swim }) }
          : entry,
      ),
    });
    const simulation = createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 4 }] }, tuned),
      catalog: tuned,
      rng: createRng(8),
    });
    simulation.setPlaces(() => places);
    return simulation;
  }

  const meanDistanceToCoral = (fish: readonly Fish[]) =>
    fish.reduce(
      (sum, member) => sum + Math.hypot(member.position.x - coral.x, member.position.z - coral.z),
      0,
    ) / fish.length;

  /**
   * Taps the glass in front of every fish and returns those it startled (the
   * deepest may be out of reach).
   */
  function startle(simulation: Simulation): Fish[] {
    for (const fish of simulation.fish) {
      simulation.tap(new Vector3(fish.position.x, fish.position.y, 0));
    }
    return simulation.fish.filter((fish) => fish.fear > 0);
  }

  it("sends fish that hide to the nearest shelter when startled", () => {
    const hiders = simulateHiding(1);
    const bolters = simulateHiding(0);
    run(hiders, 1);
    run(bolters, 1);

    const startledHiders = startle(hiders);
    const startledBolters = startle(bolters);
    run(hiders, 4);
    run(bolters, 4);

    expect(startledHiders.length).toBeGreaterThan(0);
    expect(meanDistanceToCoral(startledHiders)).toBeLessThan(meanDistanceToCoral(startledBolters));
    expect(meanDistanceToCoral(startledHiders)).toBeLessThan(0.5);
  });

  it("keeps them in the shelter a while after the fright", () => {
    const simulation = simulateHiding(1);
    run(simulation, 1);
    const startled = startle(simulation);

    run(simulation, 5);

    expect(startled.every((fish) => fish.fear === 0)).toBe(true);
    expect(meanDistanceToCoral(startled)).toBeLessThan(0.5);
  });

  it("lets them slip into a coral that shelters them, solid as it is to others", () => {
    const simulation = simulateHiding(1);
    // The coral's own collision shape, standing on the sand.
    const shape: Obstacle[] = [
      {
        center: new Vector3(coral.x, 0, coral.z),
        radii: new Vector3(0.3, 0.5, 0.3),
        cos: 1,
        sin: 0,
        reach: 0.5,
      },
    ];
    const field = createObstacleField(shape);
    const normal = new Vector3();
    simulation.setObstacles(() => shape);
    run(simulation, 1);
    const [hider] = startle(simulation);
    if (hider === undefined) throw new Error("Nobody was startled.");
    // Right by the coral, level with its refuge.
    hider.position.set(coral.x - 0.4, hider.refuge.y, coral.z);
    let deepest = Infinity;

    for (let elapsed = 0; elapsed < 3; elapsed += STEP) {
      simulation.step(STEP);
      deepest = Math.min(deepest, field.distance(hider.position, normal, 1));
    }

    expect(deepest).toBeLessThan(0);
  });

  it("lets them slip into a shelter far larger than themselves", () => {
    const table = { x: 1, z: -2, height: 1.6, tags: ["coral", "shelter"] };
    const simulation = simulateHiding(1, undefined, [table]);
    const shape: Obstacle[] = [
      {
        center: new Vector3(table.x, 0, table.z),
        radii: new Vector3(1.2, 1.6, 1.2),
        cos: 1,
        sin: 0,
        reach: 1.6,
      },
    ];
    const field = createObstacleField(shape);
    const normal = new Vector3();
    simulation.setObstacles(() => shape);
    run(simulation, 1);
    const [hider] = startle(simulation);
    if (hider === undefined) throw new Error("Nobody was startled.");
    // Just off the coral's side, level with its refuge, far from the refuge itself.
    hider.position.set(table.x - 1.3, hider.refuge.y, table.z);
    let deepest = Infinity;

    for (let elapsed = 0; elapsed < 3; elapsed += STEP) {
      simulation.step(STEP);
      deepest = Math.min(deepest, field.distance(hider.position, normal, 1));
    }

    expect(deepest).toBeLessThan(0);
  });

  it("lets them come out again later", () => {
    const simulation = simulateHiding(1);
    run(simulation, 1);
    startle(simulation);
    run(simulation, 5);

    run(simulation, 20);

    expect(simulation.fish.every((fish) => fish.hiding === 0)).toBe(true);
  });

  it("sends a clownfish into its own anemone", () => {
    const anemone = { x: -1, z: -2, height: 0.2, tags: ["anemone", "shelter"] };
    const simulation = simulateHiding(0, { style: "hover", home: "anemone" }, [anemone]);
    run(simulation, 20);

    const startled = startle(simulation);
    run(simulation, 3);

    const inside = startled.filter(
      (fish) =>
        // Within two body lengths: four large fish crowd one anemone.
        Math.hypot(fish.position.x - anemone.x, fish.position.z - anemone.z) < 0.5 &&
        fish.position.y < 0.6,
    );
    expect(startled.length).toBeGreaterThan(0);
    expect(inside.length).toBe(startled.length);
  });
});

describe("schools", () => {
  function sardines(): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) => ({ ...entry, behavior: { shyness: 1 } })),
    });
    return createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "sardine", count: 30 }] }, tuned),
      catalog: tuned,
      rng: createRng(9),
    });
  }

  /** Mean distance from each fish to its nearest neighbour, in body lengths. */
  const spacing = (simulation: Simulation) =>
    simulation.fish.reduce((sum, fish) => {
      const nearest = Math.min(
        ...simulation.fish
          .filter((other) => other !== fish)
          .map((other) => other.position.distanceTo(fish.position)),
      );
      return sum + nearest / fish.length;
    }, 0) / simulation.fish.length;

  it("packs a school tighter when one of them is startled", () => {
    const calm = sardines();
    const alarmed = sardines();
    run(calm, 15);
    run(alarmed, 15);
    const nearest = alarmed.fish.reduce((best, fish) =>
      fish.position.z > best.position.z ? fish : best,
    );

    alarmed.tap(new Vector3(nearest.position.x, nearest.position.y, 0));
    run(calm, 2);
    run(alarmed, 2);

    expect(spacing(alarmed)).toBeLessThan(spacing(calm) * 0.85);
  });

  it("loosens it again once the fright has passed", () => {
    const simulation = sardines();
    run(simulation, 15);
    const nearest = simulation.fish.reduce((best, fish) =>
      fish.position.z > best.position.z ? fish : best,
    );
    // Spacing wanders on its own, so compare averages rather than moments.
    const meanSpacing = (seconds: number) => {
      let total = 0;
      let samples = 0;
      for (let elapsed = 0; elapsed < seconds; elapsed += 0.5) {
        run(simulation, 0.5);
        total += spacing(simulation);
        samples += 1;
      }
      return total / samples;
    };
    simulation.tap(new Vector3(nearest.position.x, nearest.position.y, 0));

    const packed = meanSpacing(2);
    run(simulation, 3);
    const relaxed = meanSpacing(15);

    expect(relaxed).toBeGreaterThan(packed * 1.05);
  });
});

describe("the torch", () => {
  const intoTank = new Vector3(0, 0, -1);

  function lit(torch: number, count = 20, species = "sardine"): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) => ({ ...entry, behavior: { torch, curiosity: 1 } })),
    });
    const simulation = createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species, count }] }, tuned),
      catalog: tuned,
      rng: createRng(10),
    });
    simulation.setDaylight(() => 0);
    return simulation;
  }

  /** Mean distance of the fish from the beam's axis, through (x, y) on the glass. */
  const offBeam = (simulation: Simulation, x: number, y: number) =>
    simulation.fish.reduce(
      (sum, fish) => sum + Math.hypot(fish.position.x - x, fish.position.y - y),
      0,
    ) / simulation.fish.length;

  const aim = (simulation: Simulation, x: number, y: number) => {
    simulation.setFinger(new Vector3(x, y, 0), intoTank);
  };

  it("gathers fish that love light in its beam", () => {
    const shining = lit(1);
    const dark = lit(1);
    shining.setTorch(true);
    aim(shining, 0, 3);

    run(shining, 15);
    run(dark, 15);

    expect(offBeam(shining, 0, 3)).toBeLessThan(offBeam(dark, 0, 3) * 0.6);
  });

  it("drives shy fish out of it", () => {
    const shining = lit(-1, 6, "blue-tang");
    const dark = lit(-1, 6, "blue-tang");
    shining.setTorch(true);
    const [first] = shining.fish;
    const x = first?.position.x ?? 0;
    const y = first?.position.y ?? 2;
    aim(shining, x, y);

    run(shining, 3);
    run(dark, 3);

    expect(offBeam(shining, x, y)).toBeGreaterThan(offBeam(dark, x, y));
  });

  it("leaves fish indifferent to light alone", () => {
    const shining = lit(0);
    const dark = lit(0);
    shining.setTorch(true);
    aim(shining, 0, 3);
    aim(dark, 0, 3);

    run(shining, 5);
    run(dark, 5);

    // With the torch on, the pointer is a torch, not a finger: nobody comes to look.
    expect(offBeam(shining, 0, 3)).toBeGreaterThan(offBeam(dark, 0, 3));
  });

  it("does nothing while it is switched off", () => {
    const off = lit(1);
    const never = lit(1);
    off.setTorch(true);
    off.setTorch(false);

    run(off, 5);
    run(never, 5);

    expect(off.fish.map((fish) => fish.position.toArray())).toEqual(
      never.fish.map((fish) => fish.position.toArray()),
    );
  });
});

describe("inertia", () => {
  /**
   * The fastest any fish turned in a step over `seconds`, as a share of its
   * own turn limit at fear `fear`.
   */
  function fastestTurnShare(simulation: Simulation, seconds: number, fear: number): number {
    const yaws = new Map<number, number>();
    let fastest = 0;
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        const yaw = Math.atan2(fish.velocity.z, fish.velocity.x);
        const before = yaws.get(fish.id);
        if (before !== undefined) {
          const turn = Math.abs(Math.atan2(Math.sin(yaw - before), Math.cos(yaw - before)));
          const limit = maxTurnRate(fish.species.speed.cruise / fish.length, fear);
          fastest = Math.max(fastest, turn / STEP / limit);
        }
        yaws.set(fish.id, yaw);
      }
    }
    return fastest;
  }

  it("never lets a calm fish turn faster than its body can", () => {
    const simulation = simulate();

    expect(fastestTurnShare(simulation, 30, 0)).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("lets a frightened fish turn faster, up to an escape", () => {
    const calm = simulate();
    const startled = simulate();
    run(calm, 2);
    run(startled, 2);
    for (const fish of startled.fish) {
      startled.tap(new Vector3(fish.position.x, fish.position.y, 0));
    }

    expect(fastestTurnShare(startled, 3, 1)).toBeLessThanOrEqual(1 + 1e-6);
    expect(fastestTurnShare(startled, 3, 0)).toBeGreaterThan(fastestTurnShare(calm, 3, 0));
  });
});

describe("obstacles", () => {
  /** Boulders filling the middle of the tank, at the height the fish swim. */
  const boulders: Obstacle[] = [-3, -1.5, 0, 1.5, 3].flatMap((x) =>
    [-3.5, -2, -0.5].map((z) => ({
      center: new Vector3(x, 2.4, z),
      radii: new Vector3(0.5, 0.5, 0.5),
      cos: 1,
      sin: 0,
      reach: 0.5,
    })),
  );
  const field = createObstacleField(boulders);
  const surface = new Vector3();

  /** The share of fish-steps spent within `bodyLengths` of a boulder, and the deepest any fish went in. */
  function observe(simulation: Simulation, seconds: number, bodyLengths: number) {
    let close = 0;
    let steps = 0;
    let deepest = Infinity;
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        const distance = field.distance(fish.position, surface, fish.length * 2);
        deepest = Math.min(deepest, distance);
        if (distance < fish.length * bodyLengths) close += 1;
        steps += 1;
      }
    }
    return { closeShare: close / steps, deepest };
  }

  it("never lets a fish swim into a rock", () => {
    const simulation = simulate();
    // The same list on every step, as the view gives it.
    simulation.setObstacles(() => boulders);

    expect(observe(simulation, 20, 0).deepest).toBeGreaterThan(0);
  });

  it("never lets a fish swim into rock given as a distance field", () => {
    const simulation = simulate();
    // Rock built from blocks reaches the simulation as a field, not a list.
    simulation.setRockField(() => field);

    expect(observe(simulation, 20, 0).deepest).toBeGreaterThan(0);
  });

  it("never sends a fish to a place buried in a rock", () => {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) =>
        entry.id === "blue-tang"
          ? {
              ...entry,
              activities: { wander: { seconds: [1, 2] }, peck: { weight: 3, tags: { algae: 1 } } },
            }
          : entry,
      ),
    });
    const simulation = createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 4 }] }, tuned),
      catalog: tuned,
      rng: createRng(2),
    });
    const buried = { x: 0, z: -2, height: 0.1, tags: ["algae"] };
    const open = { x: 2, z: -2, height: 0.1, tags: ["algae"] };
    const places = [buried, open];
    const boulder: Obstacle[] = [
      {
        center: new Vector3(0, 0.2, -2),
        radii: new Vector3(0.6, 0.6, 0.6),
        cos: 1,
        sin: 0,
        reach: 0.6,
      },
    ];
    simulation.setPlaces(() => places);
    simulation.setObstacles(() => boulder);
    const targets = new Set<number>();

    for (let elapsed = 0; elapsed < 60; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.activity.id === "peck") targets.add(fish.activity.target.x);
      }
    }

    expect([...targets]).toEqual([open.x]);
  });

  it.each(["cruise", "burst-coast", "glide", "patrol"])(
    "gets a fish swimming %s out of a pocket in the rocks it swam into",
    (style) => {
      const input = catalogFixture();
      const tuned = parseCatalog({
        species: input.species.map((entry) =>
          entry.id === "blue-tang" ? { ...entry, swim: { style } } : entry,
        ),
      });
      const simulation = createSimulation({
        scene: parseScene(
          { ...sceneFixture(), fauna: [{ species: "blue-tang", count: 1 }] },
          tuned,
        ),
        catalog: tuned,
        rng: createRng(3),
      });
      const [fish] = simulation.fish;
      if (fish === undefined) throw new Error("The scene has no fish.");
      const pocket = new Vector3(0, 2.4, -2);
      const rock = (x: number, y: number, z: number): Obstacle => ({
        center: new Vector3(x, y, z),
        radii: new Vector3(0.6, 0.6, 0.6),
        cos: 1,
        sin: 0,
        reach: 0.6,
      });
      // Overlapping rocks close it on every side but -x: east, back, front, above, below.
      const walls = [
        rock(0.75, 2.4, -2),
        rock(0, 2.4, -2.75),
        rock(0, 2.4, -1.25),
        rock(0, 3.15, -2),
        rock(0, 1.65, -2),
      ];
      simulation.setObstacles(() => walls);
      run(simulation, 1);
      fish.position.copy(pocket);
      // Swimming into the closed end.
      fish.velocity.set(fish.species.speed.cruise, 0, 0);

      let farthest = 0;
      for (let elapsed = 0; elapsed < 12; elapsed += STEP) {
        simulation.step(STEP);
        farthest = Math.max(farthest, fish.position.distanceTo(pocket));
      }

      expect(farthest).toBeGreaterThan(1);
    },
  );

  it("steers fish around rocks instead of scraping along them", () => {
    const steering = simulate();
    steering.setObstacles(() => boulders);
    const blind = simulate();

    expect(observe(steering, 20, 0.5).closeShare).toBeLessThan(
      observe(blind, 20, 0.5).closeShare / 3,
    );
  });
});

describe("the crowd", () => {
  /**
   * The closest two fish of different species came, in body lengths of the
   * larger one, while food kept falling in the middle for both to crowd to.
   */
  function closestStrangers(simulation: Simulation, seconds: number): number {
    let closest = Infinity;
    for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
      if (elapsed % 2 < STEP) simulation.dropFood(0, -1.5);
      simulation.step(STEP);
      for (const one of simulation.fish) {
        for (const other of simulation.fish) {
          if (one.species === other.species) continue;
          const larger = Math.max(one.length, other.length);
          closest = Math.min(closest, one.position.distanceTo(other.position) / larger);
        }
      }
    }
    return closest;
  }

  it("keeps fish of different species from swimming through each other", () => {
    const simulation = simulate({
      fauna: [
        { species: "blue-tang", count: 12 },
        { species: "sardine", count: 40 },
      ],
    });

    expect(closestStrangers(simulation, 20)).toBeGreaterThan(0.25);
  });
});

describe("walkers", () => {
  /** Blue tangs made into walkers with `swim`, bold enough to hide when told so. */
  function simulateWalkers(swim: unknown, behavior: unknown = {}): Simulation {
    const input = catalogFixture();
    const tuned = parseCatalog({
      species: input.species.map((entry) =>
        entry.id === "blue-tang" ? { ...entry, swim, behavior } : entry,
      ),
    });
    return createSimulation({
      scene: parseScene({ ...sceneFixture(), fauna: [{ species: "blue-tang", count: 6 }] }, tuned),
      catalog: tuned,
      rng: createRng(4),
    });
  }

  /** The angle between two headings, folded into 0..π. */
  const gap = (first: number, second: number): number =>
    Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

  it("carries a walker's body at its ride height above the ground", () => {
    const simulation = simulateWalkers({ style: "crawl", rideHeight: 0.3 });

    run(simulation, 15);

    const heights = simulation.fish.map((fish) => fish.position.y / fish.length);
    expect(Math.min(...heights)).toBeCloseTo(0.3);
    expect(Math.max(...heights)).toBeCloseTo(0.3);
  });

  it("turns a sideways walker's body across the way it walks", () => {
    const simulation = simulateWalkers({ style: "crawl", sideways: true });
    const gaps: number[] = [];

    run(simulation, 10);
    for (let elapsed = 0; elapsed < 20; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.velocity.length() < fish.species.speed.cruise * 0.3) continue;
        gaps.push(gap(fish.facing, Math.atan2(fish.velocity.z, fish.velocity.x)));
      }
    }

    const mean = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    expect(gaps.length).toBeGreaterThan(0);
    expect(Math.abs(mean - Math.PI / 2)).toBeLessThan(0.3);
  });

  it("keeps a forward walker's body along the way it walks", () => {
    const simulation = simulateWalkers({ style: "crawl" });
    const gaps: number[] = [];

    run(simulation, 10);
    for (let elapsed = 0; elapsed < 20; elapsed += STEP) {
      simulation.step(STEP);
      for (const fish of simulation.fish) {
        if (fish.velocity.length() < fish.species.speed.cruise * 0.3) continue;
        gaps.push(gap(fish.facing, Math.atan2(fish.velocity.z, fish.velocity.x)));
      }
    }

    expect(Math.max(...gaps)).toBeLessThan(0.5);
  });

  it("stands still while a walker stops", () => {
    const simulation = simulateWalkers({ style: "crawl", stopSeconds: [2, 3] });
    const before = new Vector3();
    let stoppedSteps = 0;
    let largestStep = 0;

    run(simulation, 10);
    for (let elapsed = 0; elapsed < 20; elapsed += STEP) {
      const fish = simulation.fish[0];
      if (fish === undefined) break;
      before.copy(fish.position);
      simulation.step(STEP);
      if (fish.swim.speed !== 0 || !fish.walking) continue;
      stoppedSteps += 1;
      largestStep = Math.max(largestStep, fish.position.distanceTo(before));
    }

    expect(stoppedSteps).toBeGreaterThan(0);
    expect(largestStep).toBe(0);
  });

  it("keeps a walker that cannot swim on the floor, even running from a tap", () => {
    const simulation = simulateWalkers({ style: "crawl", swims: false }, { shyness: 1 });
    let highest = 0;

    run(simulation, 10);
    simulation.tap(new Vector3(0, 0.5, -2.5));
    watchAll(simulation, 5, (fish) => {
      highest = Math.max(highest, fish.position.y / fish.length);
    });

    expect(highest).toBeLessThan(0.5);
  });

  it("lets a walker that cannot swim run from a tap", () => {
    const simulation = simulateWalkers({ style: "crawl", swims: false }, { shyness: 1 });
    run(simulation, 10);
    const tap = new Vector3(0, 0.2, -2.5);
    const before = simulation.fish.map((fish) => fish.position.distanceTo(tap));

    simulation.tap(tap);
    run(simulation, 1.5);

    const after = simulation.fish.map((fish) => fish.position.distanceTo(tap));
    const fartherAway = after.filter((distance, index) => distance > (before[index] ?? 0));
    expect(fartherAway.length).toBeGreaterThan(after.length / 2);
  });

  it("pulls a walker with a shell into it when tapped: it stops where it is", () => {
    const simulation = simulateWalkers(
      { style: "crawl", swims: false, fright: "shell" },
      { shyness: 1 },
    );
    run(simulation, 10);

    simulation.tap(new Vector3(0, 0.2, -2.5));
    run(simulation, 0.2);
    const withdrawn = simulation.fish.filter((fish) => fish.hiding > 0);
    const starts = withdrawn.map((fish) => fish.position.clone());
    run(simulation, 3);

    const moved = withdrawn.map((fish, index) =>
      fish.position.distanceTo(starts[index] ?? fish.position),
    );
    expect(withdrawn.length).toBeGreaterThan(0);
    expect(Math.max(...moved)).toBe(0);
  });

  it("lets a walker with a shell come out again once calm", () => {
    const simulation = simulateWalkers(
      { style: "crawl", swims: false, fright: "shell" },
      { shyness: 1 },
    );
    run(simulation, 10);

    simulation.tap(new Vector3(0, 0.2, -2.5));
    run(simulation, 20);

    expect(simulation.fish.every((fish) => fish.hiding === 0)).toBe(true);
  });

  it("walks a crab to the nearest shelter when tapped", () => {
    const simulation = simulateWalkers(
      { style: "crawl", swims: false, sideways: true },
      { shyness: 1, hiding: 1 },
    );
    const shelter = { x: 0, z: -2.5, height: 0.3, tags: ["shelter"] };
    simulation.setPlaces(() => [shelter]);
    run(simulation, 10);
    const distance = (fish: Fish): number =>
      Math.hypot(fish.position.x - shelter.x, fish.position.z - shelter.z);
    const before = simulation.fish.map(distance);

    simulation.tap(new Vector3(0, 0.2, -2.5));
    run(simulation, 4);

    const after = simulation.fish.map(distance);
    const closer = after.filter((value, index) => value < (before[index] ?? 0));
    expect(closer.length).toBeGreaterThan(after.length / 2);
    expect(Math.max(...simulation.fish.map((fish) => fish.position.y / fish.length))).toBeLessThan(
      0.5,
    );
  });
});

function watchAll(simulation: Simulation, seconds: number, sample: (fish: Fish) => void): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    simulation.step(STEP);
    simulation.fish.forEach(sample);
  }
}
