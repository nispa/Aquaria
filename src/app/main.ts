import "../ui/styles.css";
import { Vector2, Vector3 } from "three";
import { createFixedStepClock } from "../core/clock";
import { createEventBus } from "../core/eventBus";
import { createFpsMeter } from "../core/fps";
import { createFeatureCalibration, type FeatureCalibration } from "../core/featureCalibration";
import { createFrameLimiter } from "../core/frameLimiter";
import { createResolutionGovernor, type ResolutionGovernor } from "../core/resolutionGovernor";
import { classifyGpu, shortGpuName } from "../core/gpu";
import { consoleSink, createLogger } from "../core/logger";
import { createRng } from "../core/rng";
import { versionLabel } from "../core/version";
import { createAquariumView, type AquariumView } from "../render/aquariumView";
import { openSceneEditor, type SceneEditor } from "./sceneEditor";
import { drawFishPortraits, type FishPortraitRequest } from "../render/fishPortraits";
import { drawSceneryPortraits, type SceneryPortraitRequest } from "../render/sceneryPortraits";
import { EFFECTS } from "../render/effects";
import { createFileEffect, fileEffectFragment } from "../render/effects/fileEffect";
import { fragmentShaderError } from "../render/effects/shaderCheck";
import type { EffectDefinition } from "../render/effects/types";
import {
  customSceneId,
  exportScene,
  importScene,
  isCustomSceneId,
  readCustomScenes,
  slugify,
  writeCustomScene,
} from "../scene/customScenes";
import { DEFAULT_SIZE_BALANCE, displayCatalog } from "../scene/displaySize";
import {
  ANIMAL_MODELS_FOLDER,
  MODEL_MANIFEST_FILE,
  modelFolderUrl,
  modelIdsOf,
  parseModelManifest,
  type ModelManifest,
} from "../scene/modelManifest";
import {
  checkSceneObjects,
  createObjectCatalog,
  parseObjectIndex,
  type ObjectCatalog,
} from "../scene/objectCatalog";
import {
  OBJECT_MANIFEST_FILE,
  OBJECTS_FOLDER,
  objectFolderUrl,
  parseObjectManifest,
  type ObjectManifest,
} from "../scene/objectManifest";
import { parseCatalog, parseScene, SceneValidationError } from "../scene/parse";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import {
  applyCountOverrides,
  autoResolutionOf,
  DEFAULT_MSAA_SAMPLES,
  FRAME_LIMIT_CHOICES,
  frameLimitOf,
  MIN_RENDER_HEIGHT,
  soundOf,
  volumeOf,
  MSAA_SAMPLE_CHOICES,
  defaultRenderHeight,
  parseSettings,
  type FrameLimit,
  type Settings,
} from "../scene/settings";
import type { Lights } from "../scene/lights";
import {
  EFFECT_MANIFEST_FILE,
  EFFECTS_FOLDER,
  effectFolderUrl,
  effectShaderUrl,
  parseEffectIndex,
  parseEffectManifest,
} from "../scene/effectManifest";
import {
  calibrationPlan,
  LIGHTING_FEATURES,
  lookFeatures,
  resolveLook,
  type Look,
} from "../scene/look";
import { applySceneryOverrides, sceneryEntries } from "../scene/scenery";
import {
  parseSceneIndex,
  sceneName,
  selectSceneId,
  withGroup,
  type SceneIndex,
} from "../scene/sceneIndex";
import { readScenePictures, writeScenePicture } from "../scene/scenePictures";
import type { SceneChoice, SceneChoiceGroup } from "../ui/panel";
import { createSimulation, type Simulation } from "../sim/simulation";
import { createPanel } from "../ui/panel";
import { createPointerInput, type PointerEvents } from "../input/pointer";
import { createSoundBoard } from "../audio/soundBoard";
import { ABOUT } from "./about";
import { parseLaunchOptions } from "./launchOptions";
import { createActivityOverlay, type ScreenProjection } from "../ui/activityOverlay";

const SETTINGS_KEY = "aquaria.settings";
const CUSTOM_SCENES_KEY = "aquaria.customScenes";
const SCENE_PICTURES_KEY = "aquaria.scenePictures";
/** Side of a scene card picture, px: the bundled ones' size. */
const SCENE_PICTURE_SIZE = 360;
/** A saved scene's picture is taken this long after it shows: the fish have spread out. */
const SCENE_PICTURE_DELAY_MS = 6000;
const MY_SCENES_GROUP = "My scenes";
const SIMULATION_STEP_SECONDS = 1 / 60;
/** Longest frame accepted; after a tab switch the tank resumes instead of jumping. */
const MAX_FRAME_SECONDS = 0.25;
const FPS_WINDOW_SECONDS = 1;
/**
 * Share of each frame the GPU may spend on the aquarium: the rest stays free
 * for the desktop and the other windows, or the whole screen can stall.
 */
