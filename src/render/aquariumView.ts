import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  PerspectiveCamera,
  Scene as ThreeScene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Logger } from "../core/logger";
import { pixelRatioForHeight } from "../core/resolution";
import type { Rng } from "../core/rng";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import { layoutFlora, layoutProps } from "../sim/layout";
import type { Simulation } from "../sim/simulation";
import { createEnvironment } from "./environment";
import { createFishRenderer } from "./fishRenderer";
import { createFloraRenderer } from "./floraRenderer";
import { cameraFraming } from "./framing";
import { createParticles } from "./particles";
import { FINISH_SHADER } from "./shaders/finishShader";
import { createWaterUniforms } from "./uniforms";

const VERTICAL_FOV = 38;
const BLOOM = { strength: 0.28, radius: 0.55, threshold: 0.82 } as const;
/** MSAA samples: 2 is a good compromise between smooth edges and 4K memory use. */
const MSAA_SAMPLES = 2;

export interface AquariumViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  readonly simulation: Simulation;
  readonly rng: Rng;
  readonly logger: Logger;
  /** Initial drawing-buffer height in pixels. */
  readonly renderHeight: number;
}

export interface AquariumView {
  /** Pulls state from the simulation and draws one frame. */
  render(): void;
  resize(cssWidth: number, cssHeight: number): void;
  setRenderHeight(heightPixels: number): void;
  dispose(): void;
}

export function createAquariumView(options: AquariumViewOptions): AquariumView {
  const { canvas, scene, catalog, simulation, rng, logger } = options;
  let renderHeight = options.renderHeight;
  let cssWidth = canvas.clientWidth || 1;
  let cssHeight = canvas.clientHeight || 1;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

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
  sun.position.set(2, scene.tank.height + 6, 3);
  sun.target.position.set(0, 0, -scene.tank.depth / 2);
  const ambient = new AmbientLight(scene.water.color, 0.6);
  world.add(hemisphere, sun, sun.target, ambient);

  const plants = layoutFlora(scene.tank, scene.flora, rng.fork());
  const propItems = layoutProps(scene.tank, scene.props, rng.fork());
  const environment = createEnvironment(scene, propItems, water, rng.fork());
  const flora = createFloraRenderer(plants, water, rng.fork());
  const fish = createFishRenderer(catalog, water, logger);
  const particles = createParticles(scene, propItems, water, rng.fork());
  world.add(environment.object, flora.object, fish.object, particles.object);

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MSAA_SAMPLES });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(world, camera));
  const bloom = new UnrealBloomPass(
    new Vector2(1, 1),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);

  const applySize = (): void => {
    const ratio = pixelRatioForHeight(renderHeight, cssHeight);
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssWidth, cssHeight, false);
    composer.setPixelRatio(ratio);
    composer.setSize(cssWidth, cssHeight);
    camera.aspect = cssWidth / cssHeight;
    const framing = cameraFraming(scene.tank, camera.aspect, VERTICAL_FOV);
    camera.position.set(...framing.position);
    camera.lookAt(...framing.target);
    camera.updateProjectionMatrix();
    particles.setBufferHeight(renderHeight, VERTICAL_FOV);
  };
  applySize();

  let frame = 0;

  return {
    render() {
      water.uTime.value = simulation.timeSeconds;
      environment.update(simulation.timeSeconds);
      fish.update(simulation.fish);
      const frameUniform = finish.uniforms.uFrame;
      if (frameUniform !== undefined) frameUniform.value = frame;
      frame += 1;
      composer.render();
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
    dispose() {
      environment.dispose();
      flora.dispose();
      fish.dispose();
      particles.dispose();
      bloom.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
    },
  };
}
