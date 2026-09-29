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
}

export interface Prop {
  readonly kind: PropSpec["kind"];
  readonly color: string;
  readonly x: number;
  readonly z: number;
  /** Rough diameter in meters. */
  readonly size: number;
  readonly rotation: number;
}

/** Keeps objects a little away from the glass and the side walls. */
const EDGE_CLEARANCE = 0.2;
const ROCK_SIZE: readonly [number, number] = [0.35, 1.1];
const STARFISH_SIZE: readonly [number, number] = [0.14, 0.22];
const ROCK_BANDS: readonly [number, number] = [1, 4];
const STARFISH_BANDS: readonly [number, number] = [0, 1];

export function layoutFlora(tank: TankSize, specs: readonly FloraSpec[], rng: Rng): Plant[] {
  const halfWidth = tank.width / 2 - EDGE_CLEARANCE;
  return specs.flatMap((spec) => {
    const { near, far } = bandDepthRange(tank, spec.bands);
    return Array.from({ length: spec.count }, () => ({
      kind: spec.kind,
      color: spec.color,
      x: rng.range(-halfWidth, halfWidth),
      z: rng.range(far, Math.min(near, -EDGE_CLEARANCE)),
      height: rng.range(spec.height[0], spec.height[1]),
      rotation: rng.range(0, Math.PI * 2),
      swayPhase: rng.range(0, Math.PI * 2),
    }));
  });
}

export function layoutProps(tank: TankSize, specs: readonly PropSpec[], rng: Rng): Prop[] {
  const halfWidth = tank.width / 2 - EDGE_CLEARANCE;
  return specs.flatMap((spec) => {
    const isStarfish = spec.kind === "starfish";
    const { near, far } = bandDepthRange(tank, isStarfish ? STARFISH_BANDS : ROCK_BANDS);
    const size = isStarfish ? STARFISH_SIZE : ROCK_SIZE;
    return Array.from({ length: spec.count }, () => ({
      kind: spec.kind,
      color: spec.color,
      x: rng.range(-halfWidth, halfWidth),
      z: rng.range(far, Math.min(near, -EDGE_CLEARANCE)),
      size: rng.range(size[0], size[1]),
      rotation: rng.range(0, Math.PI * 2),
    }));
  });
}
