import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  NormalBlending,
  Points,
  ShaderMaterial,
} from "three";
import type { Rng } from "../core/rng";
import type { Scene } from "../scene/schema";
import { bubbleStreamsFromProps, type BubbleStream } from "../sim/bubbles";
import type { Prop } from "../sim/layout";
import { createRefractiveBubbles } from "./refractiveBubbles";
import type { WaterUniforms } from "./uniforms";

const SNOW_COUNT = 2400;
const BUBBLES_PER_STREAM = 40;
const MAX_BUBBLE_STREAMS = 3;
/** Bubble rise speed, m/s. */
const BUBBLE_SPEED = 0.45;
/** Extra room around the tank where particles wrap, m. */
const WRAP_MARGIN = 1;

export type BubbleStyle = "sprite" | "refractive";

export interface Particles {
  readonly object: Group;
  /** Switches between cheap sprite bubbles and refractive glass-like bubbles. */
  setBubbleStyle(style: BubbleStyle): void;
  /** Moves CPU-driven particles (refractive bubbles). */
  update(timeSeconds: number): void;
  /** Point sizes depend on the drawing-buffer height; call when it changes. */
  setBufferHeight(heightPixels: number, verticalFovDegrees: number): void;
  dispose(): void;
}

/**
 * Marine snow: tiny specks drifting with the current. They are the strongest
 * cue that the space is filled with water, and move entirely on the GPU.
 *
 * Uniforms: uTime, uCurrent (WaterUniforms), uBoxMin/uBoxSize (m), uPixelScale.
 */
function marineSnow(
  scene: Scene,
  water: WaterUniforms,
  rng: Rng,
): Points<BufferGeometry, ShaderMaterial> {
  const { width, height, depth } = scene.tank;
  const positions = new Float32Array(SNOW_COUNT * 3);
  const seeds = new Float32Array(SNOW_COUNT);
  for (let index = 0; index < SNOW_COUNT; index += 1) {
    positions[index * 3] = rng.next();
    positions[index * 3 + 1] = rng.next();
    positions[index * 3 + 2] = rng.next();
    seeds[index] = rng.next();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      ...water,
      uBoxMin: { value: [-width / 2 - WRAP_MARGIN, 0, -depth - WRAP_MARGIN] },
      uBoxSize: { value: [width + WRAP_MARGIN * 2, height, depth + WRAP_MARGIN * 2] },
      uPixelScale: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCurrent;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      uniform float uPixelScale;
      varying float vFade;
      void main() {
        vec3 drift = uCurrent * uTime + vec3(
          sin(uTime * 0.21 + aSeed * 40.0) * 0.15,
          -uTime * 0.012 + sin(uTime * 0.17 + aSeed * 23.0) * 0.1,
          cos(uTime * 0.19 + aSeed * 31.0) * 0.15
        );
        vec3 world = uBoxMin + mod(position * uBoxSize + drift, uBoxSize);
        vec4 view = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        float size = mix(0.004, 0.012, aSeed);
        gl_PointSize = size * uPixelScale / -view.z;
        vFade = exp(-(-view.z) * 0.12) * (0.35 + 0.65 * aSeed);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.1, d) * vFade * 0.4;
        gl_FragColor = vec4(uLightColor * 0.8, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** Sprite bubbles rising from the rocks, wobbling and bending with the current, on the GPU. */
function spriteBubbles(
  scene: Scene,
  streams: readonly BubbleStream[],
  water: WaterUniforms,
  rng: Rng,
): Points<BufferGeometry, ShaderMaterial> {
  const count = streams.length * BUBBLES_PER_STREAM;
  const origins = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  streams.forEach((source, stream) => {
    for (let bubble = 0; bubble < BUBBLES_PER_STREAM; bubble += 1) {
      const index = stream * BUBBLES_PER_STREAM + bubble;
      origins[index * 3] = source.x + rng.range(-0.05, 0.05);
      origins[index * 3 + 1] = source.baseY;
      origins[index * 3 + 2] = source.z + rng.range(-0.05, 0.05);
      seeds[index] = rng.next();
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(origins, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      ...water,
      uHeight: { value: scene.tank.height },
      uSpeed: { value: BUBBLE_SPEED },
      uPixelScale: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCurrent;
      uniform float uHeight;
      uniform float uSpeed;
      uniform float uPixelScale;
      varying float vFade;
      void main() {
        float travel = uHeight - position.y;
        float rise = mod(uTime * uSpeed * (0.8 + aSeed * 0.4) + aSeed * travel, travel);
        vec3 world = position + vec3(0.0, rise, 0.0);
        world.xz += uCurrent.xz * rise * 3.0;
        world.x += sin(rise * 6.0 + aSeed * 20.0) * 0.04;
        world.z += cos(rise * 5.0 + aSeed * 13.0) * 0.04;
        vec4 view = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        float size = mix(0.018, 0.05, aSeed) * (1.0 + rise * 0.08);
        gl_PointSize = size * uPixelScale / -view.z;
        vFade = smoothstep(0.0, 0.2, rise) * smoothstep(travel, travel - 0.3, rise);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float rim = smoothstep(0.6, 0.95, d) * smoothstep(1.0, 0.92, d);
        float highlight = smoothstep(0.25, 0.0, length(gl_PointCoord - vec2(0.35, 0.3)));
        float alpha = (rim * 0.7 + highlight * 0.9 + 0.08 * step(d, 1.0)) * vFade;
        gl_FragColor = vec4(uLightColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** Pixels per meter at one meter from the camera: gl_PointSize = size * scale / depth. */
function pixelScale(heightPixels: number, verticalFovDegrees: number): number {
  return heightPixels / (2 * Math.tan(((verticalFovDegrees / 2) * Math.PI) / 180));
}

export function createParticles(
  scene: Scene,
  props: readonly Prop[],
  water: WaterUniforms,
  rng: Rng,
): Particles {
  const object = new Group();
  object.name = "particles";
  const streams = bubbleStreamsFromProps(props, scene.tank.height, MAX_BUBBLE_STREAMS);
  const snow = marineSnow(scene, water, rng);
  const bubbleStreams = spriteBubbles(scene, streams, water, rng);
  const refractive = createRefractiveBubbles(
    streams,
    BUBBLES_PER_STREAM,
    BUBBLE_SPEED,
    water,
    rng.fork(),
  );
  refractive.mesh.visible = false;
  object.add(snow, bubbleStreams, refractive.mesh);
  const materials = [snow.material, bubbleStreams.material];

  return {
    object,
    setBubbleStyle(style) {
      bubbleStreams.visible = style === "sprite";
      refractive.mesh.visible = style === "refractive";
    },
    update(timeSeconds) {
      if (refractive.mesh.visible) refractive.update(timeSeconds);
    },
    setBufferHeight(heightPixels, verticalFovDegrees) {
      for (const material of materials) {
        const uniform = material.uniforms.uPixelScale;
        if (uniform !== undefined) uniform.value = pixelScale(heightPixels, verticalFovDegrees);
      }
    },
    dispose() {
      for (const points of [snow, bubbleStreams]) {
        points.geometry.dispose();
        points.material.dispose();
      }
      refractive.dispose();
    },
  };
}
