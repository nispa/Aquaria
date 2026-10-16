import { FULL_HD_HEIGHT, resolutionLabel, UHD_HEIGHT } from "../core/resolution";
import type { GpuKind } from "../core/gpu";
import type { Lights } from "../scene/lights";
import type { Look, LookFeature, LookFeatureKind } from "../scene/look";
import { checkbox, collapsible, element, select, slider } from "./controls";
import { createFishCards, type DrawPortraits } from "./fishCards";
import { createLightsSection, type LightsSectionState } from "./lightsSection";
import type { SceneryEntry } from "../scene/scenery";
import type { Species } from "../scene/schema";

/** Lowest height offered on the slider (half of Full HD, for weak GPUs). */
const MIN_HEIGHT = FULL_HD_HEIGHT / 2;
const HEIGHT_STEP = 60;
/** Seconds of mouse inactivity before the corner button hides again. */
const BUTTON_IDLE_MS = 2500;
const PERCENT = 100;
const SIZE_STEP = 5;
/** Sections open until the viewer closes them; every other section starts closed. */
const OPEN_BY_DEFAULT: ReadonlySet<string> = new Set(["fauna"]);

/** "Real" at 0, "Alike" at 1, a percentage in between. */
function sizeBalanceLabel(balance: number): string {
  if (balance === 0) return "Real";
  if (balance === 1) return "Alike";
  return `${Math.round(balance * PERCENT)}%`;
}

/** A scene offered in the panel's scene list. */
export interface SceneChoice {
  readonly id: string;
  readonly name: string;
}

/** A named group of scenes, e.g. "Open sea" or "Aquariums". */
export interface SceneChoiceGroup {
  readonly name: string;
  readonly scenes: readonly SceneChoice[];
}

export interface PanelState {
  readonly sceneName: string;
  readonly scenes: readonly SceneChoiceGroup[];
  readonly sceneId: string;
  readonly species: readonly Species[];
  readonly counts: Readonly<Record<string, number>>;
  /** How fish sizes are drawn: 0 real .. 1 all alike. */
  readonly sizeBalance: number;
  /** Species with a 3D model, and whether it is shown instead of the procedural body. */
  readonly fishModels: Readonly<Record<string, boolean>>;
  /** Draws the fish cards' pictures, the first time the panel opens. */
  readonly drawPortraits: DrawPortraits;
  /** The GPU the browser draws with, and whether it is the fast one. */
  readonly gpu: { readonly name: string; readonly kind: GpuKind };
  /** LED setup and cycle. */
  readonly lights: LightsSectionState;
  /** Plants, rocks, corals and shells with their current counts. */
  readonly scenery: readonly SceneryEntry[];
  readonly renderHeight: number;
  /** Frames per second at most, one of `frameLimitChoices`; 0 = no limit. */
  readonly frameLimit: number;
  readonly frameLimitChoices: readonly number[];
  /** The resolution drops when the GPU cannot keep up, up to `renderHeight`. */
  readonly autoResolution: boolean;
  readonly showFps: boolean;
  /** Fish keep their hours and the playful spells are off. */
  readonly realistic: boolean;
  /** Multisample anti-aliasing samples, one of `msaaChoices`. */
  readonly msaaSamples: number;
  readonly msaaChoices: readonly number[];
  /** Switchable lighting features and effects, and which ones are on. */
  readonly features: readonly LookFeature[];
  readonly look: Look;
  /** Release and build shown at the bottom, e.g. "v1.0.1 · 9b2d5f7". */
  readonly version: string;
  /** Saved open/closed state per section id; absent sections use their default. */
  readonly openSections: Readonly<Record<string, boolean>>;
}

