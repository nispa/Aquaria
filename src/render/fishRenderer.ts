import {
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  Texture,
  Vector2,
  Vector3,
  type AnimationClip,
  type Material,
  type Object3D,
} from "three";
import type { Logger } from "../core/logger";
import {
  modelFileUrl,
  modelFolderUrl,
  type ModelManifest,
  type PectoralFin,
} from "../scene/modelManifest";
import { MAX_INDIVIDUALS_PER_SPECIES, type Species, type SpeciesCatalog } from "../scene/schema";
import type { Fish } from "../sim/simulation";
import { BODY_PROPORTIONS, createFishGeometry, proceduralPectoralFin } from "./fishGeometry";
import { createCrustaceanGeometry } from "./crustaceanGeometry";
import { prepareFishModel, type FishModelPart } from "./fishModel";
import { causticsPatch } from "./shaders/causticsPatch";
import { fishColoringPatch } from "./shaders/fishColoringPatch";
import { fishInstancePatch } from "./shaders/fishInstancePatch";
import { fishMotionPatch } from "./shaders/fishMotionPatch";
import { fishPatch, PATTERN_IDS } from "./shaders/fishPatch";
import { fishEyesPatch } from "./shaders/fishEyesPatch";
import { fishGillsPatch } from "./shaders/fishGillsPatch";
import { fishJawPatch } from "./shaders/fishJawPatch";
import { fishPaintedEyesPatch } from "./shaders/fishPaintedEyesPatch";
import { fishPectoralPatch } from "./shaders/fishPectoralPatch";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import type { WaterUniforms } from "./uniforms";
import { createWalkingBodies, type WalkingBodies } from "./walkingBodies";

/** Strength of the skin's rainbow sheen, 0..1. */
const IRIDESCENCE = 0.35;
const MATRIX_SIZE = 16;
/** Texels this clear (alpha, 0..1) are cut away: the gaps around a model's painted fins. */
const CLEAR_TEXEL = 0.05;

/** Loads a glTF file and returns its scene; injected so tests run without a browser. */
export type FishModelLoader = (url: string) => Promise<Object3D>;

/** Loads a glTF scene with its animation clips. */
export type AnimatedModelLoader = (
  url: string,
) => Promise<{ readonly root: Object3D; readonly clips: readonly AnimationClip[] }>;

/**
 * Loads the textures of a species' colorings, in order, as the layers of
 * one texture array (they have the same size); injected so tests run
 * without a browser.
 */
export type ColoringLoader = (urls: readonly string[]) => Promise<Texture>;

/** The 3D models available to species with a glTF body, by model folder. */
export interface FishModels {
  readonly manifests: ReadonlyMap<string, ModelManifest>;
  readonly load: FishModelLoader;
  /**
   * Loads models whose manifest names a walk (or idle) clip: they are drawn
   * as skinned bodies playing it. Without it they stay still, instanced.
   */
  readonly loadAnimated?: AnimatedModelLoader;
  /** Loads colorings; without it every model wears its own colors. */
  readonly loadColorings?: ColoringLoader;
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
  /** Packed as shaders/fishInstancePatch reads them. */
  readonly motion: InstancedBufferAttribute;
  readonly look: InstancedBufferAttribute;
  readonly finStroke: InstancedBufferAttribute;
  readonly procedural: InstancedMesh[];
  /** Empty until the model has loaded. */
  readonly model: InstancedMesh[];
  modelState: ModelState;
  /** The viewer wants the 3D model; the procedural body shows until it is ready. */
  wantModel: boolean;
  /** Meshes that open the mouth with a morph target, and which one. */
  readonly mouthMorphs: MouthMorph[];
  /** A walking model's bodies, in place of the instanced model meshes. */
  walking: WalkingBodies | undefined;
  /** This step's individuals of a walking species; reused, never reallocated. */
  readonly walkers: Fish[];
  count: number;
}

