import {
  Color,
  DoubleSide,
  Euler,
  Group,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import type { Logger } from "../core/logger";
import { createRng } from "../core/rng";
import type { PlantGenerator } from "../scene/schema";
import type { Plant } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
import {
  disposeLoadedObjectModel,
  modelMaterial,
  prepareObjectModel,
  swayAttribute,
  type ObjectModelLoader,
  type ObjectModelVariant,
} from "./objectModel";
import {
  algaeBushGeometry,
  anemoneTentacleGeometry,
  fernFrondGeometry,
  stemPlantGeometry,
} from "./sceneryGeometry";
import { causticsPatch } from "./shaders/causticsPatch";
import { fluorescencePatch } from "./shaders/fluorescencePatch";
import { patchMaterial } from "./shaders/patch";
import { plantPatch, type LeafStyle } from "./shaders/plantPatch";
import type { WaterUniforms } from "./uniforms";

export interface BladeStyle {
  /** Blades per plant. */
  readonly blades: number;
  /** Blade width in meters. */
  readonly width: number;
  /** Horizontal spread of the blades around the plant, m. */
  readonly spread: number;
  readonly segments: number;
  /** Lean away from the vertical, radians: blades stand, tentacles splay out. */
  readonly tilt: readonly [number, number];
  /** blade: flat leaf. tentacle: round tapering tube. bush: a whole plant per instance. */
  readonly shape: "blade" | "tentacle" | "bush" | "frond" | "stem";
  readonly leaf: LeafStyle;
  /** Glows under actinic light (anemones). */
  readonly fluorescent: boolean;
}

export const FLORA_STYLES: Readonly<Record<PlantGenerator, BladeStyle>> = {
  kelp: {
    blades: 3,
    width: 0.22,
    spread: 0.18,
    segments: 16,
    tilt: [0, 0.08],
    shape: "blade",
    // Kelp blades have a few broad ribs.
    leaf: { veins: 3, veinStrength: 0.25 },
    fluorescent: false,
  },
  seagrass: {
    blades: 6,
    width: 0.035,
    spread: 0.12,
    segments: 6,
    tilt: [0, 0.08],
    shape: "blade",
    leaf: { veins: 7, veinStrength: 0.3 },
    fluorescent: false,
  },
  anemone: {
    blades: 36,
    width: 0.022,
    spread: 0.04,
    segments: 6,
    tilt: [0.15, 1.1],
    shape: "tentacle",
    leaf: { veins: 0, veinStrength: 0 },
    fluorescent: true,
  },
  bush: {
    blades: 1,
    // Bushes are scaled with their height: width is relative to it.
    width: 0.7,
    spread: 0,
    segments: 0,
    tilt: [0, 0.1],
    shape: "bush",
    leaf: { veins: 0, veinStrength: 0 },
    fluorescent: false,
  },
  carpet: {
    // Dense tufts of tiny leaves splayed flat over the substrate.
    blades: 28,
    width: 0.02,
    spread: 0.13,
    segments: 2,
    tilt: [0.6, 1.3],
    shape: "blade",
    leaf: { veins: 1, veinStrength: 0.2 },
    fluorescent: false,
  },
  fern: {
    blades: 7,
    width: 1,
    spread: 0.03,
    segments: 0,
    tilt: [0.25, 0.8],
    shape: "frond",
    leaf: { veins: 0, veinStrength: 0 },
    fluorescent: false,
  },
  stem: {
    blades: 1,
    // Scaled with the plant height, like bushes.
    width: 0.5,
    spread: 0,
    segments: 0,
    tilt: [0, 0.08],
    shape: "stem",
    leaf: { veins: 0, veinStrength: 0 },
    fluorescent: false,
  },
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

/** Spreads blades and tentacles evenly around a plant, radians. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Seeds the bush shape, so it looks the same whatever the scene holds. */
const BUSH_SEED = 4231;

export function plantShapeGeometry(style: BladeStyle, seed = BUSH_SEED): BufferGeometry {
  switch (style.shape) {
    case "blade":
      return bladeGeometry(style.segments);
    case "tentacle":
      return anemoneTentacleGeometry();
    case "bush":
      return algaeBushGeometry(createRng(seed));
    case "frond":
      return fernFrondGeometry(createRng(seed));
    case "stem":
      return stemPlantGeometry(createRng(seed));
  }
}

/** Position across a blade (0..1) for the vein shader; tentacles have no veins. */
function acrossAttribute(geometry: BufferGeometry, shape: BladeStyle["shape"]): BufferAttribute {
  const uv = geometry.getAttribute("uv");
  const across = new Float32Array(uv.count);
  for (let index = 0; index < uv.count; index += 1) {
    across[index] = shape === "blade" ? uv.getX(index) : MIDRIB;
  }
  return new BufferAttribute(across, 1);
}

const MIDRIB = 0.5;
const MODEL_LEAF: LeafStyle = { veins: 0, veinStrength: 0 };

export interface FloraRenderer {
  readonly object: Group;
  /** Resolves when every model-only plant has loaded or failed. */
  settled(): Promise<void>;
  dispose(): void;
}

/** Instanced kelp, seagrass, anemones and 3D model plants, grouped by kind and color. */
export function createFloraRenderer(
  plants: readonly Plant[],
  water: WaterUniforms,
  loadModel?: ObjectModelLoader,
  logger?: Logger,
): FloraRenderer {
  const object = new Group();
  object.name = "flora";
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
      const variantIndex = createRng(plant.seed).int(0, variants.length - 1);
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
            MODEL_LEAF,
            first.tipColor === undefined ? undefined : new Color(first.tipColor),
            first.swaySpeed,
          ),
          causticsPatch(water),
        ]);
        const mesh = new InstancedMesh(geometry, material, count);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        variantMembers.forEach((plant, instance) => {
          position.set(
            plant.x,
            floorHeight(plant.x, plant.z) + (plant.elevation ?? 0) - 0.02,
            plant.z,
          );
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
    if (first === undefined) continue;
    if (first.generator === undefined) {
      if (first.model !== undefined && loadModel !== undefined) {
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
      continue;
    }
    const style = FLORA_STYLES[first.generator];
    const count = members.length * style.blades;
    const geometry = plantShapeGeometry(style);
    geometry.setAttribute("aAcross", acrossAttribute(geometry, style.shape));
    geometry.setAttribute("aSway", swayAttribute(geometry, first.swayAttribute));
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
      [
        plantPatch(
          water,
          { value: first.sway },
          style.leaf,
          first.tipColor === undefined ? undefined : new Color(first.tipColor),
          first.swaySpeed,
        ),
        causticsPatch(water),
        ...(style.fluorescent ? [fluorescencePatch(water)] : []),
      ],
    );
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    // Plants receive shadows but do not cast them: the shadow pass would not
    // include the sway, so blades and shadows would drift apart.
    mesh.receiveShadow = true;

    let instance = 0;
    for (const plant of members) {
      // Each plant has its own generator, so adding a plant never reshapes another.
      const rng = createRng(plant.seed);
      for (let blade = 0; blade < style.blades; blade += 1) {
        const x = plant.x + rng.range(-style.spread, style.spread);
        const z = plant.z + rng.range(-style.spread, style.spread);
        const height = plant.height * rng.range(0.7, 1);
        position.set(x, floorHeight(x, z) + (plant.elevation ?? 0) - 0.02, z);
        // Yaw first, then lean: blades lean a little, tentacles splay outwards.
        euler.set(
          rng.range(style.tilt[0], style.tilt[1]),
          plant.rotation + blade * GOLDEN_ANGLE,
          0,
          "YXZ",
        );
        rotation.setFromEuler(euler);
        const scaledByHeight = style.shape !== "blade" && style.shape !== "tentacle";
        const width = style.width * rng.range(0.8, 1.2) * (scaledByHeight ? height : 1);
        scale.set(width, height, style.shape === "blade" ? 1 : width);
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
    settled: () => Promise.all(loading).then(() => undefined),
    dispose() {
      disposed = true;
      disposables.forEach((item) => {
        item.dispose();
      });
    },
  };
}
