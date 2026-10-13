import type { EventBus } from "../core/eventBus";

/** A spot on the view in normalized device coordinates: -1..1, y up. */
export interface ViewSpot {
  readonly x: number;
  readonly y: number;
}

/** What viewers do with a mouse or a touch screen. */
export interface PointerEvents {
  /** The pointer rests or moves over the aquarium. */
  "pointer-move": ViewSpot;
  /** The pointer left the aquarium, or has not moved for a while. */
  "pointer-leave": undefined;
  /** A tap (click or touch) on the glass. */
  tap: ViewSpot;
}

/**
 * Seconds without movement after which the pointer counts as gone: a mouse
 * left on a kiosk would otherwise keep the fish at the glass forever.
 */
const POINTER_IDLE_MS = 8000;
const PRIMARY_BUTTON = 0;

export interface PointerInput {
  dispose(): void;
}

/** Turns pointer events on `target` into view-space events on the bus. */
export function createPointerInput(
  target: HTMLElement,
  bus: EventBus<PointerEvents>,
): PointerInput {
  let idleTimer = 0;

  const spotOf = (event: PointerEvent): ViewSpot => {
    const bounds = target.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: 1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    };
  };
  const leave = (): void => {
    window.clearTimeout(idleTimer);
    bus.emit("pointer-leave", undefined);
  };
  const onMove = (event: PointerEvent): void => {
    bus.emit("pointer-move", spotOf(event));
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(leave, POINTER_IDLE_MS);
  };
  const onDown = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;
    bus.emit("tap", spotOf(event));
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerleave", leave);

  return {
    dispose() {
      window.clearTimeout(idleTimer);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointerleave", leave);
    },
  };
}
