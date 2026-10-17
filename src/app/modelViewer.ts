import {
  AmbientLight,
  BufferAttribute,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { createAssetLoaders } from "../render/assetLoaders";
import { prepareFishModel } from "../render/fishModel";
import { modelMaterial } from "../render/fishRenderer";
import { neutralWaterUniforms } from "../render/uniforms";
import { modelFileUrl, modelFolderUrl, parseModelManifest } from "../scene/modelManifest";

/**
 * A page for whoever adds a fish model (`pnpm dev`, then
 * /model-viewer.html?id=<model folder>): it draws the model from its side,
 * as Aquaria prepares it, with the fish frame's grid over it, so the places
 * model.json asks for (eyes, jaw, gill covers) can be read off. The URL can
 * hold the gaze (-1..1), the mouth (0..1), the breath (0..1) and a zoom
 * (x,y,half width in body lengths). See docs/FISH_MODELS.md.
 */

/** The grid's step and the step of its labels, body lengths. */
const GRID_STEP = 0.05;
const LABEL_STEP = 0.1;
const DEFAULT_HALF_WIDTH = 0.6;
const BACKGROUND = 0x0b1a26;
const SAME = 1e-6;

function numberParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : fallback;
}

/** A per-vertex attribute holding one value, standing in for the renderer's per-fish ones. */
function constant(geometry: BufferGeometry, name: string, value: number): void {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(name, new BufferAttribute(new Float32Array(count).fill(value), 1));
}

interface View {
  readonly centre: readonly [number, number];
  readonly halfWidth: number;
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

async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") ?? "blue-tang";
  const gaze = numberParam(params, "gaze", 0);
  const mouth = numberParam(params, "mouth", 0);
  const zoom = (params.get("zoom") ?? "").split(",").map(Number);
  const view: View = {
    centre: [zoom[0] ?? 0, zoom[1] ?? 0],
    halfWidth: zoom[2] ?? DEFAULT_HALF_WIDTH,
  };

  const modelCanvas = document.querySelector<HTMLCanvasElement>("#model");
  const gridCanvas = document.querySelector<HTMLCanvasElement>("#grid");
  const help = document.querySelector<HTMLElement>("#help");
  if (modelCanvas === null || gridCanvas === null || help === null) return;
  help.textContent = `${id}: the fish's right side, snout to the right. URL: ?id=&gaze=-1..1&mouth=0..1&breath=0..1&zoom=x,y,halfWidth`;

  const renderer = new WebGLRenderer({ canvas: modelCanvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setSize(modelCanvas.clientWidth, modelCanvas.clientHeight, false);
  const loaders = createAssetLoaders(renderer);
  const response = await fetch(`${modelFolderUrl(id)}/model.json`);
  const manifest = parseModelManifest(await response.json(), id);
  const root = await loaders.loadModel(modelFileUrl(id, manifest));
  const water = neutralWaterUniforms();
  water.uTime.value = breathTime(numberParam(params, "breath", 0), manifest.gills?.rate ?? 1);

  const fish = new Group();
  for (const part of prepareFishModel(root, manifest)) {
    const { geometry } = part;
    constant(geometry, "aGaze", gaze);
    constant(geometry, "aMouth", mouth);
    constant(geometry, "aSwimPhase", 0);
    constant(geometry, "aOpacity", 1);
    constant(geometry, "aBend", 0);
    constant(geometry, "aEffort", 0);
    // An array of materials needs the geometry's groups; a single one does not.
    const mesh = new Mesh(
      geometry,
      Array.isArray(part.material)
        ? part.material.map((material) => modelMaterial(material, manifest, water))
        : modelMaterial(part.material, manifest, water),
    );
    if (part.mouthMorphIndex !== undefined && mesh.morphTargetInfluences !== undefined) {
      mesh.morphTargetInfluences[part.mouthMorphIndex] = mouth;
    }
    fish.add(mesh);
  }

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const light = new DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 3);
  scene.add(fish, new AmbientLight(0xffffff, 1.6), light);
  const aspect = modelCanvas.clientHeight / modelCanvas.clientWidth;
  const { centre, halfWidth } = view;
  const camera = new OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfWidth * aspect,
    -halfWidth * aspect,
    -10,
    10,
  );
  camera.position.set(centre[0], centre[1], 5);
  camera.lookAt(centre[0], centre[1], 0);
  renderer.render(scene, camera);
  drawGrid(gridCanvas, view);
  document.body.dataset.state = "ready";
}

void start();
