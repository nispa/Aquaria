import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { lightsSchema, type Lights } from "../scene/lights";
import type { Plant } from "./layout";
import { pearlingStrength, pearlSpots } from "./pearling";

const lights: Lights = lightsSchema.parse({ cycle: { sunrise: 8, sunset: 20, ramp: 1 } });

const plant = (x: number, z: number, height: number): Plant => ({
  kind: "rotala",
  sway: 0.05,
  color: "#ffffff",
  x,
  z,
  height,
  rotation: 0,
  swayPhase: 0,
  seed: 0,
  tags: [],
});

const flat = (): number => 0;

describe("pearlingStrength", () => {
  it("is none at night", () => {
    expect(pearlingStrength(lights, 2)).toBe(0);
  });

  it("is none in the first hours of light, while the plants build up oxygen", () => {
    expect(pearlingStrength(lights, 9.5)).toBe(0);
  });

  it("is full in the afternoon", () => {
    expect(pearlingStrength(lights, 15)).toBe(1);
  });

  it("stops when the lights go out", () => {
    expect(pearlingStrength(lights, 20.5)).toBe(0);
  });

  it("works for a day that runs past midnight", () => {
    const late = lightsSchema.parse({ cycle: { sunrise: 18, sunset: 4, ramp: 1 } });

    expect(pearlingStrength(late, 1)).toBe(1);
  });
});

describe("pearlSpots", () => {
  it("lays the spots on the leaves, between a third of the plant and its top", () => {
    const spots = pearlSpots([plant(0.5, -0.3, 0.4)], flat, 50, createRng(1));

    expect(spots.every((spot) => spot.y >= 0.4 / 3 && spot.y <= 0.4)).toBe(true);
  });

  it("stands the spots on the scene's floor", () => {
    const spots = pearlSpots([plant(0, -0.3, 0.4)], () => 0.2, 50, createRng(1));

    expect(spots.every((spot) => spot.y >= 0.2)).toBe(true);
  });

  it("gives as many spots as asked for", () => {
    const spots = pearlSpots([plant(0, -0.3, 0.4), plant(1, -0.5, 0.2)], flat, 30, createRng(1));

    expect(spots).toHaveLength(30);
  });

  it("gives none without plants", () => {
    expect(pearlSpots([], flat, 30, createRng(1))).toEqual([]);
  });

  it("is deterministic for a seed", () => {
    const plants = [plant(0, -0.3, 0.4)];

    expect(pearlSpots(plants, flat, 10, createRng(7))).toEqual(
      pearlSpots(plants, flat, 10, createRng(7)),
    );
  });
});
