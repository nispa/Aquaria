import { element, slider } from "./controls";
import { longHex } from "./formRows";

/**
 * The scene editor's tool bar, along the top of the window: add or remove
 * blocks, select and move plants and objects (turn, resize, delete the
 * selected one), brush size, how many layers show (slicing), smooth or
 * blocky rock, turning and zooming the view, and save, save as new or leave.
 * Big buttons, so it works with a finger as well as a mouse.
 */

export interface EditorBarState {
  /** Layers of blocks in the tank. */
  readonly layers: number;
  /** Whether the open scene is the viewer's own and may be overwritten. */
  readonly canSave: boolean;
  /** The name the scene is saved under, editable. */
  readonly name: string;
}

/**
 * What a tap on the tank does: blocks in or out, pick an item, set down the
 * palette's choice, or paint it with the brush.
 */
export type EditorTool = "add" | "remove" | "select" | "place" | "paint";

export interface EditorBarCallbacks {
  onTool(tool: EditorTool): void;
  /** Turns the selected item by degrees. */
  onTurnItem(degrees: number): void;
  /** Scales the selected item. */
  onResizeItem(factor: number): void;
  onDeleteItem(): void;
  /** Gives the selected item's whole entry this color. */
  onColorItem(color: string): void;
  onUndo(): void;
  onRedo(): void;
  /** Brush radius in blocks: 0 is a single block. */
  onBrush(radius: number): void;
  /** How close together the brush paints plants and objects, 1 (sparse) to MAX_DENSITY. */
  onDensity(density: number): void;
  /** The highest layer shown and edited, from 0. */
  onSlice(topLayer: number): void;
  onSmooth(smooth: boolean): void;
  /** Turns the view by quarter turns. */
  onTurn(quarters: number): void;
  onZoom(factor: number): void;
  onRename(name: string): void;
  onSave(): void;
  onSaveAsNew(): void;
  onExit(): void;
}

export interface EditorBar {
  /** Shows the tool in use; "place" when the palette took over. */
  setTool(tool: EditorTool): void;
  /** Enables the buttons for the selected item, showing its color, when there is one. */
  setSelected(selected: boolean, color?: string): void;
  /** Enables undo and redo when there is something to undo or redo. */
  setHistory(canUndo: boolean, canRedo: boolean): void;
  /** Shows a message, e.g. why saving failed; empty clears it. */
  showStatus(message: string): void;
  dispose(): void;
}

const MAX_BRUSH = 3;
export const MAX_DENSITY = 4;
export const DEFAULT_DENSITY = 2;
const ZOOM_STEP = 1.25;
/** One press of a turn button, degrees. */
const TURN_STEP = 15;
/** One press of a resize button. */
const RESIZE_STEP = 1.15;

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const node = element("button", "editor-bar__button", label);
  node.type = "button";
  node.title = title;
  node.setAttribute("aria-label", title);
  node.addEventListener("click", onClick);
  return node;
}

function labelled(text: string, input: HTMLElement): HTMLLabelElement {
  const row = element("label", "editor-bar__field");
  row.append(element("span", "editor-bar__label", text), input);
  return row;
}

