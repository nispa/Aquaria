import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { createRng } from "../core/rng";
import type { ObjectManifest } from "../scene/objectManifest";
import {
  PLANT_GENERATORS,
  PROP_GENERATORS,
  type BlocksSpec,
  type PlantGenerator,
  type PropGenerator,
} from "../scene/schema";
import { TRAITS, type ObjectTraits } from "../scene/traits";
import { SWAY_ATTRIBUTE } from "../scene/traits/sway";
import { createBlockwork } from "../sim/blockwork";
import { blockMesh } from "./blockMesh";
import { FLORA_STYLES, GOLDEN_ANGLE, plantShapeGeometry } from "./floraRenderer";
import { PROP_STYLES, propGeometry } from "./propRenderer";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

/** Default height (m) for a baked plant whose placement trait sets no size. */
const DEFAULT_PLANT_HEIGHT = 0.6;
/** Default diameter (m) for a baked prop whose placement trait sets no size. */
const DEFAULT_PROP_SIZE = 0.35;
/** Gap between side-by-side seed variants in a baked `.glb`, as a multiple of their span. */
const VARIANT_GAP = 1.6;
/** Blockwork smoothing and roughness match `createBlockworkRenderer`. */
const BLOCK_SMOOTHING = 3;
const BLOCK_ROUGHNESS = 0.18;

const isPlantGenerator = (id: string): id is PlantGenerator =>
  (PLANT_GENERATORS as readonly string[]).includes(id);
const isPropGenerator = (id: string): id is PropGenerator =>
  (PROP_GENERATORS as readonly string[]).includes(id);

interface BakedVariant {
  readonly name: string;
  readonly translation: readonly [number, number, number];
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs?: Float32Array;
  readonly sway?: Float32Array;
  readonly indices: Uint32Array;
}

interface BakedDocument {
  readonly name: string;
  readonly color: string;
  readonly roughness: number;
  readonly doubleSided: boolean;
  readonly swayAttributeName?: string;
  readonly traits: ObjectTraits;
  readonly variants: readonly BakedVariant[];
}

function primaryColor(color: ObjectManifest["color"]): string {
  return typeof color === "string" ? color : (color[0] ?? "#8a8178");
}

/** The middle of a placement range (`size` for objects, `height` for plants), m. */
function nominalSize(range: readonly [number, number] | undefined, fallback: number): number {
  return range === undefined ? fallback : (range[0] + range[1]) / 2;
}

function floatArrayOf(geometry: BufferGeometry, name: string, itemSize: number): Float32Array {
  const attr = geometry.getAttribute(name) as BufferAttribute | undefined;
  const count = geometry.getAttribute("position").count;
  const out = new Float32Array(count * itemSize);
  if (attr === undefined) return out;
  for (let index = 0; index < count; index += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      out[index * itemSize + component] = attr.getComponent(index, component);
    }
  }
  return out;
}

function indicesOf(geometry: BufferGeometry): Uint32Array {
  const index = geometry.getIndex();
  const vertexCount = geometry.getAttribute("position").count;
  if (index === null) {
    return Uint32Array.from({ length: vertexCount }, (_, i) => i);
  }
  const out = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i += 1) out[i] = index.getX(i);
  return out;
}

/**
 * Merges the blades of one procedural plant variant into a single geometry
 * at real size in meters, with `_SWAY` weights from each blade's local `y`
 * (0 at the root to 1 at the tip) before the blade is tilted and scaled.
 */
