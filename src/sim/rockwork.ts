import type { Rng } from "../core/rng";
import type { RockworkSpec } from "../scene/schema";
import type { HalfWidthAt, Prop } from "./layout";
import { bandDepthRange, type TankSize } from "./tank";

/**
 * A reef ridge ("aquascape"): a continuous mound of live rock that winds
 * across the tank, with a crest of uneven peaks and loose rocks piled on it.
 * Pure and seeded: the renderer builds its mesh from `heightAt`, and corals
 * placed on it read the same surface, so they sit exactly on the rock.
 */

export interface Footprint {
  readonly xMin: number;
  readonly xMax: number;
  /** Furthest from the glass. */
  readonly zMin: number;
  /** Closest to the glass. */
  readonly zMax: number;
}

export interface Rockwork {
  readonly footprint: Footprint;
  /** Height of the rock surface above the sand at (x, z), m; 0 off the ridge. */
  heightAt(x: number, z: number): number;
  /** Points along the crest line, over the full-height part of the ridge. */
  crest(count: number): readonly (readonly [number, number])[];
  /** A regular grid of about `count` points over the footprint. */
  samples(count: number): readonly (readonly [number, number])[];
  /** A random point on the rock, away from its thin edges. */
  randomPoint(rng: Rng): readonly [number, number];
  /** Loose rocks set into the ridge surface. */
  readonly rocks: readonly Prop[];
}

const PEAKS: readonly [number, number] = [3, 6];
/** Peak width along the ridge, as a share of its length. */
const PEAK_WIDTH: readonly [number, number] = [0.06, 0.16];
/** The ridge falls off to the sand over this share of its length at each end. */
const END_TAPER = 0.12;
/** Cross-section: 1 = parabolic mound, lower = steeper, blockier sides. */
const SECTION_EXPONENT = 0.6;
/** Surface lumpiness, as a share of the local crest height. */
const LUMPINESS = 0.12;
/** Meander of the crest line, as a share of the free depth in the bands. */
const MEANDER = 0.8;
const MEANDER_FREQUENCY: readonly [number, number] = [0.5, 1.1];
const ROCK_SIZE: readonly [number, number] = [0.22, 0.55];
/** How deep a loose rock sinks into the ridge, as a share of its size. */
const ROCK_SINK = 0.35;
/** Points lower than this share of the minimum crest height count as edges. */
const EDGE_HEIGHT = 0.25;
const RANDOM_POINT_TRIES = 40;
const SEED_RANGE = 2 ** 32;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function createRockwork(
  tank: TankSize,
  spec: RockworkSpec,
  rng: Rng,
  halfWidthAt: HalfWidthAt,
): Rockwork {
  const { near, far } = bandDepthRange(tank, spec.bands);
  const zMiddle = (near + far) / 2;
  const halfThickness = Math.min(spec.thickness / 2, (near - far) / 2);
  const meander = Math.max((near - far) / 2 - halfThickness, 0) * MEANDER;
  const frequency = rng.range(MEANDER_FREQUENCY[0], MEANDER_FREQUENCY[1]);
  const phase = rng.range(0, Math.PI * 2);
  const xMax = halfWidthAt(zMiddle) * spec.coverage;
  const xMin = -xMax;
  const length = xMax - xMin;
  const [minHeight, maxHeight] = spec.height;

  const peaks = Array.from({ length: rng.int(PEAKS[0], PEAKS[1]) }, () => ({
    x: rng.range(xMin, xMax),
    height: rng.range(minHeight, maxHeight),
    width: rng.range(PEAK_WIDTH[0], PEAK_WIDTH[1]) * length,
  }));
  const lumps = { a: rng.range(0, 10), b: rng.range(0, 10) };

  const crestZ = (x: number): number => zMiddle + meander * Math.sin(x * frequency + phase);
  const endTaper = (x: number): number =>
    smoothstep(xMin, xMin + END_TAPER * length, x) * smoothstep(xMax, xMax - END_TAPER * length, x);
  const crestHeight = (x: number): number => {
    let height = minHeight;
    for (const peak of peaks) {
      const distance = (x - peak.x) / peak.width;
      height = Math.max(height, peak.height * Math.exp(-distance * distance));
    }
    return height * endTaper(x);
  };

  const heightAt = (x: number, z: number): number => {
    if (x <= xMin || x >= xMax) return 0;
    const across = (z - crestZ(x)) / halfThickness;
    if (Math.abs(across) >= 1) return 0;
    const crest = crestHeight(x);
    const section = Math.pow(1 - across * across, SECTION_EXPONENT);
    // Lumps only bulge outwards, so the crest never drops below its minimum.
    const wave = Math.sin(x * 9 + lumps.a) * Math.sin(z * 11 + lumps.b);
    const lump = 1 + LUMPINESS * (wave * 0.5 + 0.5);
    return Math.min(crest * section * lump, maxHeight);
  };

  const fullHeight = { from: xMin + END_TAPER * length, to: xMax - END_TAPER * length };
  const crest = (count: number): (readonly [number, number])[] =>
    Array.from({ length: count }, (_, index) => {
      const x = fullHeight.from + ((fullHeight.to - fullHeight.from) * index) / (count - 1);
      return [x, crestZ(x)] as const;
    });

  const footprint: Footprint = {
    xMin,
    xMax,
    zMin: zMiddle - meander - halfThickness,
    zMax: zMiddle + meander + halfThickness,
  };

  const samples = (count: number): (readonly [number, number])[] => {
    const side = Math.max(Math.round(Math.sqrt(count)), 2);
    return Array.from({ length: side * side }, (_, index) => {
      const u = (index % side) / (side - 1);
      const v = Math.floor(index / side) / (side - 1);
      return [
        footprint.xMin + u * (footprint.xMax - footprint.xMin),
        footprint.zMin + v * (footprint.zMax - footprint.zMin),
      ] as const;
    });
  };

  const randomPoint = (pointRng: Rng): readonly [number, number] => {
    let x = 0;
    for (let attempt = 0; attempt < RANDOM_POINT_TRIES; attempt += 1) {
      x = pointRng.range(xMin, xMax);
      const z = crestZ(x) + pointRng.range(-1, 1) * halfThickness;
      if (heightAt(x, z) > minHeight * EDGE_HEIGHT) return [x, z];
    }
    // Rare: fall back to the crest, which is always on the rock.
    return [x, crestZ(x)];
  };

  const rocks = Array.from({ length: spec.rocks }, (): Prop => {
    const [x, z] = randomPoint(rng);
    const size = rng.range(ROCK_SIZE[0], ROCK_SIZE[1]);
    return {
      kind: "rock",
      color: spec.color,
      x,
      z,
      size,
      rotation: rng.range(0, Math.PI * 2),
      seed: Math.floor(rng.next() * SEED_RANGE),
      elevation: Math.max(heightAt(x, z) - size * ROCK_SINK, 0),
      ...(spec.material === undefined ? {} : { material: spec.material }),
    };
  });

  return { footprint, heightAt, crest, samples, randomPoint, rocks };
}
