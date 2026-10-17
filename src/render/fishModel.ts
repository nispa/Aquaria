import {
  Box3,
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
  for (const name of ["position", "normal"] as const) {
    const targets = geometry.morphAttributes[name];
    if (targets !== undefined) geometry.morphAttributes[name] = targets.map(toFloat);
  }
}

/**
 * Bakes the pose the bones are in (the model's rest pose; animations are not
 * played) into the geometry, as Three.js would skin it, and drops the skin
 * attributes: the engine swims the model without a skeleton.
 */
function bakeSkin(geometry: BufferGeometry, mesh: SkinnedMesh): void {
  const { bones, boneInverses } = mesh.skeleton;
  const skinIndex = toFloat(geometry.getAttribute("skinIndex"));
  const skinWeight = toFloat(geometry.getAttribute("skinWeight"));
  const indices = new Vector4();
  const weights = new Vector4();
  const blended = new Matrix4();
  const bone = new Matrix4();
  const linear = new Matrix3();
  const normalMatrix = new Matrix3();
  const vector = new Vector3();
  const transform = (
    attribute: Attribute | undefined,
    index: number,
    apply: (target: Vector3) => Vector3,
  ): void => {
    if (attribute === undefined) return;
    apply(vector.fromBufferAttribute(attribute, index));
    attribute.setXYZ(index, vector.x, vector.y, vector.z);
  };
  for (let index = 0; index < skinIndex.count; index += 1) {
    indices.fromBufferAttribute(skinIndex, index);
    weights.fromBufferAttribute(skinWeight, index);
    blended.elements.fill(0);
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = weights.getComponent(slot);
      const boneIndex = indices.getComponent(slot);
      const boneObject = bones[boneIndex];
      const inverse = boneInverses[boneIndex];
      if (weight === 0 || boneObject === undefined || inverse === undefined) continue;
      bone.multiplyMatrices(boneObject.matrixWorld, inverse);
      for (let element = 0; element < 16; element += 1) {
        blended.elements[element] =
          (blended.elements[element] ?? 0) + (bone.elements[element] ?? 0) * weight;
      }
    }
    blended.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    linear.setFromMatrix4(blended);
    normalMatrix.getNormalMatrix(blended);
    transform(geometry.getAttribute("position"), index, (target) => target.applyMatrix4(blended));
    transform(geometry.getAttribute("normal"), index, (target) =>
      target.applyMatrix3(normalMatrix).normalize(),
    );
    transform(geometry.getAttribute("tangent"), index, (target) =>
      target.applyMatrix3(linear).normalize(),
    );
    for (const target of geometry.morphAttributes.position ?? []) {
      transform(target, index, (offset) => offset.applyMatrix3(linear));
    }
  }
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
}

/**
 * Morph targets are offsets (glTF stores them relative), so they turn and
 * scale with the model but do not move with it.
 */
function transformMorphTargets(geometry: BufferGeometry, matrix: Matrix4): void {
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
  apply(geometry.morphAttributes.position, linear, false);
  apply(geometry.morphAttributes.normal, normals, true);
}

/** Copies a mesh's geometry into the model root's frame, morph targets included. */
function bakeGeometry(mesh: Mesh, frame: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.clone();
  floatGeometry(geometry);
  if (isSkinnedMesh(mesh)) bakeSkin(geometry, mesh);
  const matrix = new Matrix4().multiplyMatrices(frame, mesh.matrixWorld);
  geometry.applyMatrix4(matrix);
  transformMorphTargets(geometry, matrix);
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
 * length along x; returns the matrix it applied.
 */
function normalizeToBodyLength(geometries: readonly BufferGeometry[]): Matrix4 {
  // From the rest positions only: Three.js' own bounding box also grows to
  // hold every morph target, and an open mouth must not shrink the fish.
  const bounds = new Box3();
  const partBounds = new Box3();
  for (const geometry of geometries) {
    bounds.union(
      partBounds.setFromBufferAttribute(geometry.getAttribute("position") as BufferAttribute),
    );
  }
  const centre = bounds.getCenter(new Vector3());
  const length = bounds.max.x - bounds.min.x;
  const scale = length > 0 ? 1 / length : 1;
  const matrix = new Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  for (const geometry of geometries) {
    geometry.applyMatrix4(matrix);
    transformMorphTargets(geometry, new Matrix4().makeScale(scale, scale, scale));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return matrix;
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
  for (const { geometry } of parts) {
    if (geometry.hasAttribute("aEyeCenter")) {
      (geometry.getAttribute("aEyeCenter") as BufferAttribute).applyMatrix4(normalize);
    }
  }
  return parts;
}
