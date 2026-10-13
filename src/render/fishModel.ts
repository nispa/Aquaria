import {
  Box3,
  Matrix3,
  Matrix4,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
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
  const matrix = new Matrix4().multiplyMatrices(frame, mesh.matrixWorld);
  geometry.applyMatrix4(matrix);
  transformMorphTargets(geometry, matrix);
  return geometry;
}

/** Centres the parts on their joint bounding box and scales them to one body length along x. */
function normalizeToBodyLength(geometries: readonly BufferGeometry[]): void {
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
  const parts = meshes.map((mesh) => {
    const morphTarget = manifest.mouth?.morphTarget;
    return {
      geometry: bakeGeometry(mesh, frame),
      material: mesh.material,
      mouthMorphIndex:
        morphTarget === undefined ? undefined : mesh.morphTargetDictionary?.[morphTarget],
    };
  });
  normalizeToBodyLength(parts.map((part) => part.geometry));
  return parts;
}
