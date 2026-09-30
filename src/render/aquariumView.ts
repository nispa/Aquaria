import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene as ThreeScene,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Logger } from "../core/logger";
import { pixelRatioForHeight } from "../core/resolution";
import { createRng, type Rng } from "../core/rng";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import { lookPasses, type Look } from "../scene/look";
import { layoutFlora, layoutProps } from "../sim/layout";
import type { Simulation } from "../sim/simulation";
import type { EffectDefinition, EffectInstance } from "./effects/types";
import { createEnvironment } from "./environment";
import { createWaterEnvironment } from "./environmentLight";
import { createFishRenderer } from "./fishRenderer";
import { createFloraRenderer, type FloraRenderer } from "./floraRenderer";
import { cameraFraming } from "./framing";
import { createParticles, type Particles } from "./particles";
import { createSurfaceLibrary } from "./surfaceLibrary";
import { createPropRenderer, type PropRenderer } from "./propRenderer";
import { createWaterUniforms } from "./uniforms";

const VERTICAL_FOV = 38;
/** MSAA samples: 2 is a good compromise between smooth edges and 4K memory use. */
const MSAA_SAMPLES = 2;
const BASE_EXPOSURE = 1.05;
/** Sun placement relative to the tank: above, slightly to the right and in front. */
const SUN_OFFSET = { x: 2, aboveSurface: 6, z: 3 } as const;
/** Shadow camera half-size relative to the larger of tank width and depth. */
const SHADOW_COVERAGE = 0.75;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.02;
const SHADOW_FAR = 30;
/** Image-based light is a fill, not the key light: kept below the sun. */
const ENVIRONMENT_INTENSITY = 0.65;
const SHADOW_MAP_SIZE = 2048;
const SEED_MAX = 2 ** 31 - 1;
const BASIS_TRANSCODER_PATH = "basis/";
/** Relative aspect change that makes the scenery spread again across the view. */
const RELAYOUT_ASPECT_CHANGE = 0.02;

export interface AquariumViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  readonly simulation: Simulation;
  readonly rng: Rng;
  readonly logger: Logger;
  /** Initial drawing-buffer height in pixels. */
  readonly renderHeight: number;
  /** Enabled lighting features and effects. */
  readonly look: Look;
  /** Registered post-processing effects; the look enables them by id. */
  readonly effects: readonly EffectDefinition[];
}

export interface AquariumView {
  /** Resolves when textures have loaded (or failed), so a still frame shows them. */
  ready(): Promise<void>;
  /** Pulls state from the simulation and draws one frame. */
  render(): void;
  resize(cssWidth: number, cssHeight: number): void;
  setRenderHeight(heightPixels: number): void;
  /** Switches features live: lighting, bubbles and post-processing. */
  setLook(look: Look): void;
  /** Rebuilds plants, rocks, corals and shells for new scenery counts. */
  setScenery(flora: Scene["flora"], props: Scene["props"]): void;
  dispose(): void;
}

function forEachMaterial(root: Object3D, visit: (material: Material) => void): void {
  root.traverse((object) => {
    if (!("material" in object)) return;
    const { material } = object as Object3D & { material: Material | Material[] };
    (Array.isArray(material) ? material : [material]).forEach(visit);
  });
}

