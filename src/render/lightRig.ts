import {
  Color,
  type AmbientLight,
  type DirectionalLight,
  type FogExp2,
  type HemisphereLight,
} from "three";
import type { Scene } from "../scene/schema";
import type { LightState } from "../sim/lightCycle";
import type { WaterUniforms } from "./uniforms";

/** Light intensities at full daylight, relative to the scene's light intensity. */
const SUN_INTENSITY = 1.6;
const HEMISPHERE_INTENSITY = 0.9;
const AMBIENT_INTENSITY = 0.6;
/** Image-based light is a fill, not the key light: kept below the sun. */
const ENVIRONMENT_INTENSITY = 0.65;
/**
 * Share of the fill light and water color left at night, so shapes stay
 * readable in moonlight instead of going pitch black.
 */
const NIGHT_FLOOR = 0.12;

export interface LightTargets {
  readonly scene: Scene;
  readonly sun: DirectionalLight;
  readonly hemisphere: HemisphereLight;
  readonly ambient: AmbientLight;
  readonly fog: FogExp2;
  readonly background: Color;
  readonly water: WaterUniforms;
  /** Sets how strongly the environment map (reflections) lights the scene. */
  readonly setEnvironmentIntensity: (intensity: number) => void;
}

export interface LightRig {
  /** Applies the LED light of this frame. Allocation-free. */
  apply(state: LightState): void;
  setCausticsEnabled(enabled: boolean): void;
  setFluorescenceEnabled(enabled: boolean): void;
}

/** Turns the LED mix into Three.js lights, water color and shader uniforms. */
export function createLightRig(targets: LightTargets): LightRig {
  const { scene, sun, hemisphere, ambient, fog, background, water } = targets;
  const sceneLight = new Color(scene.light.color);
  const waterColor = new Color(scene.water.color);
  const lit = new Color();
  const causticsBase = scene.light.caustics.intensity;
  let caustics = true;
  let fluorescence = true;

  return {
    apply(state) {
      const daylight = Math.min(state.brightness, 1);
      const fill = NIGHT_FLOOR + (1 - NIGHT_FLOOR) * daylight;
      // Scene tint (e.g. warm sunlight) times the LED color.
      lit.setRGB(state.color[0], state.color[1], state.color[2]).multiply(sceneLight);
      sun.color.copy(lit);
      sun.intensity = SUN_INTENSITY * scene.light.intensity * state.brightness;
      hemisphere.color.copy(lit);
      hemisphere.intensity = HEMISPHERE_INTENSITY * scene.light.intensity * fill;
      ambient.intensity = AMBIENT_INTENSITY * fill;
      targets.setEnvironmentIntensity(ENVIRONMENT_INTENSITY * fill);
      // Shaders use the light as radiance: caustics, the surface and bubbles dim with it.
      water.uLightColor.value.copy(lit).multiplyScalar(daylight);
      water.uCausticsIntensity.value = caustics ? causticsBase : 0;
      water.uDaylight.value = fill;
      water.uWaterColor.value.copy(waterColor).multiplyScalar(fill);
      fog.color.copy(water.uWaterColor.value);
      background.copy(water.uWaterColor.value);
      water.uFluorescence.value = fluorescence ? state.fluorescence : 0;
    },
    setCausticsEnabled(enabled) {
      caustics = enabled;
    },
    setFluorescenceEnabled(enabled) {
      fluorescence = enabled;
    },
  };
}
