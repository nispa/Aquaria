import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  Scene as ThreeScene,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import type { Scene } from "../scene/schema";

/** Brightness of the surface glow above, relative to the sunlight color. */
const SURFACE_GLOW = 1.6;
/** Blur of the prefiltered environment; water scatters light a lot. */
const ENVIRONMENT_BLUR = 0.04;

/**
 * Builds image-based lighting from the water around the tank: bright surface
 * above, water color at the horizon, sand below. It gives fish and bubbles
 * believable reflections without any image file.
 */
export function createWaterEnvironment(renderer: WebGLRenderer, scene: Scene): WebGLRenderTarget {
  const environmentScene = new ThreeScene();
  const geometry = new SphereGeometry(10, 32, 16);
  const material = new ShaderMaterial({
    side: BackSide,
    uniforms: {
      uSurface: { value: new Color(scene.light.color).multiplyScalar(SURFACE_GLOW) },
      uWater: { value: new Color(scene.water.color) },
      uFloor: { value: new Color(scene.floor.color).multiplyScalar(0.5) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSurface;
      uniform vec3 uWater;
      uniform vec3 uFloor;
      varying vec3 vDirection;
      void main() {
        float y = vDirection.y;
        vec3 color = y > 0.0
          ? mix(uWater, uSurface, pow(y, 3.0))
          : mix(uWater, uFloor, smoothstep(0.0, -0.4, y));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  environmentScene.add(new Mesh(geometry, material));
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(environmentScene, ENVIRONMENT_BLUR);
  generator.dispose();
  geometry.dispose();
  material.dispose();
  return target;
}