export interface FishRenderer {
  readonly object: Group;
  /**
   * Copies simulation state into the instance buffers, and moves walking
   * bodies' clips on by `seconds` (0: a still picture). Allocation-free.
   */
  update(fish: readonly Fish[], seconds?: number): void;
  /** Resolves when every model requested so far has loaded or failed. */
  settled(): Promise<void>;
  /**
   * Draws a species with its 3D model or with its procedural body. The model
   * is loaded when the first fish of the species is in the tank. Species
   * without a model always use the procedural body.
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
    motion: perInstance(4),
    look: perInstance(4),
    finStroke: perInstance(4),
    procedural: [],
    model: [],
    modelState: "idle",
    wantModel,
    mouthMorphs: [],
    walking: undefined,
    walkers: [],
    count: 0,
  };
}

function shareInstanceAttributes(geometry: BufferGeometry, instances: SpeciesInstances): void {
  geometry.setAttribute("aMotion", instances.motion);
  geometry.setAttribute("aLook", instances.look);
  geometry.setAttribute("aFinStroke", instances.finStroke);
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

/**
 * A geometry of its own over the vertex data of a shared one: each species
 * adds its own instance attributes, while the GPU keeps one copy of the
 * shape (three.js uploads a buffer once per attribute object).
 */
function sharedShape(shape: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(shape.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(shape.index);
  geometry.morphAttributes = shape.morphAttributes;
  geometry.morphTargetsRelative = shape.morphTargetsRelative;
  for (const group of shape.groups)
    geometry.addGroup(group.start, group.count, group.materialIndex);
  return geometry;
}

function proceduralMaterial(body: Species["body"], water: WaterUniforms): MeshPhysicalMaterial {
  if (body.category === "crustacean") {
    // Crustaceans have an exoskeleton with chitin sheen
    return patchMaterial(
      new MeshPhysicalMaterial({
        color: new Color(body.colors.base),
        roughness: 0.45,
        metalness: 0.05,
        side: DoubleSide,
        transparent: true,
      }),
      [causticsPatch(water)],
    );
  }

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
      fishInstancePatch(),
      fishPatch({
        uBaseColor: { value: new Color(colors.base) },
        uAccentColor: { value: new Color(colors.accent) },
        uDetailColor: { value: new Color(colors.detail) },
        uPattern: { value: PATTERN_IDS[pattern] },
        uHalfHeight: { value: BODY_PROPORTIONS[shape].height / 2 },
      }),
      fishMotionPatch({ uSwimAmplitude: { value: BODY_PROPORTIONS[shape].swimAmplitude } }),
      pectoralPatch(proceduralPectoralFin(shape)),
      causticsPatch(water),
    ],
  );
}

/** Pectoral fins that beat about their base, wherever a body has them. */
function pectoralPatch(fin: PectoralFin): ShaderPatch {
  const [top, bottom] = fin.root;
  return fishPectoralPatch({
    uPectoralRootTop: { value: new Vector2(...top) },
    uPectoralRootBottom: { value: new Vector2(...bottom) },
    uPectoralSide: { value: fin.side },
    uPectoralLength: { value: fin.front - fin.back },
    uPectoralRest: { value: MathUtils.degToRad(fin.rest) },
    uPectoralSweep: { value: MathUtils.degToRad(fin.sweep) },
  });
}

/** Eyes, jaw and gills a model's manifest asks for; none when it asks for nothing. */
function facePatches(manifest: ModelManifest, water: WaterUniforms): ShaderPatch[] {
  const patches: ShaderPatch[] = [];
  const { eyes, mouth, gills } = manifest;
  if (eyes?.bones !== undefined) {
    patches.push(fishEyesPatch({ uEyeTurn: { value: MathUtils.degToRad(eyes.turn) } }));
  }
  if (eyes?.painted !== undefined) {
    const { center, radius, pupil, iris } = eyes.painted;
    patches.push(
      fishPaintedEyesPatch({
        uEyeCenter: { value: new Vector2(...center) },
        uEyeRadius: { value: radius },
        uPupilShare: { value: pupil },
        uIrisColor: { value: new Color(iris) },
      }),
    );
  }
  if (mouth?.jaw !== undefined) {
    const { start, line, drop } = mouth.jaw;
    patches.push(
      fishJawPatch({
        uJawStart: { value: start },
        uJawLine: { value: line },
        uJawDrop: { value: drop },
      }),
    );
  }
  if (gills !== undefined) {
    patches.push(
      fishGillsPatch({
        uTime: water.uTime,
        uGillEdge: { value: gills.edge },
        uGillTop: { value: gills.top },
        uGillBottom: { value: gills.bottom },
        uGillOpen: { value: gills.open },
        uGillRate: { value: gills.rate },
        uGillCurve: { value: gills.curve },
      }),
    );
  }
  return patches;
}

const hasMap = (material: Material): boolean =>
  "map" in material && material.map instanceof Texture;

/**
 * The model's own material, made fadeable and taught to swim, look, eat and
 * breathe as its manifest says; with `colorings`, a material with a texture
 * shows each fish's coloring instead. Exported for the model viewer.
 */
