import {
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import type { Logger } from "../core/logger";
import { MAX_INDIVIDUALS_PER_SPECIES, type SpeciesCatalog } from "../scene/schema";
import type { Fish } from "../sim/simulation";
import { BODY_PROPORTIONS, createFishGeometry } from "./fishGeometry";
import { causticsPatch } from "./shaders/causticsPatch";
import { fishPatch, PATTERN_IDS } from "./shaders/fishPatch";
import { patchMaterial } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";

/** Strength of the skin's rainbow sheen, 0..1. */
const IRIDESCENCE = 0.35;

interface SpeciesMesh {
  readonly mesh: InstancedMesh;
  readonly swimPhase: InstancedBufferAttribute;
  readonly opacity: InstancedBufferAttribute;
  count: number;
}

export interface FishRenderer {
  readonly object: Group;
  /** Copies simulation state into the instance buffers. Allocation-free. */
  update(fish: readonly Fish[]): void;
  dispose(): void;
}

/** One instanced mesh per species: a whole school is a single draw call. */
export function createFishRenderer(
  catalog: SpeciesCatalog,
  water: WaterUniforms,
  logger: Logger,
): FishRenderer {
  const object = new Group();
  object.name = "fish";
  const meshes = new Map<string, SpeciesMesh>();
  const geometries: BufferGeometry[] = [];

  for (const species of catalog.species) {
    if (species.body.type !== "procedural") {
      logger.warn("glTF fish bodies are not supported yet; species skipped", {
        species: species.id,
      });
      continue;
    }
    const { shape, pattern, colors } = species.body;
    const geometry = createFishGeometry(shape);
    geometries.push(geometry);
    const swimPhase = new InstancedBufferAttribute(
      new Float32Array(MAX_INDIVIDUALS_PER_SPECIES),
      1,
    );
    const opacity = new InstancedBufferAttribute(new Float32Array(MAX_INDIVIDUALS_PER_SPECIES), 1);
    geometry.setAttribute("aSwimPhase", swimPhase);
    geometry.setAttribute("aOpacity", opacity);

    const material = patchMaterial(
      // Physical material for iridescence: the rainbow sheen of guanine in fish skin.
      new MeshPhysicalMaterial({
        roughness: 0.34,
        metalness: 0.08,
        side: DoubleSide,
        transparent: true,
        iridescence: IRIDESCENCE,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [260, 520],
      }),
      [
        fishPatch({
          uBaseColor: { value: new Color(colors.base) },
          uAccentColor: { value: new Color(colors.accent) },
          uDetailColor: { value: new Color(colors.detail) },
          uPattern: { value: PATTERN_IDS[pattern] },
          uHalfHeight: { value: BODY_PROPORTIONS[shape].height / 2 },
          uSwimAmplitude: { value: BODY_PROPORTIONS[shape].swimAmplitude },
        }),
        causticsPatch(water),
      ],
    );
    const mesh = new InstancedMesh(geometry, material, MAX_INDIVIDUALS_PER_SPECIES);
    mesh.name = species.id;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instances roam the whole tank; the per-mesh bounding sphere would be wrong.
    mesh.frustumCulled = false;
    object.add(mesh);
    meshes.set(species.id, { mesh, swimPhase, opacity, count: 0 });
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler(0, 0, 0, "YZX");
  const scale = new Vector3();

  return {
    object,
    update(fish) {
      for (const entry of meshes.values()) entry.count = 0;
      for (const individual of fish) {
        const entry = meshes.get(individual.species.id);
        if (entry === undefined || entry.count >= MAX_INDIVIDUALS_PER_SPECIES) continue;
        const { velocity } = individual;
        const horizontal = Math.hypot(velocity.x, velocity.z);
        euler.set(0, Math.atan2(-velocity.z, velocity.x), Math.atan2(velocity.y, horizontal));
        rotation.setFromEuler(euler);
        scale.setScalar(individual.length);
        matrix.compose(individual.position, rotation, scale);
        entry.mesh.setMatrixAt(entry.count, matrix);
        entry.swimPhase.setX(entry.count, individual.swimPhase);
        entry.opacity.setX(entry.count, individual.opacity);
        entry.count += 1;
      }
      for (const entry of meshes.values()) {
        entry.mesh.count = entry.count;
        entry.mesh.instanceMatrix.needsUpdate = true;
        entry.swimPhase.needsUpdate = true;
        entry.opacity.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh } of meshes.values()) {
        (mesh.material as MeshPhysicalMaterial).dispose();
        mesh.dispose();
      }
      geometries.forEach((geometry) => {
        geometry.dispose();
      });
    },
  };
}
