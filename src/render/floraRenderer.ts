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
import { createRng } from "../core/rng";
import type { Plant } from "../sim/layout";
import { floorHeight } from "../sim/terrain";
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

interface BladeStyle {
  /** Blades per plant. */
  readonly blades: number;
  /** Blade width in meters. */
  readonly width: number;
  /** Horizontal spread of the blades around the plant, m. */
  readonly spread: number;
  readonly segments: number;
  readonly sway: number;
  /** Lean away from the vertical, radians: blades stand, tentacles splay out. */
  readonly tilt: readonly [number, number];
  /** blade: flat leaf. tentacle: round tapering tube. bush: a whole plant per instance. */
  readonly shape: "blade" | "tentacle" | "bush" | "frond" | "stem";
  readonly leaf: LeafStyle;
  /** Glows under actinic light (anemones). */
  readonly fluorescent: boolean;
}

const STYLES: Readonly<Record<Plant["kind"], BladeStyle>> = {
  kelp: {
    blades: 3,
    width: 0.22,
    spread: 0.18,
    segments: 16,
    sway: 0.18,
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
    sway: 0.08,
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
    sway: 0.05,
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
    sway: 0.04,
    tilt: [0, 0.1],
    shape: "bush",
    leaf: { veins: 0, veinStrength: 0 },
    fluorescent: false,
  },
  carpet: {
    // Dense tufts of tiny leaves splayed over the substrate.
    blades: 12,
    width: 0.018,
    spread: 0.07,
    segments: 2,
    sway: 0.01,
    tilt: [0.3, 1.1],
    shape: "blade",
    leaf: { veins: 1, veinStrength: 0.2 },
    fluorescent: false,
  },
  fern: {
    blades: 7,
    width: 1,
    spread: 0.03,
    segments: 0,
    sway: 0.04,
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
    sway: 0.05,
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
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Seeds the bush shape, so it looks the same whatever the scene holds. */
const BUSH_SEED = 4231;

function shapeGeometry(style: BladeStyle): BufferGeometry {
  switch (style.shape) {
    case "blade":
      return bladeGeometry(style.segments);
    case "tentacle":
      return anemoneTentacleGeometry();
    case "bush":
      return algaeBushGeometry(createRng(BUSH_SEED));
    case "frond":
      return fernFrondGeometry(createRng(BUSH_SEED));
    case "stem":
      return stemPlantGeometry(createRng(BUSH_SEED));
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

export interface FloraRenderer {
  readonly object: Group;
  dispose(): void;
}

/** Instanced kelp, seagrass and anemones, one draw call per plant kind and color. */
export function createFloraRenderer(plants: readonly Plant[], water: WaterUniforms): FloraRenderer {
  const object = new Group();
  object.name = "flora";
  const disposables: { dispose(): void }[] = [];
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

  for (const members of groups.values()) {
    const first = members[0];
    if (first === undefined) continue;
    const style = STYLES[first.kind];
    const count = members.length * style.blades;
    const geometry = shapeGeometry(style);
    geometry.setAttribute("aAcross", acrossAttribute(geometry, style.shape));
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
          { value: style.sway },
          style.leaf,
          first.tipColor === undefined ? undefined : new Color(first.tipColor),
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
    dispose() {
      disposables.forEach((item) => {
        item.dispose();
      });
    },
  };
}
