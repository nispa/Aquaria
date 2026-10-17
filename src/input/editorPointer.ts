import type { EventBus } from "../core/eventBus";
import type { ViewSpot } from "./pointer";

/**
 * What the scene editor's viewer does with a mouse or a touch screen: one
 * finger or the main button uses the tool (press, drag, release), two
 * fingers or another button move the view, and the wheel or a pinch zooms.
 */
export interface EditorPointerEvents {
  /** The pointer moves over the view with no tool stroke going on. */
  "editor-hover": ViewSpot;
  /** A tool stroke starts. */
  "editor-press": ViewSpot;
  /** The stroke goes on to another spot. */
  "editor-drag": ViewSpot;
  /** The stroke ends. */
  "editor-release": undefined;
  /** The view moves by a share of its size (normalized device units). */
  "editor-pan": { readonly dx: number; readonly dy: number };
  /** The view zooms by a factor (> 1 closer). */
  "editor-zoom": { readonly factor: number };
  /** The pointer left the view. */
  "editor-leave": undefined;
}

const PRIMARY_BUTTON = 0;
/** Zoom per wheel notch (100 pixels of scroll). */
const WHEEL_ZOOM = 1.15;
const WHEEL_NOTCH = 100;

export interface EditorPointerInput {
  dispose(): void;
}

/** Turns pointer and wheel events on `target` into editor events on the bus. */
export function createEditorPointerInput(
  target: HTMLElement,
  bus: EventBus<EditorPointerEvents>,
): EditorPointerInput {
  /** Pointers down, by id, at their last spot. */
  const down = new Map<number, ViewSpot>();
  let stroke: number | undefined;
  let panning: number | undefined;
  let pinch: number | undefined;

  const spotOf = (event: PointerEvent): ViewSpot => {
    const bounds = target.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
    };
  };
  const spread = (): number => {
    const [first, second] = [...down.values()];
    if (first === undefined || second === undefined) return 0;
    return Math.hypot(first.x - second.x, first.y - second.y);
  };
  const middle = (): ViewSpot => {
    let x = 0;
    let y = 0;
    for (const spot of down.values()) {
      x += spot.x / down.size;
      y += spot.y / down.size;
    }
    return { x, y };
  };

  const onDown = (event: PointerEvent): void => {
    target.setPointerCapture(event.pointerId);
    const spot = spotOf(event);
    down.set(event.pointerId, spot);
    if (down.size === 2) {
      // A second finger: the stroke was the start of a pan or a pinch.
      if (stroke !== undefined) bus.emit("editor-release", undefined);
      stroke = undefined;
      panning = undefined;
      pinch = spread();
      return;
    }
    if (down.size > 1) return;
    if (event.pointerType === "mouse" && event.button !== PRIMARY_BUTTON) {
      panning = event.pointerId;
      return;
    }
    stroke = event.pointerId;
    bus.emit("editor-press", spot);
  };

  const onMove = (event: PointerEvent): void => {
    const spot = spotOf(event);
    const before = down.get(event.pointerId);
    if (before === undefined) {
      bus.emit("editor-hover", spot);
      return;
    }
    if (pinch !== undefined && down.size >= 2) {
      const center = middle();
      down.set(event.pointerId, spot);
      const after = middle();
      bus.emit("editor-pan", { dx: after.x - center.x, dy: after.y - center.y });
      const now = spread();
      if (pinch > 0 && now > 0) bus.emit("editor-zoom", { factor: now / pinch });
      pinch = now;
      return;
    }
    down.set(event.pointerId, spot);
    if (event.pointerId === panning) {
      bus.emit("editor-pan", { dx: spot.x - before.x, dy: spot.y - before.y });
    } else if (event.pointerId === stroke) {
      bus.emit("editor-drag", spot);
    }
  };

  const onUp = (event: PointerEvent): void => {
    down.delete(event.pointerId);
    if (event.pointerId === stroke) bus.emit("editor-release", undefined);
    if (event.pointerId === stroke) stroke = undefined;
    if (event.pointerId === panning) panning = undefined;
    if (down.size < 2) pinch = undefined;
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    bus.emit("editor-zoom", { factor: WHEEL_ZOOM ** (-event.deltaY / WHEEL_NOTCH) });
  };
  const onLeave = (): void => {
    if (down.size === 0) bus.emit("editor-leave", undefined);
  };
  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("pointerleave", onLeave);
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("contextmenu", onContextMenu);
  return {
    dispose() {
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      target.removeEventListener("pointerleave", onLeave);
      target.removeEventListener("wheel", onWheel);
      target.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
