import "../ui/styles.css";
import { createFixedStepClock } from "../core/clock";
import { createFpsMeter } from "../core/fps";
import { classifyGpu, shortGpuName } from "../core/gpu";
import { consoleSink, createLogger } from "../core/logger";
import { createRng } from "../core/rng";
import { createAquariumView, type AquariumView } from "../render/aquariumView";
import { EFFECTS } from "../render/effects";
import {
  customSceneId,
  exportScene,
  importScene,
  isCustomSceneId,
  readCustomScenes,
  slugify,
  writeCustomScene,
} from "../scene/customScenes";
import { parseCatalog, parseScene, SceneValidationError } from "../scene/parse";
import type { Scene, SpeciesCatalog } from "../scene/schema";
import {
  applyCountOverrides,
  DEFAULT_MSAA_SAMPLES,
  MSAA_SAMPLE_CHOICES,
  parseSettings,
  type Settings,
} from "../scene/settings";
import type { Lights } from "../scene/lights";
import { lookFeatures, resolveLook, type Look } from "../scene/look";
import { applySceneryOverrides, sceneryEntries } from "../scene/scenery";
import {
  parseSceneIndex,
  sceneName,
  selectSceneId,
  withGroup,
  type SceneIndex,
} from "../scene/sceneIndex";
import { createDesigner, type Designer } from "../ui/designer";
import type { SceneChoice, SceneChoiceGroup } from "../ui/panel";
import { createSimulation, type Simulation } from "../sim/simulation";
import { createPanel } from "../ui/panel";
import { parseLaunchOptions } from "./launchOptions";

const SETTINGS_KEY = "aquaria.settings";
const CUSTOM_SCENES_KEY = "aquaria.customScenes";
const MY_SCENES_GROUP = "My scenes";
const SIMULATION_STEP_SECONDS = 1 / 60;
/** Longest frame accepted; after a tab switch the tank resumes instead of jumping. */
const MAX_FRAME_SECONDS = 0.25;
const FPS_WINDOW_SECONDS = 1;
const MS_PER_SECOND = 1000;
const CLOCK_REFRESH_MS = 1000;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = 3600;

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

/** Browser storage can be missing or blocked (private mode); settings are optional. */
function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const { settings, valid } = parseSettings(raw === null ? null : JSON.parse(raw));
    if (!valid) logger.warn("Saved settings were invalid and have been reset.");
    return settings;
  } catch {
    return parseSettings(null).settings;
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

/**
 * Opens another scene: saved as the choice, and replacing any ?scene= in the
 * URL. `designer` reopens the scene designer after the reload.
 */
function openScene(id: string | undefined, designer = false): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has("scene")) {
    if (id === undefined) url.searchParams.delete("scene");
    else url.searchParams.set("scene", id);
  }
  if (designer) url.searchParams.set("designer", "1");
  else url.searchParams.delete("designer");
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

