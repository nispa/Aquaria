import { FULL_HD_HEIGHT, resolutionLabel, UHD_HEIGHT } from "../core/resolution";
import type { Look, LookFeature, LookFeatureKind } from "../scene/look";
import type { SceneryEntry } from "../scene/scenery";
import { MAX_INDIVIDUALS_PER_SPECIES, type Species } from "../scene/schema";

/** Lowest height offered on the slider (half of Full HD, for weak GPUs). */
const MIN_HEIGHT = FULL_HD_HEIGHT / 2;
const HEIGHT_STEP = 60;
/** Seconds of mouse inactivity before the corner button hides again. */
const BUTTON_IDLE_MS = 2500;

export interface PanelState {
  readonly sceneName: string;
  readonly species: readonly Species[];
  readonly counts: Readonly<Record<string, number>>;
  /** Plants, rocks, corals and shells with their current counts. */
  readonly scenery: readonly SceneryEntry[];
  readonly renderHeight: number;
  readonly showFps: boolean;
  /** Switchable lighting features and effects, and which ones are on. */
  readonly features: readonly LookFeature[];
  readonly look: Look;
}

export interface PanelCallbacks {
  onCountChange(speciesId: string, count: number): void;
  onSceneryChange(key: string, count: number): void;
  onRenderHeightChange(height: number): void;
  onShowFpsChange(show: boolean): void;
  onFeatureChange(featureId: string, enabled: boolean): void;
  onFullscreen(): void;
}

export interface Panel {
  toggle(): void;
  setFps(fps: number | undefined): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FEATURE_HEADINGS: Readonly<Record<LookFeatureKind, string>> = {
  lighting: "Lighting",
  effect: "Post-processing",
};

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const row = element("label", "panel__row panel__row--check");
  const input = element("input", "panel__check");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    onChange(input.checked);
  });
  row.append(input, element("span", "panel__label", label));
  return row;
}

/** One section per feature kind, one switch per feature. */
function featureSections(
  features: readonly LookFeature[],
  look: Look,
  onChange: (featureId: string, enabled: boolean) => void,
): HTMLElement[] {
  return (Object.keys(FEATURE_HEADINGS) as LookFeatureKind[]).map((kind) => {
    const section = element("section", "panel__section");
    section.append(element("h2", "panel__heading", FEATURE_HEADINGS[kind]));
    for (const feature of features.filter((candidate) => candidate.kind === kind)) {
      const row = checkbox(feature.name, look.has(feature.id), (checked) => {
        onChange(feature.id, checked);
      });
      row.dataset.feature = feature.id;
      section.append(row);
    }
    return section;
  });
}

function slider(min: number, max: number, step: number, value: number): HTMLInputElement {
  const input = element("input", "panel__slider");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

/**
 * Hidden control panel. Nothing stays on screen permanently (static elements
 * wear LED walls unevenly): a corner button appears only while the mouse
 * moves, and the panel opens with it or with the H key.
 */
export function createPanel(
  root: HTMLElement,
  state: PanelState,
  callbacks: PanelCallbacks,
): Panel {
  const panel = element("aside", "panel");
  panel.setAttribute("aria-label", "Aquarium controls");
  panel.hidden = true;

  panel.append(element("h1", "panel__title", state.sceneName));

  const fauna = element("section", "panel__section");
  fauna.append(element("h2", "panel__heading", "Fauna"));
  for (const species of state.species) {
    const row = element("label", "panel__row");
    const value = element("output", "panel__value", String(state.counts[species.id] ?? 0));
    const input = slider(0, MAX_INDIVIDUALS_PER_SPECIES, 1, state.counts[species.id] ?? 0);
    input.dataset.species = species.id;
    input.addEventListener("input", () => {
      value.textContent = input.value;
      callbacks.onCountChange(species.id, Number(input.value));
    });
    row.append(element("span", "panel__label", species.name), input, value);
    fauna.append(row);
  }

  const scenery = element("section", "panel__section");
  scenery.append(element("h2", "panel__heading", "Scenery"));
  for (const entry of state.scenery) {
    const row = element("label", "panel__row");
    const value = element("output", "panel__value", String(entry.count));
    const input = slider(0, entry.max, 1, entry.count);
    input.dataset.scenery = entry.key;
    input.addEventListener("input", () => {
      value.textContent = input.value;
      callbacks.onSceneryChange(entry.key, Number(input.value));
    });
    row.append(element("span", "panel__label", entry.label), input, value);
    scenery.append(row);
  }

  const quality = element("section", "panel__section");
  quality.append(element("h2", "panel__heading", "Quality"));
  const resolutionRow = element("label", "panel__row");
  const resolutionValue = element("output", "panel__value", resolutionLabel(state.renderHeight));
  const resolution = slider(MIN_HEIGHT, UHD_HEIGHT, HEIGHT_STEP, state.renderHeight);
  resolution.name = "resolution";
  const setResolution = (height: number): void => {
    resolution.value = String(height);
    resolutionValue.textContent = resolutionLabel(height);
    callbacks.onRenderHeightChange(height);
  };
  resolution.addEventListener("input", () => {
    setResolution(Number(resolution.value));
  });
  resolutionRow.append(element("span", "panel__label", "Resolution"), resolution, resolutionValue);

  const presets = element("div", "panel__presets");
  for (const [label, height] of [
    ["Full HD", FULL_HD_HEIGHT],
    ["4K", UHD_HEIGHT],
  ] as const) {
    const button = element("button", "panel__button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      setResolution(height);
    });
    presets.append(button);
  }

  const fpsRow = checkbox("Show FPS", state.showFps, (checked) => {
    fpsCounter.hidden = !checked;
    callbacks.onShowFpsChange(checked);
  });

  const fullscreen = element("button", "panel__button panel__button--wide", "Full screen (F)");
  fullscreen.type = "button";
  fullscreen.addEventListener("click", () => {
    callbacks.onFullscreen();
  });

  quality.append(resolutionRow, presets, fpsRow, fullscreen);
  panel.append(
    fauna,
    scenery,
    ...featureSections(state.features, state.look, (featureId, enabled) => {
      callbacks.onFeatureChange(featureId, enabled);
    }),
    quality,
    element("p", "panel__hint", "H: show/hide · F: full screen"),
  );

  const fpsCounter = element("div", "fps");
  fpsCounter.hidden = !state.showFps;

  const opener = element("button", "opener", "☰");
  opener.type = "button";
  opener.setAttribute("aria-label", "Open controls");
  opener.hidden = true;

  let idleTimer: number | undefined;
  const onPointerMove = (): void => {
    opener.hidden = false;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      opener.hidden = true;
    }, BUTTON_IDLE_MS);
  };
  const toggle = (): void => {
    panel.hidden = !panel.hidden;
  };
  opener.addEventListener("click", toggle);
  const onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return;
    if (event.key === "h" || event.key === "H") toggle();
    if (event.key === "f" || event.key === "F") callbacks.onFullscreen();
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("keydown", onKey);

  root.append(panel, opener, fpsCounter);

  return {
    toggle,
    setFps(fps) {
      fpsCounter.textContent = fps === undefined ? "– fps" : `${fps} fps`;
    },
    dispose() {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKey);
      panel.remove();
      opener.remove();
      fpsCounter.remove();
    },
  };
}