export function createEditorBar(
  root: HTMLElement,
  state: EditorBarState,
  callbacks: EditorBarCallbacks,
): EditorBar {
  const bar = element("div", "editor-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Scene editor");

  const add = button("＋", "Add blocks", () => {
    choose("add");
  });
  const remove = button("－", "Remove blocks", () => {
    choose("remove");
  });
  const select = button("☝", "Select and move plants and objects", () => {
    choose("select");
  });
  const paint = button("🖌", "Paint the palette's choice with the brush", () => {
    choose("paint");
  });
  const tools = [
    ["add", add],
    ["remove", remove],
    ["select", select],
    ["paint", paint],
  ] as const;
  const show = (tool: EditorTool): void => {
    for (const [id, node] of tools) node.setAttribute("aria-pressed", String(id === tool));
  };
  const choose = (tool: EditorTool): void => {
    show(tool);
    callbacks.onTool(tool);
  };
  show("add");
  const itemButtons = [
    button("↺", "Turn the selected item left", () => {
      callbacks.onTurnItem(-TURN_STEP);
    }),
    button("↻", "Turn the selected item right", () => {
      callbacks.onTurnItem(TURN_STEP);
    }),
    button("▫", "Make the selected item smaller", () => {
      callbacks.onResizeItem(1 / RESIZE_STEP);
    }),
    button("▢", "Make the selected item bigger", () => {
      callbacks.onResizeItem(RESIZE_STEP);
    }),
    button("🗑", "Delete the selected item", () => {
      callbacks.onDeleteItem();
    }),
  ];
  const color = element("input", "editor-bar__color");
  color.type = "color";
  color.title = "Color of the selected item and the others like it";
  color.setAttribute("aria-label", "Color of the selected item");
  color.addEventListener("input", () => {
    callbacks.onColorItem(color.value);
  });
  const setSelected = (selected: boolean, shown?: string): void => {
    for (const node of itemButtons) node.disabled = !selected;
    color.disabled = !selected;
    if (shown !== undefined) color.value = longHex(shown);
  };
  setSelected(false);
  const undo = button("↶", "Undo (Ctrl+Z)", () => {
    callbacks.onUndo();
  });
  const redo = button("↷", "Redo (Ctrl+Y)", () => {
    callbacks.onRedo();
  });
  const setHistory = (canUndo: boolean, canRedo: boolean): void => {
    undo.disabled = !canUndo;
    redo.disabled = !canRedo;
  };
  setHistory(false, false);

  const brush = slider(0, MAX_BRUSH, 1, 0);
  brush.name = "brush";
  brush.addEventListener("input", () => {
    callbacks.onBrush(Number(brush.value));
  });
  const density = slider(1, MAX_DENSITY, 1, DEFAULT_DENSITY);
  density.name = "density";
  density.addEventListener("input", () => {
    callbacks.onDensity(Number(density.value));
  });
  const slice = slider(1, state.layers, 1, state.layers);
  slice.name = "layers";
  slice.addEventListener("input", () => {
    callbacks.onSlice(Number(slice.value) - 1);
  });
  const smoothInput = element("input", "editor-bar__check");
  smoothInput.type = "checkbox";
  smoothInput.name = "smooth";
  smoothInput.addEventListener("change", () => {
    callbacks.onSmooth(smoothInput.checked);
  });

  const name = element("input", "editor-bar__name");
  name.type = "text";
  name.value = state.name;
  name.setAttribute("aria-label", "Scene name");
  name.title = "The name the scene is saved under";
  name.addEventListener("input", () => {
    callbacks.onRename(name.value);
  });
  const status = element("span", "editor-bar__status");
  status.setAttribute("role", "status");
  const save = button("Save", "Save the scene", () => {
    callbacks.onSave();
  });
  save.disabled = !state.canSave;
  if (!state.canSave) save.title = "Bundled scenes are saved as new ones";

  bar.append(
    element("span", "editor-bar__title", "Editing"),
    undo,
    redo,
    add,
    remove,
    select,
    paint,
    ...itemButtons,
    color,
    labelled("Brush", brush),
    labelled("Density", density),
    labelled("Layers", slice),
    labelled("Smooth", smoothInput),
    button("⟲", "Turn left", () => {
      callbacks.onTurn(-1);
    }),
    button("⟳", "Turn right", () => {
      callbacks.onTurn(1);
    }),
    button("−", "Zoom out", () => {
      callbacks.onZoom(1 / ZOOM_STEP);
    }),
    button("+", "Zoom in", () => {
      callbacks.onZoom(ZOOM_STEP);
    }),
    status,
    name,
    save,
    button("Save as new", "Save as a new scene", () => {
      callbacks.onSaveAsNew();
    }),
    button("Exit", "Leave without saving", () => {
      callbacks.onExit();
    }),
  );
  root.append(bar);

  return {
    setTool: show,
    setSelected,
    setHistory,
    showStatus(message) {
      status.textContent = message;
    },
    dispose() {
      bar.remove();
    },
  };
}
