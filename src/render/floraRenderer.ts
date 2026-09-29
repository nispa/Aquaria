import {
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import type { Rng } from "../core/rng";
import type { Plant } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
import { causticsPatch } from "./shaders/causticsPatch";
import { patchMaterial } from "./shaders/patch";
import { plantPatch } from "./shaders/plantPatch";
import type { WaterUniforms } from "./uniforms";

interface BladeStyle {
  /** Blades per plant. */
  readonly blades: number;
  /** Blade width in meters. */
  readonly width: number;
  /** Horizontal spread of the blades around the plant, m. */
  readonly spread: number;
  readonly segments: number;
  readonly sway: number;
}

const STYLES: Readonly<Record<Plant["kind"], BladeStyle>> = {
  kelp: { blades: 3, width: 0.22, spread: 0.18, segments: 16, sway: 0.18 },
  seagrass: { blades: 6, width: 0.035, spread: 0.12, segments: 6, sway: 0.08 },
};

/** A blade one unit tall, narrowing towards the tip, base at y = 0. */
function bladeGeometry(segments: number): BufferGeometry {
  const geometry = new PlaneGeometry(1, 1, 1, segments);
  geometry.translate(0, 0.5, 0);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    positions.setX(index, positions.getX(index) * (1 - y * 0.7));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export interface FloraRenderer {
  readonly object: Group;
  dispose(): void;
}

/** Instanced kelp and seagrass, one draw call per plant kind and color. */
export function createFloraRenderer(
  plants: readonly Plant[],
  water: WaterUniforms,
  rng: Rng,
): FloraRenderer {
  const object = new Group();
  object.name = "flora";
  const disposables: { dispose(): void }[] = [];
  const groups = new Map<string, Plant[]>();
  for (const plant of plants) {
    const key = `${plant.kind}|${plant.color}`;
    groups.set(key, [...(groups.get(key) ?? []), plant]);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();

  for (const members of groups.values()) {
    const first = members[0];
    if (first === undefined) continue;
    const style = STYLES[first.kind];
    const count = members.length * style.blades;
    const geometry = bladeGeometry(style.segments);
    const swayPhase = new Float32Array(count);
    const heights = new Float32Array(count);
    geometry.setAttribute("aSwayPhase", new InstancedBufferAttribute(swayPhase, 1));
    geometry.setAttribute("aHeight", new InstancedBufferAttribute(heights, 1));
    const material = patchMaterial(
      new MeshStandardMaterial({
        color: new Color(first.color),
        roughness: 0.7,
        side: DoubleSide,
      }),
      [plantPatch(water, { value: style.sway }), causticsPatch(water)],
    );
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;

    let instance = 0;
    for (const plant of members) {
      for (let blade = 0; blade < style.blades; blade += 1) {
        const x = plant.x + rng.range(-style.spread, style.spread);
        const z = plant.z + rng.range(-style.spread, style.spread);
        const height = plant.height * rng.range(0.7, 1);
        position.set(x, floorHeight(x, z) - 0.02, z);
        euler.set(rng.range(-0.08, 0.08), plant.rotation + blade * 1.3, rng.range(-0.08, 0.08));
        rotation.setFromEuler(euler);
        scale.set(style.width * rng.range(0.8, 1.2), height, 1);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(instance, matrix);
        swayPhase[instance] = plant.swayPhase + blade * 0.9;
        heights[instance] = height;
        instance += 1;
      }
    }
    object.add(mesh);
    disposables.push(geometry, material, mesh);
  }

  return {
    object,
    dispose() {
      disposables.forEach((item) => {
        item.dispose();
      });
    },
  };
}