export function createAquariumView(options: AquariumViewOptions): AquariumView {
  const { canvas, scene, catalog, simulation, rng, logger, effects } = options;
  let renderHeight = options.renderHeight;
  let cssWidth = canvas.clientWidth || 1;
  let cssHeight = canvas.clientHeight || 1;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = BASE_EXPOSURE;
  renderer.shadowMap.type = PCFShadowMap;

  const world = new ThreeScene();
  world.background = new Color(scene.water.color);
  world.fog = new FogExp2(scene.water.color, scene.water.fogDensity);

  const camera = new PerspectiveCamera(VERTICAL_FOV, cssWidth / cssHeight, 0.05, 80);

  const water = createWaterUniforms(scene);
  const hemisphere = new HemisphereLight(
    scene.light.color,
    scene.floor.color,
    0.9 * scene.light.intensity,
  );
  const sun = new DirectionalLight(scene.light.color, 1.6 * scene.light.intensity);
  sun.position.set(SUN_OFFSET.x, scene.tank.height + SUN_OFFSET.aboveSurface, SUN_OFFSET.z);
  sun.target.position.set(0, 0, -scene.tank.depth / 2);
  const shadowHalf = Math.max(scene.tank.width, scene.tank.depth) * SHADOW_COVERAGE;
  Object.assign(sun.shadow.camera, {
    left: -shadowHalf,
    right: shadowHalf,
    top: shadowHalf,
    bottom: -shadowHalf,
    far: SHADOW_FAR,
  });
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  const ambient = new AmbientLight(scene.water.color, 0.6);
  world.add(hemisphere, sun, sun.target, ambient);

  // Scenery is rebuilt when the viewer changes counts: keep the seeds, not the
  // generators, so every rebuild starts from the same state.
  const scenerySeeds = { flora: rng.int(0, SEED_MAX), props: rng.int(0, SEED_MAX) };
  const particleSeed = rng.int(0, SEED_MAX);
  // KTX2 textures stay compressed on the GPU (about a quarter of the memory of
  // PNG or WebP), which matters at 4K. The Basis transcoder is in public/basis/.
  const textureLoader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH);
  textureLoader.detectSupport(renderer);
  const surfaces = createSurfaceLibrary((url) => textureLoader.loadAsync(url), logger);
  surfaces.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const environment = createEnvironment(scene, water, surfaces, rng.fork());
  const fish = createFishRenderer(catalog, water, logger);
  // Stable containers: effects keep references to them across rebuilds.
  const floraGroup = new Group();
  const propGroup = new Group();
  const particleGroup = new Group();
  world.add(environment.object, floraGroup, propGroup, fish.object, particleGroup);
  let flora: FloraRenderer | undefined;
  let props: PropRenderer | undefined;
  let particles: Particles | undefined;
  const frameCamera = (): void => {
    camera.aspect = cssWidth / cssHeight;
    const framing = cameraFraming(scene.tank, camera.aspect, VERTICAL_FOV);
    camera.position.set(...framing.position);
    camera.lookAt(...framing.target);
    camera.updateProjectionMatrix();
  };
  frameCamera();
  let currentLook: Look = options.look;
  let layoutAspect = 0;
  let floraSpecs: Scene["flora"] = scene.flora;
  let propSpecs: Scene["props"] = scene.props;

  const buildScenery = (): void => {
    flora?.dispose();
    props?.dispose();
    particles?.dispose();
    floraGroup.clear();
    propGroup.clear();
    particleGroup.clear();
    // Spread across what the camera sees at each depth, not just the tank walls.
    layoutAspect = camera.aspect;
    const halfWidthAt = (z: number): number =>
      Math.max(
        (camera.position.z - z) * Math.tan(((VERTICAL_FOV / 2) * Math.PI) / 180) * camera.aspect,
        scene.tank.width / 2,
      );
    const plants = layoutFlora(scene.tank, floraSpecs, createRng(scenerySeeds.flora), halfWidthAt);
    const items = layoutProps(scene.tank, propSpecs, createRng(scenerySeeds.props), halfWidthAt);
    flora = createFloraRenderer(plants, water);
    props = createPropRenderer(items, water, surfaces);
    // Bubbles rise from the rocks, so they follow the props.
    particles = createParticles(scene, items, water, createRng(particleSeed));
    particles.setBubbleStyle(currentLook.has("refractive-bubbles") ? "refractive" : "sprite");
    particles.setBufferHeight(renderHeight, VERTICAL_FOV);
    floraGroup.add(flora.object);
    propGroup.add(props.object);
    particleGroup.add(particles.object);
  };
  buildScenery();

  const environmentMap = createWaterEnvironment(renderer, scene);
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const context = {
    renderer,
    scene: world,
    camera,
    water,
    tank: scene.tank,
    sunPosition: sun.position,
    shaderAnimated: { plants: floraGroup, particles: particleGroup },
    overlays: [environment.lightShafts],
  };

  let composer: EffectComposer | undefined;
  let instances: EffectInstance[] = [];

  const disposePipeline = (): void => {
    instances.forEach((instance) => {
      instance.dispose();
    });
    instances = [];
    composer?.dispose();
  };

  const buildPipeline = (look: Look): void => {
    disposePipeline();
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MSAA_SAMPLES });
    const next = new EffectComposer(renderer, target);
    next.addPass(new RenderPass(world, camera));
    // Every parameter has a default: the tuned look lives in the effect files.
    const created = lookPasses(effects, look).map((effect) => ({
      stage: effect.stage,
      instance: effect.create(context, {}),
    }));
    created
      .filter((entry) => entry.stage === "hdr")
      .forEach((entry) => {
        next.addPass(entry.instance.pass);
      });
    next.addPass(new OutputPass());
    created
      .filter((entry) => entry.stage === "display")
      .forEach((entry) => {
        next.addPass(entry.instance.pass);
      });
    instances = created.map((entry) => entry.instance);
    composer = next;
  };

  const applyLighting = (look: Look): void => {
    const shadows = look.has("shadows");
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    world.environment = look.has("reflections") ? environmentMap.texture : null;
    world.environmentIntensity = ENVIRONMENT_INTENSITY;
    water.uCausticsIntensity.value = look.has("caustics") ? scene.light.caustics.intensity : 0;
    currentLook = look;
    particles?.setBubbleStyle(look.has("refractive-bubbles") ? "refractive" : "sprite");
    environment.setLightShaftsVisible(look.has("light-shafts"));
    // Shadow and environment support are compiled into the shaders.
    forEachMaterial(world, (material) => {
      material.needsUpdate = true;
    });
  };

  const applySize = (): void => {
    const ratio = pixelRatioForHeight(renderHeight, cssHeight);
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssWidth, cssHeight, false);
    composer?.setPixelRatio(ratio);
    composer?.setSize(cssWidth, cssHeight);
    frameCamera();
    // A different screen shape shows a different width at the back: respread.
    if (Math.abs(camera.aspect - layoutAspect) > layoutAspect * RELAYOUT_ASPECT_CHANGE) {
      buildScenery();
    }
    particles?.setBufferHeight(renderHeight, VERTICAL_FOV);
  };

  const setLook = (look: Look): void => {
    applyLighting(look);
    buildPipeline(look);
    applySize();
  };
  setLook(options.look);

  return {
    ready: () => surfaces.settled(),
    render() {
      water.uTime.value = simulation.timeSeconds;
      props?.update(simulation.timeSeconds);
      fish.update(simulation.fish);
      particles?.update(simulation.timeSeconds);
      instances.forEach((instance) => {
        instance.update?.();
      });
      composer?.render();
    },
    resize(width, height) {
      cssWidth = Math.max(width, 1);
      cssHeight = Math.max(height, 1);
      applySize();
    },
    setRenderHeight(heightPixels) {
      renderHeight = heightPixels;
      applySize();
    },
    setLook,
    setScenery(nextFlora, nextProps) {
      floraSpecs = nextFlora;
      propSpecs = nextProps;
      buildScenery();
    },
    dispose() {
      disposePipeline();
      environment.dispose();
      flora?.dispose();
      props?.dispose();
      fish.dispose();
      particles?.dispose();
      environmentMap.dispose();
      surfaces.dispose();
      textureLoader.dispose();
      renderer.dispose();
    },
  };
}