function bakePlantVariant(
  generator: PlantGenerator,
  height: number,
  variantIndex: number,
  translationX: number,
): BakedVariant {
  const style = FLORA_STYLES[generator];
  const baseGeometry = plantShapeGeometry(style, 4231 + variantIndex);
  baseGeometry.computeVertexNormals();
  const basePositions = floatArrayOf(baseGeometry, "position", 3);
  const baseNormals = floatArrayOf(baseGeometry, "normal", 3);
  const baseUvs = baseGeometry.hasAttribute("uv") ? floatArrayOf(baseGeometry, "uv", 2) : undefined;
  const baseIndices = indicesOf(baseGeometry);
  const vertexCount = basePositions.length / 3;
  const baseSway = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    baseSway[i] = Math.min(Math.max(basePositions[i * 3 + 1] ?? 0, 0), 1);
  }
  baseGeometry.dispose();

  const totalVertices = vertexCount * style.blades;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = baseUvs === undefined ? undefined : new Float32Array(totalVertices * 2);
  const sway = new Float32Array(totalVertices);
  const indices = new Uint32Array(baseIndices.length * style.blades);

  const rng = createRng(1000 + variantIndex * 97);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  const vertex = new Vector3();
  const normal = new Vector3();

  for (let blade = 0; blade < style.blades; blade += 1) {
    const x = rng.range(-style.spread, style.spread);
    const z = rng.range(-style.spread, style.spread);
    const bladeHeight = height * rng.range(0.7, 1);
    position.set(x, 0, z);
    euler.set(rng.range(style.tilt[0], style.tilt[1]), blade * GOLDEN_ANGLE, 0, "YXZ");
    rotation.setFromEuler(euler);
    const scaledByHeight = style.shape !== "blade" && style.shape !== "tentacle";
    const width = style.width * rng.range(0.8, 1.2) * (scaledByHeight ? bladeHeight : 1);
    scale.set(width, bladeHeight, style.shape === "blade" ? 1 : width);
    matrix.compose(position, rotation, scale);

    const vOffset = blade * vertexCount;
    for (let i = 0; i < vertexCount; i += 1) {
      vertex
        .set(
          basePositions[i * 3] ?? 0,
          basePositions[i * 3 + 1] ?? 0,
          basePositions[i * 3 + 2] ?? 0,
        )
        .applyMatrix4(matrix);
      positions[(vOffset + i) * 3] = vertex.x;
      positions[(vOffset + i) * 3 + 1] = Math.max(vertex.y, 0);
      positions[(vOffset + i) * 3 + 2] = vertex.z;

      normal
        .set(baseNormals[i * 3] ?? 0, baseNormals[i * 3 + 1] ?? 0, baseNormals[i * 3 + 2] ?? 0)
        .transformDirection(matrix);
      normals[(vOffset + i) * 3] = normal.x;
      normals[(vOffset + i) * 3 + 1] = normal.y;
      normals[(vOffset + i) * 3 + 2] = normal.z;

      if (uvs !== undefined && baseUvs !== undefined) {
        uvs[(vOffset + i) * 2] = baseUvs[i * 2] ?? 0;
        uvs[(vOffset + i) * 2 + 1] = baseUvs[i * 2 + 1] ?? 0;
      }
      sway[vOffset + i] = baseSway[i] ?? 0;
    }

    const iOffset = blade * baseIndices.length;
    for (let i = 0; i < baseIndices.length; i += 1) {
      indices[iOffset + i] = (baseIndices[i] ?? 0) + vOffset;
    }
  }

  return {
    name: `variant_${String(variantIndex)}`,
    translation: [translationX, 0, 0],
    positions,
    normals,
    ...(uvs === undefined ? {} : { uvs }),
    sway,
    indices,
  };
}

function bakePropVariant(
  generator: PropGenerator,
  size: number,
  variantIndex: number,
  translationX: number,
): BakedVariant {
  const geometry = propGeometry(generator, variantIndex);
  geometry.scale(size, size, size);
  geometry.computeVertexNormals();
  const positions = floatArrayOf(geometry, "position", 3);
  const normals = floatArrayOf(geometry, "normal", 3);
  const uvs = geometry.hasAttribute("uv") ? floatArrayOf(geometry, "uv", 2) : undefined;
  const indices = indicesOf(geometry);
  geometry.dispose();
  return {
    name: `variant_${String(variantIndex)}`,
    translation: [translationX, 0, 0],
    positions,
    normals,
    ...(uvs === undefined ? {} : { uvs }),
    indices,
  };
}

