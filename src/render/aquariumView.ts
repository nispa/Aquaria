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
  Plane,
  Raycaster,
  Scene as ThreeScene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Logger } from "../core/logger";
import { pixelRatioForHeight } from "../core/resolution";
import { createRng, type Rng } from "../core/rng";
import type { ModelManifest } from "../scene/modelManifest";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import type { Lights } from "../scene/lights";
import { lookPasses, type Look } from "../scene/look";
import { layoutFlora, layoutProps } from "../sim/layout";
import { createGpuTimer } from "./gpuTimer";
import { obstaclesOf, type Obstacle } from "../sim/obstacles";
import { placesOf, type Place } from "../sim/places";
import { createLightMixer, cycleHour, daylight } from "../sim/lightCycle";
import { createRockwork, type Rockwork } from "../sim/rockwork";
import { floorHeight } from "../sim/terrain";
import type { Simulation } from "../sim/simulation";
import type { EffectDefinition, EffectInstance } from "./effects/types";
import { createEnvironment } from "./environment";
import { createWaterEnvironment } from "./environmentLight";
import { createAssetLoaders } from "./assetLoaders";
import { createFishRenderer } from "./fishRenderer";
import { createFloraRenderer, type FloraRenderer } from "./floraRenderer";
import { cameraFraming } from "./framing";
import { createFixtureRenderer } from "./fixtureRenderer";
import { createFoodRenderer } from "./foodRenderer";
import { createLightRig } from "./lightRig";
import { createParticles, type Particles } from "./particles";
import { createSurfaceLibrary } from "./surfaceLibrary";
import { createPropRenderer, type PropRenderer } from "./propRenderer";
import { createRockworkRenderer, type RockworkRenderer } from "./rockworkRenderer";
import { createWaterUniforms } from "./uniforms";
import { createTorchLight } from "./torchLight";

const VERTICAL_FOV = 38;
const BASE_EXPOSURE = 1.05;
/** Sun placement relative to the tank: above, slightly to the right and in front. */
const SUN_OFFSET = { x: 2, aboveSurface: 6, z: 3 } as const;
/** Shadow camera half-size relative to the larger of tank width and depth. */
const SHADOW_COVERAGE = 0.75;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.02;
const SHADOW_FAR = 30;
const SHADOW_MAP_SIZE = 2048;
const SEED_MAX = 2 ** 31 - 1;
/** Derives the ridge seed from the props seed, keeping earlier seeds unchanged. */
const ROCKWORK_SEED_OFFSET = 1;
/** Relative aspect change that makes the scenery spread again across the view. */
const RELAYOUT_ASPECT_CHANGE = 0.02;

