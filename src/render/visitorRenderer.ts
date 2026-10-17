import type { Mesh } from "three";
import {
  AnimationMixer,
  Group,
  Texture,
  type AnimationClip,
  type Material,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Logger } from "../core/logger";
import type { ModelManifest } from "../scene/modelManifest";
import type { VisitorState } from "../sim/visitors";
import { animatedModelFrame, clipSeconds, pinRootMotion } from "./animatedModel";

/** Loads a model's manifest and its glTF scene with its clips; injected by the app. */
export type AnimalLoader = (id: string) => Promise<{
  readonly manifest: ModelManifest;
  readonly root: Object3D;
  readonly clips: readonly AnimationClip[];
}>;

export interface VisitorRenderer {
  readonly object: Group;
  /** Places and animates the visitors; `seconds` since the last frame. Allocation-free. */
  update(visitors: readonly VisitorState[], seconds: number): void;
  /** Resolves when every visitor's model has loaded or failed. */
  settled(): Promise<void>;
  dispose(): void;
}

interface Body {
  /** Placed where the visitor is, turned the way it goes. */
  readonly carrier: Group;
  readonly mixer: AnimationMixer;
  /** Body lengths a second at which its clip plays at its own pace. */
  readonly pace: number;
}

/** Turns as the visitor goes, but never pitches steeper than this, radians. */
const MAX_PITCH = 0.35;

const materialsOf = (material: Material | Material[]): Material[] =>
  Array.isArray(material) ? material : [material];

/**
 * The visitors far behind the tank (sim/visitors): each a skinned glTF model
 * of its own, swimming with its clip, faster or slower as it goes. A model
 * that fails to load leaves its visitors out, with a warning.
 */
export function createVisitorRenderer(
  visitors: readonly VisitorState[],
  load: AnimalLoader,
  logger: Logger,
): VisitorRenderer {
  const object = new Group();
  object.name = "visitors";
  const bodies: (Body | undefined)[] = visitors.map(() => undefined);
  const loaded: Object3D[] = [];
  let disposed = false;

  const models = [...new Set(visitors.map((visitor) => visitor.model))];
  const loading = models.map(async (model) => {
    try {
      const { manifest, root, clips } = await load(model);
      if (disposed) return;
      loaded.push(root);
      const frame = animatedModelFrame(root, manifest);
      const name = manifest.animations?.swim ?? manifest.animations?.idle;
      const found = clips.find((clip) => clip.name === name) ?? clips[0];
      const clip =
        found === undefined || manifest.animations?.inPlace === false
          ? found
          : pinRootMotion(found, root, frame.length);
      visitors.forEach((visitor, index) => {
        if (visitor.model !== model) return;
        const body = cloneSkinned(root);
        body.traverse((node) => {
          // Skinned meshes move away from their bind-pose bounds; they are few and far.
          if ((node as Partial<Mesh>).isMesh === true) node.frustumCulled = false;
        });
        const placed = new Group();
        placed.matrixAutoUpdate = false;
        placed.matrix.copy(frame.matrix);
        placed.add(body);
        const carrier = new Group();
        carrier.visible = false;
        carrier.add(placed);
        object.add(carrier);
        const mixer = new AnimationMixer(body);
        if (clip !== undefined) mixer.clipAction(clip).play();
        bodies[index] = { carrier, mixer, pace: manifest.animations?.speed ?? 1 };
      });
    } catch (error) {
      logger.warn("Visitor model could not be loaded", { model, error: String(error) });
    }
  });

  return {
    object,
    update(current, seconds) {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const visitor = current[index];
        if (body === undefined || visitor === undefined) continue;
        body.carrier.visible = visitor.visible;
        if (!visitor.visible) continue;
        const { position, velocity, length } = visitor;
        const across = Math.hypot(velocity.x, velocity.z);
        body.carrier.position.copy(position);
        body.carrier.rotation.set(
          0,
          Math.atan2(-velocity.z, velocity.x),
          Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(velocity.y, across))),
          "YZX",
        );
        body.carrier.scale.setScalar(length);
        // The clip keeps time with the stroke: faster as the animal goes faster.
        body.mixer.update(clipSeconds(seconds, velocity.length(), length, body.pace));
      }
    },
    settled: () => Promise.all(loading).then(() => undefined),
    dispose() {
      disposed = true;
      for (const body of bodies) body?.mixer.stopAllAction();
      // Clones share the loaded models' geometries, materials and textures.
      for (const root of loaded) {
        root.traverse((node) => {
          const mesh = node as Partial<Mesh>;
          if (mesh.isMesh !== true || mesh.geometry === undefined || mesh.material === undefined)
            return;
          mesh.geometry.dispose();
          for (const material of materialsOf(mesh.material)) {
            for (const value of Object.values(material)) {
              if (value instanceof Texture) value.dispose();
            }
            material.dispose();
          }
        });
      }
      object.clear();
    },
  };
}
