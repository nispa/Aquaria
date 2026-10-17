import { AnimationClip, Bone, Group, VectorKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { pinRootMotion } from "./animatedModel";

/** A model 1 m across with one bone, animated by a position track going `travel` along y. */
function animated(travel: number): { root: Group; clip: AnimationClip } {
  const root = new Group();
  const bone = new Bone();
  bone.name = "Body";
  root.add(bone);
  const track = new VectorKeyframeTrack(
    "Body.position",
    [0, 1, 2],
    [0, 0, 0, 0, travel / 2, 0, 0, travel, 0],
  );
  return { root, clip: new AnimationClip("Swim", 2, [track]) };
}

describe("pinRootMotion", () => {
  it("pins a bone the clip carries far away, where it starts", () => {
    const { root, clip } = animated(4);

    const pinned = pinRootMotion(clip, root, 1);

    expect(Array.from(pinned.tracks[0]?.values ?? [])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("keeps a bone that only bobs, as breathing or walking does", () => {
    const { root, clip } = animated(0.05);

    const pinned = pinRootMotion(clip, root, 1);

    // The track keeps 32-bit values, as glTF does.
    const bobbing = Array.from(new Float32Array([0, 0, 0, 0, 0.025, 0, 0, 0.05, 0]));
    expect(Array.from(pinned.tracks[0]?.values ?? [])).toEqual(bobbing);
  });

  it("measures the travel at the bone's scale in the model", () => {
    const { root, clip } = animated(4);
    root.scale.setScalar(0.01);

    const pinned = pinRootMotion(clip, root, 1);

    expect(pinned.tracks[0]?.values[7]).toBe(4);
  });

  it("leaves the clip it was given untouched", () => {
    const { root, clip } = animated(4);

    pinRootMotion(clip, root, 1);

    expect(clip.tracks[0]?.values[7]).toBe(4);
  });
});
