import "../ui/styles.css";
import { createFixedStepClock } from "../core/clock";
import { createFpsMeter } from "../core/fps";
import { consoleSink, createLogger } from "../core/logger";
import { createRng } from "../core/rng";
import { createAquariumView } from "../render/aquariumView";
import { parseCatalog, parseScene } from "../scene/parse";
import { applyCountOverrides, parseSettings, type Settings } from "../scene/settings";
import { createSimulation } from "../sim/simulation";
import { createPanel } from "../ui/panel";
import { parseLaunchOptions } from "./launchOptions";

const SETTINGS_KEY = "aquaria.settings";
const SIMULATION_STEP_SECONDS = 1 / 60;
/** Longest frame accepted; after a tab switch the tank resumes instead of jumping. */
const MAX_FRAME_SECONDS = 0.25;
const FPS_WINDOW_SECONDS = 1;
const MS_PER_SECOND = 1000;

const logger = createLogger("app", consoleSink);

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
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
  const scene = applyCountOverrides(
    parseScene(sceneData, catalog),
    settings.counts[options.scene] ?? {},
    catalog,
  );

  const rng = createRng(options.seed ?? scene.seed);
  const simulation = createSimulation({ scene, catalog, rng: rng.fork() });
  const view = createAquariumView({
    canvas,
    scene,
    catalog,
    simulation,
    rng: rng.fork(),
    logger: createLogger("render", consoleSink),
    renderHeight: settings.renderHeight,
  });
  view.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () => {
    view.resize(window.innerWidth, window.innerHeight);
  });

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
      onRenderHeightChange(height) {
        view.setRenderHeight(height);
        update({ renderHeight: height });
      },
      onShowFpsChange(show) {
        update({ showFps: show });
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
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
  document.body.dataset.state = "ready";
}

start().catch(showError);