export function modelMaterial(
  material: Material,
  manifest: ModelManifest,
  water: WaterUniforms,
  colorings?: Texture,
): Material {
  const copy = material.clone();
  copy.transparent = true;
  // A model exported as blended comes without depth writes: depth effects
  // then take the fish for open water and its own faces show through.
  copy.depthWrite = true;
  copy.alphaTest = Math.max(copy.alphaTest, CLEAR_TEXEL);
  return patchMaterial(copy, [
    fishInstancePatch(),
    ...facePatches(manifest, water),
    fishMotionPatch({ uSwimAmplitude: { value: manifest.swimAmplitude } }),
    ...(manifest.fins?.pectoral === undefined ? [] : [pectoralPatch(manifest.fins.pectoral)]),
    ...(colorings !== undefined && hasMap(copy)
      ? [fishColoringPatch({ uColoringMap: { value: colorings } })]
      : []),
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

/**
 * The texture files of the colorings a species wears, in its order; none
 * when it wears none, or one its model does not list.
 */
function coloringUrls(
  species: Species,
  modelId: string,
  manifest: ModelManifest,
  logger: Logger,
): string[] | undefined {
  if (species.coloring === undefined) return undefined;
  const urls: string[] = [];
  for (const { id } of species.coloring) {
    const coloring = manifest.colorings?.[id];
    if (coloring === undefined) {
      logger.warn("Fish model has no such coloring; it wears its own colors", {
        species: species.id,
        model: modelId,
        coloring: id,
      });
      return undefined;
    }
    urls.push(`${modelFolderUrl(modelId)}/${coloring.texture}`);
  }
  return urls;
}

function showBody(instances: SpeciesInstances): void {
  const model = instances.wantModel && instances.modelState === "ready";
  for (const mesh of instances.procedural) mesh.visible = !model;
  for (const mesh of instances.model) mesh.visible = model;
  if (instances.walking !== undefined) instances.walking.group.visible = model;
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
  /** Walking models as loaded: their bodies share these geometries and materials. */
  const loadedWalkers: Object3D[] = [];
  /** Model shapes by file, downloaded once for every species that wears them. */
  const shapes = new Map<string, Promise<readonly FishModelPart[]>>();
  let disposed = false;

  const shapeOf = (url: string, manifest: ModelManifest): Promise<readonly FishModelPart[]> => {
    const known = shapes.get(url);
    if (known !== undefined) return known;
    const shape = models.load(url).then((root) => {
      const parts = prepareFishModel(root, manifest);
      const loadedTextures = disposeLoadedScene(root);
      if (disposed) {
        for (const part of parts) part.geometry.dispose();
        for (const texture of loadedTextures) texture.dispose();
      } else {
        geometries.push(...parts.map((part) => part.geometry));
        textures.push(...loadedTextures);
      }
      return parts;
    });
    shapes.set(url, shape);
    return shape;
  };

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
    colorings: Texture | undefined,
  ): void => {
    for (const part of parts) {
      const partMaterials = materialsOf(part.material).map((material) =>
        modelMaterial(material, manifest, water, colorings),
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
    const { loadAnimated } = models;
    if (manifest.animations !== undefined && loadAnimated !== undefined) {
      loadWalking(instances, url, manifest, loadAnimated);
      return;
    }
    const done = Promise.all([shapeOf(url, manifest), loadColorings(entry, modelId, manifest)])
      .then(([shape, colorings]) => {
        if (disposed) {
          colorings?.dispose();
          return;
        }
        if (colorings !== undefined) textures.push(colorings);
        const parts = shape.map((part) => ({ ...part, geometry: sharedShape(part.geometry) }));
        addModelParts(entry.id, instances, parts, manifest, colorings);
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

  /** The species' colorings as one texture array; undefined (with a warning) if it cannot have them. */
  const loadColorings = (
    entry: Species,
    modelId: string,
    manifest: ModelManifest,
  ): Promise<Texture | undefined> => {
    const urls = coloringUrls(entry, modelId, manifest, logger);
    if (urls === undefined || models.loadColorings === undefined) return Promise.resolve(undefined);
    return models.loadColorings(urls).catch((error: unknown) => {
      logger.warn("Fish colorings could not be loaded; the model wears its own colors", {
        species: entry.id,
        urls,
        error: String(error),
      });
      return undefined;
    });
  };

  const loadWalking = (
    instances: SpeciesInstances,
    url: string,
    manifest: ModelManifest,
    loadAnimated: AnimatedModelLoader,
  ): void => {
    const { species: entry } = instances;
    const done = loadAnimated(url)
      .then(({ root, clips }) => {
        loadedWalkers.push(root);
        if (disposed) return;
        const count = Math.min(entry.maxCount, MAX_INDIVIDUALS_PER_SPECIES);
        const walking = createWalkingBodies(`${entry.id}/animated`, root, clips, manifest, count);
        instances.walking = walking;
        object.add(walking.group);
        instances.modelState = "ready";
        showBody(instances);
      })
      .catch((error: unknown) => {
        instances.modelState = "failed";
        logger.warn("Walking model could not be loaded; the procedural body is used", {
          species: entry.id,
          url,
          error: String(error),
        });
      });
    loading.push(done);
  };

  /** The procedural body, built when the first fish of the species is drawn. */
  const buildBody = (instances: SpeciesInstances): void => {
    const { species: entry } = instances;
    const geometry =
      entry.body.category === "crustacean"
        ? createCrustaceanGeometry(entry.body.shape)
        : createFishGeometry(entry.body.shape);
    const material = proceduralMaterial(entry.body, water);
    geometries.push(geometry);
    materials.push(material);
    addMesh(
      instances,
      instances.procedural,
      createInstancedMesh(entry.id, geometry, material, instances),
    );
    showBody(instances);
  };

  for (const entry of catalog.species) {
    species.set(entry.id, createInstances(entry, modelEnabled(entry.id)));
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler(0, 0, 0, "YZX");
  const scale = new Vector3();
  const openMouths = (instances: SpeciesInstances): void => {
    for (const { mesh, index, weights } of instances.mouthMorphs) {
      const influences = weights.morphTargetInfluences ?? [];
      for (let instance = 0; instance < instances.count; instance += 1) {
        influences[index] = instances.look.getY(instance);
        mesh.setMorphAt(instance, weights);
      }
      if (mesh.morphTexture !== null) mesh.morphTexture.needsUpdate = true;
    }
  };

  return {
    object,
    update(fish, seconds = 0) {
      for (const instances of species.values()) {
        instances.count = 0;
        instances.walkers.length = 0;
      }
      for (const individual of fish) {
        const instances = species.get(individual.species.id);
        if (instances === undefined || instances.count >= MAX_INDIVIDUALS_PER_SPECIES) continue;
        const { velocity } = individual;
        const horizontal = Math.hypot(velocity.x, velocity.z);
        euler.set(individual.roll, -individual.facing, Math.atan2(velocity.y, horizontal));
        rotation.setFromEuler(euler);
        scale.setScalar(individual.length);
        matrix.compose(individual.position, rotation, scale);
        const index = instances.count;
        matrix.toArray(instances.matrices.array, index * MATRIX_SIZE);
        const { fins } = individual;
        instances.motion.setXYZW(
          index,
          individual.swimPhase,
          individual.bend,
          individual.effort,
          individual.opacity,
        );
        instances.look.setXYZW(
          index,
          individual.gaze,
          individual.mouth,
          fins.spreadLeft,
          fins.spreadRight,
        );
        instances.finStroke.setXYZW(
          index,
          fins.phaseLeft,
          fins.phaseRight,
          fins.beat,
          individual.coloring,
        );
        instances.count += 1;
        if (instances.walking !== undefined) instances.walkers.push(individual);
      }
      for (const instances of species.values()) {
        // Bodies are built and models prepared on the main thread, which
        // stalls a phone: only species in the tank pay for theirs.
        if (instances.count > 0 && instances.procedural.length === 0) buildBody(instances);
        if (instances.count > 0 && instances.wantModel) loadModel(instances);
        for (const mesh of instances.procedural) mesh.count = instances.count;
        for (const mesh of instances.model) mesh.count = instances.count;
        instances.matrices.needsUpdate = true;
        instances.motion.needsUpdate = true;
        instances.look.needsUpdate = true;
        instances.finStroke.needsUpdate = true;
        openMouths(instances);
        instances.walking?.update(instances.walkers, seconds);
      }
    },
    settled: () => Promise.all(loading).then(() => undefined),
    setModelEnabled(speciesId, enabled) {
      const instances = species.get(speciesId);
      if (instances === undefined) return;
      instances.wantModel = enabled;
      if (enabled && instances.count > 0) loadModel(instances);
      showBody(instances);
    },
    dispose() {
      disposed = true;
      for (const instances of species.values()) {
        for (const mesh of [...instances.procedural, ...instances.model]) mesh.dispose();
        instances.walking?.dispose();
      }
      for (const root of loadedWalkers) textures.push(...disposeLoadedScene(root));
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