const GPU_FRAME_SHARE = 0.75;
/** Frames per second the budget is set for when there is no frame limit. */
const UNLIMITED_BUDGET_FPS = 60;
/** Keeps the sound's generator apart from the scene's. */
const SOUND_SEED_OFFSET = 7;
/** The automatic resolution moves in steps of this many pixels. */
const RESOLUTION_STEP = 60;
const MS_PER_SECOND = 1000;
const CLOCK_REFRESH_MS = 1000;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = 3600;
/** Keeps the feeding spots' generator apart from the scene's. */
const FEED_SEED_OFFSET = 7919;
/** Food falls in the middle of the view: this share of the width, and this depth range (share of depth). */
const FEED_WIDTH_SHARE = 0.6;
const FEED_DEPTH_SHARE = [0.15, 0.6] as const;
/** Food dropped at the pointer falls this share of the depth behind the glass. */
const FEED_POINTER_DEPTH_SHARE = 0.25;

function localHour(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / MINUTES_PER_HOUR + now.getSeconds() / SECONDS_PER_HOUR;
}

const logger = createLogger("app", consoleSink);

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  }
  // Single-page servers answer missing files with index.html and status 200.
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(`Could not load ${path}: the file does not exist or is not JSON.`);
  }
  return response.json();
}

/** Render height before the viewer picks one; the web build starts lighter (VITE_DEFAULT_RENDER_HEIGHT). */
const START_RENDER_HEIGHT = defaultRenderHeight(import.meta.env.VITE_DEFAULT_RENDER_HEIGHT);

/** Browser storage can be missing or blocked (private mode); settings are optional. */
function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const { settings, valid } = parseSettings(
      raw === null ? null : JSON.parse(raw),
      START_RENDER_HEIGHT,
    );
    if (!valid) logger.warn("Saved settings were invalid and have been reset.");
    return settings;
  } catch {
    return parseSettings(null, START_RENDER_HEIGHT).settings;
  }
}

function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    logger.warn("Settings could not be saved in this browser.");
  }
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  const overlay = document.createElement("div");
  overlay.className = "error";
  const text = document.createElement("pre");
  text.textContent = message;
  overlay.append(text);
  document.body.append(overlay);
  document.body.dataset.state = "error";
}

/** Names for the panel's scene list; a scene that fails to load is listed by its id. */
async function loadSceneChoices(
  index: SceneIndex,
  custom: Readonly<Record<string, Scene>>,
): Promise<SceneChoiceGroup[]> {
  const choice = async (id: string): Promise<SceneChoice> => {
    const own = custom[id];
    if (own !== undefined) return { id, name: own.name };
    try {
      return { id, name: sceneName(await fetchJson(`scenes/${id}.json`), id) };
    } catch {
      return { id, name: id };
    }
  };
  return Promise.all(
    index.groups.map(async (group) => ({
      name: group.name,
      scenes: await Promise.all(group.scenes.map(choice)),
    })),
  );
}

/** Opens another scene: saved as the choice, and replacing any ?scene= in the URL. */
function openScene(id: string | undefined): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has("scene")) {
    if (id === undefined) url.searchParams.delete("scene");
    else url.searchParams.set("scene", id);
  }
  window.location.assign(url);
}

function loadCustomScenes(catalog: SpeciesCatalog): Record<string, Scene> {
  try {
    return readCustomScenes(window.localStorage.getItem(CUSTOM_SCENES_KEY), catalog);
  } catch {
    return {};
  }
}

function storeCustomScenes(change: (stored: string | null) => string): void {
  try {
    window.localStorage.setItem(
      CUSTOM_SCENES_KEY,
      change(window.localStorage.getItem(CUSTOM_SCENES_KEY)),
    );
  } catch {
    logger.warn("Custom scenes could not be saved in this browser.");
  }
}

/** The card pictures of the viewer's own scenes, by id. */
function loadScenePictures(): Record<string, string> {
  try {
    return readScenePictures(window.localStorage.getItem(SCENE_PICTURES_KEY));
  } catch {
    return {};
  }
}

/** Keeps a scene's card picture, or forgets it so a fresh one is taken. */
function storeScenePicture(id: string, picture?: string): void {
  try {
    window.localStorage.setItem(
      SCENE_PICTURES_KEY,
      writeScenePicture(window.localStorage.getItem(SCENE_PICTURES_KEY), id, picture),
    );
  } catch {
    logger.warn("A scene picture could not be saved in this browser.");
  }
}

