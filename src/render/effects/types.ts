import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { z } from "zod";
import type { EffectDescriptor, EffectStage } from "../../scene/shaderPack";
import type { TankSize } from "../../sim/tank";
import type { WaterUniforms } from "../uniforms";

/** Everything an effect may need to build its pass. */
export interface EffectContext {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly water: WaterUniforms;
  readonly tank: TankSize;
  /** World position the sunlight comes from. */
  readonly sunPosition: Vector3;
  /**
   * Objects whose final shape comes from a vertex shader. Depth and normal
   * passes render with override materials that skip those shaders, so these
   * objects appear there at their un-animated positions.
   */
  readonly shaderAnimated: {
    /** Swaying plants: roughly in place near the base, displaced at the tips. */
    readonly plants: Object3D;
    /** GPU-driven particles: nowhere near their real positions. */
    readonly particles: Object3D;
  };
}

/**
 * Wraps a pass that re-renders the scene with an override material (depth,
 * normals) so it does not see `objects`; otherwise they would appear at their
 * un-animated positions as ghosts.
 */
export function hideDuringRender(pass: Pass, objects: readonly Object3D[]): void {
  const render = pass.render.bind(pass);
  const visibility: boolean[] = objects.map(() => true);
  pass.render = (...args: Parameters<Pass["render"]>) => {
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      if (object === undefined) continue;
      visibility[index] = object.visible;
      object.visible = false;
    }
    render(...args);
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      if (object !== undefined) object.visible = visibility[index] ?? true;
    }
  };
}

export interface EffectInstance {
  readonly pass: Pass;
  /** Called every frame before rendering (e.g. to follow the camera). */
  update?(): void;
  dispose(): void;
}

export interface EffectDefinition extends EffectDescriptor {
  create(context: EffectContext, params: unknown): EffectInstance;
}

/**
 * Declares a post-processing effect. To add a new one: write a file in this
 * folder with `defineEffect`, add it to `EFFECTS` in `index.ts`, and use its
 * id in a shader pack JSON. Parameters are validated when the pack loads.
 */
export function defineEffect<Schema extends z.ZodType>(definition: {
  readonly id: string;
  readonly stage: EffectStage;
  readonly params: Schema;
  readonly create: (context: EffectContext, params: z.output<Schema>) => EffectInstance;
}): EffectDefinition {
  return {
    id: definition.id,
    stage: definition.stage,
    params: definition.params,
    create: (context, params) => definition.create(context, definition.params.parse(params)),
  };
}
