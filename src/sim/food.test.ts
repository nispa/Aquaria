import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { createCurrentField } from "./current";
import { BOTTOM_LIFETIME_SECONDS, createFood, FLAKES_PER_PINCH, type Food } from "./food";

const STEP = 1 / 60;
const tank = { width: 8, height: 4.5, depth: 5 };
const stillWater = createCurrentField({ direction: [1, 0, 0], strength: 0, turbulence: 0 });
const flatFloor = (): number => 0;

function feed(capacity?: number): Food {
  return createFood({ tank, rng: createRng(7), ...(capacity === undefined ? {} : { capacity }) });
}

function run(food: Food, seconds: number, current = stillWater, seabed = flatFloor): void {
  let time = 0;
  for (; time < seconds; time += STEP) food.step(STEP, time, current, seabed);
}

const active = (food: Food) => food.pellets.filter((pellet) => pellet.active);

describe("createFood", () => {
  it("starts empty", () => {
    expect(active(feed())).toEqual([]);
  });

  it("drops a pinch of flakes at the surface around the chosen spot", () => {
    const food = feed();

    food.drop(1, -2);

    const flakes = active(food);
    expect(flakes).toHaveLength(FLAKES_PER_PINCH);
    expect(flakes.every((flake) => flake.position.y > tank.height * 0.95)).toBe(true);
    expect(flakes.every((flake) => Math.abs(flake.position.x - 1) < 0.5)).toBe(true);
    expect(flakes.every((flake) => Math.abs(flake.position.z + 2) < 0.5)).toBe(true);
  });

  it("keeps flakes dropped near a wall inside the tank", () => {
    const food = feed();

    food.drop(tank.width, 1);

    expect(active(food).every((flake) => Math.abs(flake.position.x) <= tank.width / 2)).toBe(true);
    expect(active(food).every((flake) => flake.position.z <= 0)).toBe(true);
  });

  it("lets flakes sink slowly", () => {
    const food = feed();
    food.drop(0, -2);

    run(food, 5);

    const heights = active(food).map((flake) => flake.position.y);
    expect(Math.max(...heights)).toBeLessThan(tank.height * 0.95);
    expect(Math.min(...heights)).toBeGreaterThan(tank.height / 2);
  });

  it("carries flakes along with the current", () => {
    const food = feed();
    const current = createCurrentField({ direction: [1, 0, 0], strength: 0.1, turbulence: 0 });
    food.drop(0, -2);

    run(food, 5, current);

    const meanX = active(food).reduce((sum, flake) => sum + flake.position.x, 0) / FLAKES_PER_PINCH;
    expect(meanX).toBeGreaterThan(0.3);
  });

  it("lets flakes settle on the seabed instead of sinking through it", () => {
    const food = feed();
    const mound = (): number => 1;
    food.drop(0, -2);

    run(food, 120, stillWater, mound);

    expect(active(food).every((flake) => flake.position.y >= 1)).toBe(true);
    expect(active(food).every((flake) => flake.settled)).toBe(true);
  });

  it("clears flakes that lie on the bottom for too long", () => {
    const food = feed();
    food.drop(0, -2);

    run(food, 120 + BOTTOM_LIFETIME_SECONDS * 2);

    expect(active(food)).toEqual([]);
  });

  it("never holds more flakes than its capacity", () => {
    const food = feed(FLAKES_PER_PINCH + 10);

    food.drop(0, -2);
    food.drop(1, -2);
    food.drop(2, -2);

    expect(active(food)).toHaveLength(FLAKES_PER_PINCH + 10);
  });

  it("removes a flake once it is eaten", () => {
    const food = feed();
    food.drop(0, -2);
    const [first] = active(food);
    if (first === undefined) throw new Error("No flake dropped.");

    food.eat(first);

    expect(active(food)).toHaveLength(FLAKES_PER_PINCH - 1);
  });
});

describe("nearest", () => {
  const everywhere = new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));

  it("finds the closest flake within reach", () => {
    const food = feed();
    food.drop(-3, -2);
    food.drop(3, -2);

    const found = food.nearest(new Vector3(2.5, 4, -2), 2, everywhere);

    expect(found?.position.x).toBeGreaterThan(2);
  });

  it("finds nothing out of reach", () => {
    const food = feed();
    food.drop(-3, -2);

    expect(food.nearest(new Vector3(3, 4, -2), 1, everywhere)).toBeUndefined();
  });

  it("ignores flakes outside the region the fish forages in", () => {
    const food = feed();
    food.drop(0, -2);
    const deep = new Box3(new Vector3(-10, 0, -10), new Vector3(10, 1, 10));

    expect(food.nearest(new Vector3(0, 1, -2), 5, deep)).toBeUndefined();
  });

  it("ignores eaten flakes", () => {
    const food = feed();
    food.drop(0, -2);
    for (const flake of active(food)) food.eat(flake);

    expect(food.nearest(new Vector3(0, 4, -2), 5, everywhere)).toBeUndefined();
  });
});