/** Hands the viewer a file to save. */
function download(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Material ids for the scene editor; none if the index is missing. */
async function loadMaterialIds(): Promise<string[]> {
  try {
    const data = (await fetchJson("assets/materials/index.json")) as { materials?: unknown };
    return Array.isArray(data.materials)
      ? data.materials.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Manifests of the catalog's 3D models. A missing manifest skips its species
 * with a warning; an invalid one is an error, like an invalid scene.
 */
async function loadModelManifests(catalog: SpeciesCatalog): Promise<Map<string, ModelManifest>> {
  const entries = await Promise.all(
    modelIdsOf(catalog).map(async (id): Promise<[string, ModelManifest] | undefined> => {
      let data: unknown;
      try {
        data = await fetchJson(`${modelFolderUrl(id)}/${MODEL_MANIFEST_FILE}`);
      } catch (error) {
        logger.warn("Fish model manifest could not be loaded", { model: id, error: String(error) });
        return undefined;
      }
      return [id, parseModelManifest(data, id)];
    }),
  );
  return new Map(entries.filter((entry) => entry !== undefined));
}

/**
 * The plants and objects of `assets/objects/`. A missing object.json skips
 * its object with a warning; an invalid one is an error, like an invalid scene.
 */
async function loadObjects(): Promise<ObjectCatalog> {
  const ids = parseObjectIndex(await fetchJson(`${OBJECTS_FOLDER}/index.json`));
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, ObjectManifest] | undefined> => {
      let data: unknown;
      try {
        data = await fetchJson(`${objectFolderUrl(id)}/${OBJECT_MANIFEST_FILE}`);
      } catch (error) {
        logger.warn("Object could not be loaded", { object: id, error: String(error) });
        return undefined;
      }
      const { manifest, warnings } = parseObjectManifest(data, id);
      for (const warning of warnings) logger.warn(warning);
      return [id, manifest];
    }),
  );
  return createObjectCatalog(entries.filter((entry) => entry !== undefined));
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(path);
  // Single-page servers answer missing files with index.html and status 200.
  if (!response.ok || (response.headers.get("content-type") ?? "").includes("html")) {
    throw new Error(`Could not load ${path}: the file does not exist.`);
  }
  return response.text();
}

/**
 * The effects made of files in `effects/` (scene/effectManifest). They are
 * extras: an effect that is missing, invalid, named like another feature or
 * whose shader does not compile is left out with a warning.
 */
async function loadFileEffects(): Promise<readonly EffectDefinition[]> {
  let ids: readonly string[];
  try {
    ids = parseEffectIndex(await fetchJson(`${EFFECTS_FOLDER}/index.json`));
  } catch (error) {
    logger.warn("No effects made of files", { error: String(error) });
    return [];
  }
  const taken = new Set([
    ...LIGHTING_FEATURES.map((feature) => feature.id),
    ...EFFECTS.map((effect) => effect.id),
  ]);
  const loaded = await Promise.all(
    ids.map(async (id): Promise<EffectDefinition | undefined> => {
      if (taken.has(id)) {
        logger.warn("Effect left out: its id is taken by Aquaria's own", { effect: id });
        return undefined;
      }
      try {
        const manifest = parseEffectManifest(
          await fetchJson(`${effectFolderUrl(id)}/${EFFECT_MANIFEST_FILE}`),
          id,
        );
        const body = await fetchText(effectShaderUrl(id, manifest));
        const error = fragmentShaderError(fileEffectFragment(manifest, body));
        if (error !== undefined) {
          logger.warn("Effect left out: its shader does not compile", { effect: id, error });
          return undefined;
        }
        return createFileEffect(id, manifest, body);
      } catch (error) {
        logger.warn("Effect left out", { effect: id, error: String(error) });
        return undefined;
      }
    }),
  );
  return loaded.filter((effect) => effect !== undefined);
}

/** The manifest of an animal's model (a visitor, a crab), from public/assets/animals. */
async function animalManifest(id: string): Promise<ModelManifest> {
  const data = await fetchJson(
    `${modelFolderUrl(id, ANIMAL_MODELS_FOLDER)}/${MODEL_MANIFEST_FILE}`,
  );
  return parseModelManifest(data, id);
}

