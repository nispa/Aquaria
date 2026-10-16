import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  PerspectiveCamera,
  Scene as ThreeScene,
  WebGLRenderer,
  type Object3D,
} from "three";
import { createRng } from "../core/rng";
import type { Logger } from "../core/logger";
import { sceneryAlone } from "../scene/scenery";
import type { Scene } from "../scene/schema";
import { layoutFlora, layoutProps } from "../sim/layout";
import { createAssetLoaders } from "./assetLoaders";
import { createFloraRenderer } from "./floraRenderer";
import { portraitFraming } from "./portraitFraming";
import { createPropRenderer } from "./propRenderer";
import { createSurfaceLibrary } from "./surfaceLibrary";
import { neutralWaterUniforms } from "./uniforms";

const FOV = 28;
const EXPOSURE = 1.1;
const SKY = 0xdff3ff;
const GROUND = 0x274556;
const SKY_INTENSITY = 1.8;
const SUN_INTENSITY = 2.4;
const SUN_POSITION = [0.6, 2, 1.6] as const;
/** The same item every time, so a card never changes between visits. */
const PORTRAIT_SEED = 11;

/** One picture to draw: a scenery entry, by its panel key. */
export interface SceneryPortraitRequest {
  readonly key: string;
  /** Receives the picture, scaled to its own size. */
  readonly canvas: HTMLCanvasElement;
}

/** The meshes' bounds; instanced meshes include their instances. */
function boundsOf(object: Object3D, bounds: Box3): Box3 {
  bounds.makeEmpty();
  object.traverse((child) => {
    if (!(child instanceof InstancedMesh) || child.count === 0) return;
    child.computeBoundingBox();
    if (child.boundingBox !== null) bounds.union(child.boundingBox);
  });
  return bounds;
}

/**
 * Draws one item of each requested scenery entry (a plant, a rock, a coral)
 * for the control panel's cards. Like the fish pictures, a small renderer of
 * its own is created for the batch and released at the end; photographic
 * surfaces are waited for, so rocks show their real stone.
 */
export async function drawSceneryPortraits(
  scene: Scene,
  requests: readonly SceneryPortraitRequest[],
  logger: Logger,
): Promise<void> {
  const first = requests[0];
  if (first === undefined) return;
  const width = first.canvas.width;
  const height = first.canvas.height;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const loaders = createAssetLoaders(renderer);
  const surfaces = createSurfaceLibrary((url) => loaders.textures.loadAsync(url), logger);
  const water = neutralWaterUniforms();
  const stage = new ThreeScene();
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.position.set(...SUN_POSITION);
  stage.add(new HemisphereLight(SKY, GROUND, SKY_INTENSITY), sun);
  const camera = new PerspectiveCamera(FOV, width / height, 0.01, 100);
  const bounds = new Box3();

  // Every item stands alone in the middle of the sand.
  const sitters = requests.map((request) => {
    const alone = sceneryAlone(scene, request.key);
    const centered = <T extends { readonly x: number; readonly z: number }>(item: T): T => ({
      ...item,
      x: 0,
      z: 0,
    });
    const flora = createFloraRenderer(
      layoutFlora(scene.tank, alone.flora, createRng(PORTRAIT_SEED)).map(centered),
      water,
    );
    const props = createPropRenderer(
      layoutProps(scene.tank, alone.props, createRng(PORTRAIT_SEED)).map(centered),
      water,
      surfaces,
    );
    return { request, flora, props };
  });

  try {
    await surfaces.settled();
    for (const { request, flora, props } of sitters) {
      const context = request.canvas.getContext("2d");
      if (context === null) continue;
      stage.add(flora.object, props.object);
      stage.updateMatrixWorld();
      boundsOf(stage, bounds);
      if (!bounds.isEmpty()) {
        const framing = portraitFraming(
          { min: bounds.min.toArray(), max: bounds.max.toArray() },
          camera.aspect,
          FOV,
        );
        camera.position.set(...framing.position);
        camera.lookAt(...framing.target);
        renderer.render(stage, camera);
        context.clearRect(0, 0, request.canvas.width, request.canvas.height);
        context.drawImage(renderer.domElement, 0, 0, request.canvas.width, request.canvas.height);
      }
      stage.remove(flora.object, props.object);
    }
  } finally {
    for (const { flora, props } of sitters) {
      flora.dispose();
      props.dispose();
    }
    surfaces.dispose();
    loaders.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
