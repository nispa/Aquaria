import {
  Box3,
  BufferAttribute,
  Matrix4,
  Texture,
  Vector3,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import type { Logger } from "../core/logger";
import type { ObjectManifest } from "../scene/objectManifest";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import { parseTraits, type ObjectTraits } from "../scene/traits";
import { SWAY_ATTRIBUTE } from "../scene/traits/sway";

export type ObjectCategory = ObjectManifest["category"];

/** Loads a glTF file and returns its scene; injected so tests run without a browser. */
export type ObjectModelLoader = (url: string) => Promise<Object3D>;

export interface ObjectModelPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
}

export interface ObjectModelVariant {
  readonly parts: readonly ObjectModelPart[];
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

const MIDRIB = 0.5;

function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

const materialsOf = (material: Material | Material[]): Material[] =>
  Array.isArray(material) ? material : [material];

/**
 * The model's own material (or materials) for one instanced part, patched
 * for the aquarium: a copy, so the loaded scene can be disposed, sharing
 * its textures, which the caller keeps until the renderer is disposed.
 */
export function modelMaterial(
  material: Material | Material[],
  patches: readonly ShaderPatch[],
): Material | Material[] {
  const patched = (each: Material): Material => patchMaterial(each.clone(), patches);
  return Array.isArray(material) ? material.map(patched) : patched(material);
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

/**
 * Frees the geometries and materials created by the glTF loader; returns any
 * textures they referenced so the caller can dispose them with the renderer.
 */
export function disposeLoadedObjectModel(root: Object3D): Texture[] {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    for (const material of materialsOf(object.material)) {
      texturesOf(material).forEach((texture) => textures.add(texture));
      material.dispose();
    }
  });
  return [...textures];
}

function toFloat(attribute: Attribute): BufferAttribute {
  if (attribute instanceof BufferAttribute && attribute.array instanceof Float32Array) {
    return attribute;
  }
  const { count, itemSize } = attribute;
  const copy = new BufferAttribute(new Float32Array(count * itemSize), itemSize);
  for (let index = 0; index < count; index += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      copy.setComponent(index, component, attribute.getComponent(index, component));
    }
  }
  return copy;
}

function floatGeometry(geometry: BufferGeometry): void {
  for (const name of ["position", "normal", "tangent"]) {
    const attribute = geometry.getAttribute(name) as Attribute | undefined;
    if (attribute !== undefined) geometry.setAttribute(name, toFloat(attribute));
  }
}

/** The glTF attribute giving each tentacle of a plant its own value (anemone.py). */
export const STRAND_ATTRIBUTE = "_STRAND";

/**
 * Per-vertex strand values (0..1, one per tentacle) for the plant shader
 * (`aStrand`), when the model has them: each tentacle then moves on its
 * own. GLTFLoader lowercases custom attribute names.
 */
export function strandAttribute(geometry: BufferGeometry): BufferAttribute | undefined {
  const name = [STRAND_ATTRIBUTE, STRAND_ATTRIBUTE.toLowerCase()].find((each) =>
    geometry.hasAttribute(each),
  );
  if (name === undefined) return undefined;
  const source = geometry.getAttribute(name);
  const values = new Float32Array(source.count);
  for (let index = 0; index < source.count; index += 1) values[index] = source.getX(index);
  return new BufferAttribute(values, 1);
}

/**
 * Per-vertex sway weights (0..1) for the plant shader (`aSway`). Reads the
 * glTF attribute `attributeName` (or its lowercased name, as `GLTFLoader`
 * stores custom `_` attributes) when painted on the mesh; otherwise falls
 * back to relative height from the geometry's base (`0`) to its top (`1`).
 */
export function swayAttribute(
  geometry: BufferGeometry,
  attributeName: string = SWAY_ATTRIBUTE,
): BufferAttribute {
  const painted = geometry.hasAttribute(attributeName)
    ? geometry.getAttribute(attributeName)
    : geometry.hasAttribute(attributeName.toLowerCase())
      ? geometry.getAttribute(attributeName.toLowerCase())
      : undefined;
  const positions = geometry.getAttribute("position");
  const count = positions.count;
  const weights = new Float32Array(count);
  if (painted?.count === count) {
    for (let index = 0; index < count; index += 1) {
      weights[index] = Math.min(Math.max(painted.getX(index), 0), 1);
    }
    return new BufferAttribute(weights, 1);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < count; index += 1) {
    const y = positions.getY(index);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = maxY - minY;
  for (let index = 0; index < count; index += 1) {
    const y = positions.getY(index);
    weights[index] = height > 0 ? Math.min(Math.max((y - minY) / height, 0), 1) : 0;
  }
  return new BufferAttribute(weights, 1);
}

/** Ensures a plant geometry has `aAcross` for `plantPatch` (0.5 = midrib). */
function ensureAcrossAttribute(geometry: BufferGeometry): void {
  if (geometry.hasAttribute("aAcross")) return;
  const count = geometry.getAttribute("position").count;
  const across = new Float32Array(count).fill(MIDRIB);
  geometry.setAttribute("aAcross", new BufferAttribute(across, 1));
}

function collectMeshes(node: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  node.traverse((child) => {
    if (isMesh(child)) meshes.push(child);
  });
  return meshes;
}

function worldBoundsOf(meshes: readonly Mesh[]): Box3 {
  const bounds = new Box3();
  const meshBounds = new Box3();
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (positions === undefined) continue;
    meshBounds.setFromBufferAttribute(positions).applyMatrix4(mesh.matrixWorld);
    bounds.union(meshBounds);
  }
  return bounds;
}

