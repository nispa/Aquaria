import {
  Color,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Vector4,
} from "three";
import type { Logger } from "../core/logger";
import type { Plant } from "../sim/layout";
import { floorHeight, type FloorHeight } from "../sim/terrain";
import {
  disposeLoadedObjectModel,
  modelMaterial,
  prepareObjectModel,
  type ObjectModelLoader,
  type ObjectModelVariant,
} from "./objectModel";
import { causticsPatch } from "./shaders/causticsPatch";
import { MAX_PARTING, plantPatch, type StrandUniforms } from "./shaders/plantPatch";
import type { WaterUniforms } from "./uniforms";
import { variantOf } from "./variants";

export interface FloraRenderer {
  readonly object: Group;
  /**
   * The fish the tentacles of anemones part around, (x, y, z, radius) in m:
   * write the first ones (see anemoneParting), then say how many.
   */
  readonly parting: readonly Vector4[];
  setPartingCount(count: number): void;
  /** Resolves when every model-only plant has loaded or failed. */
  settled(): Promise<void>;
  dispose(): void;
}

/** Instanced 3D model plants, grouped by kind and color. */
export function createFloraRenderer(
  plants: readonly Plant[],
  water: WaterUniforms,
  loadModel?: ObjectModelLoader,
  logger?: Logger,
  /** The scene's floor, which every plant stands on. */
  floor: FloorHeight = floorHeight,
): FloraRenderer {
  const object = new Group();
  object.name = "flora";
  const strands: StrandUniforms = {
    uParting: { value: Array.from({ length: MAX_PARTING }, () => new Vector4()) },
    uPartingCount: { value: 0 },
  };
  const disposables: { dispose(): void }[] = [];
  const loading: Promise<void>[] = [];
  let disposed = false;

  const groups = new Map<string, Plant[]>();
  for (const plant of plants) {
    const key = `${plant.kind}|${plant.color}|${plant.tipColor ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), plant]);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();

  const buildModelGroup = (
    members: readonly Plant[],
    variants: readonly ObjectModelVariant[],
  ): void => {
    const first = members[0];
    if (first === undefined || variants.length === 0) return;
    const byVariant = new Map<number, Plant[]>();
    for (const plant of members) {
      const variantIndex = variantOf(plant, variants.length);
      byVariant.set(variantIndex, [...(byVariant.get(variantIndex) ?? []), plant]);
    }
    for (const [variantIndex, variantMembers] of byVariant) {
      const variant = variants[variantIndex];
      if (variant === undefined) continue;
      for (const part of variant.parts) {
        const geometry = part.geometry.clone();
        const count = variantMembers.length;
        const swayPhase = new Float32Array(count);
        const heights = new Float32Array(count);
        geometry.setAttribute("aSwayPhase", new InstancedBufferAttribute(swayPhase, 1));
        geometry.setAttribute("aHeight", new InstancedBufferAttribute(heights, 1));
        const material = modelMaterial(part.material, [
          plantPatch(
            water,
            { value: first.sway },
            first.tipColor === undefined ? undefined : new Color(first.tipColor),
            first.swaySpeed,
            geometry.hasAttribute("aStrand") ? strands : undefined,
          ),
          causticsPatch(water),
        ]);
        const mesh = new InstancedMesh(geometry, material, count);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        variantMembers.forEach((plant, instance) => {
          position.set(plant.x, floor(plant.x, plant.z) + (plant.elevation ?? 0) - 0.02, plant.z);
          rotation.setFromEuler(euler.set(0, plant.rotation, 0));
          scale.setScalar(plant.height);
          matrix.compose(position, rotation, scale);
          mesh.setMatrixAt(instance, matrix);
          swayPhase[instance] = plant.swayPhase;
          heights[instance] = plant.height;
        });
        object.add(mesh);
        disposables.push(geometry, ...(Array.isArray(material) ? material : [material]), mesh);
      }
    }
  };

  for (const members of groups.values()) {
    const first = members[0];
    if (first === undefined || loadModel === undefined) continue;
    const url = first.model;
    const done = loadModel(url)
      .then((root) => {
        const variants = prepareObjectModel(root, "plant", first.swayAttribute);
        const loadedTextures = disposeLoadedObjectModel(root);
        if (disposed) {
          for (const variant of variants) {
            for (const part of variant.parts) part.geometry.dispose();
          }
          for (const texture of loadedTextures) texture.dispose();
          return;
        }
        disposables.push(...loadedTextures);
        buildModelGroup(members, variants);
        for (const variant of variants) {
          for (const part of variant.parts) part.geometry.dispose();
        }
      })
      .catch((error: unknown) => {
        logger?.warn("Plant model could not be loaded", {
          object: first.kind,
          url,
          error: String(error),
        });
      });
    loading.push(done);
  }

  return {
    object,
    parting: strands.uParting.value,
    setPartingCount(count) {
      strands.uPartingCount.value = Math.min(count, MAX_PARTING);
    },
    settled: () => Promise.all(loading).then(() => undefined),
    dispose() {
      disposed = true;
      disposables.forEach((item) => {
        item.dispose();
      });
    },
  };
}
