import type { Rng } from "../core/rng";
import type { Lights } from "../scene/lights";
import type { Plant } from "./layout";
import type { FloorHeight } from "./terrain";

/**
 * Pearling: on a bright afternoon the leaves of a planted tank are full of
 * oxygen and let it go as tiny bubbles. It starts only after hours of
 * light, once the water is saturated, and stops when the lights go out.
 */

const HOURS_PER_DAY = 24;
/** Hours of light before the first pearls: the water must fill with oxygen first. */
const PEARLING_DELAY = 3;
/** Hours from the first pearls to the most. */
const PEARLING_BUILD = 2;
/** Pearls form on the leaves above this share of a plant's height. */
const LOWEST_LEAF = 1 / 3;
/** How far across a plant its leaves reach, as a share of its height. */
const LEAF_SPREAD = 0.2;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How much the plants pearl at an hour, 0..1: none at night and in the
 * first hours of light, building up to the full afternoon, gone as the
 * lights fade out.
 */
export function pearlingStrength(lights: Lights, hour: number): number {
  const { sunrise, sunset, ramp } = lights.cycle;
  const since = (hour - sunrise + HOURS_PER_DAY) % HOURS_PER_DAY;
  const length = (sunset - sunrise + HOURS_PER_DAY) % HOURS_PER_DAY;
  if (since > length) return 0;
  const building = smoothstep(PEARLING_DELAY, PEARLING_DELAY + PEARLING_BUILD, since);
  const fading = 1 - smoothstep(length - ramp, length, since);
  return building * fading;
}

/** A point on a leaf where pearls form, m. */
export interface PearlSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * `count` points on the leaves of the plants, standing on the scene's
 * floor; taller plants, with more leaves, get more of them.
 */
export function pearlSpots(
  plants: readonly Plant[],
  floor: FloorHeight,
  count: number,
  rng: Rng,
): PearlSpot[] {
  const total = plants.reduce((sum, plant) => sum + plant.height, 0);
  if (total <= 0) return [];
  return Array.from({ length: count }, () => {
    let reach = rng.next() * total;
    const plant = plants.find((each) => (reach -= each.height) < 0) ?? plants[plants.length - 1];
    if (plant === undefined) return { x: 0, y: 0, z: 0 };
    const spread = plant.height * LEAF_SPREAD;
    const base = floor(plant.x, plant.z) + (plant.elevation ?? 0);
    return {
      x: plant.x + rng.range(-spread, spread),
      y: base + plant.height * rng.range(LOWEST_LEAF, 1),
      z: plant.z + rng.range(-spread, spread),
    };
  });
}