function horizontallyDisjoint(boxes: readonly Box3[]): boolean {
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (b === undefined) continue;
      const overlapsX = a.min.x < b.max.x && a.max.x > b.min.x;
      const overlapsZ = a.min.z < b.max.z && a.max.z > b.min.z;
      if (overlapsX && overlapsZ) return false;
    }
  }
  return true;
}

/**
 * Splits a root scene into variant subtrees: when top-level children with
 * meshes sit side by side (disjoint in X/Z, as `export:objects` lays out
 * seed variants), each child is its own variant; otherwise the whole scene
 * is a single variant.
 */
function variantRoots(root: Object3D): Object3D[] {
  const childrenWithMeshes = root.children.filter((child) => collectMeshes(child).length > 0);
  if (childrenWithMeshes.length <= 1) return [root];
  const boxes = childrenWithMeshes.map((child) => worldBoundsOf(collectMeshes(child)));
  return horizontallyDisjoint(boxes) ? childrenWithMeshes : [root];
}

function prepareVariant(
  variantRoot: Object3D,
  rootInverse: Matrix4,
  category: ObjectCategory,
  swayAttributeName: string,
): ObjectModelVariant | undefined {
  const meshes = collectMeshes(variantRoot);
  if (meshes.length === 0) return undefined;
  const parts: ObjectModelPart[] = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    floatGeometry(geometry);
    const matrix = new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    geometry.applyMatrix4(matrix);
    return { geometry, material: mesh.material };
  });

  const bounds = new Box3();
  const partBounds = new Box3();
  for (const part of parts) {
    const positions = part.geometry.getAttribute("position") as BufferAttribute;
    bounds.union(partBounds.setFromBufferAttribute(positions));
  }
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const span = category === "plant" ? size.y : Math.max(size.x, size.z);
  const scale = span > 0 ? 1 / span : 1;
  const normalize = new Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));

  for (const part of parts) {
    part.geometry.applyMatrix4(normalize);
    if (category === "plant") {
      part.geometry.setAttribute("aSway", swayAttribute(part.geometry, swayAttributeName));
      const strands = strandAttribute(part.geometry);
      if (strands !== undefined) part.geometry.setAttribute("aStrand", strands);
      ensureAcrossAttribute(part.geometry);
    }
    if (!part.geometry.hasAttribute("normal")) part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return { parts };
}

/**
 * Prepares a loaded glTF scene for instanced rendering as a plant (1 unit
 * tall, standing on `y = 0`, with `aSway` and `aAcross` attributes) or an
 * object (1 unit across in X/Z, standing on `y = 0`). The loaded scene is
 * left untouched so the caller can dispose its raw resources.
 */
export function prepareObjectModel(
  root: Object3D,
  category: ObjectCategory,
  swayAttributeName: string = SWAY_ATTRIBUTE,
): ObjectModelVariant[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  const variants: ObjectModelVariant[] = [];
  for (const node of variantRoots(root)) {
    const variant = prepareVariant(node, rootInverse, category, swayAttributeName);
    if (variant !== undefined) variants.push(variant);
  }
  return variants;
}

/**
 * Reads Aquaria's `traits` from a loaded glTF scene's `extras` (`userData`
 * on the scene or its nodes, where `export:objects` and Blender keep custom
 * properties) and validates them with `parseTraits`.
 */
export function extractModelTraits(
  root: Object3D,
  id: string,
  logger?: Logger,
): ObjectTraits | undefined {
  let rawTraits: unknown;
  root.traverse((node) => {
    if (rawTraits !== undefined) return;
    const data = node.userData as Record<string, unknown> | undefined;
    if (data !== undefined && "traits" in data && data.traits !== undefined) {
      rawTraits = data.traits;
    }
  });
  if (rawTraits === undefined || typeof rawTraits !== "object" || rawTraits === null) {
    return undefined;
  }
  const { traits, warnings } = parseTraits(rawTraits as Record<string, unknown>, id);
  for (const warning of warnings) logger?.warn(warning);
  return traits;
}
