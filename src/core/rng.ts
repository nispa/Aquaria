/**
 * Deterministic pseudo-random number generator.
 *
 * All randomness in the simulation goes through this interface so that a
 * given seed always produces the same aquarium. This is what makes tests and
 * visual snapshots reproducible.
 */
export interface Rng {
  /** Uniform value in [0, 1). */
  next(): number;
  /** Uniform value in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Normally distributed value (Box–Muller). */
  normal(mean: number, standardDeviation: number): number;
  /** Uniformly chosen element; throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Independent child generator, seeded from this one. */
  fork(): Rng;
}

const UINT32_RANGE = 4294967296;
const MULBERRY_INCREMENT = 0x6d2b79f5;

/** Creates a mulberry32 generator: fast, small state, good enough for visuals. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  return {
    next,
    range,
    int: (min, max) => Math.floor(range(min, max + 1)),
    normal: (mean, standardDeviation) => {
      // 1 - next() avoids log(0).
      const radius = Math.sqrt(-2 * Math.log(1 - next()));
      const angle = 2 * Math.PI * next();
      return mean + standardDeviation * radius * Math.cos(angle);
    },
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error("Cannot pick from an empty list.");
      }
      return item;
    },
    fork: () => createRng(Math.floor(next() * UINT32_RANGE)),
  };
}