/** A custom scene saved in this browser, or a clear error if it is gone. */
function customSceneData(custom: Readonly<Record<string, Scene>>, id: string): Scene {
  const scene = custom[id];
  if (scene === undefined) {
    throw new Error(`The scene "${id}" is not saved in this browser.`);
  }
  return scene;
}

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#aquarium");
  if (canvas === null) throw new Error('Missing <canvas id="aquarium">.');

  const options = parseLaunchOptions(window.location.search);
  let settings = loadSettings();
  const [indexData, catalogData, materialIds, objects, fileEffects] = await Promise.all([
    fetchJson("scenes/index.json"),
    fetchJson("species.json"),
    loadMaterialIds(),
    loadObjects(),
    loadFileEffects(),
  ]);
  // Aquaria's own effects, then those made of files.
  const effects = [...EFFECTS, ...fileEffects];
  const catalog = parseCatalog(catalogData);
  const modelManifests = await loadModelManifests(catalog);
  const customScenes = loadCustomScenes(catalog);
  const scenePictures = loadScenePictures();
  const sceneIndex = withGroup(
    parseSceneIndex(indexData),
    MY_SCENES_GROUP,
    Object.keys(customScenes),
  );
  const sceneId = selectSceneId(sceneIndex, options.scene, settings.scene);
  const [sceneData, sceneChoices] = await Promise.all([
    isCustomSceneId(sceneId)
      ? customSceneData(customScenes, sceneId)
      : fetchJson(`scenes/${sceneId}.json`),
    loadSceneChoices(sceneIndex, customScenes),
  ]);
  const features = lookFeatures(effects);
  // The look is fitted to the GPU on live frames; a requested list or a still frame is used as is.
  const fitsLook = options.effects === undefined && options.frozenSeconds === undefined;
  let look: Look = fitsLook
    ? calibrationPlan(features, settings.look ?? {}).start
    : resolveLook(features, settings.look ?? {}, options.effects);
  /** A scene validated, down to the plants and objects it names. */
  const parseWithObjects = (input: unknown): Scene => {
    const parsed = parseScene(input, catalog);
    checkSceneObjects(parsed, objects);
    return parsed;
  };
  const loadedScene = parseWithObjects(sceneData);
  const baseScene = applyCountOverrides(loadedScene, settings.counts[sceneId] ?? {}, catalog);
  let sceneryCounts: Readonly<Record<string, number>> = settings.scenery?.[sceneId] ?? {};
  const scene = applySceneryOverrides(baseScene, sceneryCounts);

  // The wall clock is read once a second, not every frame (Date allocates).
  // Scene switches keep the hour of the first start: the light stays put.
  const startHour = localHour();
  let clockHour = startHour;
  window.setInterval(() => {
    clockHour = localHour();
  }, CLOCK_REFRESH_MS);
  /** A custom or the scene's setup; `?hour=` pins the time for demos and snapshots. */
  const effectiveLights = (custom: Lights | undefined): Lights => {
    const chosen = custom ?? scene.lights;
    return options.hour === undefined
      ? chosen
      : { ...chosen, cycle: { ...chosen.cycle, mode: "fixed", hour: options.hour } };
  };

  // Sounds: the bubbling all along, and a sound for taps, food and the tools.
  const sounds = createSoundBoard(createRng((options.seed ?? scene.seed) + SOUND_SEED_OFFSET));
  sounds.setVolume(volumeOf(settings));
  sounds.setEnabled(soundOf(settings));
  // Browsers allow sound only after the viewer's first click or key.
  const unlockSound = (): void => {
    sounds.unlock();
  };
  window.addEventListener("pointerdown", unlockSound);
  window.addEventListener("keydown", unlockSound);

  /**
   * Builds the simulation and the view for a scene; called again after the
   * scene editor or a size change: the old view is disposed and the new one
   * draws on the same canvas, with the current settings.
   */
  const mountScene = (shown: Scene): { simulation: Simulation; view: AquariumView } => {
    sounds.setBubbling(shown.water.bubbles);
    const rng = createRng(options.seed ?? shown.seed);
    // The simulation sees the sizes as drawn; the catalog keeps the real ones.
    const sized = displayCatalog(
      catalog,
      shown.tank.width,
      settings.sizeBalance ?? DEFAULT_SIZE_BALANCE,
    );
    const nextSimulation = createSimulation({ scene: shown, catalog: sized, rng: rng.fork() });
    shownScene = shown;
    const nextView = createAquariumView({
      canvas,
      scene: shown,
      catalog,
      objects,
      modelManifests,
      animalManifest,
      fishModelEnabled,
      simulation: nextSimulation,
      rng: rng.fork(),
      logger: createLogger("render", consoleSink),
      renderHeight: settings.renderHeight,
      look,
      effects,
      lights: effectiveLights(settings.lights),
      msaaSamples: settings.msaaSamples ?? DEFAULT_MSAA_SAMPLES,
      clockHour: () => clockHour,
      startHour,
    });
    nextSimulation.setSeabed((x, z) => nextView.seabedHeight(x, z));
    nextSimulation.setPlaces(() => nextView.places());
    nextSimulation.setObstacles(() => nextView.obstacles());
    nextSimulation.setRockField(() => nextView.rockField());
    nextSimulation.setDaylight(() => nextView.daylight());
    nextSimulation.setRealistic(settings.realistic === true);
    nextSimulation.setTorch(torchOn);
    nextView.resize(window.innerWidth, window.innerHeight);
    return { simulation: nextSimulation, view: nextView };
  };
  /** Species show their 3D model unless the viewer switched it off. */
  const fishModelEnabled = (speciesId: string): boolean => settings.fishModels?.[speciesId] ?? true;
  /** The torch: while on, the pointer lights up the tank instead of being a finger. */
  let torchOn = false;
  /** The magnifier: while on, a lens over the pointer shows the tank up close. */
  let lensOn = false;
  const pointerAt = new Vector2();
  let shownScene = scene;
  let { simulation, view } = mountScene(scene);
  // Without a GPU timer nothing can be measured: the default look is drawn as is.
  const canFitLook = fitsLook && view.timesGpu;
  if (fitsLook && !canFitLook) {
    look = resolveLook(features, settings.look ?? {});
    view.setLook(look);
  }
  /** The scene editor while editing: it draws instead of the tank, and the simulation stops. */
  let editor: SceneEditor | undefined;
  const feedRng = createRng((options.seed ?? scene.seed) + FEED_SEED_OFFSET);
  // The pointer is a finger on the glass: curious fish come to look, a tap
  // startles them, and food falls where it points.
  const input = createEventBus<PointerEvents>();
  const pointer = createPointerInput(canvas, input);
  /** Pointing: the viewer's switch for a touch that points instead of tapping. */
  let pointingOn = false;
  /** The torch and the magnifier need pointing; on a touch screen it is the only way to aim them. */
  const updateTapping = (): void => {
    pointer.setTapping(!(pointingOn || torchOn || lensOn));
  };
  const finger = new Vector3();
  const sight = new Vector3();
  const tapPoint = new Vector3();
  let fingerOnGlass = false;
  input.on("pointer-move", ({ x, y }) => {
    if (editor !== undefined) return;
    pointerAt.set(x, y);
    if (lensOn) view.aimLens(pointerAt);
    fingerOnGlass = view.glassPoint(x, y, finger, sight);
    simulation.setFinger(fingerOnGlass ? finger : undefined, sight);
    if (torchOn) view.aimTorch(fingerOnGlass ? finger : undefined);
  });
  input.on("pointer-leave", () => {
    if (editor !== undefined) return;
    fingerOnGlass = false;
    simulation.setFinger(undefined);
    view.aimTorch(undefined);
    view.aimLens(undefined);
  });
  input.on("tap", ({ x, y }) => {
    if (editor !== undefined) return;
    if (!view.glassPoint(x, y, tapPoint)) return;
    simulation.tap(tapPoint);
    sounds.play("tap");
  });

  const feed = (): void => {
    const { width, depth } = scene.tank;
    sounds.play("feed");
    if (fingerOnGlass) {
      simulation.dropFood(finger.x, -depth * FEED_POINTER_DEPTH_SHARE);
      return;
    }
    simulation.dropFood(
      feedRng.range(-width / 2, width / 2) * FEED_WIDTH_SHARE,
      -depth * feedRng.range(FEED_DEPTH_SHARE[0], FEED_DEPTH_SHARE[1]),
    );
  };
  window.addEventListener("resize", () => {
    if (editor !== undefined) {
      editor.resize(window.innerWidth, window.innerHeight);
      return;
    }
    view.resize(window.innerWidth, window.innerHeight);
    governor.setMax(highestHeight());
  });

  // The automatic resolution never draws more pixels than the screen has; the
  // chosen resolution is its ceiling. Without it, the chosen one is drawn as is.
  const highestHeight = (): number => {
    const screenPixels = window.innerHeight * window.devicePixelRatio;
    const screen = Math.ceil(screenPixels / RESOLUTION_STEP) * RESOLUTION_STEP;
    return Math.max(Math.min(settings.renderHeight, screen), MIN_RENDER_HEIGHT);
  };
  /** What a frame may cost on the GPU, ms. */
  const frameBudgetMs = (limit: FrameLimit): number =>
    (GPU_FRAME_SHARE * MS_PER_SECOND) / (limit === 0 ? UNLIMITED_BUDGET_FPS : limit);
  const createGovernor = (limit: FrameLimit, start: number): ResolutionGovernor =>
    createResolutionGovernor({
      min: MIN_RENDER_HEIGHT,
      max: highestHeight(),
      step: RESOLUTION_STEP,
      start,
      budgetMs: frameBudgetMs(limit),
    });
  let governor = createGovernor(frameLimitOf(settings), highestHeight());
  let limiter = createFrameLimiter(frameLimitOf(settings));

  // Slider drags fire many events per frame; rebuild the scenery at most once per frame.
  let sceneryRebuildPending = false;
  const scheduleSceneryRebuild = (): void => {
    if (sceneryRebuildPending) return;
    sceneryRebuildPending = true;
    window.requestAnimationFrame(() => {
      sceneryRebuildPending = false;
      const next = applySceneryOverrides(baseScene, sceneryCounts);
      view.setScenery(next.flora, next.props);
    });
  };

  const update = (change: Partial<Settings>): void => {
    settings = { ...settings, ...change };
    saveSettings(settings);
  };

  // One batch of fish pictures at a time: each batch has its own small renderer.
  let portraits = Promise.resolve();
  const drawPortraits = (requests: readonly FishPortraitRequest[]): void => {
    portraits = portraits
      .then(() => drawFishPortraits(catalog, modelManifests, requests, logger))
      .catch((error: unknown) => {
        logger.warn("Fish pictures could not be drawn", { error: String(error) });
      });
  };
  // Scenery pictures wait their turn too: one small renderer at a time.
  const drawSceneryPictures = (requests: readonly SceneryPortraitRequest[]): void => {
    portraits = portraits
      .then(() => drawSceneryPortraits(scene, objects, requests, logger))
      .catch((error: unknown) => {
        logger.warn("Scenery pictures could not be drawn", { error: String(error) });
      });
  };

  const panel = createPanel(
    document.body,
    {
      sceneName: scene.name,
      gpu: { name: shortGpuName(view.gpuName()), kind: classifyGpu(view.gpuName()) },
      scenes: sceneChoices,
      sceneId,
      species: catalog.species,
      counts: Object.fromEntries(
        catalog.species.map((species) => [species.id, simulation.targetCount(species.id)]),
      ),
      sizeBalance: settings.sizeBalance ?? DEFAULT_SIZE_BALANCE,
      fishModels: Object.fromEntries(
        catalog.species.flatMap((species) =>
          species.model !== undefined && modelManifests.has(species.model)
            ? [[species.id, fishModelEnabled(species.id)]]
            : [],
        ),
      ),
      drawPortraits,
      renderHeight: settings.renderHeight,
      frameLimit: frameLimitOf(settings),
      frameLimitChoices: FRAME_LIMIT_CHOICES,
      autoResolution: autoResolutionOf(settings),
      sound: soundOf(settings),
      volume: volumeOf(settings),
      showFps: settings.showFps,
      realistic: settings.realistic === true,
      msaaSamples: settings.msaaSamples ?? DEFAULT_MSAA_SAMPLES,
      msaaChoices: MSAA_SAMPLE_CHOICES,
      features,
      look,
      canFitLook,
      openSections: settings.panelSections ?? {},
      version: versionLabel(import.meta.env.APP_VERSION, import.meta.env.APP_COMMIT),
      about: ABOUT,
      logo: `${import.meta.env.BASE_URL}title.webp`,
      // Bundled scenes have a card picture; the viewer's own do not.
      scenePicture: (id) =>
        sceneIndex.scenes.includes(id)
          ? `${import.meta.env.BASE_URL}scenes/thumbnails/${id}.jpg`
          : undefined,
      scenery: sceneryEntries(scene, objects),
      drawSceneryPortraits: drawSceneryPictures,
      lights: {
        lights: settings.lights ?? scene.lights,
        recommended: scene.lights,
        custom: settings.lights !== undefined,
      },
    },
    {
      onCountChange(speciesId, count) {
        simulation.setCount(speciesId, count);
        update({
          counts: {
            ...settings.counts,
            [scene.id]: { ...settings.counts[scene.id], [speciesId]: count },
          },
        });
      },
      onFishModelChange(speciesIds, enabled) {
        for (const id of speciesIds) view.setFishModel(id, enabled);
        update({
          fishModels: {
            ...settings.fishModels,
            ...Object.fromEntries(speciesIds.map((id) => [id, enabled])),
          },
        });
      },
      onSizeBalanceChange(balance) {
        update({ sizeBalance: balance });
        // Fish keep their sizes for life: rebuild the tank, keeping the counts and scenery.
        view.dispose();
        remount();
      },
      onSceneryChange(key, count) {
        sceneryCounts = { ...sceneryCounts, [key]: count };
        scheduleSceneryRebuild();
        update({ scenery: { ...settings.scenery, [scene.id]: sceneryCounts } });
      },
      onLightsChange(lights) {
        view.setLights(effectiveLights(lights));
        update({ lights });
      },
      onSceneChange(id) {
        update({ scene: id });
        openScene(id);
      },
      onOpenEditor() {
        if (editor === undefined) openEditor();
      },
      onRenderHeightChange(height) {
        update({ renderHeight: height });
        governor.setMax(highestHeight());
      },
      onFrameLimitChange(limit) {
        const choice = FRAME_LIMIT_CHOICES.find((candidate) => candidate === limit);
        if (choice === undefined) return;
        update({ frameLimit: choice });
        limiter = createFrameLimiter(choice);
        governor = createGovernor(choice, governor.height);
      },
      onAutoResolutionChange(enabled) {
        update({ autoResolution: enabled });
      },
      onMsaaChange(samples) {
        const choice = MSAA_SAMPLE_CHOICES.find((candidate) => candidate === samples);
        if (choice === undefined) return;
        view.setMsaa(choice);
        update({ msaaSamples: choice });
      },
      onShowFpsChange(show) {
        update({ showFps: show });
      },
      onRealisticChange(realistic) {
        simulation.setRealistic(realistic);
        update({ realistic });
      },
      onFeatureChange(featureId, enabled) {
        if (fitting !== undefined) stopFitting();
        const next = new Set(look);
        if (enabled) next.add(featureId);
        else next.delete(featureId);
        look = next;
        view.setLook(look);
        update({ look: { ...settings.look, [featureId]: enabled } });
      },
      onFitLook() {
        update({ look: {} });
        startFitting();
      },
      onFeed: feed,
      onPointingToggle() {
        pointingOn = !pointingOn;
        panel.setPointing(pointingOn);
        updateTapping();
      },
      onLensToggle() {
        lensOn = !lensOn;
        sounds.play(lensOn ? "lens-on" : "lens-off");
        view.aimLens(lensOn ? pointerAt : undefined);
        panel.setLens(lensOn);
        updateTapping();
      },
      onSoundChange(enabled) {
        // A key press may come before any click: it unlocks the sound too.
        sounds.unlock();
        sounds.setEnabled(enabled);
        update({ sound: enabled });
      },
      onVolumeChange(volume) {
        sounds.setVolume(volume);
        update({ volume });
      },
      onTorchToggle() {
        torchOn = !torchOn;
        sounds.play(torchOn ? "torch-on" : "torch-off");
        simulation.setTorch(torchOn);
        view.aimTorch(torchOn && fingerOnGlass ? finger : undefined);
        panel.setTorch(torchOn);
        updateTapping();
      },
      onSectionToggle(sectionId, open) {
        update({ panelSections: { ...settings.panelSections, [sectionId]: open } });
      },
      onFullscreen() {
        if (document.fullscreenElement === null) {
          document.documentElement.requestFullscreen().catch(() => {
            logger.warn("Full screen was refused by the browser.");
          });
        } else {
          void document.exitFullscreen();
        }
      },
    },
  );

  const clock = createFixedStepClock({
    stepSeconds: SIMULATION_STEP_SECONDS,
    maxDeltaSeconds: MAX_FRAME_SECONDS,
  });

  /** Validates and stores a scene, then opens it. Returns why it could not be saved, or undefined. */
  const saveScene = (draft: Scene, id: string): string | undefined => {
    let valid: Scene;
    try {
      valid = { ...parseWithObjects({ ...draft, id }), id };
    } catch (error) {
      return error instanceof SceneValidationError ? error.message : String(error);
    }
    storeCustomScenes((stored) => writeCustomScene(stored, valid));
    // The scene changed: its picture is taken again when it shows.
    storeScenePicture(id);
    // The saved scene holds its own counts: panel overrides would hide them.
    const otherScenes = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));
    update({
      scene: id,
      counts: otherScenes(settings.counts),
      scenery: otherScenes(settings.scenery ?? {}),
    });
    openScene(id);
    return undefined;
  };
  /** Rebuilds the tank on the canvas, keeping the fish counts and the viewer's scenery. */
  const remount = (): void => {
    const counts = catalog.species.map(
      (species) => [species.id, simulation.targetCount(species.id)] as const,
    );
    ({ simulation, view } = mountScene(shownScene));
    for (const [id, count] of counts) simulation.setCount(id, count);
    scheduleSceneryRebuild();
  };

  /** The scene as the viewer sees it, with the current LED setup: what the editor starts from. */
  const sceneOnScreen = (): Scene => ({
    ...scene,
    id: sceneId,
    lights: settings.lights ?? scene.lights,
  });
  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /**
   * Editing mode: the tank gives way to the scene editor until saved or left.
   * `start` is the scene to edit, the one on screen unless the editor starts
   * again on its own work (a resized tank).
   */
  const openEditor = (start: Scene = sceneOnScreen()): void => {
    if (editor === undefined) {
      panel.setSuspended(true);
      view.dispose();
    } else {
      editor.dispose();
    }
    const opened = openSceneEditor({
      canvas,
      root: document.body,
      objects,
      logger,
      drawPortraits(shown, requests) {
        portraits = portraits
          .then(() => drawSceneryPortraits(shown, objects, requests, logger))
          .catch((error: unknown) => {
            logger.warn("Palette pictures could not be drawn", { error: String(error) });
          });
      },
      scene: start,
      canSave: isCustomSceneId(sceneId),
      materials: materialIds,
      // Every bundled scene is a biome the scene can take its water and light from.
      environments: sceneChoices
        .filter((group) => group.name !== MY_SCENES_GROUP)
        .flatMap((group) => group.scenes),
      loadEnvironment: async (id) => parseWithObjects(await fetchJson(`scenes/${id}.json`)),
      onSave(draft, asNew) {
        const id = asNew ? customSceneId(draft.name, Object.keys(customScenes)) : sceneId;
        return saveScene(draft, id);
      },
      onReopen(next) {
        openEditor(next);
      },
      onExport(draft) {
        try {
          parseWithObjects(draft);
        } catch (error) {
          opened.showStatus(errorMessage(error));
          return;
        }
        download(`${slugify(draft.name)}.json`, exportScene(draft));
      },
      onImport(file) {
        file
          .text()
          .then((json) => {
            const imported = importScene(json, catalog, Object.keys(customScenes));
            checkSceneObjects(imported.scene, objects);
            const problem = saveScene(imported.scene, imported.id);
            if (problem !== undefined) opened.showStatus(problem);
          })
          .catch((error: unknown) => {
            opened.showStatus(errorMessage(error));
          });
      },
      onDelete() {
        storeCustomScenes((stored) => writeCustomScene(stored, sceneId, "delete"));
        storeScenePicture(sceneId);
        update({ scene: undefined });
        openScene(undefined);
      },
      onExit() {
        editor?.dispose();
        editor = undefined;
        panel.setSuspended(false);
        remount();
      },
    });
    editor = opened;
    opened.resize(window.innerWidth, window.innerHeight);
  };

  // A saved scene without a card picture gets a frame of its tank, once the fish have spread out.
  if (isCustomSceneId(sceneId) && scenePictures[sceneId] === undefined) {
    window.setTimeout(() => {
      if (editor !== undefined) return;
      const picture = view.snapshot(SCENE_PICTURE_SIZE);
      storeScenePicture(sceneId, picture);
      panel.setScenePicture(sceneId, picture);
    }, SCENE_PICTURE_DELAY_MS);
  }

  // Fitting the look to the GPU: features are added one at a time while the
  // resolution stays at its highest, then the automatic resolution takes over.
  let fitting: FeatureCalibration | undefined;
  /** Features the fitting added, in the order it added them. */
  let fitted: string[] = [];
  const startFitting = (): void => {
    const plan = calibrationPlan(features, settings.look ?? {});
    look = plan.start;
    view.setLook(look);
    panel.setLook(look);
    fitted = [];
    fitting = createFeatureCalibration(plan.candidates, frameBudgetMs(frameLimitOf(settings)));
    panel.setLookFitting(true, fitted);
  };
  const stopFitting = (): void => {
    fitting = undefined;
    panel.setLookFitting(false, fitted);
    governor = createGovernor(frameLimitOf(settings), highestHeight());
    logger.info("Look fitted to the GPU", { added: fitted.join(", ") });
  };
  const fitLook = (gpuMs: number, seconds: number): void => {
    if (fitting === undefined) return;
    const changes = fitting.frame(gpuMs, seconds);
    if (changes.length > 0) {
      const next = new Set(look);
      for (const { id, enabled } of changes) {
        if (enabled) next.add(id);
        else next.delete(id);
        fitted = enabled ? [...fitted, id] : fitted.filter((other) => other !== id);
      }
      look = next;
      view.setLook(look);
      panel.setLook(look);
    }
    if (fitting.done) stopFitting();
  };
  if (canFitLook) startFitting();

  if (options.frozenSeconds !== undefined) {
    // Deterministic still frame for visual tests: no animation loop.
    const steps = Math.round(options.frozenSeconds / SIMULATION_STEP_SECONDS);
    for (let step = 0; step < steps; step += 1) simulation.step(SIMULATION_STEP_SECONDS);
    await view.ready();
    view.render();
    document.body.dataset.state = "ready";
    return;
  }

  const fps = createFpsMeter(FPS_WINDOW_SECONDS);
  // What every fish is doing, toggled with A.
  const activityOverlay = createActivityOverlay(document.body, {
    shown: options.debug?.includes("overlay") ?? false,
    shapes: options.debug?.includes("shapes") ?? false,
  });
  const project: ScreenProjection = (point, out) => view.screenPoint(point, out);
  let previous: number | undefined;
  let previousDrawn: number | undefined;
  // The view the height was last set on, and the height: a new scene brings a new view.
  let sizedView: AquariumView | undefined;
  let drawnHeight = 0;
  const frame = (now: number): void => {
    window.requestAnimationFrame(frame);
    if (editor !== undefined) {
      editor.render();
      previous = undefined;
      return;
    }
    const delta = previous === undefined ? 0 : (now - previous) / MS_PER_SECOND;
    previous = now;
    const steps = clock.advance(delta);
    for (let step = 0; step < steps; step += 1) simulation.step(clock.stepSeconds);
    if (!limiter.due(now)) return;
    const intervalMs = previousDrawn === undefined ? 0 : now - previousDrawn;
    previousDrawn = now;
    const automatic = autoResolutionOf(settings);
    const height = !automatic
      ? settings.renderHeight
      : fitting === undefined
        ? governor.height
        : highestHeight();
    if (view !== sizedView || height !== drawnHeight) {
      view.setRenderHeight(height);
      sizedView = view;
      drawnHeight = height;
    }
    view.render();
    activityOverlay.draw(simulation.fish, simulation.gesture, view.obstacles(), project);
    const gpuMs = view.gpuMs();
    if (fitting !== undefined) {
      if (gpuMs !== undefined && intervalMs > 0) fitLook(gpuMs, intervalMs / MS_PER_SECOND);
    } else if (automatic && intervalMs > 0) {
      // Without a GPU timer, frames arriving late are the only sign of a busy GPU.
      const cost = gpuMs ?? intervalMs * GPU_FRAME_SHARE;
      governor.frame(cost, intervalMs / MS_PER_SECOND);
    }
    fps.frame(intervalMs / MS_PER_SECOND);
    if (settings.showFps) panel.setFps(fps.fps, drawnHeight);
    panel.setHour(view.hour());
  };
  window.requestAnimationFrame(frame);
  document.body.dataset.state = "ready";
}

start().catch(showError);
