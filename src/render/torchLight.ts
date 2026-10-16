import { SpotLight, Vector3 } from "three";

/**
 * The viewer's torch: a spot light from the viewer's eye through the
 * pointer into the tank. It stays in the scene, dark when unused, so turning
 * it on and off never makes the renderer recompile its shaders.
 */

/** A warm white, like a hand torch. */
const TORCH_COLOR = 0xfff1d6;
/** Luminous intensity, candela; tuned by eye at night. */
const TORCH_INTENSITY = 40;
/** Half-angle of the beam, radians, and the soft share of its edge. */
const BEAM_ANGLE = 0.14;
const BEAM_PENUMBRA = 0.6;
/** How far the light reaches, m (0 would be unlimited), and how fast it fades. */
const REACH = 20;
const DECAY = 1.2;

export interface TorchLight {
  readonly light: SpotLight;
  /** Shines from `eye` through `point`; dark when `point` is undefined. Allocation-free. */
  aim(eye: Vector3, point: Vector3 | undefined): void;
}

export function createTorchLight(): TorchLight {
  const light = new SpotLight(TORCH_COLOR, 0, REACH, BEAM_ANGLE, BEAM_PENUMBRA, DECAY);
  const direction = new Vector3();
  return {
    light,
    aim(eye, point) {
      if (point === undefined) {
        light.intensity = 0;
        return;
      }
      light.intensity = TORCH_INTENSITY;
      light.position.copy(eye);
      direction.subVectors(point, eye).normalize();
      light.target.position.copy(eye).addScaledVector(direction, REACH);
      light.target.updateMatrixWorld();
    },
  };
}
