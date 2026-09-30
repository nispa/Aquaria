import type { Rng } from "../core/rng";
import type { FloraSpec, PropSpec, SurfaceMaterialSpec } from "../scene/schema";
import type { Rockwork } from "./rockwork";
import { bandDepthRange, type TankSize } from "./tank";

/**
 * Static placement of plants and props. Pure and seeded, so a scene always
 * looks the same and the layout can be tested without a renderer.
 */

export interface Plant {
  readonly kind: FloraSpec["kind"];
  /** One color; a palette entry has already been resolved to one of its colors. */
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
  /** Height of the base above the sand, m, when growing on rockwork. */
  readonly elevation?: number;
  /** Color the leaves turn towards the top, when the entry sets one. */
  readonly tipColor?: string;
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
  /** Height of the base above the sand, m, when set on rockwork. */
  readonly elevation?: number;
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
  "table-coral": { size: [0.35, 0.7], bands: [1, 3] },
  "mushroom-coral": { size: [0.08, 0.16], bands: [0, 2] },
  "leather-coral": { size: [0.2, 0.4], bands: [1, 3] },
  driftwood: { size: [0.5, 1.1], bands: [1, 3] },
  "dragon-stone": { size: [0.15, 0.35], bands: [1, 3] },
  moss: { size: [0.08, 0.2], bands: [0, 3] },
  pebble: { size: [0.02, 0.06], bands: [0, 2] },
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

/** Where one item goes: x, z and its height above the sand when on rockwork. */
interface Spot {
  readonly x: number;
  readonly z: number;
  readonly elevation?: number;
}

/** Draws a spot on the sand within the depth range, or on the rockwork surface. */
function drawSpot(
  entryRng: Rng,
  depth: { readonly near: number; readonly far: number },
  halfWidthAt: HalfWidthAt,
  rockwork: Rockwork | undefined,
): Spot {
  if (rockwork !== undefined) {
    const [x, z] = rockwork.randomPoint(entryRng);
    return { x, z, elevation: rockwork.heightAt(x, z) };
  }
  const across = entryRng.range(-1, 1);
  const z = entryRng.range(depth.far, Math.min(depth.near, -EDGE_CLEARANCE));
  return { x: spreadX(across, z, halfWidthAt), z };
}

/** A single color is used as is; a palette gives each item one of its colors. */
function drawColor(color: string | readonly string[], entryRng: Rng): string {
  return typeof color === "string" ? color : entryRng.pick(color);
}

export function layoutFlora(
  tank: TankSize,
  specs: readonly FloraSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
  rockwork?: Rockwork,
): Plant[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const depth = bandDepthRange(tank, spec.bands);
    const surface = spec.on === "rockwork" ? rockwork : undefined;
    return Array.from({ length: spec.count }, (): Plant => {
      const spot = drawSpot(entryRng, depth, halfWidthAt, surface);
      return {
        kind: spec.kind,
        color: drawColor(spec.color, entryRng),
        ...spot,
        height: entryRng.range(spec.height[0], spec.height[1]),
        rotation: entryRng.range(0, Math.PI * 2),
        swayPhase: entryRng.range(0, Math.PI * 2),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
        ...(spec.tipColor === undefined ? {} : { tipColor: spec.tipColor }),
      };
    });
  });
}

export function layoutProps(
  tank: TankSize,
  specs: readonly PropSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
  rockwork?: Rockwork,
): Prop[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const placement = PROP_PLACEMENT[spec.kind];
    const depth = bandDepthRange(tank, spec.bands ?? placement.bands);
    const surface = spec.on === "rockwork" ? rockwork : undefined;
    return Array.from({ length: spec.count }, (): Prop => {
      const spot = drawSpot(entryRng, depth, halfWidthAt, surface);
      return {
        kind: spec.kind,
        color: drawColor(spec.color, entryRng),
        ...spot,
        size: entryRng.range(placement.size[0], placement.size[1]),
        rotation: entryRng.range(0, Math.PI * 2),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
        ...(spec.material === undefined ? {} : { material: spec.material }),
      };
    });
  });
}
