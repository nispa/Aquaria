import {
  AnimationMixer,
  Euler,
  Group,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ModelManifest } from "../scene/modelManifest";
import type { Fish } from "../sim/simulation";
import { animatedModelFrame, clipSeconds, pinRootMotion } from "./animatedModel";
import { litMaterial } from "./fishModel";

/**
 * The bodies of a species whose model walks (crabs): one skinned copy of
 * the model per individual, playing its walk clip in step with the animal's
 * pace and holding it while the animal stands. Unlike fish, which are
 * instanced and swum by a shader, there are only a few of them.
 */
export interface WalkingBodies {
  readonly group: Group;
  /** Places and animates the bodies for `fish`, hiding the spare ones. Allocation-free. */
  update(fish: readonly Fish[], seconds: number): void;
  /** Stops the clips; the loaded model's geometry and materials are freed by its owner. */
  dispose(): void;
}

interface Body {
  /** Placed where the animal is, turned the way it faces. */
  readonly carrier: Group;
  readonly mixer: AnimationMixer;
}

const materialsOf = (material: Material | Material[]): Material[] =>
  Array.isArray(material) ? material : [material];

/** The clip a walking model plays: its walk, else its idle, else its first. */
function walkClip(
  clips: readonly AnimationClip[],
  manifest: ModelManifest,
): AnimationClip | undefined {
  const name = manifest.animations?.walk ?? manifest.animations?.idle;
  return clips.find((clip) => clip.name === name) ?? clips[0];
}

/** Gives the model's unlit materials (scans) light, like the instanced bodies get. */
function lightUp(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Partial<Mesh>;
    if (mesh.isMesh !== true || mesh.material === undefined) return;
    const lit = materialsOf(mesh.material).map(litMaterial);
    (node as Mesh).material = Array.isArray(mesh.material) ? lit : (lit[0] ?? mesh.material);
  });
}

/** `count` walking bodies of the loaded `root`, named `name`. */
export function createWalkingBodies(
  name: string,
  root: Object3D,
  clips: readonly AnimationClip[],
  manifest: ModelManifest,
  count: number,
): WalkingBodies {
  lightUp(root);
  const frame = animatedModelFrame(root, manifest);
  const found = walkClip(clips, manifest);
  const clip =
    found === undefined || manifest.animations?.inPlace === false
      ? found
      : pinRootMotion(found, root, frame.length);
  const pace = manifest.animations?.speed ?? 1;
  const group = new Group();
  group.name = name;
  const bodies: Body[] = [];
  for (let index = 0; index < count; index += 1) {
    const body = cloneSkinned(root);
    body.traverse((node) => {
      const mesh = node as Partial<Mesh>;
      if (mesh.isMesh !== true) return;
      // Skinned meshes move away from their bind-pose bounds.
      node.frustumCulled = false;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    const placed = new Group();
    placed.matrixAutoUpdate = false;
    placed.matrix.copy(frame.matrix);
    placed.add(body);
    const carrier = new Group();
    carrier.visible = false;
    carrier.add(placed);
    group.add(carrier);
    const mixer = new AnimationMixer(body);
    const action: AnimationAction | undefined =
      clip === undefined ? undefined : mixer.clipAction(clip);
    // Each starts somewhere in its stride, so a group does not step in time.
    if (action !== undefined && clip !== undefined) {
      action.play();
      mixer.setTime((clip.duration * index) / Math.max(count, 1));
    }
    bodies.push({ carrier, mixer });
  }
  const turn = new Euler(0, 0, 0, "YZX");

  return {
    group,
    update(fish, seconds) {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const individual = fish[index];
        if (body === undefined) continue;
        body.carrier.visible = individual !== undefined && individual.opacity > 0;
        if (individual === undefined) continue;
        body.carrier.position.copy(individual.position);
        turn.set(individual.roll, -individual.facing, 0);
        body.carrier.rotation.copy(turn);
        body.carrier.scale.setScalar(individual.length);
        const speed = individual.still ? 0 : individual.velocity.length();
        body.mixer.update(clipSeconds(seconds, speed, individual.length, pace));
      }
    },
    dispose() {
      for (const body of bodies) body.mixer.stopAllAction();
      group.clear();
    },
  };
}
