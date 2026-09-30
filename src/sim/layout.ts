import type { Rng } from "../core/rng";
import type { FloraSpec, PropSpec } from "../scene/schema";
import { bandDepthRange, type TankSize } from "./tank";

/**
 * Static placement of plants and props. Pure and seeded, so a scene always
 * looks the same and the layout can be tested without a renderer.
 */

export interface Plant {
  readonly kind: FloraSpec["kind"];
  readonly color: string;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  /** Rotation around the vertical axis, radians. */
  readonly rotation: number;
  /** Offset so neighbouring plants do not sway in lockstep, radians. */
  readonly swayPhase: number;
  /** Seeds the renderer's per-plant details (blade jitter), independent of other plants. */
  readonly seed: number;
}

export interface Prop {
  readonly kind: PropSpec["kind"];
  readonly color: string;
  readonly x: number;
  readonly z: number;
  /** Rough diameter in meters. */
  readonly size: number;
  readonly rotation: number;
  /** Seeds the renderer's per-prop details (shape variant), independent of other props. */
  readonly seed: number;
}

/** Keeps objects a little away from the glass and the side walls. */
const EDGE_CLEARANCE = 0.2;
const SEED_RANGE = 2 ** 32;

interface PropPlacement {
  /** Rough diameter range, m. */
  readonly size: readonly [number, number];
  /** Default depth bands; a scene entry may override them. */
  readonly bands: readonly [number, number];
}

/** Small things sit near the glass where they can be seen; large ones frame the back. */
const PROP_PLACEMENT: Readonly<Record<PropSpec["kind"], PropPlacement>> = {
  rock: { size: [0.25, 0.75], bands: [1, 4] },
  starfish: { size: [0.14, 0.22], bands: [0, 1] },
  shell: { size: [0.08, 0.14], bands: [0, 1] },
  "brain-coral": { size: [0.25, 0.5], bands: [1, 3] },
  "branch-coral": { size: [0.3, 0.6], bands: [1, 4] },
  "fan-coral": { size: [0.5, 1], bands: [2, 4] },
};

/**
 * One independent generator per entry, forked before anything is drawn, so
 * changing the count of one entry never moves the items of another. Within an
 * entry items are drawn in order, so growing a count keeps existing items.
 */
function entryGenerators(rng: Rng, count: number): Rng[] {
  return Array.from({ length: count }, () => rng.fork());
}

export function layoutFlora(tank: TankSize, specs: readonly FloraSpec[], rng: Rng): Plant[] {
  const halfWidth = tank.width / 2 - EDGE_CLEARANCE;
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const { near, far } = bandDepthRange(tank, spec.bands);
    return Array.from({ length: spec.count }, () => ({
      kind: spec.kind,
      color: spec.color,
      x: entryRng.range(-halfWidth, halfWidth),
      z: entryRng.range(far, Math.min(near, -EDGE_CLEARANCE)),
      height: entryRng.range(spec.height[0], spec.height[1]),
      rotation: entryRng.range(0, Math.PI * 2),
      swayPhase: entryRng.range(0, Math.PI * 2),
      seed: Math.floor(entryRng.next() * SEED_RANGE),
    }));
  });
}

export function layoutProps(tank: TankSize, specs: readonly PropSpec[], rng: Rng): Prop[] {
  const halfWidth = tank.width / 2 - EDGE_CLEARANCE;
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const placement = PROP_PLACEMENT[spec.kind];
    const { near, far } = bandDepthRange(tank, spec.bands ?? placement.bands);
    return Array.from({ length: spec.count }, () => ({
      kind: spec.kind,
      color: spec.color,
      x: entryRng.range(-halfWidth, halfWidth),
      z: entryRng.range(far, Math.min(near, -EDGE_CLEARANCE)),
      size: entryRng.range(placement.size[0], placement.size[1]),
      rotation: entryRng.range(0, Math.PI * 2),
      seed: Math.floor(entryRng.next() * SEED_RANGE),
    }));
  });
}
