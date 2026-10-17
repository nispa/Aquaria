import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { consoleSink, createLogger } from "../core/logger";
import { createAssetLoaders } from "../render/assetLoaders";
import { posedFish } from "../render/fishPortraits";
import { createFishRenderer } from "../render/fishRenderer";
import { neutralWaterUniforms } from "../render/uniforms";
import {
  MODEL_MANIFEST_FILE,
  modelFolderUrl,
  modelIdsOf,
  parseModelManifest,
  type ModelManifest,
} from "../scene/modelManifest";
import { parseCatalog } from "../scene/parse";
import type { Species } from "../scene/schema";
import { MAX_BEND, MAX_EFFORT, MIN_EFFORT } from "../sim/posture";
import { createDebugSliders, type DebugSliderSpec } from "../ui/debugSliders";

/**
 * A page for whoever adds or tunes a fish (`pnpm dev`, then
 * /model-viewer.html, also linked from /debug.html): it draws one species
 * from its side, as the aquarium draws it (procedural body or 3D model),
 * with the fish frame's grid over it, so the places model.json asks for
 * (eyes, jaw, gill covers) can be read off. Sliders move the gaze, the
 * mouth, the gills, the bend of a turn and the tail; each can swing by
 * itself ("auto"). The URL can set where they start:
 * ?id=<species>&model=0|1&gaze=-1..1&mouth=0..1&breath=0..1&zoom=x,y,halfWidth.
 * See docs/FISH_MODELS.md.
 */

/** The grid's step and the step of its labels, body lengths. */
const GRID_STEP = 0.05;
const LABEL_STEP = 0.1;
const DEFAULT_HALF_WIDTH = 0.6;
const ZOOM_RANGE: readonly [number, number] = [0.15, 1.2];
const BACKGROUND = 0x0b1a26;
const SAME = 1e-6;
const DEFAULT_SPECIES = "blue-tang";
/** Fastest tail beat the slider offers, beats per second. */
const MAX_BEATS = 3;
/** Seconds of one swing of each slider on auto. */
const PERIODS = { gaze: 3, mouth: 2, breath: 3, bend: 4, effort: 5 } as const;
/** How the gills open with time when the model does not say. */
const DEFAULT_GILL_RATE = 1;
/** Longest frame step, s, so a hidden tab does not jump the tail. */
const MAX_FRAME_SECONDS = 0.1;
const MILLISECONDS = 1000;

const logger = createLogger("model-viewer", consoleSink);

function numberParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : fallback;
}

interface View {
  centre: readonly [number, number];
  halfWidth: number;
}

function drawLines(
  context: CanvasRenderingContext2D,
  low: number,
  high: number,
  draw: (value: number, labelled: boolean) => void,
): void {
  for (let step = Math.ceil(low / GRID_STEP); step * GRID_STEP <= high; step += 1) {
    const value = step * GRID_STEP;
    const ratio = value / LABEL_STEP;
    context.beginPath();
    draw(value, Math.abs(ratio - Math.round(ratio)) < SAME);
    context.stroke();
  }
}

function drawGrid(canvas: HTMLCanvasElement, { centre, halfWidth }: View): void {
  const context = canvas.getContext("2d");
  if (context === null) return;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const scale = canvas.width / (2 * halfWidth);
  const halfHeight = canvas.height / 2 / scale;
  const toX = (x: number): number => canvas.width / 2 + (x - centre[0]) * scale;
  const toY = (y: number): number => canvas.height / 2 - (y - centre[1]) * scale;
  context.font = "11px system-ui, sans-serif";
  drawLines(context, centre[0] - halfWidth, centre[0] + halfWidth, (x, labelled) => {
    context.strokeStyle = labelled ? "rgba(255,110,110,0.75)" : "rgba(255,110,110,0.3)";
    context.moveTo(toX(x), 0);
    context.lineTo(toX(x), canvas.height);
    if (!labelled) return;
    context.fillStyle = "#ffb0b0";
    context.fillText(`x ${x.toFixed(1)}`, toX(x) + 3, 12);
  });
  drawLines(context, centre[1] - halfHeight, centre[1] + halfHeight, (y, labelled) => {
    context.strokeStyle = labelled ? "rgba(110,170,255,0.75)" : "rgba(110,170,255,0.3)";
    context.moveTo(0, toY(y));
    context.lineTo(canvas.width, toY(y));
    if (!labelled) return;
    context.fillStyle = "#b0d0ff";
    context.fillText(`y ${y.toFixed(1)}`, 4, toY(y) - 3);
  });
}

