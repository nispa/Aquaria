import { Vector3 } from "three";

export interface CurrentSpec {
  readonly direction: readonly [number, number, number];
  /** Base drift speed in m/s. */
  readonly strength: number;
  /** 0 = laminar, 1 = very turbulent. */
  readonly turbulence: number;
}

/** A water velocity field that fish, plants and particles all share. */
export interface CurrentField {
  /** Water velocity at `position` and `timeSeconds`, written into `out`. */
  sample(position: Vector3, timeSeconds: number, out: Vector3): Vector3;
  readonly spec: CurrentSpec;
}

// Incommensurate frequencies so the swirl never visibly repeats.
const SPATIAL_FREQUENCY = [0.9, 1.3, 1.1] as const;
const TEMPORAL_FREQUENCY = [0.6, 0.7, 0.5] as const;
// Normalises the three sine components so their combined length is at most 1.
const SWIRL_NORMALISER = 1 / Math.sqrt(3);

export function createCurrentField(spec: CurrentSpec): CurrentField {
  const base = new Vector3(...spec.direction).normalize().multiplyScalar(spec.strength);
  const swirlAmplitude = spec.strength * spec.turbulence * SWIRL_NORMALISER;

  return {
    spec,
    sample(position, timeSeconds, out) {
      out.copy(base);
      if (swirlAmplitude === 0) {
        return out;
      }
      out.x +=
        swirlAmplitude *
        Math.sin(position.y * SPATIAL_FREQUENCY[1] + timeSeconds * TEMPORAL_FREQUENCY[0]);
      out.y +=
        swirlAmplitude *
        Math.sin(position.z * SPATIAL_FREQUENCY[2] + timeSeconds * TEMPORAL_FREQUENCY[1]);
      out.z +=
        swirlAmplitude *
        Math.sin(position.x * SPATIAL_FREQUENCY[0] + timeSeconds * TEMPORAL_FREQUENCY[2]);
      return out;
    },
  };
}
