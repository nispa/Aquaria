import { Vector3 } from "three";
import { createEventBus } from "../core/eventBus";
import { createEditorPointerInput, type EditorPointerEvents } from "../input/editorPointer";
import type { ViewSpot } from "../input/pointer";
import { createEditorView, type CursorMode } from "../render/editorView";
import { paintBlocks, pickBlock, type BlockCell } from "../scene/blockEditing";
import { blockGrid, cellCount, decodeRuns, encodeRuns } from "../scene/blocks";
import type { BlocksSpec, Scene } from "../scene/schema";
import { createEditorBar } from "../ui/editorBar";

/**
 * Editing mode: the window shows the scene editor instead of the tank, the
 * viewer builds rock from blocks, then saves (the tank is rebuilt with the
 * saved scene) or leaves without saving.
 */

export interface SceneEditorOptions {
  readonly canvas: HTMLCanvasElement;
  /** Where the tool bar goes. */
  readonly root: HTMLElement;
  readonly scene: Scene;
  /** Whether the scene is the viewer's own and may be overwritten. */
  readonly canSave: boolean;
  /** Saves the edited scene; returns why it could not, or undefined. */
  onSave(scene: Scene, asNew: boolean): string | undefined;
  onExit(): void;
}

export interface SceneEditor {
  resize(cssWidth: number, cssHeight: number): void;
  /** Draws a frame, rebuilding the rock first if it changed. */
  render(): void;
  dispose(): void;
}

/** Block edge for a scene with no blocks yet, m. */
const DEFAULT_BLOCK_SIZE = 0.05;
/** The first blocks of a scene: a plain grey stone, layered. */
const DEFAULT_BLOCKS: Pick<BlocksSpec, "color" | "material"> = {
  color: "#8a8178",
  material: { id: "layered-rock", tileSize: 0.5, displacement: 0 },
};

/** The scene with the edited blocks; without any solid block, none at all. */
function withBlocks(scene: Scene, size: number, cells: Uint8Array): Scene {
  const rest: Scene = { ...scene };
  delete rest.blocks;
  if (!cells.includes(1)) return rest;
  const look = scene.blocks ?? DEFAULT_BLOCKS;
  return { ...rest, blocks: { ...look, size, runs: encodeRuns(cells) } };
}

export function openSceneEditor(options: SceneEditorOptions): SceneEditor {
  const { canvas, scene } = options;
  const { tank } = scene;
  const size = scene.blocks?.size ?? DEFAULT_BLOCK_SIZE;
  const grid = blockGrid(tank, size);
  const cells =
    scene.blocks === undefined
      ? new Uint8Array(cellCount(grid))
      : decodeRuns(scene.blocks.runs, cellCount(grid));
  const view = createEditorView({
    canvas,
    tank,
    grid,
    cells,
    floorColor: scene.floor.color,
    rockColor: scene.blocks?.color ?? DEFAULT_BLOCKS.color,
    backgroundColor: scene.water.color,
  });

  let mode: CursorMode = "add";
  let radius = 0;
  let topLayer = grid.layers - 1;
  /** The blocks as they were when the stroke began: a stroke paints one surface, never its own. */
  let strokeStart: Uint8Array | undefined;
  let lastPainted: BlockCell | undefined;
  let dirty = false;
  const origin = new Vector3();
  const direction = new Vector3();

  const targetAt = (spot: ViewSpot): BlockCell | undefined => {
    view.ray(spot.x, spot.y, origin, direction);
    const pick = pickBlock(tank, grid, strokeStart ?? cells, origin, direction, topLayer);
    return mode === "add" ? pick?.place : pick?.hit;
  };
  const paint = (cell: BlockCell): void => {
    if (
      lastPainted?.column === cell.column &&
      lastPainted.layer === cell.layer &&
      lastPainted.row === cell.row
    ) {
      return;
    }
    lastPainted = cell;
    if (paintBlocks(grid, cells, cell, radius, mode === "add" ? 1 : 0, topLayer)) dirty = true;
  };
  const hover = (spot: ViewSpot): void => {
    view.setCursor(targetAt(spot), mode, radius);
  };

  const bus = createEventBus<EditorPointerEvents>();
  const input = createEditorPointerInput(canvas, bus);
  canvas.classList.add("editing");
  bus.on("editor-hover", hover);
  bus.on("editor-press", (spot) => {
    strokeStart = cells.slice();
    lastPainted = undefined;
    const cell = targetAt(spot);
    if (cell !== undefined) paint(cell);
    hover(spot);
  });
  bus.on("editor-drag", (spot) => {
    const cell = targetAt(spot);
    if (cell !== undefined) paint(cell);
    view.setCursor(cell, mode, radius);
  });
  bus.on("editor-release", () => {
    strokeStart = undefined;
    lastPainted = undefined;
  });
  bus.on("editor-leave", () => {
    view.setCursor(undefined, mode, radius);
  });
  bus.on("editor-pan", ({ dx, dy }) => {
    view.pan(dx, dy);
  });
  bus.on("editor-zoom", ({ factor }) => {
    view.zoom(factor);
  });

  const save = (asNew: boolean): void => {
    bar.showStatus(options.onSave(withBlocks(scene, size, cells), asNew) ?? "");
  };
  const bar = createEditorBar(
    options.root,
    { layers: grid.layers, canSave: options.canSave },
    {
      onTool(next) {
        mode = next;
      },
      onBrush(next) {
        radius = next;
      },
      onSlice(next) {
        topLayer = next;
        view.setSlice(next);
      },
      onSmooth(smooth) {
        view.setSmooth(smooth);
      },
      onTurn(quarters) {
        view.turn(quarters);
      },
      onZoom(factor) {
        view.zoom(factor);
      },
      onSave() {
        save(false);
      },
      onSaveAsNew() {
        save(true);
      },
      onExit() {
        options.onExit();
      },
    },
  );
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") options.onExit();
  };
  window.addEventListener("keydown", onKey);

  return {
    resize(cssWidth, cssHeight) {
      view.resize(cssWidth, cssHeight);
    },
    render() {
      if (dirty) {
        dirty = false;
        view.refresh();
      }
      view.render();
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      canvas.classList.remove("editing");
      input.dispose();
      bar.dispose();
      view.dispose();
    },
  };
}