export interface PanelCallbacks {
  onSceneChange(sceneId: string): void;
  onOpenDesigner(): void;
  onCountChange(speciesId: string, count: number): void;
  /** Called when the slider is released: the tank is rebuilt with the new sizes. */
  onSizeBalanceChange(balance: number): void;
  /** Shows these species with their 3D models, or with their procedural bodies. */
  onFishModelChange(speciesIds: readonly string[], enabled: boolean): void;
  onSceneryChange(key: string, count: number): void;
  /** A custom setup, or undefined to go back to the recommended one. */
  onLightsChange(lights: Lights | undefined): void;
  onRenderHeightChange(height: number): void;
  onFrameLimitChange(limit: number): void;
  onAutoResolutionChange(enabled: boolean): void;
  onShowFpsChange(show: boolean): void;
  onRealisticChange(realistic: boolean): void;
  onMsaaChange(samples: number): void;
  onFeatureChange(featureId: string, enabled: boolean): void;
  onFullscreen(): void;
  /** Drops a pinch of food into the tank. */
  onFeed(): void;
  /** Switches the torch on or off. */
  onTorchToggle(): void;
  onSectionToggle(sectionId: string, open: boolean): void;
}

export interface Panel {
  toggle(): void;
  /** Shows the frame rate and, when given, the height drawn at (pixels). */
  setFps(fps: number | undefined, height?: number): void;
  /** Shows the aquarium's time of day. Cheap to call every frame. */
  setHour(hour: number): void;
  /** Shows whether the torch is on. */
  setTorch(on: boolean): void;
  dispose(): void;
}

const FEATURE_HEADINGS: Readonly<Record<LookFeatureKind, string>> = {
  lighting: "Lighting",
  effect: "Post-processing",
};

type SectionFactory = (id: string, title: string) => HTMLDetailsElement;

/** One section per feature kind, one switch per feature. */
function featureSections(
  features: readonly LookFeature[],
  look: Look,
  section: SectionFactory,
  onChange: (featureId: string, enabled: boolean) => void,
): HTMLElement[] {
  return (Object.keys(FEATURE_HEADINGS) as LookFeatureKind[]).map((kind) => {
    const box = section(kind, FEATURE_HEADINGS[kind]);
    for (const feature of features.filter((candidate) => candidate.kind === kind)) {
      const row = checkbox(feature.name, look.has(feature.id), (checked) => {
        onChange(feature.id, checked);
      });
      row.dataset.feature = feature.id;
      box.append(row);
    }
    return box;
  });
}

/** Three flakes drifting down: the feed button's icon. */
const FEED_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">' +
  '<rect x="5" y="4" width="4" height="4" rx="1" transform="rotate(15 7 6)"/>' +
  '<rect x="14" y="8" width="4" height="4" rx="1" transform="rotate(-20 16 10)"/>' +
  '<rect x="8" y="15" width="4" height="4" rx="1" transform="rotate(35 10 17)"/></svg>';

/** A hand torch with its beam: the torch button's icon. */
const TORCH_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">' +
  '<path d="M3 10h7l3-3v10l-3-3H3z"/>' +
  '<path d="M15 9l6-3v2l-6 2zM15 12h6v1h-6zM15 15l6 2v2l-6-3z" opacity="0.7"/></svg>';

/**
 * Hidden control panel. Nothing stays on screen permanently (static elements
 * wear LED walls unevenly): a row of corner buttons (torch, feed, panel)
 * appears only while the pointer moves or touches the screen, and the panel
 * opens with it or with the H key.
 */
