import { FULL_HD_HEIGHT, resolutionLabel, UHD_HEIGHT } from "../core/resolution";
import type { GpuKind } from "../core/gpu";
import type { Lights } from "../scene/lights";
import type { Look, LookFeature, LookFeatureKind } from "../scene/look";
import { checkbox, collapsible, element, select, slider } from "./controls";
import { createFishCards, type DrawPortraits } from "./fishCards";
import { createLightsSection, type LightsSectionState } from "./lightsSection";
import { createSceneCards } from "./sceneCards";
import { createSceneryCards, type DrawSceneryPortraits } from "./sceneryCards";
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
const OPEN_BY_DEFAULT: ReadonlySet<string> = new Set(["scenes", "fauna"]);

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
  readonly drawSceneryPortraits: DrawSceneryPortraits;
  readonly renderHeight: number;
  /** Frames per second at most, one of `frameLimitChoices`; 0 = no limit. */
  readonly frameLimit: number;
  readonly frameLimitChoices: readonly number[];
  /** The resolution drops when the GPU cannot keep up, up to `renderHeight`. */
  readonly autoResolution: boolean;
  /** Whether the aquarium makes its sounds, and how loud, 0..1. */
  readonly sound: boolean;
  readonly volume: number;
  readonly showFps: boolean;
  /** Fish keep their hours and the playful spells are off. */
  readonly realistic: boolean;
  /** Multisample anti-aliasing samples, one of `msaaChoices`. */
  readonly msaaSamples: number;
  readonly msaaChoices: readonly number[];
  /** Switchable lighting features and effects, and which ones are on. */
  readonly features: readonly LookFeature[];
  readonly look: Look;
  /** Release and build, e.g. "v1.0.1 · 9b2d5f7". */
  readonly version: string;
  /** URL of the Aquaria title picture at the top of the panel. */
  readonly logo: string;
  /** Who made Aquaria and where its code lives, for the About box. */
  readonly about: About;
  /** The square picture of a scene's card, or undefined for a scene without one. */
  scenePicture(sceneId: string): string | undefined;
  /** Saved open/closed state per section id; absent sections use their default. */
  readonly openSections: Readonly<Record<string, boolean>>;
}

export interface About {
  readonly author: string;
  /** E.g. "© 2026 Aquaria contributors". */
  readonly copyright: string;
  readonly license: string;
  readonly repository: string;
}

