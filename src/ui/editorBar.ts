import type { CursorMode } from "../render/editorView";
import { element, slider } from "./controls";

/**
 * The scene editor's tool bar, along the top of the window: add or remove
 * blocks, brush size, how many layers show (slicing), smooth or blocky
 * rock, turning and zooming the view, and save, save as new or leave.
 * Big buttons, so it works with a finger as well as a mouse.
 */

export interface EditorBarState {
  /** Layers of blocks in the tank. */
  readonly layers: number;
  /** Whether the open scene is the viewer's own and may be overwritten. */
  readonly canSave: boolean;
}

export interface EditorBarCallbacks {
  onTool(mode: CursorMode): void;
  /** Brush radius in blocks: 0 is a single block. */
  onBrush(radius: number): void;
  /** The highest layer shown and edited, from 0. */
  onSlice(topLayer: number): void;
  onSmooth(smooth: boolean): void;
  /** Turns the view by quarter turns. */
  onTurn(quarters: number): void;
  onZoom(factor: number): void;
  onSave(): void;
  onSaveAsNew(): void;
  onExit(): void;
}

export interface EditorBar {
  /** Shows a message, e.g. why saving failed; empty clears it. */
  showStatus(message: string): void;
  dispose(): void;
}

const MAX_BRUSH = 3;
const ZOOM_STEP = 1.25;

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
  const choose = (mode: CursorMode): void => {
    add.setAttribute("aria-pressed", String(mode === "add"));
    remove.setAttribute("aria-pressed", String(mode === "remove"));
    callbacks.onTool(mode);
  };
  add.setAttribute("aria-pressed", "true");
  remove.setAttribute("aria-pressed", "false");

  const brush = slider(0, MAX_BRUSH, 1, 0);
  brush.name = "brush";
  brush.addEventListener("input", () => {
    callbacks.onBrush(Number(brush.value));
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

  const status = element("span", "editor-bar__status");
  status.setAttribute("role", "status");
  const save = button("Save", "Save the scene", () => {
    callbacks.onSave();
  });
  save.disabled = !state.canSave;
  if (!state.canSave) save.title = "Bundled scenes are saved as new ones";

  bar.append(
    element("span", "editor-bar__title", "Editing"),
    add,
    remove,
    labelled("Brush", brush),
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
    showStatus(message) {
      status.textContent = message;
    },
    dispose() {
      bar.remove();
    },
  };
}
