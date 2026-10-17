import {
  AnimationClip,
  Box3,
  Matrix4,
  PropertyBinding,
  Vector3,
  type KeyframeTrack,
  type Object3D,
} from "three";
import type { ModelManifest } from "../scene/modelManifest";
import { modelAxisFrame } from "./fishModel";

/**
 * Animated models (not fish): sea turtles, crabs. Unlike fish, which are
 * instanced and swum by a shader, each one is a skinned model of its own
 * that plays its glTF clips; there are only a few of them.
 */

/** A clip that carries a bone further than this share of the model's size moves the animal itself. */
const ROOT_MOTION_SHARE = 0.25;
const POSITION = "position";

/** How far a position track moves its bone along its widest axis, in the bone's parent's units. */
function travelOf(track: KeyframeTrack): number {
  const { values } = track;
  let widest = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    let low = Infinity;
    let high = -Infinity;
    for (let index = axis; index < values.length; index += 3) {
      const value = values[index] ?? 0;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    widest = Math.max(widest, high - low);
  }
  return widest;
}

/**
 * A copy of `clip` in which bones it carries far (further than a quarter of
 * the model's `size`, measured at the bone's scale in the model) stay where
 * the clip starts them: Aquaria moves the animal itself, so a clip's own
 * travel would make it run off. Small moves (a body bobbing as legs step,
 * breathing) are kept.
 */
export function pinRootMotion(clip: AnimationClip, root: Object3D, size: number): AnimationClip {
  root.updateWorldMatrix(true, true);
  const scale = new Vector3();
  const tracks = clip.tracks.map((track) => {
    const binding = PropertyBinding.parseTrackName(track.name);
    if (binding.propertyName !== POSITION) return track;
    const node = PropertyBinding.findNode(root, binding.nodeName) as Object3D | undefined;
    const parentScale = node?.parent?.getWorldScale(scale).x ?? 1;
    if (travelOf(track) * parentScale <= size * ROOT_MOTION_SHARE) return track;
    const pinned = track.clone();
    const { values } = pinned;
    for (let index = 3; index < values.length; index += 1) values[index] = values[index % 3] ?? 0;
    return pinned;
  });
  return new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

export interface AnimatedModelFrame {
  /** Turns the model so it faces +x with its back up, and scales it to one unit long. */
  readonly matrix: Matrix4;
  /** The model's length along its forward axis, in its own units. */
  readonly length: number;
}

/**
 * How to place a loaded model: turned by its manifest's axes to face +x,
 * centred, and scaled to one unit long, so an animal of any length is the
 * frame scaled by its length.
 */
export function animatedModelFrame(root: Object3D, manifest: ModelManifest): AnimatedModelFrame {
  root.updateWorldMatrix(true, true);
  const axes = modelAxisFrame(manifest.forward, manifest.up);
  const bounds = new Box3().setFromObject(root).applyMatrix4(axes);
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  const length = size.x > 0 ? size.x : 1;
  const matrix = new Matrix4()
    .makeScale(1 / length, 1 / length, 1 / length)
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    .multiply(axes);
  return { matrix, length };
}
