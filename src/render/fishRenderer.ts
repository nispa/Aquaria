import {
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  Texture,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import type { Logger } from "../core/logger";
import { modelFileUrl, type ModelManifest } from "../scene/modelManifest";
import { MAX_INDIVIDUALS_PER_SPECIES, type Species, type SpeciesCatalog } from "../scene/schema";
import type { Fish } from "../sim/simulation";
import { BODY_PROPORTIONS, createFishGeometry } from "./fishGeometry";
import { prepareFishModel, type FishModelPart } from "./fishModel";
import { causticsPatch } from "./shaders/causticsPatch";
import { fishMotionPatch } from "./shaders/fishMotionPatch";
import { fishPatch, PATTERN_IDS } from "./shaders/fishPatch";
import { patchMaterial } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";

/** Strength of the skin's rainbow sheen, 0..1. */
const IRIDESCENCE = 0.35;
const MATRIX_SIZE = 16;

/** Loads a glTF file and returns its scene; injected so tests run without a browser. */
export type FishModelLoader = (url: string) => Promise<Object3D>;

/** The 3D models available to species with a glTF body, by model folder. */
export interface FishModels {
  readonly manifests: ReadonlyMap<string, ModelManifest>;
  readonly load: FishModelLoader;
}

interface MouthMorph {
  readonly mesh: InstancedMesh;
  readonly index: number;
  /** Scratch object whose influences are copied into the instance's morph weights. */
  readonly weights: Mesh;
}

type ModelState = "idle" | "loading" | "ready" | "failed";

/**
 * Per-instance state of one species, shared by every mesh of both its
 * bodies: the procedural one and the 3D model, which may have several
 * meshes. Only one body is visible at a time.
 */
interface SpeciesInstances {
  readonly species: Species;
  readonly matrices: InstancedBufferAttribute;
  readonly swimPhase: InstancedBufferAttribute;
  readonly opacity: InstancedBufferAttribute;
  readonly gaze: InstancedBufferAttribute;
  readonly bend: InstancedBufferAttribute;
  readonly effort: InstancedBufferAttribute;
  readonly mouth: InstancedBufferAttribute;
  readonly procedural: InstancedMesh[];
  /** Empty until the model has loaded. */
  readonly model: InstancedMesh[];
  modelState: ModelState;
  /** The viewer wants the 3D model; the procedural body shows until it is ready. */
  wantModel: boolean;
  /** Meshes that open the mouth with a morph target, and which one. */
  readonly mouthMorphs: MouthMorph[];
  count: number;
}

export interface FishRenderer {
  readonly object: Group;
  /** Copies simulation state into the instance buffers. Allocation-free. */
  update(fish: readonly Fish[]): void;
  /** Resolves when every model requested so far has loaded or failed. */
  settled(): Promise<void>;
  /**
   * Draws a species with its 3D model (loaded on first use) or with its
   * procedural body. Species without a model always use the procedural body.
   */
  setModelEnabled(speciesId: string, enabled: boolean): void;
  dispose(): void;
}

const perInstance = (itemSize = 1): InstancedBufferAttribute =>
  new InstancedBufferAttribute(new Float32Array(MAX_INDIVIDUALS_PER_SPECIES * itemSize), itemSize);

function createInstances(species: Species, wantModel: boolean): SpeciesInstances {
  return {
    species,
    matrices: perInstance(MATRIX_SIZE),
    swimPhase: perInstance(),
    opacity: perInstance(),
    gaze: perInstance(),
    bend: perInstance(),
    effort: perInstance(),
    mouth: perInstance(),
    procedural: [],
    model: [],
    modelState: "idle",
    wantModel,
    mouthMorphs: [],
    count: 0,
  };
}

function shareInstanceAttributes(geometry: BufferGeometry, instances: SpeciesInstances): void {
  geometry.setAttribute("aSwimPhase", instances.swimPhase);
  geometry.setAttribute("aOpacity", instances.opacity);
  geometry.setAttribute("aGaze", instances.gaze);
  geometry.setAttribute("aBend", instances.bend);
  geometry.setAttribute("aEffort", instances.effort);
  geometry.setAttribute("aMouth", instances.mouth);
}

function createInstancedMesh(
  name: string,
  geometry: BufferGeometry,
  material: Material | Material[],
  instances: SpeciesInstances,
): InstancedMesh {
  shareInstanceAttributes(geometry, instances);
  const mesh = new InstancedMesh(geometry, material, MAX_INDIVIDUALS_PER_SPECIES);
  mesh.name = name;
  mesh.instanceMatrix = instances.matrices;
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Instances roam the whole tank; the per-mesh bounding sphere would be wrong.
  mesh.frustumCulled = false;
  return mesh;
}

function proceduralMaterial(body: Species["body"], water: WaterUniforms): MeshPhysicalMaterial {
  const { shape, pattern, colors } = body;
  return patchMaterial(
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
      }),
      fishMotionPatch({ uSwimAmplitude: { value: BODY_PROPORTIONS[shape].swimAmplitude } }),
      causticsPatch(water),
    ],
  );
}