export interface AquariumViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  /** Manifests of the species' 3D models, by model folder. */
  readonly modelManifests: ReadonlyMap<string, ModelManifest>;
  /** Whether a species starts with its 3D model instead of its procedural body. */
  readonly fishModelEnabled: (speciesId: string) => boolean;
  readonly simulation: Simulation;
  readonly rng: Rng;
  readonly logger: Logger;
  /** Initial drawing-buffer height in pixels. */
  readonly renderHeight: number;
  /** Enabled lighting features and effects. */
  readonly look: Look;
  /** Registered post-processing effects; the look enables them by id. */
  readonly effects: readonly EffectDefinition[];
  /** LED channels and daily cycle. */
  readonly lights: Lights;
  /** Multisample anti-aliasing samples (0 = off), capped by what the GPU supports. */
  readonly msaaSamples: number;
  /** Local time of day in hours, for the clock cycle mode. Called every frame: keep it cheap. */
  readonly clockHour: () => number;
  /** Local time of day in hours when the aquarium was started, for the startup cycle mode. */
  readonly startHour: number;
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
  /** Changes the multisample anti-aliasing (0 = off); rebuilds the render targets. */
  setMsaa(samples: number): void;
  /** Switches to another LED setup or cycle. */
  setLights(lights: Lights): void;
  /**
   * Height of the seabed (sand plus rockwork) at (x, z), m. The scenery is laid
   * out here (it follows the camera), so the simulation reads it through the app.
   */
  seabedHeight(x: number, z: number): number;
  /**
   * The scenery's places (plants and props with tags) for the simulation; a
   * new list whenever the scenery is laid out again.
   */
  places(): readonly Place[];
  /**
   * The scenery's solid props (rocks, corals, wood) for fish to swim around;
   * a new list whenever the scenery is laid out again.
   */
  obstacles(): readonly Obstacle[];
  /**
   * Where a spot on the view (normalized device coordinates) meets the front
   * glass, in tank coordinates, written into `out`, and, when given, the
   * direction of the line of sight through it into `sight`. False when the
   * spot is not over the glass.
   */
  glassPoint(x: number, y: number, out: Vector3, sight?: Vector3): boolean;
  /**
   * Where a point of the tank shows on the view, as normalized device
   * coordinates (-1..1) written into `out`. False when it is off screen.
   */
  screenPoint(point: Vector3, out: Vector3): boolean;
  /** Shines the viewer's torch through `point` on the glass, or switches it off. */
  aimTorch(point: Vector3 | undefined): void;
  /** The WebGL renderer string: which GPU the browser actually draws with. */
  gpuName(): string;
  /**
   * How long the GPU took to draw a recent frame, ms, or undefined when the
   * browser cannot tell (no timer query) or nothing has come back yet.
   */
  gpuMs(): number | undefined;
  /** Hour of the aquarium day shown by the last frame. */
  hour(): number;
  /** How much of a day it is at that hour, 0 (night) .. 1 (full day). */
  daylight(): number;
  /** Rebuilds plants, rocks, corals and shells for new scenery counts. */
  setScenery(flora: Scene["flora"], props: Scene["props"]): void;
  /** Draws a species with its 3D model or its procedural body. */
  setFishModel(speciesId: string, enabled: boolean): void;
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
  const gl = renderer.getContext();
  const gpuTimer = gl instanceof WebGL2RenderingContext ? createGpuTimer(gl) : undefined;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = BASE_EXPOSURE;
  renderer.shadowMap.type = PCFShadowMap;

  const world = new ThreeScene();
  const background = new Color(scene.water.color);
  const fog = new FogExp2(scene.water.color, scene.water.fogDensity);
  world.background = background;
  world.fog = fog;

  const camera = new PerspectiveCamera(VERTICAL_FOV, cssWidth / cssHeight, 0.05, 80);
  // The front glass is the plane z = 0, facing the camera.
  const glass = new Plane(new Vector3(0, 0, 1), 0);
  const raycaster = new Raycaster();
  const pointer = new Vector2();

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
  const torch = createTorchLight();
  world.add(torch.light, torch.light.target);
  const rig = createLightRig({
    scene,
    sun,
    hemisphere,
    ambient,
    fog,
    background,
    water,
    setEnvironmentIntensity: (intensity) => {
      world.environmentIntensity = intensity;
    },
  });
  let lights = options.lights;
  let mixer = createLightMixer(lights);
  let currentHour = lights.cycle.hour;
  // Reused every frame so the render loop does not allocate.
  const cycleInput = { clockHour: 0, startHour: options.startHour, elapsedSeconds: 0 };

  // Scenery is rebuilt when the viewer changes counts: keep the seeds, not the
  // generators, so every rebuild starts from the same state.
  const scenerySeeds = { flora: rng.int(0, SEED_MAX), props: rng.int(0, SEED_MAX) };
  const particleSeed = rng.int(0, SEED_MAX);
  const loaders = createAssetLoaders(renderer);
  const surfaces = createSurfaceLibrary((url) => loaders.textures.loadAsync(url), logger);
  surfaces.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const environment = createEnvironment(scene, water, surfaces, rng.fork());
  const fish = createFishRenderer(
    catalog,
    water,
    logger,
    {
      manifests: options.modelManifests,
      load: loaders.loadModel,
    },
    options.fishModelEnabled,
  );
  const food = createFoodRenderer(simulation.food.pellets.length, water);
  // Stable containers: effects keep references to them across rebuilds.
  const floraGroup = new Group();
  const propGroup = new Group();
  const particleGroup = new Group();
  world.add(environment.object, floraGroup, propGroup, fish.object, food.object, particleGroup);
  const fixture = createFixtureRenderer(scene.tank, water);
  world.add(fixture.object);
  /** Under LED spots the sun stands straight overhead, so shadows fall down. */
  const placeSun = (lights: Lights): void => {
    if (lights.fixture.type === "spots") {
      sun.position.set(
        0,
        scene.tank.height + SUN_OFFSET.aboveSurface,
        -scene.tank.depth / 2 + 0.01,
      );
    } else {
      sun.position.set(SUN_OFFSET.x, scene.tank.height + SUN_OFFSET.aboveSurface, SUN_OFFSET.z);
    }
  };
  fixture.setFixture(lights.fixture);
  placeSun(lights);
  let flora: FloraRenderer | undefined;
  let props: PropRenderer | undefined;
  let rockwork: RockworkRenderer | undefined;
  let ridge: Rockwork | undefined;
  let places: readonly Place[] = [];
  let obstacles: readonly Obstacle[] = [];
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
  let msaaSamples = options.msaaSamples;
  let layoutAspect = 0;
  let floraSpecs: Scene["flora"] = scene.flora;
  let propSpecs: Scene["props"] = scene.props;

  const buildScenery = (): void => {
    flora?.dispose();
    props?.dispose();
    rockwork?.dispose();
    rockwork = undefined;
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
    ridge =
      scene.rockwork === undefined
        ? undefined
        : createRockwork(
            scene.tank,
            scene.rockwork,
            createRng(scenerySeeds.props + ROCKWORK_SEED_OFFSET),
            halfWidthAt,
          );
    const plants = layoutFlora(
      scene.tank,
      floraSpecs,
      createRng(scenerySeeds.flora),
      halfWidthAt,
      ridge,
    );
    const items = layoutProps(
      scene.tank,
      propSpecs,
      createRng(scenerySeeds.props),
      halfWidthAt,
      ridge,
    );
    places = placesOf(plants, [...(ridge?.rocks ?? []), ...items]);
    obstacles = obstaclesOf([...(ridge?.rocks ?? []), ...items]);
    flora = createFloraRenderer(plants, water);
    props = createPropRenderer([...(ridge?.rocks ?? []), ...items], water, surfaces);
    if (ridge !== undefined && scene.rockwork !== undefined) {
      rockwork = createRockworkRenderer(ridge, scene.rockwork, water, surfaces);
      propGroup.add(rockwork.object);
    }
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
    overlays: [environment.lightShafts, fixture.cones],
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
    const samples = Math.min(msaaSamples, renderer.capabilities.maxSamples);
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples });
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
    rig.setCausticsEnabled(look.has("caustics"));
    rig.setFluorescenceEnabled(look.has("fluorescence"));
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
    ready: () => Promise.all([surfaces.settled(), fish.settled()]).then(() => undefined),
    setMsaa(samples) {
      msaaSamples = samples;
      buildPipeline(currentLook);
      applySize();
    },
    setLights(next) {
      fixture.setFixture(next.fixture);
      placeSun(next);
      lights = next;
      mixer = createLightMixer(next);
    },
    hour: () => currentHour,
    daylight: () => daylight(lights, currentHour),
    gpuName: () => {
      const gl = renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name: unknown = gl.getParameter(
        info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL,
      );
      return typeof name === "string" ? name : "unknown";
    },
    glassPoint(x, y, out, sight) {
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      sight?.copy(raycaster.ray.direction);
      if (raycaster.ray.intersectPlane(glass, out) === null) return false;
      const halfWidth = scene.tank.width / 2;
      return Math.abs(out.x) <= halfWidth && out.y >= 0 && out.y <= scene.tank.height;
    },
    aimTorch(point) {
      torch.aim(camera.position, point);
    },
    screenPoint(point, out) {
      out.copy(point).project(camera);
      return out.z < 1 && Math.abs(out.x) <= 1 && Math.abs(out.y) <= 1;
    },
    seabedHeight: (x, z) => floorHeight(x, z) + (ridge?.heightAt(x, z) ?? 0),
    places: () => places,
    obstacles: () => obstacles,
    render() {
      cycleInput.clockHour = options.clockHour();
      cycleInput.elapsedSeconds = simulation.timeSeconds;
      currentHour = cycleHour(lights.cycle, cycleInput);
      const light = mixer.at(currentHour);
      rig.apply(light);
      fixture.update(light);
      water.uTime.value = simulation.timeSeconds;
      props?.update(simulation.timeSeconds);
      fish.update(simulation.fish);
      food.update(simulation.food.pellets);
      particles?.update(simulation.timeSeconds);
      instances.forEach((instance) => {
        instance.update?.();
      });
      gpuTimer?.begin();
      composer?.render();
      gpuTimer?.end();
    },
    gpuMs: () => gpuTimer?.latestMs(),
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
    setFishModel(speciesId, enabled) {
      fish.setModelEnabled(speciesId, enabled);
    },
    setScenery(nextFlora, nextProps) {
      floraSpecs = nextFlora;
      propSpecs = nextProps;
      buildScenery();
    },
    dispose() {
      gpuTimer?.dispose();
      disposePipeline();
      environment.dispose();
      flora?.dispose();
      props?.dispose();
      rockwork?.dispose();
      fish.dispose();
      food.dispose();
      particles?.dispose();
      environmentMap.dispose();
      fixture.dispose();
      surfaces.dispose();
      loaders.dispose();
      renderer.dispose();
    },
  };
}
