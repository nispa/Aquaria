import { Color, Vector3, type IUniform } from "three";
import type { Scene } from "../scene/schema";

/**
 * Uniforms shared by every material in the aquarium. They are the single
 * source of truth for time, light and current, updated once per frame.
 */
// A type alias (not an interface) so it is assignable to Record<string, IUniform>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type WaterUniforms = {
  readonly uTime: IUniform<number>;
  /** Caustic brightness multiplier (0..3). */
  readonly uCausticsIntensity: IUniform<number>;
  /** Caustic pattern frequency, 1/m (0.2..4). */
  readonly uCausticsScale: IUniform<number>;
  /** Height of the water surface, m. */
  readonly uSurfaceY: IUniform<number>;
  /** Sunlight color, linear RGB. */
  readonly uLightColor: IUniform<Color>;
  /** Base water current velocity, m/s. */
  readonly uCurrent: IUniform<Vector3>;
  /** Water color, linear RGB. */
  readonly uWaterColor: IUniform<Color>;
};

export function createWaterUniforms(scene: Scene): WaterUniforms {
  const [x, y, z] = scene.current.direction;
  return {
    uTime: { value: 0 },
    uCausticsIntensity: { value: scene.light.caustics.intensity },
    uCausticsScale: { value: scene.light.caustics.scale },
    uSurfaceY: { value: scene.tank.height },
    uLightColor: { value: new Color(scene.light.color) },
    uCurrent: { value: new Vector3(x, y, z).normalize().multiplyScalar(scene.current.strength) },
    uWaterColor: { value: new Color(scene.water.color) },
  };
}