/** The model's own material, made fadeable and taught to swim. */
function modelMaterial(
  material: Material,
  manifest: ModelManifest,
  water: WaterUniforms,
): Material {
  const copy = material.clone();
  copy.transparent = true;
  return patchMaterial(copy, [
    fishMotionPatch({ uSwimAmplitude: { value: manifest.swimAmplitude } }),
    causticsPatch(water),
  ]);
}

const materialsOf = (material: Material | Material[]): Material[] =>
  Array.isArray(material) ? material : [material];

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

/** Frees what the loader created; the parts keep their own copies of the geometry. */
function disposeLoadedScene(root: Object3D): Texture[] {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    (object.geometry as BufferGeometry).dispose();
    for (const material of materialsOf(object.material as Material | Material[])) {
      texturesOf(material).forEach((texture) => textures.add(texture));
      material.dispose();
    }
  });
  return [...textures];
}

function showBody(instances: SpeciesInstances): void {
  const model = instances.wantModel && instances.modelState === "ready";
  for (const mesh of instances.procedural) mesh.visible = !model;
  for (const mesh of instances.model) mesh.visible = model;
}

/**
 * One set of instanced meshes per species: a whole school is a single draw
 * call per mesh. Procedural bodies are ready at once. A 3D model is loaded
 * when the viewer wants it and replaces the procedural body once it is
 * ready; a model that fails to load leaves the procedural body in place.
 *
 * @param modelEnabled whether a species starts with its 3D model.
 */
