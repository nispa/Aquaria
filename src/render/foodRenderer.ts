import {
  Color,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { Pellet } from "../sim/food";
import { causticsPatch } from "./shaders/causticsPatch";
import { patchMaterial } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";

/** Flake size, m: a little larger than real flakes so they read on a wall-sized display. */
const FLAKE_SIZE = 0.02;
/** Flakes are thin: height relative to width. */
const FLAKE_THICKNESS = 0.2;
/** Flake food comes in a few colors, sRGB. */
const FLAKE_COLORS = ["#d9772b", "#c2452d", "#9fae3c", "#e3b54a"] as const;
/** The second tumbling axis turns at this share of the first, so flakes wobble. */
const WOBBLE_RATIO = 0.7;

export interface FoodRenderer {
  readonly object: InstancedMesh;
  /** Copies the flakes in the water into the instance buffer. Allocation-free. */
  update(pellets: readonly Pellet[]): void;
  dispose(): void;
}

/** Fish food flakes: one instanced draw call for every flake in the tank. */
export function createFoodRenderer(capacity: number, water: WaterUniforms): FoodRenderer {
  const geometry = new OctahedronGeometry(FLAKE_SIZE / 2, 0);
  geometry.scale(1, FLAKE_THICKNESS, 1);
  const material = patchMaterial(
    new MeshStandardMaterial({ roughness: 0.8, side: DoubleSide, flatShading: true }),
    [causticsPatch(water)],
  );
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = "food";
  mesh.count = 0;
  // Flakes fall anywhere in the tank; the per-mesh bounding sphere would be wrong.
  mesh.frustumCulled = false;
  const colors = FLAKE_COLORS.map((hex) => new Color(hex));

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();

  return {
    object: mesh,
    update(pellets) {
      let count = 0;
      for (let index = 0; index < pellets.length && count < capacity; index += 1) {
        const pellet = pellets[index];
        if (!pellet?.active) continue;
        euler.set(pellet.spin, pellet.spin * WOBBLE_RATIO, 0);
        rotation.setFromEuler(euler);
        // Dissolving flakes shrink away.
        scale.setScalar(pellet.opacity);
        matrix.compose(pellet.position, rotation, scale);
        mesh.setMatrixAt(count, matrix);
        const color = colors[index % colors.length];
        if (color !== undefined) mesh.setColorAt(count, color);
        count += 1;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
