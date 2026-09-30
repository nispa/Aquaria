import { Color, Vector3, type IUniform } from "three";
import { MAX_SPOTS } from "../scene/lights";
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
  /** How lit the tank is by the LEDs, 0 (night) .. 1 (full day). Dims far water. */
  readonly uDaylight: IUniform<number>;
  /** Coral glow under actinic light, 0..1. */
  readonly uFluorescence: IUniform<number>;
  /** LED spot positions (world, m); only the first uSpotCount are used. */
  readonly uSpots: IUniform<Vector3[]>;
  readonly uSpotCount: IUniform<number>;
  /** 0 = open sky, 1 = light falls in pools under the spots. */
  readonly uSpotMix: IUniform<number>;
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
    uDaylight: { value: 1 },
    uFluorescence: { value: 0 },
    uSpots: { value: Array.from({ length: MAX_SPOTS }, () => new Vector3()) },
    uSpotCount: { value: 0 },
    uSpotMix: { value: 0 },
  };
}