/** The time at which the gills are open by `breath` (0..1): breath = 0.5 - 0.5 cos(2 pi time rate). */
function breathTime(breath: number, rate: number): number {
  const open = Math.min(Math.max(breath, 0), 1);
  return Math.acos(1 - 2 * open) / (2 * Math.PI) / rate;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return response.json();
}

async function loadManifests(ids: readonly string[]): Promise<Map<string, ModelManifest>> {
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, ModelManifest] | undefined> => {
      try {
        const data = await fetchJson(`${modelFolderUrl(id)}/${MODEL_MANIFEST_FILE}`);
        return [id, parseModelManifest(data, id)];
      } catch (error) {
        logger.warn("Fish model manifest could not be loaded", { model: id, error: String(error) });
        return undefined;
      }
    }),
  );
  return new Map(entries.filter((entry) => entry !== undefined));
}

/** The species `id` names: a species id, or the model folder of one. */
function speciesNamed(all: readonly Species[], id: string): Species | undefined {
  return all.find((species) => species.id === id) ?? all.find((species) => species.model === id);
}

function sliderSpecs(params: URLSearchParams, halfWidth: number): DebugSliderSpec[] {
  return [
    {
      id: "gaze",
      label: "Gaze",
      min: -1,
      max: 1,
      value: numberParam(params, "gaze", 0),
      periodSeconds: PERIODS.gaze,
    },
    {
      id: "mouth",
      label: "Mouth",
      min: 0,
      max: 1,
      value: numberParam(params, "mouth", 0),
      periodSeconds: PERIODS.mouth,
    },
    {
      id: "breath",
      label: "Gills",
      min: 0,
      max: 1,
      value: numberParam(params, "breath", 0),
      periodSeconds: PERIODS.breath,
    },
    {
      id: "bend",
      label: "Turn bend",
      min: -MAX_BEND,
      max: MAX_BEND,
      value: 0,
      periodSeconds: PERIODS.bend,
    },
    {
      id: "effort",
      label: "Tail effort",
      min: MIN_EFFORT,
      max: MAX_EFFORT,
      value: 1,
      periodSeconds: PERIODS.effort,
    },
    { id: "beats", label: "Swimming (beats/s)", min: 0, max: MAX_BEATS, value: 0 },
    {
      id: "zoom",
      label: "Zoom (half width)",
      min: ZOOM_RANGE[0],
      max: ZOOM_RANGE[1],
      value: halfWidth,
    },
  ];
}

function fillSpeciesPicker(
  picker: HTMLSelectElement,
  all: readonly Species[],
  chosen: Species,
): void {
  for (const species of all) {
    const option = document.createElement("option");
    option.value = species.id;
    option.textContent = species.model === undefined ? species.name : `${species.name} (3D)`;
    option.selected = species === chosen;
    picker.append(option);
  }
}

