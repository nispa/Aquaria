import {
  AnimationMixer,
  Color,
  Euler,
  Group,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Coloring, ModelManifest } from "../scene/modelManifest";
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
  readonly walk: AnimationAction | undefined;
  readonly hide: AnimationAction | undefined;
  /** 0 out, 1 all the way into its shell. */
  withdrawn: number;
  /** Its own copies of the materials the colorings name, with their color in each. */
  readonly tinted: readonly TintedMaterial[];
  /** The coloring it shows, -1 before the first. */
  coloring: number;
}

interface TintedMaterial {
  readonly material: Material & { color: Color };
  readonly colors: readonly Color[];
}

/** Seconds a body takes to pull into its shell, or to come out of it. */
const WITHDRAW_SECONDS = 0.4;

/**
 * How far into its shell a body is after `seconds`, from `current` (0 out ..
 * 1 in): it pulls in while `hiding`, and comes out again after.
 */
export function withdrawal(current: number, hiding: boolean, seconds: number): number {
  const step = seconds / WITHDRAW_SECONDS;
  return hiding ? Math.min(current + step, 1) : Math.max(current - step, 0);
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

const hasColor = (material: Material): material is Material & { color: Color } =>
  "color" in material && material.color instanceof Color;

/**
 * Gives a body its own copy of each material the colorings name, so it can
 * wear its animal's coloring; the colors of a material are, in the order of
 * `worn`, the one each coloring names, else the material's own.
 */
function tintMaterials(body: Object3D, worn: readonly Coloring[]): TintedMaterial[] {
  const tinted: TintedMaterial[] = [];
  const own = (material: Material): Material => {
    if (!hasColor(material)) return material;
    const named = worn.map((coloring) => coloring.materials?.[material.name]);
    if (named.every((color) => color === undefined)) return material;
    const copy = material.clone();
    tinted.push({
      material: copy,
      colors: named.map((color) => (color === undefined ? copy.color.clone() : new Color(color))),
    });
    return copy;
  };
  body.traverse((node) => {
    const mesh = node as Partial<Mesh>;
    if (mesh.isMesh !== true || mesh.material === undefined) return;
    (node as Mesh).material = Array.isArray(mesh.material)
      ? mesh.material.map(own)
      : own(mesh.material);
  });
  return tinted;
}

/**
 * `count` walking bodies of the loaded `root`, named `name`; each wears the
 * plain colors of its animal's coloring, from the colorings its species wears.
 */
export function createWalkingBodies(
  name: string,
  root: Object3D,
  clips: readonly AnimationClip[],
  manifest: ModelManifest,
  count: number,
  worn: readonly Coloring[] = [],
): WalkingBodies {
  lightUp(root);
  const frame = animatedModelFrame(root, manifest);
  const found = walkClip(clips, manifest);
  const clip =
    found === undefined || manifest.animations?.inPlace === false
      ? found
      : pinRootMotion(found, root, frame.length);
  const pace = manifest.animations?.speed ?? 1;
  const hideName = manifest.animations?.hide;
  const hideClip = clips.find((candidate) => candidate.name === hideName);
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
    const walk = clip === undefined ? undefined : mixer.clipAction(clip);
    const hide = hideClip === undefined ? undefined : mixer.clipAction(hideClip);
    hide?.setEffectiveWeight(0).play();
    // Each starts somewhere in its stride, so a group does not step in time.
    if (walk !== undefined && clip !== undefined) {
      walk.play();
      mixer.setTime((clip.duration * index) / Math.max(count, 1));
    }
    bodies.push({
      carrier,
      mixer,
      walk,
      hide,
      withdrawn: 0,
      tinted: tintMaterials(body, worn),
      coloring: -1,
    });
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
        if (body.coloring !== individual.coloring) {
          body.coloring = individual.coloring;
          for (const { material, colors } of body.tinted) {
            const color = colors[Math.min(individual.coloring, colors.length - 1)];
            if (color !== undefined) material.color.copy(color);
          }
        }
        const speed = individual.still ? 0 : individual.velocity.length();
        if (body.hide !== undefined) {
          const hiding = individual.swim.withdraws && individual.hiding > 0;
          body.withdrawn = withdrawal(body.withdrawn, hiding, seconds);
          body.hide.setEffectiveWeight(body.withdrawn);
          body.walk?.setEffectiveWeight(1 - body.withdrawn);
        }
        body.mixer.update(clipSeconds(seconds, speed, individual.length, pace));
      }
    },
    dispose() {
      for (const body of bodies) {
        body.mixer.stopAllAction();
        for (const { material } of body.tinted) material.dispose();
      }
      group.clear();
    },
  };
}
