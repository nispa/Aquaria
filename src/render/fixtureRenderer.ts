import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import type { Lights } from "../scene/lights";
import { spotPositions } from "../sim/fixture";
import type { TankSize } from "../sim/tank";
import type { LightState } from "../sim/lightCycle";
import type { WaterUniforms } from "./uniforms";

/** Radius of one LED spot, m. */
const SPOT_SIZE = 0.035;
/** Emitters are much brighter than the scene so they bloom. */
const EMITTER_GAIN = 4;
/** Width of a light cone at the bottom of the tank, m. */
const CONE_WIDTH = 0.7;
/** Strength of the additive light cones. */
const CONE_STRENGTH = 0.07;

export interface FixtureRenderer {
  readonly object: Group;
  /** Additive light cones, which depth passes must skip. */
  readonly cones: Group;
  /** Shows the fixture's spots (or hides them under an open sky). */
  setFixture(fixture: Lights["fixture"]): void;
  /** Follows the LED light of this frame. Allocation-free. */
  update(state: LightState): void;
  dispose(): void;
}

/**
 * An aquarium light fixture: LED spots in a row above the water, seen
 * through the surface, each shining a soft cone of light down into the tank.
 * The pools of light on the bottom are drawn by the caustics patch.
 */
export function createFixtureRenderer(tank: TankSize, water: WaterUniforms): FixtureRenderer {
  const object = new Group();
  object.name = "fixture";
  const cones = new Group();
  const emitterGeometry = new CircleGeometry(SPOT_SIZE, 20);
  emitterGeometry.rotateX(Math.PI / 2);
  const emitterMaterial = new MeshBasicMaterial({ color: new Color(1, 1, 1), side: DoubleSide });
  const coneGeometry = new PlaneGeometry(1, 1);
  coneGeometry.translate(0, -0.5, 0);
  const coneMaterial = new ShaderMaterial({
    uniforms: { uLightColor: water.uLightColor, uStrength: { value: CONE_STRENGTH } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        // A cone: narrow under the spot (top, v = 1), widening downwards,
        // fading with depth.
        float down = 1.0 - vUv.y;
        float halfWidth = mix(0.06, 0.5, down);
        float across = abs(vUv.x - 0.5) / halfWidth;
        float beam = (1.0 - smoothstep(0.3, 1.0, across)) * mix(1.0, 0.15, down);
        gl_FragColor = vec4(uLightColor * beam * uStrength, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  object.add(cones);

  const setFixture = (fixture: Lights["fixture"]): void => {
    object.clear();
    cones.clear();
    object.add(cones);
    const spots = fixture.type === "spots" ? spotPositions(tank, fixture.spots) : [];
    spots.forEach((spot, index) => {
      const emitter = new Mesh(emitterGeometry, emitterMaterial);
      emitter.position.set(spot.x, spot.y, spot.z);
      object.add(emitter);
      const cone = new Mesh(coneGeometry, coneMaterial);
      cone.position.set(spot.x, tank.height, spot.z);
      cone.scale.set(CONE_WIDTH, tank.height, 1);
      cone.renderOrder = 2;
      cones.add(cone);
      water.uSpots.value[index]?.set(spot.x, spot.y, spot.z);
    });
    water.uSpotCount.value = spots.length;
    water.uSpotMix.value = spots.length > 0 ? 1 : 0;
  };

  return {
    object,
    cones,
    setFixture,
    update(state) {
      emitterMaterial.color
        .setRGB(state.color[0], state.color[1], state.color[2])
        .multiplyScalar(EMITTER_GAIN * Math.min(state.brightness, 1));
    },
    dispose() {
      emitterGeometry.dispose();
      emitterMaterial.dispose();
      coneGeometry.dispose();
      coneMaterial.dispose();
    },
  };
}
