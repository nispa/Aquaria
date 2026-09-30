import type { Rng } from "../core/rng";
import type { FloraSpec, PropSpec, SurfaceMaterialSpec } from "../scene/schema";
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
  /** Photographic surface, when the scene entry sets one. */
  readonly material?: SurfaceMaterialSpec;
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

/** Half the width the camera sees at a depth z, m. */
export type HalfWidthAt = (z: number) => number;

/** Without a camera, scenery stays inside the tank walls. */
function tankHalfWidth(tank: TankSize): HalfWidthAt {
  return () => tank.width / 2;
}

/**
 * Seen in perspective, the view widens with depth: scenery spreads across the
 * visible width at its own depth, so the sides of the back are not left empty.
 * Items keep their depth and relative position (-1..1) when the view changes.
 */
function spreadX(across: number, z: number, halfWidthAt: HalfWidthAt): number {
  return across * Math.max(halfWidthAt(z) - EDGE_CLEARANCE, 0);
}

export function layoutFlora(
  tank: TankSize,
  specs: readonly FloraSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
): Plant[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const { near, far } = bandDepthRange(tank, spec.bands);
    return Array.from({ length: spec.count }, () => {
      const across = entryRng.range(-1, 1);
      const z = entryRng.range(far, Math.min(near, -EDGE_CLEARANCE));
      return {
        kind: spec.kind,
        color: spec.color,
        x: spreadX(across, z, halfWidthAt),
        z,
        height: entryRng.range(spec.height[0], spec.height[1]),
        rotation: entryRng.range(0, Math.PI * 2),
        swayPhase: entryRng.range(0, Math.PI * 2),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
      };
    });
  });
}

export function layoutProps(
  tank: TankSize,
  specs: readonly PropSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
): Prop[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const placement = PROP_PLACEMENT[spec.kind];
    const { near, far } = bandDepthRange(tank, spec.bands ?? placement.bands);
    return Array.from({ length: spec.count }, () => {
      const across = entryRng.range(-1, 1);
      const z = entryRng.range(far, Math.min(near, -EDGE_CLEARANCE));
      return {
        kind: spec.kind,
        color: spec.color,
        x: spreadX(across, z, halfWidthAt),
        z,
        size: entryRng.range(placement.size[0], placement.size[1]),
        rotation: entryRng.range(0, Math.PI * 2),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
        ...(spec.material === undefined ? {} : { material: spec.material }),
      };
    });
  });
}
