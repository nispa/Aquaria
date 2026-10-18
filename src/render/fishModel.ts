import {
  BufferAttribute,
  Matrix3,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PropertyBinding,
  Vector3,
  Vector4,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from "three";
import type { ModelAxis, ModelManifest } from "../scene/modelManifest";
import { pectoralWeights } from "./pectoralWeights";

/** One mesh of a fish model, in the fish frame shared with the procedural bodies. */
export interface FishModelPart {
  /** A copy of the model's geometry: one body length along +x, snout at +0.5, dorsal fin up. */
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** Index of the morph target that opens the mouth, if this part has it. */
  readonly mouthMorphIndex: number | undefined;
}

const AXES: Readonly<Record<ModelAxis, Vector3>> = {
  "+x": new Vector3(1, 0, 0),
  "-x": new Vector3(-1, 0, 0),
  "+y": new Vector3(0, 1, 0),
  "-y": new Vector3(0, -1, 0),
  "+z": new Vector3(0, 0, 1),
  "-z": new Vector3(0, 0, -1),
};

/** Rotation that turns the model's forward axis into +x and its up axis into +y. */
export function modelAxisFrame(forward: ModelAxis, up: ModelAxis): Matrix4 {
  const front = AXES[forward];
  const top = AXES[up];
  const side = new Vector3().crossVectors(front, top);
  // The basis maps the fish frame onto the model's axes; a rotation's inverse is its transpose.
  return new Matrix4().makeBasis(front, top, side).transpose();
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

function isSkinnedMesh(mesh: Mesh): mesh is SkinnedMesh {
  return (mesh as Partial<SkinnedMesh>).isSkinnedMesh === true;
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/**
 * Compressed models store positions and normals as normalized integers, which
 * cannot hold values outside -1..1 once the model is moved and scaled.
 */
function toFloat(attribute: Attribute): BufferAttribute {
  if (attribute instanceof BufferAttribute && attribute.array instanceof Float32Array) {
    return attribute;
  }
  const { count, itemSize } = attribute;
  const values = new Float32Array(count * itemSize);
  if (attribute instanceof BufferAttribute) {
    // One division per value, as Three.js denormalizes, without its per-value type checks:
    // a model's worth of getComponent calls took a phone a quarter of a second.
    const source = attribute.array;
    const { divisor, signed } = attribute.normalized ? normalizedRange(source) : WHOLE_VALUES;
    for (let index = 0; index < values.length; index += 1) {
      const value = (source[index] ?? 0) / divisor;
      values[index] = signed ? Math.max(value, -1) : value;
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      for (let component = 0; component < itemSize; component += 1) {
        values[index * itemSize + component] = attribute.getComponent(index, component);
      }
    }
  }
  return new BufferAttribute(values, itemSize);
}

interface NormalizedRange {
  /** The stored value that stands for 1. */
  readonly divisor: number;
  /** Signed types reach one step further below 0 than above; that end is clamped to -1. */
  readonly signed: boolean;
}

const WHOLE_VALUES: NormalizedRange = { divisor: 1, signed: false };

/** How a normalized integer array maps to -1..1 or 0..1, as in Three.js' MathUtils.denormalize. */
function normalizedRange(array: ArrayLike<number>): NormalizedRange {
  if (array instanceof Uint32Array) return { divisor: 4294967295, signed: false };
  if (array instanceof Uint16Array) return { divisor: 65535, signed: false };
  if (array instanceof Uint8Array) return { divisor: 255, signed: false };
  if (array instanceof Int32Array) return { divisor: 2147483647, signed: true };
  if (array instanceof Int16Array) return { divisor: 32767, signed: true };
  if (array instanceof Int8Array) return { divisor: 127, signed: true };
  return WHOLE_VALUES;
}

function floatGeometry(geometry: BufferGeometry): void {
  for (const name of ["position", "normal", "tangent"]) {
    const attribute = geometry.getAttribute(name) as Attribute | undefined;
    if (attribute !== undefined) geometry.setAttribute(name, toFloat(attribute));
  }
  for (const name of ["position", "normal"] as const) {
    const targets = geometry.morphAttributes[name];
    if (targets !== undefined) geometry.morphAttributes[name] = targets.map(toFloat);
  }
}

/** Elements of a 4x4 matrix, column-major as in Three.js. */
type Elements = readonly number[];

/** The vector at `offset` in `values` turned by the upper 3x3 of `matrix`, normalized if asked. */
function turn(values: Float32Array, offset: number, matrix: Elements, normalize: boolean): void {
  const x = values[offset] ?? 0;
  const y = values[offset + 1] ?? 0;
  const z = values[offset + 2] ?? 0;
  let tx = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z;
  let ty = (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z;
  let tz = (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z;
  if (normalize) {
    const length = Math.hypot(tx, ty, tz) || 1;
    tx /= length;
    ty /= length;
    tz /= length;
  }
  values[offset] = tx;
  values[offset + 1] = ty;
  values[offset + 2] = tz;
}

/**
 * Bakes the pose the bones are in (the model's rest pose; animations are not
 * played) into the geometry, as Three.js would skin it, then moves it by
 * `place`, and drops the skin attributes: the engine swims the model without
 * a skeleton. Skinning is linear in the bone matrices, so the bind matrices
 * and `place` fold into one matrix per bone and each vertex is visited once;
 * vertex by vertex with Three.js' helpers, a model stalled a phone for most
 * of a second.
 */
function bakeSkin(geometry: BufferGeometry, mesh: SkinnedMesh, place: Matrix4): void {
  const { bones, boneInverses } = mesh.skeleton;
  const boneMatrices = bones.map((bone, index) => {
    const inverse = boneInverses[index];
    if (inverse === undefined) return undefined;
    return new Matrix4()
      .multiplyMatrices(bone.matrixWorld, inverse)
      .premultiply(mesh.bindMatrixInverse)
      .multiply(mesh.bindMatrix)
      .premultiply(place).elements;
  });
  const indices = toFloat(geometry.getAttribute("skinIndex")).array;
  const weights = toFloat(geometry.getAttribute("skinWeight")).array;
  const floats = (attribute: Attribute | undefined): Float32Array | undefined =>
    attribute === undefined ? undefined : (toFloat(attribute).array as Float32Array);
  // floatGeometry has made these Float32 already: writing to the arrays writes the geometry.
  const positions = floats(geometry.getAttribute("position"));
  const normals = floats(geometry.getAttribute("normal"));
  const tangents = floats(geometry.getAttribute("tangent"));
  const morphs = (geometry.morphAttributes.position ?? []).map((target) => floats(target));
  const blended = new Array<number>(16).fill(0);
  const count = indices.length / 4;
  for (let vertex = 0; vertex < count; vertex += 1) {
    blended.fill(0);
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = weights[vertex * 4 + slot] ?? 0;
      const matrix = boneMatrices[indices[vertex * 4 + slot] ?? -1];
      if (weight === 0 || matrix === undefined) continue;
      for (let element = 0; element < 16; element += 1) {
        blended[element] = (blended[element] ?? 0) + (matrix[element] ?? 0) * weight;
      }
    }
    if (positions !== undefined) placePoint(positions, vertex * 3, blended);
    if (normals !== undefined) turnNormal(normals, vertex * 3, blended);
    if (tangents !== undefined) turn(tangents, vertex * 4, blended, true);
    for (const morph of morphs) {
      if (morph !== undefined) turn(morph, vertex * 3, blended, false);
    }
  }
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  // Moved without applyMatrix4: bounds the loader computed are stale.
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
}

/** The point at `offset` in `values` moved by `matrix`, as Vector3.applyMatrix4. */
function placePoint(values: Float32Array, offset: number, matrix: Elements): void {
  const x = values[offset] ?? 0;
  const y = values[offset + 1] ?? 0;
  const z = values[offset + 2] ?? 0;
  const w =
    1 / ((matrix[3] ?? 0) * x + (matrix[7] ?? 0) * y + (matrix[11] ?? 0) * z + (matrix[15] ?? 0));
  values[offset] =
    ((matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0)) * w;
  values[offset + 1] =
    ((matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0)) * w;
  values[offset + 2] =
    ((matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0)) * w;
}

/**
 * The normal at `offset` in `values` turned by the inverse transpose of the
 * upper 3x3 of `matrix` and normalized, as Three.js' normal matrix does: the
 * columns' cross products over the determinant, zero when it is singular.
 */
function turnNormal(values: Float32Array, offset: number, matrix: Elements): void {
  const [m0 = 0, m1 = 0, m2 = 0, , m4 = 0, m5 = 0, m6 = 0, , m8 = 0, m9 = 0, m10 = 0] = matrix;
  const x = values[offset] ?? 0;
  const y = values[offset + 1] ?? 0;
  const z = values[offset + 2] ?? 0;
  const ax = m5 * m10 - m6 * m9;
  const ay = m6 * m8 - m4 * m10;
  const az = m4 * m9 - m5 * m8;
  const bx = m9 * m2 - m10 * m1;
  const by = m10 * m0 - m8 * m2;
  const bz = m8 * m1 - m9 * m0;
  const cx = m1 * m6 - m2 * m5;
  const cy = m2 * m4 - m0 * m6;
  const cz = m0 * m5 - m1 * m4;
  const determinant = m0 * ax + m1 * ay + m2 * az;
  const scale = determinant === 0 ? 0 : 1 / determinant;
  const nx = (ax * x + bx * y + cx * z) * scale;
  const ny = (ay * x + by * y + cy * z) * scale;
  const nz = (az * x + bz * y + cz * z) * scale;
  const length = Math.hypot(nx, ny, nz) || 1;
  values[offset] = nx / length;
  values[offset + 1] = ny / length;
  values[offset + 2] = nz / length;
}

/**
 * Morph targets are offsets (glTF stores them relative), so they turn and
 * scale with the model but do not move with it.
 */
function transformMorphTargets(geometry: BufferGeometry, matrix: Matrix4, positions = true): void {
  const linear = new Matrix3().setFromMatrix4(matrix);
  const normals = new Matrix3().getNormalMatrix(matrix);
  const offset = new Vector3();
  const apply = (
    attributes: readonly (BufferAttribute | InterleavedBufferAttribute)[] | undefined,
    transform: Matrix3,
    normalize: boolean,
  ): void => {
    for (const attribute of attributes ?? []) {
      for (let index = 0; index < attribute.count; index += 1) {
        offset.fromBufferAttribute(attribute, index).applyMatrix3(transform);
        if (normalize && !geometry.morphTargetsRelative) offset.normalize();
        attribute.setXYZ(index, offset.x, offset.y, offset.z);
      }
    }
  };
  if (positions) apply(geometry.morphAttributes.position, linear, false);
  apply(geometry.morphAttributes.normal, normals, true);
}

/** Copies a mesh's geometry into the model root's frame, morph targets included. */
function bakeGeometry(mesh: Mesh, frame: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.clone();
  floatGeometry(geometry);
  const matrix = new Matrix4().multiplyMatrices(frame, mesh.matrixWorld);
  if (isSkinnedMesh(mesh) && geometry.hasAttribute("skinIndex")) {
    // Skinning places the vertices and position offsets; normal offsets are not skinned.
    bakeSkin(geometry, mesh, matrix);
    transformMorphTargets(geometry, matrix, false);
  } else {
    geometry.applyMatrix4(matrix);
    transformMorphTargets(geometry, matrix);
  }
  return geometry;
}

/**
 * Whether a bone is one the manifest names. The glTF loader drops the dots
 * from node names (Blender's "Eye.L" arrives as "EyeL"), so both are matched.
 */
function namedIn(names: readonly string[], bone: Object3D): boolean {
  return names.some(
    (name) => name === bone.name || PropertyBinding.sanitizeNodeName(name) === bone.name,
  );
}

/**
 * Eye attributes of one mesh, set on its baked `geometry`, for the eye patch: how much of each vertex
 * belongs to the eye bones (aEyeWeight, 0..1) and the point it turns about,
 * the weighted heads of those bones in the root's frame (aEyeCenter). A
 * mesh without a skeleton has no eye in it: all weights 0.
 */
function eyeAttributes(
  mesh: Mesh,
  geometry: BufferGeometry,
  eyeBones: readonly string[],
  frame: Matrix4,
): void {
  const count = geometry.getAttribute("position").count;
  const weights = new Float32Array(count);
  const centres = new Float32Array(count * 3);
  if (isSkinnedMesh(mesh) && mesh.geometry.hasAttribute("skinIndex")) {
    const bones = mesh.skeleton.bones;
    const heads = bones.map((bone) =>
      namedIn(eyeBones, bone)
        ? bone.getWorldPosition(new Vector3()).applyMatrix4(frame)
        : undefined,
    );
    const skinIndex = toFloat(mesh.geometry.getAttribute("skinIndex"));
    const skinWeight = toFloat(mesh.geometry.getAttribute("skinWeight"));
    const indices = new Vector4();
    const shares = new Vector4();
    const centre = new Vector3();
    for (let index = 0; index < count; index += 1) {
      indices.fromBufferAttribute(skinIndex, index);
      shares.fromBufferAttribute(skinWeight, index);
      let total = 0;
      centre.set(0, 0, 0);
      for (let slot = 0; slot < 4; slot += 1) {
        const head = heads[indices.getComponent(slot)];
        const share = shares.getComponent(slot);
        if (head === undefined || share === 0) continue;
        total += share;
        centre.addScaledVector(head, share);
      }
      weights[index] = Math.min(total, 1);
      if (total > 0) centre.divideScalar(total).toArray(centres, index * 3);
    }
  }
  geometry.setAttribute("aEyeWeight", new BufferAttribute(weights, 1));
  geometry.setAttribute("aEyeCenter", new BufferAttribute(centres, 3));
}

/**
 * Centres the parts on their joint bounding box and scales them to one body
 * length along x; returns the matrix it applied. Written as plain loops over
 * the arrays: Three.js' per-vertex helpers made this a third of a second on
 * a phone.
 */
function normalizeToBodyLength(geometries: readonly BufferGeometry[]): Matrix4 {
  // From the rest positions only: Three.js' own bounding box also grows to
  // hold every morph target, and an open mouth must not shrink the fish.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const geometry of geometries) {
    const positions = toFloat(geometry.getAttribute("position")).array;
    for (let index = 0; index < positions.length; index += 1) {
      const value = positions[index] ?? 0;
      const axis = index % 3;
      if (value < (min[axis] ?? 0)) min[axis] = value;
      if (value > (max[axis] ?? 0)) max[axis] = value;
    }
  }
  const [minX = 0, minY = 0, minZ = 0] = min;
  const [maxX = 0, maxY = 0, maxZ = 0] = max;
  const centre = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const length = maxX - minX;
  const scale = length > 0 ? 1 / length : 1;
  for (const geometry of geometries) {
    const position = toFloat(geometry.getAttribute("position"));
    const positions = position.array;
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] = ((positions[index] ?? 0) - (centre[index % 3] ?? 0)) * scale;
    }
    position.needsUpdate = true;
    // Offsets scale but do not move. Normals keep their direction under a
    // uniform scale; relative normal offsets shrink by it, as the normal
    // matrix would have them.
    for (const target of geometry.morphAttributes.position ?? []) {
      const offsets = toFloat(target).array;
      for (let index = 0; index < offsets.length; index += 1) {
        offsets[index] = (offsets[index] ?? 0) * scale;
      }
    }
    if (geometry.morphTargetsRelative) {
      for (const target of geometry.morphAttributes.normal ?? []) {
        const offsets = toFloat(target).array;
        for (let index = 0; index < offsets.length; index += 1) {
          offsets[index] = (offsets[index] ?? 0) / scale;
        }
      }
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  const [centreX = 0, centreY = 0, centreZ = 0] = centre;
  return new Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-centreX, -centreY, -centreZ));
}

/** A scan's painted-in light is no light at all in the tank: matte, it is lit like the rest. */
const SCAN_ROUGHNESS = 1;

/**
 * The material a part is drawn with. One drawn unlit (scans often are, their
 * light painted into the texture) becomes a lit one with the same colors,
 * so the tank's lights, fog and caustics reach it like every other body.
 */
export function litMaterial(material: Material): Material {
  if (!(material instanceof MeshBasicMaterial)) return material;
  return new MeshStandardMaterial({
    name: material.name,
    color: material.color,
    map: material.map,
    alphaMap: material.alphaMap,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    roughness: SCAN_ROUGHNESS,
    metalness: 0,
  });
}

/**
 * Turns a loaded glTF scene into fish parts that swim like the procedural
 * bodies: oriented by the manifest, one body length long, snout at x = +0.5.
 * The loaded scene is left untouched.
 */
export function prepareFishModel(root: Object3D, manifest: ModelManifest): FishModelPart[] {
  root.updateWorldMatrix(true, true);
  // The root's own placement does not matter: the model is re-centred anyway.
  const frame = modelAxisFrame(manifest.forward, manifest.up).multiply(
    new Matrix4().copy(root.matrixWorld).invert(),
  );
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (isMesh(object)) meshes.push(object);
  });
  const eyeBones = manifest.eyes?.bones;
  const parts = meshes.map((mesh) => {
    const morphTarget = manifest.mouth?.morphTarget;
    const geometry = bakeGeometry(mesh, frame);
    if (eyeBones !== undefined) eyeAttributes(mesh, geometry, eyeBones, frame);
    return {
      geometry,
      material: Array.isArray(mesh.material)
        ? mesh.material.map(litMaterial)
        : litMaterial(mesh.material),
      mouthMorphIndex:
        morphTarget === undefined ? undefined : mesh.morphTargetDictionary?.[morphTarget],
    };
  });
  const normalize = normalizeToBodyLength(parts.map((part) => part.geometry));
  const pectoral = manifest.fins?.pectoral;
  for (const { geometry } of parts) {
    if (geometry.hasAttribute("aEyeCenter")) {
      (geometry.getAttribute("aEyeCenter") as BufferAttribute).applyMatrix4(normalize);
    }
    if (pectoral !== undefined) {
      const positions = geometry.getAttribute("position").array;
      geometry.setAttribute(
        "aPectoral",
        new BufferAttribute(pectoralWeights(positions, pectoral), 1),
      );
    }
  }
  return parts;
}
