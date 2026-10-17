import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Logger } from "../core/logger";
import type { ModelManifest } from "../scene/modelManifest";
import type { Species, SpeciesCatalog } from "../scene/schema";
import { createActivityState, createSwimState } from "../sim/behaviors";
import { createPlay } from "../sim/play";
import { createUnstick, type Fish } from "../sim/simulation";
import { createAssetLoaders } from "./assetLoaders";
import { createFishRenderer } from "./fishRenderer";
import { portraitFraming } from "./portraitFraming";
import { neutralWaterUniforms } from "./uniforms";

const FOV = 28;
const EXPOSURE = 1.1;
const SKY = 0xdff3ff;
const GROUND = 0x274556;
const SKY_INTENSITY = 1.8;
const SUN_INTENSITY = 2.4;
const SUN_POSITION = [0.6, 2, 1.6] as const;
/** Heading turned slightly towards the viewer: a three-quarter view shows the body's depth. */
const HEADING = new Vector3(1, 0, 0.35);
/** A moment of the tail beat with a gentle curve, so the fish looks alive. */
const SWIM_PHASE = 0.8;
const EFFORT = 0.6;

/** One picture to draw: a species with its procedural body or its 3D model. */
export interface FishPortraitRequest {
  readonly speciesId: string;
  readonly model: boolean;
  /** Receives the picture, scaled to its own size. */
  readonly canvas: HTMLCanvasElement;
}

/**
 * A still individual of body length 1 at the origin, heading along
 * `heading`: by default facing the camera at three-quarters.
 */
export function posedFish(species: Species, heading: Vector3 = HEADING): Fish {
  return {
    id: 0,
    species,
    position: new Vector3(),
    velocity: heading.clone(),
    length: 1,
    swimPhase: SWIM_PHASE,
    opacity: 1,
    gaze: 0,
    bend: 0,
    effort: EFFORT,
    satiety: 1,
    mouth: 0,
    fear: 0,
    state: "swimming",
    swim: createSwimState(),
    activity: createActivityState(),
    play: createPlay(),
    roll: 0,
    turnRate: 0,
    walking: false,
    still: false,
    facing: Math.atan2(heading.z, heading.x),
    hiding: 0,
    refuge: new Vector3(),
    refugeSize: 0,
    unstick: createUnstick(),
    side: 1,
  };
}

/**
 * Draws fish pictures for the control panel's cards. A small renderer of its
 * own is created for the batch and released at the end, so the aquarium's
 * renderer, effects and memory are untouched. Procedural bodies are drawn at
 * once; 3D models are drawn again once they have loaded.
 */
export async function drawFishPortraits(
  catalog: SpeciesCatalog,
  manifests: ReadonlyMap<string, ModelManifest>,
  requests: readonly FishPortraitRequest[],
  logger: Logger,
): Promise<void> {
  const first = requests[0];
  if (first === undefined) return;
  const width = first.canvas.width;
  const height = first.canvas.height;
  const wanted = new Map(requests.map((request) => [request.speciesId, request.model]));
  const sitters = new Map(
    catalog.species
      .filter((species) => wanted.has(species.id))
      .map((species) => [species.id, posedFish(species)]),
  );

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const loaders = createAssetLoaders(renderer);
  const fish = createFishRenderer(
    { species: [...sitters.values()].map((individual) => individual.species) },
    neutralWaterUniforms(),
    logger,
    { manifests, load: loaders.loadModel },
    (speciesId) => wanted.get(speciesId) ?? false,
  );
  const scene = new Scene();
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.position.set(...SUN_POSITION);
  scene.add(new HemisphereLight(SKY, GROUND, SKY_INTENSITY), sun, fish.object);
  const camera = new PerspectiveCamera(FOV, width / height, 0.01, 100);
  const bounds = new Box3();

  const draw = (request: FishPortraitRequest): void => {
    const individual = sitters.get(request.speciesId);
    const context = request.canvas.getContext("2d");
    if (individual === undefined || context === null) return;
    fish.update([individual]);
    scene.updateMatrixWorld();
    bounds.makeEmpty();
    fish.object.traverse((object) => {
      if (!(object instanceof InstancedMesh) || !object.visible || object.count === 0) return;
      object.computeBoundingBox();
      if (object.boundingBox !== null) bounds.union(object.boundingBox);
    });
    if (bounds.isEmpty()) return;
    const framing = portraitFraming(
      { min: bounds.min.toArray(), max: bounds.max.toArray() },
      camera.aspect,
      FOV,
    );
    camera.position.set(...framing.position);
    camera.lookAt(...framing.target);
    renderer.render(scene, camera);
    context.clearRect(0, 0, request.canvas.width, request.canvas.height);
    context.drawImage(renderer.domElement, 0, 0, request.canvas.width, request.canvas.height);
  };

  try {
    requests.forEach(draw);
    await fish.settled();
    requests.filter((request) => request.model).forEach(draw);
  } finally {
    fish.dispose();
    loaders.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
