import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
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
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { Logger } from "../core/logger";
import { pixelRatioForHeight } from "../core/resolution";
import type { Rng } from "../core/rng";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import type { ShaderPack } from "../scene/shaderPack";
import { layoutFlora, layoutProps } from "../sim/layout";
import type { Simulation } from "../sim/simulation";
import type { EffectDefinition, EffectInstance } from "./effects/types";
import { createEnvironment } from "./environment";
import { createWaterEnvironment } from "./environmentLight";
import { createFishRenderer } from "./fishRenderer";
import { createFloraRenderer } from "./floraRenderer";
import { cameraFraming } from "./framing";
import { createParticles } from "./particles";
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

export interface AquariumViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  readonly simulation: Simulation;
  readonly rng: Rng;
  readonly logger: Logger;
  /** Initial drawing-buffer height in pixels. */
  readonly renderHeight: number;
  readonly shaderPack: ShaderPack;
  /** Registered effects; the pack's passes refer to them by id. */
  readonly effects: readonly EffectDefinition[];
}

export interface AquariumView {
  /** Pulls state from the simulation and draws one frame. */
  render(): void;
  resize(cssWidth: number, cssHeight: number): void;
  setRenderHeight(heightPixels: number): void;
  /** Swaps the look live: lighting, bubbles and post-processing. */
  setShaderPack(pack: ShaderPack): void;
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

  const plants = layoutFlora(scene.tank, scene.flora, rng.fork());
  const propItems = layoutProps(scene.tank, scene.props, rng.fork());
  const environment = createEnvironment(scene, propItems, water, rng.fork());
  const flora = createFloraRenderer(plants, water, rng.fork());
  const fish = createFishRenderer(catalog, water, logger);
  const particles = createParticles(scene, propItems, water, rng.fork());
  world.add(environment.object, flora.object, fish.object, particles.object);

  const environmentMap = createWaterEnvironment(renderer, scene);
  const effectsById = new Map(effects.map((effect) => [effect.id, effect]));
  const context = {
    renderer,
    scene: world,
    camera,
    water,
    tank: scene.tank,
    sunPosition: sun.position,
    shaderAnimated: { plants: flora.object, particles: particles.object },
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

  const buildPipeline = (pack: ShaderPack): void => {
    disposePipeline();
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MSAA_SAMPLES });
    const next = new EffectComposer(renderer, target);
    next.addPass(new RenderPass(world, camera));
    const created = pack.passes.flatMap((pass) => {
      const effect = effectsById.get(pass.effect.id);
      if (effect === undefined) {
        logger.warn("Effect missing from the registry; pass skipped", { effect: pass.effect.id });
        return [];
      }
      return [{ stage: effect.stage, instance: effect.create(context, pass.params) }];
    });
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

  const applyLighting = (pack: ShaderPack): void => {
    const { shadows, environment: useEnvironment, exposure } = pack.lighting;
    renderer.toneMappingExposure = BASE_EXPOSURE * exposure;
    renderer.shadowMap.enabled = shadows.enabled;
    sun.castShadow = shadows.enabled;
    if (sun.shadow.mapSize.x !== shadows.mapSize) {
      sun.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    world.environment = useEnvironment ? environmentMap.texture : null;
    world.environmentIntensity = ENVIRONMENT_INTENSITY;
    particles.setBubbleStyle(pack.bubbles);
    environment.setLightShaftsVisible(pack.lightShafts);
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
    camera.aspect = cssWidth / cssHeight;
    const framing = cameraFraming(scene.tank, camera.aspect, VERTICAL_FOV);
    camera.position.set(...framing.position);
    camera.lookAt(...framing.target);
    camera.updateProjectionMatrix();
    particles.setBufferHeight(renderHeight, VERTICAL_FOV);
  };

  const setShaderPack = (pack: ShaderPack): void => {
    applyLighting(pack);
    buildPipeline(pack);
    applySize();
  };
  setShaderPack(options.shaderPack);

  return {
    render() {
      water.uTime.value = simulation.timeSeconds;
      environment.update(simulation.timeSeconds);
      fish.update(simulation.fish);
      particles.update(simulation.timeSeconds);
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
    setShaderPack,
    dispose() {
      disposePipeline();
      environment.dispose();
      flora.dispose();
      fish.dispose();
      particles.dispose();
      environmentMap.dispose();
      renderer.dispose();
    },
  };
}