export interface PanelCallbacks {
  onSceneChange(sceneId: string): void;
  /** Opens the scene editor (building rock from blocks) in place of the tank. */
  onOpenEditor(): void;
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
  /** Switches the magnifier on or off. */
  onLensToggle(): void;
  /** Switches pointing on or off: a touch points instead of tapping the glass. */
  onPointingToggle(): void;
  onSoundChange(enabled: boolean): void;
  onVolumeChange(volume: number): void;
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
  /** Shows whether the magnifier is on. */
  setLens(on: boolean): void;
  /** Shows whether a touch points instead of tapping. */
  setPointing(on: boolean): void;
  /** Shows whether the sound is on (it may be switched with M). */
  setSound(on: boolean): void;
  /** Shows a scene's new card picture (a data URL or a link). */
  setScenePicture(sceneId: string, picture: string): void;
  /** While editing, the panel and the corner buttons hide and keys do nothing. */
  setSuspended(suspended: boolean): void;
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

/** Version, author, copyright, license and a link to the code, opened from the ⓘ. */
function aboutBox(version: string, about: About): HTMLElement {
  const box = element("div", "panel__about");
  box.hidden = true;
  const link = element("a", "panel__link", about.repository.replace(/^https:\/\//, ""));
  link.href = about.repository;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const repository = element("p", "panel__about-line", "Code: ");
  repository.append(link);
  box.append(
    element("p", "panel__version", `Aquaria ${version}`),
    element("p", "panel__about-line", `By ${about.author}`),
    element("p", "panel__about-line", `${about.copyright} · ${about.license}`),
    repository,
  );
  return box;
}

/** Three flakes drifting down: the feed button's icon. */
const FEED_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">' +
  '<rect x="5" y="4" width="4" height="4" rx="1" transform="rotate(15 7 6)"/>' +
  '<rect x="14" y="8" width="4" height="4" rx="1" transform="rotate(-20 16 10)"/>' +
  '<rect x="8" y="15" width="4" height="4" rx="1" transform="rotate(35 10 17)"/></svg>';

/** A magnifying glass: the magnifier button's icon. */
const LENS_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/></svg>';

/** A hand torch with its beam: the torch button's icon. */
/** A hand pointing up: the pointing switch's icon. */
const POINTING_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11"/>' +
  '<path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15' +
  'a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L4 16a1.5 1.5 0 0 1 2.3-1.9L9 16.5"/></svg>';

const TORCH_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">' +
  '<path d="M3 10h7l3-3v10l-3-3H3z"/>' +
  '<path d="M15 9l6-3v2l-6 2zM15 12h6v1h-6zM15 15l6 2v2l-6-3z" opacity="0.7"/></svg>';

/**
 * Hidden control panel. Nothing stays on screen permanently (static elements
 * wear LED walls unevenly): a row of corner buttons (torch, magnifier, feed, panel)
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

  const header = element("div", "panel__header");
  const infoButton = element("button", "panel__info", "i");
  infoButton.type = "button";
  infoButton.setAttribute("aria-label", "About Aquaria");
  infoButton.setAttribute("aria-expanded", "false");
  const about = aboutBox(state.version, state.about);
  infoButton.addEventListener("click", () => {
    about.hidden = !about.hidden;
    infoButton.setAttribute("aria-expanded", String(!about.hidden));
  });
  header.append(element("h1", "panel__title", state.sceneName), infoButton);
  const logo = element("img", "panel__logo");
  logo.src = state.logo;
  logo.alt = "Aquaria";
  panel.append(logo, header, about);

  const scenes = section("scenes", "Scenes");
  scenes.append(
    createSceneCards({
      groups: state.scenes,
      selected: state.sceneId,
      pictureOf: (id) => state.scenePicture(id),
      onSelect: (id) => {
        callbacks.onSceneChange(id);
      },
      onOpenEditor: () => {
        callbacks.onOpenEditor();
      },
    }),
  );

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
  const sceneryCards = createSceneryCards({
    entries: state.scenery,
    drawPortraits: state.drawSceneryPortraits,
    onCountChange: (key, count) => {
      callbacks.onSceneryChange(key, count);
    },
  });
  scenery.append(sceneryCards.grid);

  const lightsSection = createLightsSection(state.lights, (lights) => {
    callbacks.onLightsChange(lights);
  });
  const time = sectionWithSummary("time", "Time");
  time.summary.append(lightsSection.clock);
  time.section.append(...lightsSection.timeRows);
  const lights = section("lights", "Lights");
  lights.append(...lightsSection.lightRows);

  const sound = section("sound", "Sound");
  const soundRow = checkbox("Sound (M)", state.sound, (checked) => {
    callbacks.onSoundChange(checked);
  });
  const soundInput = soundRow.querySelector("input");
  const volumeRow = element("label", "panel__row");
  const volumeValue = element("output", "panel__value", `${Math.round(state.volume * PERCENT)}%`);
  const volume = slider(0, PERCENT, 1, Math.round(state.volume * PERCENT));
  volume.name = "volume";
  volume.addEventListener("input", () => {
    volumeValue.textContent = `${volume.value}%`;
    callbacks.onVolumeChange(Number(volume.value) / PERCENT);
  });
  volumeRow.append(element("span", "panel__label", "Volume"), volume, volumeValue);
  sound.append(soundRow, volumeRow);

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
    scenes,
    fauna,
    time.section,
    lights,
    scenery,
    ...featureSections(state.features, state.look, section, (featureId, enabled) => {
      callbacks.onFeatureChange(featureId, enabled);
    }),
    sound,
    quality,
    element(
      "p",
      "panel__hint",
      "H: show/hide · F: full screen · T: torch · Z: magnifier · P: point · M: sound · A: what fish do · E: edit rock",
    ),
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
  const lensButton = element("button", "corner__button");
  lensButton.type = "button";
  lensButton.innerHTML = LENS_ICON;
  lensButton.setAttribute("aria-label", "Magnifier");
  lensButton.setAttribute("aria-pressed", "false");
  lensButton.title = "Magnifier (Z): look at the fish up close";
  lensButton.addEventListener("click", () => {
    callbacks.onLensToggle();
  });
  const pointingButton = element("button", "corner__button");
  pointingButton.type = "button";
  pointingButton.innerHTML = POINTING_ICON;
  pointingButton.setAttribute("aria-label", "Point");
  pointingButton.setAttribute("aria-pressed", "false");
  pointingButton.title = "Point (P): a touch points at the tank instead of tapping the glass";
  pointingButton.addEventListener("click", () => {
    callbacks.onPointingToggle();
  });
  const opener = element("button", "corner__button", "☰");
  opener.type = "button";
  opener.setAttribute("aria-label", "Open controls");
  opener.title = "Controls (H)";
  corner.append(pointingButton, torchButton, lensButton, cornerFeed, opener);

  let idleTimer: number | undefined;
  let suspended = false;
  const onPointerMove = (): void => {
    if (suspended) return;
    corner.hidden = false;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      corner.hidden = true;
    }, BUTTON_IDLE_MS);
  };
  const toggle = (): void => {
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    fishCards.showPortraits();
    sceneryCards.showPortraits();
  };
  opener.addEventListener("click", toggle);
  const onKey = (event: KeyboardEvent): void => {
    if (suspended) return;
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return;
    if (event.key === "e" || event.key === "E") callbacks.onOpenEditor();
    if (event.key === "h" || event.key === "H") toggle();
    if (event.key === "f" || event.key === "F") callbacks.onFullscreen();
    if (event.key === "t" || event.key === "T") callbacks.onTorchToggle();
    if (event.key === "z" || event.key === "Z") callbacks.onLensToggle();
    if (event.key === "p" || event.key === "P") callbacks.onPointingToggle();
    if (event.key === "m" || event.key === "M") {
      const next = soundInput?.checked !== true;
      if (soundInput !== null) soundInput.checked = next;
      callbacks.onSoundChange(next);
    }
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
    setLens(on) {
      lensButton.setAttribute("aria-pressed", String(on));
    },
    setPointing(on) {
      pointingButton.setAttribute("aria-pressed", String(on));
    },
    setScenePicture(sceneId, picture) {
      const holder = panel.querySelector(
        `.scene-card[data-scene="${CSS.escape(sceneId)}"] .scene-card__picture`,
      );
      if (holder === null) return;
      const image = element("img", "scene-card__image");
      image.src = picture;
      image.alt = "";
      holder.replaceChildren(image);
    },
    setSuspended(next) {
      suspended = next;
      if (next) {
        panel.hidden = true;
        corner.hidden = true;
      }
    },
    setSound(on) {
      if (soundInput !== null) soundInput.checked = on;
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
