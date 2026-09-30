import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { smoothstep } from "../core/math";
import type { Rng } from "../core/rng";
import { bubblePosition, type BubbleStream } from "../sim/bubbles";
import { patchMaterial } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";

/** Bubble radius range, m. */
const RADIUS: readonly [number, number] = [0.008, 0.024];
/** Bubbles swell as the pressure drops on the way up: extra radius per meter risen. */
const GROWTH_PER_METER = 0.08;
/** Bubbles are slightly flattened while rising. */
const VERTICAL_SQUASH = 0.85;
/** Fade distance at the bottom and top of the stream, m. */
const EDGE_FADE = 0.15;
const SPHERE_SEGMENTS = { width: 20, height: 14 } as const;

export interface RefractiveBubbles {
  readonly mesh: InstancedMesh;
  /** Places every bubble for the given time. Allocation-free. */
  update(timeSeconds: number): void;
  dispose(): void;
}

/**
 * Glass-like bubbles that refract and reflect the scene behind them, using
 * physically based transmission. Heavier than sprites, so only offered by
 * shader packs that ask for it.
 */
export function createRefractiveBubbles(
  streams: readonly BubbleStream[],
  bubblesPerStream: number,
  riseSpeed: number,
  water: WaterUniforms,
  rng: Rng,
): RefractiveBubbles {
  const count = streams.length * bubblesPerStream;
  const geometry = new SphereGeometry(1, SPHERE_SEGMENTS.width, SPHERE_SEGMENTS.height);
  const material = patchMaterial(
    new MeshPhysicalMaterial({
      color: new Color(1, 1, 1),
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: 0.02,
      // An air bubble in water really has a relative IOR below 1; Three.js
      // needs ≥ 1, and a mild value still gives the lens look with a bright rim.
      ior: 1.25,
      specularIntensity: 1,
      envMapIntensity: 1.4,
    }),
    [
      {
        // Seen from water, a bubble's edge reflects almost all light (total
        // internal reflection); a fresnel rim gives that silvery outline.
        name: "bubble-rim",
        uniforms: { uLightColor: water.uLightColor },
        fragmentHead: "uniform vec3 uLightColor;",
        fragment: [
          [
            "#include <fog_fragment>",
            /* glsl */ `
          {
            float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
            gl_FragColor.rgb += uLightColor * pow(1.0 - facing, 3.0) * 0.9;
          }
          #include <fog_fragment>
          `,
          ],
        ],
      },
    ],
  );
  const mesh = new InstancedMesh(geometry, material, Math.max(count, 1));
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.name = "refractive-bubbles";

  const seeds = Float32Array.from({ length: count }, () => rng.next());
  const radii = Float32Array.from({ length: count }, () => rng.range(RADIUS[0], RADIUS[1]));
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const matrix = new Matrix4();

  return {
    mesh,
    update(timeSeconds) {
      streams.forEach((stream, streamIndex) => {
        const travel = stream.surfaceY - stream.baseY;
        for (let bubble = 0; bubble < bubblesPerStream; bubble += 1) {
          const index = streamIndex * bubblesPerStream + bubble;
          const seed = seeds[index] ?? 0;
          const speed = riseSpeed * (0.8 + seed * 0.4);
          bubblePosition(stream, seed, timeSeconds, water.uCurrent.value, speed, position);
          const risen = position.y - stream.baseY;
          const fade =
            smoothstep(0, EDGE_FADE, risen) * smoothstep(travel, travel - EDGE_FADE, risen);
          const radius = (radii[index] ?? RADIUS[0]) * (1 + risen * GROWTH_PER_METER) * fade;
          scale.set(radius, radius * VERTICAL_SQUASH, radius);
          matrix.compose(position, rotation, scale);
          mesh.setMatrixAt(index, matrix);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
