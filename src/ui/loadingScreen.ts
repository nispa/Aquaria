/**
 * The screen shown while the aquarium gets ready: the logo and the list of
 * steps, ticked off as they finish. Its markup and styles are in index.html,
 * so it shows before any script has arrived, and its animation is CSS only,
 * so it keeps moving while the main thread is busy building the tank.
 */

/** The steps, in the order they run; index.html has one list item for each. */
export const LOADING_STEPS = ["scene", "scenery", "models", "shaders", "frame"] as const;
export type LoadingStep = (typeof LOADING_STEPS)[number];

export type StepState = "done" | "current" | "waiting";

/** How each step looks while `current` runs; undefined: all done. */
export function stepStates<Step extends string>(
  steps: readonly Step[],
  current: Step | undefined,
): StepState[] {
  const at = current === undefined ? steps.length : steps.indexOf(current);
  return steps.map((_, index) => (index < at ? "done" : index === at ? "current" : "waiting"));
}

/** How long the fade out lasts, ms; matches the transition in index.html. */
const FADE_MS = 600;
/** A hidden tab gets no animation frames: the wait for a paint gives up after this, ms. */
const PAINT_TIMEOUT_MS = 100;

/**
 * Resolves once the browser has painted, so a change to the page shows
 * before the main thread is taken by a long task.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, PAINT_TIMEOUT_MS);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.clearTimeout(timeout);
        resolve();
      }, 0);
    });
  });
}

export interface LoadingScreen {
  /** Shows `step` as running and the ones before it as done; resolves once that is painted. */
  show(step: LoadingStep): Promise<void>;
  /** Fades the screen out and removes it. */
  fadeOut(): void;
  /** Removes the screen at once: for still frames taken as soon as the page is ready. */
  remove(): void;
}

/** Drives the loading screen in index.html; does nothing if the page has none. */
export function createLoadingScreen(root: HTMLElement | null): LoadingScreen {
  const items = LOADING_STEPS.map((step) =>
    root?.querySelector<HTMLElement>(`[data-step="${step}"]`),
  );
  const mark = (current: LoadingStep | undefined): void => {
    stepStates(LOADING_STEPS, current).forEach((state, index) => {
      const item = items[index];
      if (item !== null && item !== undefined) item.dataset.state = state;
    });
  };
  return {
    show(step) {
      mark(step);
      return afterPaint();
    },
    fadeOut() {
      if (root === null) return;
      mark(undefined);
      root.classList.add("loading--done");
      window.setTimeout(() => {
        root.remove();
      }, FADE_MS);
    },
    remove() {
      root?.remove();
    },
  };
}
