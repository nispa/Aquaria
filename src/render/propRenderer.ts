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
import { createRng, type Rng } from "../core/rng";
import type { Prop } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
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
  /** Vertical offset relative to the prop size: < 0 sinks it into the sand. */
  readonly sink: number;
}

const STYLES: Readonly<Record<Prop["kind"], PropStyle>> = {
  rock: {
    variants: 5,
    build: rockGeometry,
    roughness: 0.98,
    flatShading: true,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
    sink: 0,
  },
  starfish: {
    variants: 4,
    build: starfishGeometry,
    roughness: 0.75,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: false,
    sink: 0,
  },
  shell: {
    variants: 3,
    build: shellGeometry,
    roughness: 0.45,
    flatShading: false,
    doubleSided: true,
    castShadow: true,
    fluorescent: false,
    sink: -0.05,
  },
  "brain-coral": {
    variants: 3,
    build: brainCoralGeometry,
    roughness: 0.85,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
    sink: -0.04,
  },
  "branch-coral": {
    variants: 4,
    build: branchCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
    sink: -0.03,
  },
  "fan-coral": {
    variants: 3,
    build: fanCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
    sink: -0.02,
  },
  "table-coral": {
    variants: 3,
    build: tableCoralGeometry,
    roughness: 0.8,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
    sink: -0.02,
  },
  "mushroom-coral": {
    variants: 3,
    build: mushroomCoralGeometry,
    roughness: 0.6,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: true,
    sink: -0.02,
  },
  "leather-coral": {
    variants: 3,
    build: leatherCoralGeometry,
    roughness: 0.75,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: true,
    sink: -0.03,
  },
  driftwood: {
    variants: 4,
    build: driftwoodGeometry,
    roughness: 0.9,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
    sink: -0.02,
  },
  "dragon-stone": {
    variants: 4,
    build: dragonStoneGeometry,
    roughness: 0.95,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
    sink: -0.03,
  },
  moss: {
    variants: 3,
    build: mossCushionGeometry,
    roughness: 1,
    flatShading: false,
    doubleSided: false,
    castShadow: true,
    fluorescent: false,
    sink: -0.05,
  },
  pebble: {
    variants: 4,
    build: pebbleGeometry,
    roughness: 0.6,
    flatShading: false,
    doubleSided: false,
    castShadow: false,
    fluorescent: false,
    sink: -0.1,
  },
};

/** Starfish creep: one full turn takes this many seconds. */
const STARFISH_TURN_SECONDS = 1800;
/** Seeds the shape variants so they look the same whatever the scene holds. */
const VARIANT_SEED = 7919;

export interface PropRenderer {
  readonly object: Group;
  /** Turns the starfish, very slowly. Allocation-free. */
  update(timeSeconds: number): void;
  dispose(): void;
}

interface Placed {
  readonly prop: Prop;
  readonly variant: number;
}

/** Rocks, starfish, shells and corals: one instanced draw call per kind, color and shape. */
export function createPropRenderer(
  items: readonly Prop[],
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
): PropRenderer {
  const object = new Group();
  object.name = "props";
  const disposables: { dispose(): void }[] = [];
  const geometries = new Map<string, BufferGeometry>();
  const geometryFor = (kind: Prop["kind"], variant: number): BufferGeometry => {
    const key = `${kind}|${variant}`;
    const existing = geometries.get(key);
    if (existing !== undefined) return existing;
    const geometry = STYLES[kind].build(createRng(VARIANT_SEED + variant));
    geometries.set(key, geometry);
    disposables.push(geometry);
    return geometry;
  };

  const groups = new Map<string, Placed[]>();
  for (const prop of items) {
    const variant = createRng(prop.seed).int(0, STYLES[prop.kind].variants - 1);
    const material = prop.material;
    const surface =
      material === undefined
        ? "plain"
        : `${material.id}|${material.tileSize}|${material.displacement}`;
    const key = `${prop.kind}|${prop.color}|${variant}|${surface}`;
    groups.set(key, [...(groups.get(key) ?? []), { prop, variant }]);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  const starfish: { mesh: InstancedMesh; props: Prop[] }[] = [];

  const place = (mesh: InstancedMesh, index: number, prop: Prop, turn: number): void => {
    const style = STYLES[prop.kind];
    const base = floorHeight(prop.x, prop.z) + (prop.elevation ?? 0);
    position.set(prop.x, base + style.sink * prop.size, prop.z);
    rotation.setFromEuler(euler.set(0, prop.rotation + turn, 0));
    scale.setScalar(prop.size);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  };

  for (const members of groups.values()) {
    const first = members[0];
    if (first === undefined) continue;
    const style = STYLES[first.prop.kind];
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
      geometryFor(first.prop.kind, first.variant),
      material,
      members.length,
    );
    mesh.castShadow = style.castShadow;
    mesh.receiveShadow = true;
    members.forEach(({ prop }, index) => {
      place(mesh, index, prop, 0);
    });
    mesh.computeBoundingSphere();
    if (first.prop.kind === "starfish") {
      starfish.push({ mesh, props: members.map(({ prop }) => prop) });
    }
    object.add(mesh);
    disposables.push(material, mesh);
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
    dispose() {
      disposables.forEach((item) => {
        item.dispose();
      });
    },
  };
}
