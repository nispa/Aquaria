import "../ui/styles.css";
import { createFixedStepClock } from "../core/clock";
import { createFpsMeter } from "../core/fps";
import { consoleSink, createLogger } from "../core/logger";
import { createRng } from "../core/rng";
import { createAquariumView } from "../render/aquariumView";
import { EFFECTS } from "../render/effects";
import { parseCatalog, parseScene } from "../scene/parse";
import { applyCountOverrides, parseSettings, type Settings } from "../scene/settings";
import type { Lights } from "../scene/lights";
import { lookFeatures, resolveLook, type Look } from "../scene/look";
import { applySceneryOverrides, sceneryEntries } from "../scene/scenery";
import { createSimulation } from "../sim/simulation";
import { createPanel } from "../ui/panel";
import { parseLaunchOptions } from "./launchOptions";

const SETTINGS_KEY = "aquaria.settings";
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

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#aquarium");
  if (canvas === null) throw new Error('Missing <canvas id="aquarium">.');

  const options = parseLaunchOptions(window.location.search);
  const [catalogData, sceneData] = await Promise.all([
    fetchJson("species.json"),
    fetchJson(`scenes/${options.scene}.json`),
  ]);
  const catalog = parseCatalog(catalogData);
  let settings = loadSettings();
  const features = lookFeatures(EFFECTS);
  let look: Look = resolveLook(features, settings.look ?? {}, options.effects);
  const baseScene = applyCountOverrides(
    parseScene(sceneData, catalog),
    settings.counts[options.scene] ?? {},
    catalog,
  );
  let sceneryCounts: Readonly<Record<string, number>> = settings.scenery?.[options.scene] ?? {};
  const scene = applySceneryOverrides(baseScene, sceneryCounts);

  const rng = createRng(options.seed ?? scene.seed);
  const simulation = createSimulation({ scene, catalog, rng: rng.fork() });
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

  const view = createAquariumView({
    canvas,
    scene,
    catalog,
    simulation,
    rng: rng.fork(),
    logger: createLogger("render", consoleSink),
    renderHeight: settings.renderHeight,
    look,
    effects: EFFECTS,
    lights: effectiveLights(settings.lights),
    clockHour: () => clockHour,
  });
  simulation.setSeabed((x, z) => view.seabedHeight(x, z));
  view.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () => {
    simulation.setSeabed((x, z) => view.seabedHeight(x, z));
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
      species: catalog.species,
      counts: Object.fromEntries(
        catalog.species.map((species) => [species.id, simulation.targetCount(species.id)]),
      ),
      renderHeight: settings.renderHeight,
      showFps: settings.showFps,
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
      onRenderHeightChange(height) {
        view.setRenderHeight(height);
        update({ renderHeight: height });
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
