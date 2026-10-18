import {
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import type { Logger } from "../core/logger";
import { createRng, type Rng } from "../core/rng";
import type { PropGenerator } from "../scene/schema";
import type { Prop } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
import {
  disposeLoadedObjectModel,
  modelMaterial,
  prepareObjectModel,
  type ObjectModelLoader,
  type ObjectModelVariant,
} from "./objectModel";
import type { ShapeSource } from "./sceneryShapes";
import {
  branchCoralGeometry,
  brainCoralGeometry,
  fanCoralGeometry,
  rockGeometry,
  driftwoodGeometry,
  dragonStoneGeometry,
  leatherCoralGeometry,
  mossCushionGeometry,
  mushroomCoralGeometry,
  pebbleGeometry,
  shellGeometry,
  starfishGeometry,
  tableCoralGeometry,
} from "./sceneryGeometry";
import { causticsPatch } from "./shaders/causticsPatch";
import { fluorescencePatch } from "./shaders/fluorescencePatch";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import { surfacePatch } from "./shaders/surfacePatch";
import type { SurfaceLibrary } from "./surfaceLibrary";
import type { WaterUniforms } from "./uniforms";

interface PropStyle {
  /** Distinct shapes per kind; each prop picks one from its own seed. */
  readonly variants: number;
  readonly build: (rng: Rng) => BufferGeometry;
  readonly roughness: number;
  readonly flatShading: boolean;
  /** Thin shapes are seen from both sides. */
  readonly doubleSided: boolean;
  readonly castShadow: boolean;
  /** Glows under actinic light (living corals). */
  readonly fluorescent: boolean;
}

export const PROP_STYLES: Readonly<Record<PropGenerator, PropStyle>> = {
  rock: {
    variants: 5,
    build: rockGeometry,
    roughness: 0.98,
    flatShading: true,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
  },
  starfish: {
    variants: 4,
    build: starfishGeometry,
    roughness: 0.75,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: false,
  },
  shell: {
    variants: 3,
    build: shellGeometry,
    roughness: 0.45,
    flatShading: false,
    doubleSided: true,
    castShadow: true,
    fluorescent: false,
  },
  "brain-coral": {
    variants: 3,
    build: brainCoralGeometry,
    roughness: 0.85,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
  },
  "branch-coral": {
    variants: 4,
    build: branchCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
  },
  "fan-coral": {
    variants: 3,
    build: fanCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
  },
  "table-coral": {
    variants: 3,
    build: tableCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
  },
  "mushroom-coral": {
    variants: 3,
    build: mushroomCoralGeometry,
    roughness: 0.6,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: true,
  },
  "leather-coral": {
    variants: 3,
    build: leatherCoralGeometry,
    roughness: 0.75,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
  },
  driftwood: {
    variants: 4,
    build: driftwoodGeometry,
    roughness: 0.9,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
  },
  "dragon-stone": {
    variants: 4,
    build: dragonStoneGeometry,
    roughness: 0.95,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
  },
  moss: {
    variants: 3,
    build: mossCushionGeometry,
    roughness: 1,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
  },
  pebble: {
    variants: 4,
    build: pebbleGeometry,
    roughness: 0.6,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: false,
  },
};

/** Starfish creep: one full turn takes this many seconds. */
const STARFISH_TURN_SECONDS = 1800;
/** Seeds the shape variants so they look the same whatever the scene holds. */
const VARIANT_SEED = 7919;

/** The mesh of one shape variant of a generator's prop, standing on y = 0, one unit across. */
export function propGeometry(generator: PropGenerator, variant: number): BufferGeometry {
  return PROP_STYLES[generator].build(createRng(VARIANT_SEED + variant));
}

export interface PropRenderer {
  readonly object: Group;
  /** Turns the starfish, very slowly. Allocation-free. */
  update(timeSeconds: number): void;
  /** Resolves when every model-only prop has loaded or failed. */
  settled(): Promise<void>;
  dispose(): void;
}

interface Placed {
  readonly prop: Prop;
  readonly generator: PropGenerator;
  readonly variant: number;
}

const surfaceKey = (material: Prop["material"]): string =>
  material === undefined ? "plain" : `${material.id}|${material.tileSize}|${material.displacement}`;

/** Rocks, starfish, shells, corals and 3D model props: instanced by kind, color and shape. */
export function createPropRenderer(
  items: readonly Prop[],
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
  loadModel?: ObjectModelLoader,
  logger?: Logger,
  /** Where generated shapes come from (render/shapeLibrary); built here by default. */
  shapes?: ShapeSource,
): PropRenderer {
  const object = new Group();
  object.name = "props";
  const disposables: { dispose(): void }[] = [];
  const loading: Promise<void>[] = [];
  let disposed = false;

  const geometries = new Map<string, BufferGeometry>();
  const geometryFor = (generator: PropGenerator, variant: number): BufferGeometry => {
    const key = `${generator}|${variant}`;
    const existing = geometries.get(key);
    if (existing !== undefined) return existing;
    const geometry =
      shapes?.({ kind: "prop", generator, variant }) ?? propGeometry(generator, variant);
    geometries.set(key, geometry);
    disposables.push(geometry);
    return geometry;
  };

  const groups = new Map<string, Placed[]>();
  const modelGroups = new Map<string, Prop[]>();
  for (const prop of items) {
    if (prop.generator === undefined) {
      if (prop.model !== undefined) {
        const key = `${prop.kind}|${prop.color}|${surfaceKey(prop.material)}`;
        modelGroups.set(key, [...(modelGroups.get(key) ?? []), prop]);
      }
      continue;
    }
    const variant = createRng(prop.seed).int(0, PROP_STYLES[prop.generator].variants - 1);
    const key = `${prop.kind}|${prop.color}|${variant}|${surfaceKey(prop.material)}`;
    groups.set(key, [...(groups.get(key) ?? []), { prop, generator: prop.generator, variant }]);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  const starfish: { mesh: InstancedMesh; props: Prop[] }[] = [];

  const place = (mesh: InstancedMesh, index: number, prop: Prop, turn: number): void => {
    const base = floorHeight(prop.x, prop.z) + (prop.elevation ?? 0);
    position.set(prop.x, base + prop.shape.sink * prop.size, prop.z);
    rotation.setFromEuler(euler.set(0, prop.rotation + turn, 0));
    scale.setScalar(prop.size);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  };

  const buildModelGroup = (
    members: readonly Prop[],
    variants: readonly ObjectModelVariant[],
  ): void => {
    const first = members[0];
    if (first === undefined || variants.length === 0) return;
    const byVariant = new Map<number, Prop[]>();
    for (const prop of members) {
      const variantIndex = createRng(prop.seed).int(0, variants.length - 1);
      byVariant.set(variantIndex, [...(byVariant.get(variantIndex) ?? []), prop]);
    }
    const surface = first.material;
    const patches: ShaderPatch[] =
      surface === undefined
        ? [causticsPatch(water)]
        : [surfacePatch(surfaces.get(surface.id), "triplanar", surface), causticsPatch(water)];
    for (const [variantIndex, variantMembers] of byVariant) {
      const variant = variants[variantIndex];
      if (variant === undefined) continue;
      for (const part of variant.parts) {
        const geometry = part.geometry.clone();
        const material = modelMaterial(part.material, patches);
        const mesh = new InstancedMesh(geometry, material, variantMembers.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        variantMembers.forEach((prop, index) => {
          place(mesh, index, prop, 0);
        });
        mesh.computeBoundingSphere();
        object.add(mesh);
        disposables.push(geometry, ...(Array.isArray(material) ? material : [material]), mesh);
      }
    }
  };

  for (const members of groups.values()) {
    const first = members[0];
    if (first === undefined) continue;
    const style = PROP_STYLES[first.generator];
    const surface = first.prop.material;
    const patches: ShaderPatch[] =
      surface === undefined
        ? [causticsPatch(water)]
        : [surfacePatch(surfaces.get(surface.id), "triplanar", surface), causticsPatch(water)];
    if (style.fluorescent) patches.push(fluorescencePatch(water));
    const material = patchMaterial(
      new MeshStandardMaterial({
        color: new Color(first.prop.color),
        roughness: style.roughness,
        // Textured surfaces bring their own relief; facets would fight it.
        flatShading: style.flatShading && surface === undefined,
        ...(style.doubleSided ? { side: DoubleSide } : {}),
      }),
      patches,
    );
    const mesh = new InstancedMesh(
      geometryFor(first.generator, first.variant),
      material,
      members.length,
    );
    mesh.castShadow = style.castShadow;
    mesh.receiveShadow = true;
    members.forEach(({ prop }, index) => {
      place(mesh, index, prop, 0);
    });
    mesh.computeBoundingSphere();
    if (first.generator === "starfish") {
      starfish.push({ mesh, props: members.map(({ prop }) => prop) });
    }
    object.add(mesh);
    disposables.push(material, mesh);
  }

  for (const members of modelGroups.values()) {
    const first = members[0];
    if (first?.model === undefined || loadModel === undefined) continue;
    const url = first.model;
    const done = loadModel(url)
      .then((root) => {
        const variants = prepareObjectModel(root, "object");
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
        logger?.warn("Object model could not be loaded", {
          object: first.kind,
          url,
          error: String(error),
        });
      });
    loading.push(done);
  }

  return {
    object,
    update(timeSeconds) {
      const turn = (timeSeconds / STARFISH_TURN_SECONDS) * Math.PI * 2;
      for (const group of starfish) {
        for (let index = 0; index < group.props.length; index += 1) {
          const prop = group.props[index];
          if (prop !== undefined) place(group.mesh, index, prop, turn);
        }
        group.mesh.instanceMatrix.needsUpdate = true;
      }
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
