import { TANK_SIZE_MEASURES, type TankMeasures } from "../scene/tankMeasures";

/** Maximum height of the sand dunes above or below y = 0 in a large tank, in meters. */
export const FLOOR_AMPLITUDE = 0.12;
/** The tank height the dunes are drawn for; lower tanks get them scaled down. */
const DUNES_HEIGHT = TANK_SIZE_MEASURES.large.height;

// Three incommensurate ripples; weights sum to 1 so the amplitude bound holds.
const RIPPLES = [
  { weight: 0.55, x: 0.45, z: 0.3, phase: 0.4 },
  { weight: 0.3, x: -0.9, z: 0.75, phase: 1.7 },
  { weight: 0.15, x: 2.1, z: -1.6, phase: 2.9 },
] as const;

/** Height of a scene's floor at (x, z), m. */
export type FloorHeight = (x: number, z: number) => number;

/** How a scene shapes its floor (the scene's `floor` entry). */
export interface FloorProfile {
  /** How high the floor climbs from the glass to the back, as a share of the tank height. */
  readonly rise?: number;
  /** The dunes: 1 for the usual ones of a tank this size, 0 for a flat floor. */
  readonly dunes?: number;
}

/**
 * Height of the sandy floor of a large tank at (x, z). Shared by the floor
 * mesh and by props, so rocks and the starfish sit on the sand instead of
 * floating above it.
 */
export function floorHeight(x: number, z: number): number {
  let height = 0;
  for (const ripple of RIPPLES) {
    height += ripple.weight * Math.sin(x * ripple.x + z * ripple.z + ripple.phase);
  }
  return height * FLOOR_AMPLITUDE;
}

const smoothstep = (value: number): number => {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * The floor of a tank: the dunes shrunk with a tank lower than a large one
 * (in height and in length, so they keep their shape), on a slope rising
 * from the front glass to the back and level beyond it.
 */
export function floorOf(tank: TankMeasures, profile: FloorProfile): FloorHeight {
  const scale = Math.min(tank.height / DUNES_HEIGHT, 1);
  const dunes = (profile.dunes ?? 1) * scale;
  const rise = (profile.rise ?? 0) * tank.height;
  return (x, z) =>
    (dunes === 0 ? 0 : dunes * floorHeight(x / scale, z / scale)) +
    rise * smoothstep(-z / tank.depth);
}