export function createFishRenderer(
  catalog: SpeciesCatalog,
  water: WaterUniforms,
  logger: Logger,
  models: FishModels,
  modelEnabled: (speciesId: string) => boolean,
): FishRenderer {
  const object = new Group();
  object.name = "fish";
  const species = new Map<string, SpeciesInstances>();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];
  const loading: Promise<void>[] = [];
  let disposed = false;

  const addMesh = (
    instances: SpeciesInstances,
    body: InstancedMesh[],
    mesh: InstancedMesh,
    mouthMorphIndex?: number,
  ): void => {
    body.push(mesh);
    if (mouthMorphIndex !== undefined) {
      const weights = new Mesh();
      weights.morphTargetInfluences = new Array<number>(
        mesh.geometry.morphAttributes.position?.length ?? 0,
      ).fill(0);
      // The morph texture is sized by the mesh's count when it is first written.
      mesh.count = MAX_INDIVIDUALS_PER_SPECIES;
      mesh.setMorphAt(0, weights);
      mesh.count = 0;
      instances.mouthMorphs.push({ mesh, index: mouthMorphIndex, weights });
    }
    object.add(mesh);
  };

  const addModelParts = (
    id: string,
    instances: SpeciesInstances,
    parts: readonly FishModelPart[],
    manifest: ModelManifest,
  ): void => {
    for (const part of parts) {
      const partMaterials = materialsOf(part.material).map((material) =>
        modelMaterial(material, manifest, water),
      );
      geometries.push(part.geometry);
      materials.push(...partMaterials);
      const material = Array.isArray(part.material) ? partMaterials : partMaterials[0];
      if (material === undefined) continue;
      addMesh(
        instances,
        instances.model,
        createInstancedMesh(`${id}/model`, part.geometry, material, instances),
        part.mouthMorphIndex,
      );
    }
  };

  const loadModel = (instances: SpeciesInstances): void => {
    const { species: entry } = instances;
    if (entry.model === undefined || instances.modelState !== "idle") return;
    const modelId = entry.model;
    const manifest = models.manifests.get(modelId);
    if (manifest === undefined) {
      instances.modelState = "failed";
      logger.warn("Fish model has no manifest; the procedural body is used", {
        species: entry.id,
        model: modelId,
      });
      return;
    }
    instances.modelState = "loading";
    const url = modelFileUrl(modelId, manifest);
    const done = models
      .load(url)
      .then((root) => {
        const parts = prepareFishModel(root, manifest);
        const loadedTextures = disposeLoadedScene(root);
        if (disposed) {
          for (const part of parts) part.geometry.dispose();
          for (const texture of loadedTextures) texture.dispose();
          return;
        }
        textures.push(...loadedTextures);
        addModelParts(entry.id, instances, parts, manifest);
        instances.modelState = "ready";
        showBody(instances);
      })
      .catch((error: unknown) => {
        instances.modelState = "failed";
        logger.warn("Fish model could not be loaded; the procedural body is used", {
          species: entry.id,
          url,
          error: String(error),
        });
      });
    loading.push(done);
  };

  for (const entry of catalog.species) {
    const instances = createInstances(entry, modelEnabled(entry.id));
    species.set(entry.id, instances);
    const geometry = createFishGeometry(entry.body.shape);
    const material = proceduralMaterial(entry.body, water);
    geometries.push(geometry);
    materials.push(material);
    addMesh(
      instances,
      instances.procedural,
      createInstancedMesh(entry.id, geometry, material, instances),
    );
    if (instances.wantModel) loadModel(instances);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler(0, 0, 0, "YZX");
  const scale = new Vector3();
  const openMouths = (instances: SpeciesInstances): void => {
    for (const { mesh, index, weights } of instances.mouthMorphs) {
      const influences = weights.morphTargetInfluences ?? [];
      for (let instance = 0; instance < instances.count; instance += 1) {
        influences[index] = instances.mouth.getX(instance);
        mesh.setMorphAt(instance, weights);
      }
      if (mesh.morphTexture !== null) mesh.morphTexture.needsUpdate = true;
    }
  };

  return {
    object,
    update(fish) {
      for (const instances of species.values()) instances.count = 0;
      for (const individual of fish) {
        const instances = species.get(individual.species.id);
        if (instances === undefined || instances.count >= MAX_INDIVIDUALS_PER_SPECIES) continue;
        const { velocity } = individual;
        const horizontal = Math.hypot(velocity.x, velocity.z);
        euler.set(
          individual.roll,
          Math.atan2(-velocity.z, velocity.x),
          Math.atan2(velocity.y, horizontal),
        );
        rotation.setFromEuler(euler);
        scale.setScalar(individual.length);
        matrix.compose(individual.position, rotation, scale);
        const index = instances.count;
        matrix.toArray(instances.matrices.array, index * MATRIX_SIZE);
        instances.swimPhase.setX(index, individual.swimPhase);
        instances.opacity.setX(index, individual.opacity);
        instances.gaze.setX(index, individual.gaze);
        instances.bend.setX(index, individual.bend);
        instances.effort.setX(index, individual.effort);
        instances.mouth.setX(index, individual.mouth);
        instances.count += 1;
      }
      for (const instances of species.values()) {
        for (const mesh of instances.procedural) mesh.count = instances.count;
        for (const mesh of instances.model) mesh.count = instances.count;
        instances.matrices.needsUpdate = true;
        instances.swimPhase.needsUpdate = true;
        instances.opacity.needsUpdate = true;
        instances.gaze.needsUpdate = true;
        instances.bend.needsUpdate = true;
        instances.effort.needsUpdate = true;
        instances.mouth.needsUpdate = true;
        openMouths(instances);
      }
    },
    settled: () => Promise.all(loading).then(() => undefined),
    setModelEnabled(speciesId, enabled) {
      const instances = species.get(speciesId);
      if (instances === undefined) return;
      instances.wantModel = enabled;
      if (enabled) loadModel(instances);
      showBody(instances);
    },
    dispose() {
      disposed = true;
      for (const instances of species.values()) {
        for (const mesh of [...instances.procedural, ...instances.model]) mesh.dispose();
      }
      materials.forEach((material) => {
        material.dispose();
      });
      geometries.forEach((geometry) => {
        geometry.dispose();
      });
      textures.forEach((texture) => {
        texture.dispose();
      });
    },
  };
}