function minMaxVec3(values: Float32Array): { readonly min: number[]; readonly max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const v = values[i + axis] ?? 0;
      if (v < (min[axis] ?? Infinity)) min[axis] = v;
      if (v > (max[axis] ?? -Infinity)) max[axis] = v;
    }
  }
  return { min, max };
}

function minMaxScalar(values: Float32Array): { readonly min: number[]; readonly max: number[] } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min: [min], max: [max] };
}

function serializeGlb(doc: BakedDocument): Uint8Array {
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  const appendBytes = (raw: ArrayBufferView, target: number): number => {
    const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const pad = (4 - (view.byteLength % 4)) % 4;
    const byteOffset = byteLength;
    chunks.push(view);
    if (pad > 0) chunks.push(new Uint8Array(pad));
    byteLength += view.byteLength + pad;
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: view.byteLength,
      target,
    });
    return viewIndex;
  };

  for (const variant of doc.variants) {
    const attributes: Record<string, number> = {};

    const posView = appendBytes(variant.positions, TARGET_ARRAY_BUFFER);
    const posBounds = minMaxVec3(variant.positions);
    attributes.POSITION = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: COMPONENT_FLOAT,
      count: variant.positions.length / 3,
      type: "VEC3",
      min: posBounds.min,
      max: posBounds.max,
    });

    const normView = appendBytes(variant.normals, TARGET_ARRAY_BUFFER);
    attributes.NORMAL = accessors.length;
    accessors.push({
      bufferView: normView,
      componentType: COMPONENT_FLOAT,
      count: variant.normals.length / 3,
      type: "VEC3",
    });

    if (variant.uvs !== undefined) {
      const uvView = appendBytes(variant.uvs, TARGET_ARRAY_BUFFER);
      attributes.TEXCOORD_0 = accessors.length;
      accessors.push({
        bufferView: uvView,
        componentType: COMPONENT_FLOAT,
        count: variant.uvs.length / 2,
        type: "VEC2",
      });
    }

    if (variant.sway !== undefined && doc.swayAttributeName !== undefined) {
      const swayView = appendBytes(variant.sway, TARGET_ARRAY_BUFFER);
      const swayBounds = minMaxScalar(variant.sway);
      attributes[doc.swayAttributeName] = accessors.length;
      accessors.push({
        bufferView: swayView,
        componentType: COMPONENT_FLOAT,
        count: variant.sway.length,
        type: "SCALAR",
        min: swayBounds.min,
        max: swayBounds.max,
      });
    }

    const idxView = appendBytes(variant.indices, TARGET_ELEMENT_ARRAY_BUFFER);
    const indicesAccessor = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: COMPONENT_UNSIGNED_INT,
      count: variant.indices.length,
      type: "SCALAR",
    });

    const meshIndex = meshes.length;
    meshes.push({
      name: variant.name,
      primitives: [{ attributes, indices: indicesAccessor, material: 0 }],
    });
    nodes.push({
      name: variant.name,
      mesh: meshIndex,
      translation: variant.translation,
    });
  }

  const color = new Color(doc.color);
  const gltf = {
    asset: { version: "2.0", generator: "Aquaria" },
    scene: 0,
    scenes: [
      {
        name: doc.name,
        nodes: nodes.map((_, index) => index),
        extras: { traits: doc.traits },
      },
    ],
    nodes,
    meshes,
    materials: [
      {
        name: doc.name,
        doubleSided: doc.doubleSided,
        pbrMetallicRoughness: {
          baseColorFactor: [color.r, color.g, color.b, 1],
          metallicFactor: 0,
          roughnessFactor: doc.roughness,
        },
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunkLength = jsonBytes.byteLength + jsonPad;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + byteLength;

  const glb = new Uint8Array(totalLength);
  const header = new DataView(glb.buffer);
  header.setUint32(0, GLB_MAGIC, true);
  header.setUint32(4, GLB_VERSION, true);
  header.setUint32(8, totalLength, true);

  header.setUint32(12, jsonChunkLength, true);
  header.setUint32(16, CHUNK_JSON, true);
  glb.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i += 1) glb[20 + jsonBytes.byteLength + i] = 0x20;

  const binHeaderOffset = 20 + jsonChunkLength;
  header.setUint32(binHeaderOffset, byteLength, true);
  header.setUint32(binHeaderOffset + 4, CHUNK_BIN, true);
  let cursor = binHeaderOffset + 8;
  for (const chunk of chunks) {
    glb.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return glb;
}

/**
 * Bakes an object's procedural recipe into a binary glTF 2.0 (`.glb`) buffer
 * with `variantCount` seed variants side by side at real size in meters, a
 * standard PBR material, `_SWAY` vertex weights on plants, and the manifest's
 * `traits` in `scenes[0].extras.traits` so a round trip through Blender keeps them.
 */
export function bakeObjectGlb(id: string, manifest: ObjectManifest, variantCount = 3): Uint8Array {
  const generator = manifest.recipe?.generator;
  if (generator === undefined) {
    throw new Error(`Object "${id}" has no recipe to bake.`);
  }
  const color = primaryColor(manifest.color);

  if (isPlantGenerator(generator)) {
    const height = nominalSize(manifest.traits.placement?.height, DEFAULT_PLANT_HEIGHT);
    const step = height * VARIANT_GAP;
    const swayAttributeName = manifest.traits.sway?.attribute ?? SWAY_ATTRIBUTE;
    const variants = Array.from({ length: variantCount }, (_, index) =>
      bakePlantVariant(generator, height, index, (index - (variantCount - 1) / 2) * step),
    );
    return serializeGlb({
      name: id,
      color,
      roughness: 0.7,
      doubleSided: true,
      swayAttributeName,
      traits: manifest.traits,
      variants,
    });
  }

  if (isPropGenerator(generator)) {
    const style = PROP_STYLES[generator];
    const size = nominalSize(manifest.traits.placement?.size, DEFAULT_PROP_SIZE);
    const step = size * VARIANT_GAP;
    const count = Math.min(variantCount, style.variants);
    const variants = Array.from({ length: count }, (_, index) =>
      bakePropVariant(generator, size, index, (index - (count - 1) / 2) * step),
    );
    return serializeGlb({
      name: id,
      color,
      roughness: style.roughness,
      doubleSided: style.doubleSided,
      traits: manifest.traits,
      variants,
    });
  }

  throw new Error(`Object "${id}" has an unknown generator "${String(generator)}".`);
}

/**
 * Bakes block rock (`scene.blocks`) into a binary glTF 2.0 (`.glb`) buffer with
 * the smoothed, roughened surface mesh, a standard PBR material, and rock traits
 * in `scenes[0].extras.traits`.
 */
export function bakeBlockworkGlb(
  tank: { readonly width: number; readonly height: number; readonly depth: number },
  blocks: BlocksSpec,
  seed = 0,
): Uint8Array {
  const blockwork = createBlockwork(tank, blocks);
  const mesh = blockMesh(tank, blockwork.grid, blockwork.cells, {
    smoothing: BLOCK_SMOOTHING,
    roughness: BLOCK_ROUGHNESS * blocks.size,
    seed,
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  const positions = floatArrayOf(geometry, "position", 3);
  const normals = floatArrayOf(geometry, "normal", 3);
  const indices = indicesOf(geometry);
  geometry.dispose();

  return serializeGlb({
    name: "blockwork",
    color: blocks.color,
    roughness: 0.92,
    doubleSided: false,
    traits: {
      collision: TRAITS.collision.schema.parse({ solid: true }),
      tags: ["rock", "hardscape"],
    },
    variants: [
      {
        name: "blockwork",
        translation: [0, 0, 0],
        positions,
        normals,
        indices,
      },
    ],
  });
}
