import { Vector3, type Box3 } from "three";
import { clamp } from "../core/math";
import type { Rng } from "../core/rng";
import type { CurrentField } from "./current";
import type { ObstacleField } from "./obstacles";
import type { SeabedHeight } from "./steering";
import type { TankSize } from "./tank";

/** Flakes in one pinch of food. */
export const FLAKES_PER_PINCH = 24;
/** How long a flake lies on the bottom before it is gone, in seconds. */
export const BOTTOM_LIFETIME_SECONDS = 30;
/** Default number of flakes the tank holds at once. */
const DEFAULT_CAPACITY = 240;
/** A pinch spreads over this radius, m. */
const PINCH_RADIUS = 0.25;
/** Flakes start just under the surface, m. */
const SURFACE_GAP = 0.02;
/** Sinking speed range, m/s: real flakes drift down a few centimeters a second. */
const SINK_SPEED = [0.05, 0.08] as const;
/** A flake comes to rest on a surface whose normal points at least this much up (about 60°). */
const RESTING_SLOPE = 0.5;
/** Side-to-side flutter while sinking: speed in m/s and frequency in rad/s. */
const FLUTTER_SPEED = 0.03;
const FLUTTER_FREQUENCY = 2.2;
/** Tumbling while sinking, rad/s. */
const TUMBLE_SPEED = 1.5;
/** Flakes fade out over the last part of their time on the bottom, s. */
const FADE_SECONDS = 5;
/** Flakes keep this far from the walls, m. */
const WALL_GAP = 0.02;

export interface Pellet {
  readonly position: Vector3;
  /** False for unused slots and eaten or dissolved flakes. */
  readonly active: boolean;
  /** True once the flake lies on the seabed. */
  readonly settled: boolean;
  /** 0..1; fades out before the flake is gone. */
  readonly opacity: number;
  /** Tumbling angle in radians, for renderers. */
  readonly spin: number;
}

interface FlakeState {
  readonly position: Vector3;
  active: boolean;
  settled: boolean;
  opacity: number;
  spin: number;
  sinkSpeed: number;
  flutterPhase: number;
  bottomSeconds: number;
}

export interface FoodOptions {
  readonly tank: TankSize;
  readonly rng: Rng;
  /** Most flakes alive at once; further drops are ignored. */
  readonly capacity?: number;
}

/** Fish food: flakes dropped at the surface that sink, drift and settle. */
export interface Food {
  /** A fixed pool of flakes; only `active` ones are in the water. */
  readonly pellets: readonly Pellet[];
  /** Drops a pinch of flakes at the surface around (x, z), tank coordinates. */
  drop(x: number, z: number): void;
  step(
    deltaSeconds: number,
    timeSeconds: number,
    current: CurrentField,
    seabed: SeabedHeight,
    obstacles?: ObstacleField,
  ): void;
  /** The closest active flake within `radius` of `position` and inside `region`. */
  nearest(position: Vector3, radius: number, region: Box3): Pellet | undefined;
  eat(pellet: Pellet): void;
}

export function createFood(options: FoodOptions): Food {
  const { tank, rng } = options;
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const flakes: FlakeState[] = Array.from({ length: capacity }, () => ({
    position: new Vector3(),
    active: false,
    settled: false,
    opacity: 0,
    spin: 0,
    sinkSpeed: 0,
    flutterPhase: 0,
    bottomSeconds: 0,
  }));
  const halfWidth = tank.width / 2 - WALL_GAP;
  const drift = new Vector3();
  const surface = new Vector3();

  const keepInside = (position: Vector3): void => {
    position.x = clamp(position.x, -halfWidth, halfWidth);
    position.z = clamp(position.z, -tank.depth + WALL_GAP, -WALL_GAP);
  };

  return {
    pellets: flakes,
    drop(x, z) {
      let dropped = 0;
      for (const flake of flakes) {
        if (dropped === FLAKES_PER_PINCH) break;
        if (flake.active) continue;
        const angle = rng.range(0, Math.PI * 2);
        const distance = PINCH_RADIUS * Math.sqrt(rng.next());
        flake.position.set(
          x + Math.cos(angle) * distance,
          tank.height - SURFACE_GAP,
          z + Math.sin(angle) * distance,
        );
        keepInside(flake.position);
        flake.active = true;
        flake.settled = false;
        flake.opacity = 1;
        flake.spin = rng.range(0, Math.PI * 2);
        flake.sinkSpeed = rng.range(SINK_SPEED[0], SINK_SPEED[1]);
        flake.flutterPhase = rng.range(0, Math.PI * 2);
        flake.bottomSeconds = 0;
        dropped += 1;
      }
    },
    step(deltaSeconds, timeSeconds, current, seabed, obstacles) {
      for (const flake of flakes) {
        if (!flake.active) continue;
        if (flake.settled) {
          flake.bottomSeconds += deltaSeconds;
          flake.opacity = clamp(
            (BOTTOM_LIFETIME_SECONDS - flake.bottomSeconds) / FADE_SECONDS,
            0,
            1,
          );
          if (flake.bottomSeconds >= BOTTOM_LIFETIME_SECONDS) flake.active = false;
          continue;
        }
        const { position } = flake;
        current.sample(position, timeSeconds, drift);
        const flutter = timeSeconds * FLUTTER_FREQUENCY + flake.flutterPhase;
        position.x += (drift.x + Math.cos(flutter) * FLUTTER_SPEED) * deltaSeconds;
        position.z += (drift.z + Math.sin(flutter) * FLUTTER_SPEED) * deltaSeconds;
        position.y -= flake.sinkSpeed * deltaSeconds;
        position.y = Math.min(position.y, tank.height - SURFACE_GAP);
        keepInside(position);
        flake.spin += TUMBLE_SPEED * deltaSeconds;
        const floor = seabed(position.x, position.z);
        if (position.y <= floor) {
          position.y = floor;
          flake.settled = true;
        }
        // A flake landing on a rock or a coral lies on top of it; on a steep
        // side it slides down instead.
        const inside = obstacles?.distance(position, surface, 0) ?? Infinity;
        if (inside < 0) {
          position.addScaledVector(surface, -inside);
          if (surface.y > RESTING_SLOPE) flake.settled = true;
        }
      }
    },
    nearest(position, radius, region) {
      let best: FlakeState | undefined;
      let bestDistance = radius * radius;
      for (const flake of flakes) {
        if (!flake.active || !region.containsPoint(flake.position)) continue;
        const distance = flake.position.distanceToSquared(position);
        if (distance <= bestDistance) {
          best = flake;
          bestDistance = distance;
        }
      }
      return best;
    },
    eat(pellet) {
      const flake = flakes.find((candidate) => candidate === pellet);
      if (flake !== undefined) flake.active = false;
    },
  };
}