export function createPanel(
  root: HTMLElement,
  state: PanelState,
  callbacks: PanelCallbacks,
): Panel {
  const panel = element("aside", "panel");
  panel.setAttribute("aria-label", "Aquarium controls");
  panel.hidden = true;

  const sectionWithSummary = (id: string, title: string) =>
    collapsible(id, title, state.openSections[id] ?? OPEN_BY_DEFAULT.has(id), (open) => {
      callbacks.onSectionToggle(id, open);
    });
  const section: SectionFactory = (id, title) => sectionWithSummary(id, title).section;

  panel.append(element("h1", "panel__title", state.sceneName));
  const sceneSelect = select("Scene", [], state.sceneId);
  for (const group of state.scenes) {
    const optgroup = element("optgroup", "");
    optgroup.label = group.name;
    for (const choice of group.scenes) {
      const option = element("option", "", choice.name);
      option.value = choice.id;
      optgroup.append(option);
    }
    sceneSelect.input.append(optgroup);
  }
  sceneSelect.input.value = state.sceneId;
  sceneSelect.input.name = "scene";
  sceneSelect.input.addEventListener("change", () => {
    callbacks.onSceneChange(sceneSelect.input.value);
  });
  const designerButton = element("button", "panel__button panel__button--wide", "Scene designer");
  designerButton.type = "button";
  designerButton.addEventListener("click", () => {
    callbacks.onOpenDesigner();
  });
  const feedButton = element(
    "button",
    "panel__button panel__button--wide",
    "Feed the fish (Space)",
  );
  feedButton.type = "button";
  feedButton.addEventListener("click", () => {
    callbacks.onFeed();
  });
  panel.append(sceneSelect.row, designerButton, feedButton);

  const fauna = section("fauna", "Fauna");
  const sizeRow = element("label", "panel__row");
  const sizeValue = element("output", "panel__value", sizeBalanceLabel(state.sizeBalance));
  const size = slider(0, PERCENT, SIZE_STEP, Math.round(state.sizeBalance * PERCENT));
  size.name = "fish-size";
  size.title = "0% real sizes, 100% every species the same size";
  size.addEventListener("input", () => {
    sizeValue.textContent = sizeBalanceLabel(Number(size.value) / PERCENT);
  });
  size.addEventListener("change", () => {
    callbacks.onSizeBalanceChange(Number(size.value) / PERCENT);
  });
  sizeRow.append(element("span", "panel__label", "Fish size"), size, sizeValue);
  const realisticRow = checkbox("Realistic", state.realistic, (checked) => {
    callbacks.onRealisticChange(checked);
  });
  realisticRow.title =
    "Fish rest at night like real ones; hypnosis and tickling are off. Off: playful mode.";
  fauna.append(sizeRow, realisticRow);

  const fishCards = createFishCards({
    species: state.species,
    counts: state.counts,
    fishModels: state.fishModels,
    drawPortraits: state.drawPortraits,
    onCountChange: (speciesId, count) => {
      callbacks.onCountChange(speciesId, count);
    },
    onModelChange: (speciesIds, enabled) => {
      callbacks.onFishModelChange(speciesIds, enabled);
    },
  });
  if (fishCards.modelRow !== undefined) fauna.append(fishCards.modelRow);
  fauna.append(fishCards.grid);

  const scenery = section("scenery", "Scenery");
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

  const lightsSection = createLightsSection(state.lights, (lights) => {
    callbacks.onLightsChange(lights);
  });
  const time = sectionWithSummary("time", "Time");
  time.summary.append(lightsSection.clock);
  time.section.append(...lightsSection.timeRows);
  const lights = section("lights", "Lights");
  lights.append(...lightsSection.lightRows);

  const quality = section("quality", "Quality");
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

  const automatic = checkbox("Automatic resolution", state.autoResolution, (checked) => {
    callbacks.onAutoResolutionChange(checked);
  });
  automatic.title =
    "Draws at fewer pixels when the GPU cannot keep up, so the screen never stalls; the resolution above is the most it uses.";
  const frameLimit = select(
    "Frame limit",
    state.frameLimitChoices.map(
      (limit) => [String(limit), limit === 0 ? "None" : `${String(limit)} fps`] as const,
    ),
    String(state.frameLimit),
  );
  frameLimit.input.name = "frame-limit";
  frameLimit.input.addEventListener("change", () => {
    callbacks.onFrameLimitChange(Number(frameLimit.input.value));
  });

  const fpsRow = checkbox("Show FPS", state.showFps, (checked) => {
    fpsCounter.hidden = !checked;
    callbacks.onShowFpsChange(checked);
  });

  const fullscreen = element("button", "panel__button panel__button--wide", "Full screen (F)");
  fullscreen.type = "button";
  fullscreen.addEventListener("click", () => {
    callbacks.onFullscreen();
  });

  const gpuRow = element("p", "panel__gpu", `GPU: ${state.gpu.name}`);
  quality.append(gpuRow);
  if (state.gpu.kind === "integrated" || state.gpu.kind === "software") {
    quality.append(
      element(
        "p",
        "panel__warning",
        state.gpu.kind === "integrated"
          ? "Running on the integrated GPU. See README, \u201cUse the dedicated GPU\u201d."
          : "Running without GPU acceleration. See README, \u201cUse the dedicated GPU\u201d.",
      ),
    );
  }
  const antialias = select(
    "Anti-aliasing",
    state.msaaChoices.map(
      (samples) => [String(samples), samples === 0 ? "Off" : `MSAA ${samples}x`] as const,
    ),
    String(state.msaaSamples),
  );
  antialias.input.name = "msaa";
  antialias.input.addEventListener("change", () => {
    callbacks.onMsaaChange(Number(antialias.input.value));
  });
  quality.append(
    resolutionRow,
    presets,
    automatic,
    frameLimit.row,
    antialias.row,
    fpsRow,
    fullscreen,
  );
  panel.append(
    fauna,
    time.section,
    lights,
    scenery,
    ...featureSections(state.features, state.look, section, (featureId, enabled) => {
      callbacks.onFeatureChange(featureId, enabled);
    }),
    quality,
    element("p", "panel__hint", "H: show/hide · F: full screen · T: torch · A: what fish do"),
    element("p", "panel__version", `Aquaria ${state.version}`),
  );

  const fpsCounter = element("div", "fps");
  fpsCounter.hidden = !state.showFps;

  const corner = element("div", "corner");
  corner.hidden = true;
  const cornerFeed = element("button", "corner__button");
  cornerFeed.type = "button";
  cornerFeed.innerHTML = FEED_ICON;
  cornerFeed.setAttribute("aria-label", "Feed the fish");
  cornerFeed.title = "Feed the fish (Space)";
  cornerFeed.addEventListener("click", () => {
    callbacks.onFeed();
  });
  const torchButton = element("button", "corner__button");
  torchButton.type = "button";
  torchButton.innerHTML = TORCH_ICON;
  torchButton.setAttribute("aria-label", "Torch");
  torchButton.setAttribute("aria-pressed", "false");
  torchButton.title = "Torch (T): the pointer lights up the tank";
  torchButton.addEventListener("click", () => {
    callbacks.onTorchToggle();
  });
  const opener = element("button", "corner__button", "☰");
  opener.type = "button";
  opener.setAttribute("aria-label", "Open controls");
  opener.title = "Controls (H)";
  corner.append(torchButton, cornerFeed, opener);

  let idleTimer: number | undefined;
  const onPointerMove = (): void => {
    corner.hidden = false;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      corner.hidden = true;
    }, BUTTON_IDLE_MS);
  };
  const toggle = (): void => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) fishCards.showPortraits();
  };
  opener.addEventListener("click", toggle);
  const onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return;
    if (event.key === "h" || event.key === "H") toggle();
    if (event.key === "f" || event.key === "F") callbacks.onFullscreen();
    if (event.key === "t" || event.key === "T") callbacks.onTorchToggle();
    // A focused button would also click on Space: leave it to the button.
    if (event.key === " " && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      callbacks.onFeed();
    }
  };
  window.addEventListener("pointermove", onPointerMove);
  // A touch may come without any move before it.
  window.addEventListener("pointerdown", onPointerMove);
  window.addEventListener("keydown", onKey);

  root.append(panel, corner, fpsCounter);

  return {
    toggle,
    setHour(hour) {
      lightsSection.setHour(hour);
    },
    setTorch(on) {
      torchButton.setAttribute("aria-pressed", String(on));
    },
    setFps(fps, height) {
      const rate = fps === undefined ? "– fps" : `${fps} fps`;
      fpsCounter.textContent = height === undefined ? rate : `${rate} · ${height}p`;
    },
    dispose() {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("keydown", onKey);
      panel.remove();
      corner.remove();
      fpsCounter.remove();
    },
  };
}