async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const zoom = (params.get("zoom") ?? "").split(",").map(Number);
  const view: View = {
    centre: [zoom[0] ?? 0, zoom[1] ?? 0],
    halfWidth: zoom[2] ?? DEFAULT_HALF_WIDTH,
  };

  const modelCanvas = document.querySelector<HTMLCanvasElement>("#model");
  const gridCanvas = document.querySelector<HTMLCanvasElement>("#grid");
  const panel = document.querySelector<HTMLElement>("#controls");
  const picker = document.querySelector<HTMLSelectElement>("#species");
  const modelSwitch = document.querySelector<HTMLInputElement>("#use-model");
  if (
    modelCanvas === null ||
    gridCanvas === null ||
    panel === null ||
    picker === null ||
    modelSwitch === null
  ) {
    return;
  }

  const catalog = parseCatalog(await fetchJson("species.json"));
  const manifests = await loadManifests(modelIdsOf(catalog));
  const named =
    speciesNamed(catalog.species, params.get("id") ?? DEFAULT_SPECIES) ?? catalog.species[0];
  if (named === undefined) return;
  let species: Species = named;
  fillSpeciesPicker(picker, catalog.species, species);
  modelSwitch.checked = params.get("model") !== "0";

  const renderer = new WebGLRenderer({ canvas: modelCanvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  const loaders = createAssetLoaders(renderer);
  const water = neutralWaterUniforms();
  const fish = createFishRenderer(
    catalog,
    water,
    logger,
    { manifests, load: loaders.loadModel, loadAnimated: loaders.loadAnimated },
    (id) => id === named.id && modelSwitch.checked,
  );
  let individual = posedFish(species, new Vector3(1, 0, 0));

  const showSpecies = (next: Species): void => {
    fish.setModelEnabled(species.id, false);
    species = next;
    individual = posedFish(species, new Vector3(1, 0, 0));
    fish.setModelEnabled(species.id, modelSwitch.checked);
  };
  picker.addEventListener("change", () => {
    const next = catalog.species.find((entry) => entry.id === picker.value);
    if (next !== undefined) showSpecies(next);
  });
  modelSwitch.addEventListener("change", () => {
    fish.setModelEnabled(species.id, modelSwitch.checked);
  });

  const sliders = createDebugSliders(panel, sliderSpecs(params, view.halfWidth));

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const light = new DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 3);
  scene.add(fish.object, new AmbientLight(0xffffff, 1.6), light);
  const camera = new OrthographicCamera();
  camera.position.set(view.centre[0], view.centre[1], 5);
  camera.lookAt(view.centre[0], view.centre[1], 0);

  let framedWidth = 0;
  let framedHeight = 0;
  let framedZoom = 0;
  /** Fits the camera and the grid to the window and the zoom, when either changed. */
  const frame = (): void => {
    const width = modelCanvas.clientWidth;
    const height = modelCanvas.clientHeight;
    view.halfWidth = sliders.value("zoom");
    if (width === framedWidth && height === framedHeight && view.halfWidth === framedZoom) return;
    framedWidth = width;
    framedHeight = height;
    framedZoom = view.halfWidth;
    renderer.setSize(width, height, false);
    const aspect = height / width;
    camera.left = -view.halfWidth;
    camera.right = view.halfWidth;
    camera.top = view.halfWidth * aspect;
    camera.bottom = -view.halfWidth * aspect;
    camera.near = -10;
    camera.far = 10;
    camera.updateProjectionMatrix();
    drawGrid(gridCanvas, view);
  };

  let previous: number | undefined;
  let clock = 0;
  const tick = (now: number): void => {
    const seconds = Math.min((now - (previous ?? now)) / MILLISECONDS, MAX_FRAME_SECONDS);
    previous = now;
    clock += seconds;
    sliders.update(clock);
    individual.gaze = sliders.value("gaze");
    individual.mouth = sliders.value("mouth");
    individual.bend = sliders.value("bend");
    individual.effort = sliders.value("effort");
    const beats = sliders.value("beats");
    individual.swimPhase += 2 * Math.PI * beats * seconds;
    const rate = manifests.get(species.model ?? "")?.gills?.rate ?? DEFAULT_GILL_RATE;
    water.uTime.value = breathTime(sliders.value("breath"), rate);
    // A walking model steps as fast as the swimming slider beats.
    fish.update([individual], seconds * beats);
    frame();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };

  await fish.settled();
  frame();
  fish.update([individual]);
  renderer.render(scene, camera);
  document.body.dataset.state = "ready";
  requestAnimationFrame(tick);
}

void start();