/** Hands the viewer a file to save. */
function download(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Material ids for the designer; none if the index is missing. */
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
  const [indexData, catalogData, materialIds] = await Promise.all([
    fetchJson("scenes/index.json"),
    fetchJson("species.json"),
    loadMaterialIds(),
  ]);
  const catalog = parseCatalog(catalogData);
  const customScenes = loadCustomScenes(catalog);
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
  const features = lookFeatures(EFFECTS);
  let look: Look = resolveLook(features, settings.look ?? {}, options.effects);
  const baseScene = applyCountOverrides(
    parseScene(sceneData, catalog),
    settings.counts[sceneId] ?? {},
    catalog,
  );
  let sceneryCounts: Readonly<Record<string, number>> = settings.scenery?.[sceneId] ?? {};
  const scene = applySceneryOverrides(baseScene, sceneryCounts);

  // The wall clock is read once a second, not every frame (Date allocates).
  let clockHour = localHour();
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

  /**
   * Builds the simulation and the view for a scene. The scene designer's
   * preview calls it again with a draft: the old view is disposed and the
   * new one draws on the same canvas, with the current settings.
   */
  const mountScene = (shown: Scene): { simulation: Simulation; view: AquariumView } => {
    const rng = createRng(options.seed ?? shown.seed);
    const nextSimulation = createSimulation({ scene: shown, catalog, rng: rng.fork() });
    const nextView = createAquariumView({
      canvas,
      scene: shown,
      catalog,
      simulation: nextSimulation,
      rng: rng.fork(),
      logger: createLogger("render", consoleSink),
      renderHeight: settings.renderHeight,
      look,
      effects: EFFECTS,
      lights: effectiveLights(settings.lights),
      msaaSamples: settings.msaaSamples ?? DEFAULT_MSAA_SAMPLES,
      clockHour: () => clockHour,
    });
    nextSimulation.setSeabed((x, z) => nextView.seabedHeight(x, z));
    nextView.resize(window.innerWidth, window.innerHeight);
    return { simulation: nextSimulation, view: nextView };
  };
  let { simulation, view } = mountScene(scene);
  window.addEventListener("resize", () => {
    view.resize(window.innerWidth, window.innerHeight);
  });

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
      renderHeight: settings.renderHeight,
      showFps: settings.showFps,
      msaaSamples: settings.msaaSamples ?? DEFAULT_MSAA_SAMPLES,
      msaaChoices: MSAA_SAMPLE_CHOICES,
      features,
      look,
      scenery: sceneryEntries(scene),
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
      onOpenDesigner() {
        designer.toggle();
      },
      onRenderHeightChange(height) {
        view.setRenderHeight(height);
        update({ renderHeight: height });
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
      onFeatureChange(featureId, enabled) {
        const next = new Set(look);
        if (enabled) next.add(featureId);
        else next.delete(featureId);
        look = next;
        view.setLook(look);
        update({ look: { ...settings.look, [featureId]: enabled } });
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

  const saveScene = (draft: Scene, id: string): void => {
    let valid: Scene;
    try {
      valid = { ...parseScene({ ...draft, id }, catalog), id };
    } catch (error) {
      designer.showError(error instanceof SceneValidationError ? error.message : String(error));
      return;
    }
    storeCustomScenes((stored) => writeCustomScene(stored, valid));
    // The saved scene holds its own counts: panel overrides would hide them.
    const otherScenes = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));
    update({
      scene: id,
      counts: otherScenes(settings.counts),
      scenery: otherScenes(settings.scenery ?? {}),
    });
    openScene(id, true);
  };
  const designer: Designer = createDesigner(
    document.body,
    {
      // Start from what is on screen, with the current LED setup.
      scene: { ...scene, id: sceneId, lights: settings.lights ?? scene.lights },
      catalog,
      isCustom: isCustomSceneId(sceneId),
      materials: materialIds,
    },
    {
      onPreview(draft) {
        let shown: Scene;
        try {
          shown = parseScene(draft, catalog);
        } catch (error) {
          designer.showError(error instanceof SceneValidationError ? error.message : String(error));
          return;
        }
        designer.showError("");
        view.dispose();
        ({ simulation, view } = mountScene(shown));
      },
      onSave(draft, asNew) {
        const taken = Object.keys(customScenes);
        saveScene(draft, asNew ? customSceneId(draft.name, taken) : sceneId);
      },
      onExport(draft) {
        try {
          parseScene(draft, catalog);
        } catch (error) {
          designer.showError(error instanceof SceneValidationError ? error.message : String(error));
          return;
        }
        download(`${slugify(draft.name)}.json`, exportScene(draft));
      },
      onImport(file) {
        file
          .text()
          .then((json) => {
            const imported = importScene(json, catalog, Object.keys(customScenes));
            saveScene(imported.scene, imported.id);
          })
          .catch((error: unknown) => {
            designer.showError(error instanceof Error ? error.message : String(error));
          });
      },
      onDelete() {
        storeCustomScenes((stored) => writeCustomScene(stored, sceneId, "delete"));
        update({ scene: undefined });
        openScene(undefined);
      },
    },
  );
  if (options.designer === true) designer.open();

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
  let previous: number | undefined;
  const frame = (now: number): void => {
    const delta = previous === undefined ? 0 : (now - previous) / MS_PER_SECOND;
    previous = now;
    const steps = clock.advance(delta);
    for (let step = 0; step < steps; step += 1) simulation.step(clock.stepSeconds);
    view.render();
    fps.frame(delta);
    if (settings.showFps) panel.setFps(fps.fps);
    panel.setHour(view.hour());
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
  document.body.dataset.state = "ready";
}

start().catch(showError);
