import type { BlocksSpec, Scene, SurfaceMaterialSpec } from "../scene/schema";
import { element } from "./controls";
import {
  buttonRow,
  checkRow,
  colorRow,
  heading,
  materialRows,
  numberRow,
  selectRow,
  without,
} from "./formRows";

/**
 * The scene editor's Scene tab: everything about a scene that is not a
 * block, a plant or an object (its name is in the tool bar). Its seed, the tank's size, the water
 * (color, murkiness, surface, bubbles), the floor, the backdrop, the light
 * and the current, the look of the block rock, and the file actions: export,
 * import, delete. It edits a copy and reports every change.
 */

export interface SceneSettingsState {
  readonly scene: Scene;
  /** Surface material ids for the floor and the rock. */
  readonly materials: readonly string[];
  /** The viewer's own scene: it can be deleted. */
  readonly canDelete: boolean;
  /** The bundled scenes whose environment (biome) the scene can take. */
  readonly environments: readonly { readonly id: string; readonly name: string }[];
}

/** How the block rock looks. */
export type RockLook = Pick<BlocksSpec, "color" | "material">;

export interface SceneSettingsCallbacks {
  /** The scene with the settings as they are now (its blocks and scenery untouched). */
  onChange(scene: Scene): void;
  /** Resizes the tank: the editor starts again on the new tank, keeping the work. */
  onResizeTank(tank: Scene["tank"]): void;
  onRockLook(look: RockLook): void;
  /** Takes the water, floor, backdrop, light and current of a bundled scene. */
  onEnvironment(sceneId: string): void;
  /** Turns the procedural reef ridge into blocks the editor can reshape. */
  onConvertRidge(): void;
  onExport(): void;
  onImport(file: File): void;
  onDelete(): void;
}

const TANK = {
  width: [0.3, 12],
  height: [0.2, 6],
  depth: [0.2, 8],
} as const;
const TANK_STEP = 0.05;
const SEED_RANGE = [0, 99999] as const;
const UNIT = [0, 1] as const;
/** A share of the tank height, as the scene schema allows. */
const FLOOR_RISE = [0, 0.5] as const;
const FLOOR_DUNES = [0, 2] as const;
const BACKGROUNDS = [
  ["gradient", "Open water"],
  ["panel", "Panel on the back glass"],
] as const;
const LIGHT_RANGE = [0, 3] as const;
const CAUSTIC_SIZE = [0.2, 6] as const;
const CURRENT_RANGE = [0, 0.3] as const;
const DIRECTION_RANGE = [-180, 180] as const;
const DIRECTION_STEP = 5;
const DEGREES = 180 / Math.PI;
const DEFAULT_ROCK_COLOR = "#8a8178";

/** The ridge's hint and its convert button; both go once it is blocks. */
function ridgeRows(scene: Scene, callbacks: SceneSettingsCallbacks): HTMLElement[] {
  if (scene.rockwork === undefined) return [];
  const hint = element(
    "p",
    "panel__hint",
    "This scene has a procedural reef ridge. Convert it to blocks to reshape it.",
  );
  const convert = buttonRow("Convert the ridge to blocks", () => {
    callbacks.onConvertRidge();
    hint.remove();
    convert.remove();
  });
  return [hint, convert];
}

export function createSceneSettings(
  state: SceneSettingsState,
  callbacks: SceneSettingsCallbacks,
): HTMLElement {
  let draft: Scene = structuredClone(state.scene);
  const changed = (next: Scene): void => {
    draft = next;
    callbacks.onChange(draft);
  };
  const box = element("div", "scene-settings");
  const section = (title: string, ...rows: HTMLElement[]): HTMLElement => {
    const part = element("section", "panel__section");
    part.append(element("h2", "panel__heading", title), ...rows);
    return part;
  };

  // The tank's size waits for a button: resizing starts the editor again.
  let tank = { ...draft.tank };
  const tankRow = (label: string, key: keyof Scene["tank"]): HTMLElement =>
    numberRow(label, tank[key], TANK[key], TANK_STEP, (value) => {
      tank = { ...tank, [key]: value };
    });

  const backdrop = draft.backdrop;
  const backdropRows =
    backdrop.type === "image"
      ? []
      : [
          selectRow("Background", BACKGROUNDS, backdrop.type, (type) => {
            if (draft.backdrop.type !== "image" && (type === "gradient" || type === "panel")) {
              changed({ ...draft, backdrop: { ...draft.backdrop, type } });
            }
          }),
          colorRow("Background top", backdrop.top, (top) => {
            if (draft.backdrop.type !== "image") {
              changed({ ...draft, backdrop: { ...draft.backdrop, top } });
            }
          }),
          colorRow("Background bottom", backdrop.bottom, (bottom) => {
            if (draft.backdrop.type !== "image") {
              changed({ ...draft, backdrop: { ...draft.backdrop, bottom } });
            }
          }),
        ];

  let rock: RockLook = {
    color: draft.blocks?.color ?? DEFAULT_ROCK_COLOR,
    ...(draft.blocks?.material === undefined ? {} : { material: draft.blocks.material }),
  };
  const setRockMaterial = (material: SurfaceMaterialSpec | undefined): void => {
    rock = material === undefined ? without(rock, "material") : { ...rock, material };
    callbacks.onRockLook(rock);
  };

  const fileInput = element("input", "scene-settings__file");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) callbacks.onImport(file);
    fileInput.value = "";
  });

  let environment = state.environments[0]?.id;
  box.append(
    section(
      "Environment",
      element(
        "p",
        "panel__hint",
        "Start from the water, floor, light and current of a biome; the rock, plants and fish stay.",
      ),
      selectRow(
        "Biome",
        state.environments.map(({ id, name }) => [id, name] as const),
        environment ?? "",
        (id) => {
          environment = id;
        },
      ),
      buttonRow("Use this environment", () => {
        if (environment !== undefined) callbacks.onEnvironment(environment);
      }),
    ),
    section(
      "Scene",
      numberRow("Seed", draft.seed, SEED_RANGE, 1, (seed) => {
        changed({ ...draft, seed });
      }),
      heading("Tank (m)"),
      tankRow("Width", "width"),
      tankRow("Height", "height"),
      tankRow("Depth", "depth"),
      buttonRow("Resize the tank", () => {
        callbacks.onResizeTank(tank);
      }),
    ),
    section(
      "Water and floor",
      colorRow("Water", draft.water.color, (color) => {
        changed({ ...draft, water: { ...draft.water, color } });
      }),
      numberRow("Murkiness", draft.water.fogDensity, UNIT, 0.01, (fogDensity) => {
        changed({ ...draft, water: { ...draft.water, fogDensity } });
      }),
      numberRow("Surface", draft.water.surface, UNIT, 0.05, (surface) => {
        changed({ ...draft, water: { ...draft.water, surface } });
      }),
      checkRow("Bubbles", draft.water.bubbles, (bubbles) => {
        changed({ ...draft, water: { ...draft.water, bubbles } });
      }),
      ...backdropRows,
      colorRow("Floor", draft.floor.color, (color) => {
        changed({ ...draft, floor: { ...draft.floor, color } });
      }),
      ...materialRows(state.materials, draft.floor.material, false, (material) => {
        const floor = without(draft.floor, "material");
        changed({ ...draft, floor: material === undefined ? floor : { ...floor, material } });
      }),
      numberRow("Floor rise", draft.floor.rise, FLOOR_RISE, 0.01, (rise) => {
        changed({ ...draft, floor: { ...draft.floor, rise } });
      }),
      numberRow("Dunes", draft.floor.dunes, FLOOR_DUNES, 0.1, (dunes) => {
        changed({ ...draft, floor: { ...draft.floor, dunes } });
      }),
    ),
    section(
      "Rock",
      colorRow("Rock color", rock.color, (color) => {
        rock = { ...rock, color };
        callbacks.onRockLook(rock);
      }),
      ...materialRows(state.materials, rock.material, true, setRockMaterial),
      ...ridgeRows(draft, callbacks),
    ),
    section(
      "Light and current",
      colorRow("Light tint", draft.light.color, (color) => {
        changed({ ...draft, light: { ...draft.light, color } });
      }),
      numberRow("Intensity", draft.light.intensity, LIGHT_RANGE, 0.05, (intensity) => {
        changed({ ...draft, light: { ...draft.light, intensity } });
      }),
      numberRow("Caustics", draft.light.caustics.intensity, LIGHT_RANGE, 0.05, (intensity) => {
        changed({
          ...draft,
          light: { ...draft.light, caustics: { ...draft.light.caustics, intensity } },
        });
      }),
      numberRow("Caustic size", draft.light.caustics.scale, CAUSTIC_SIZE, 0.1, (scale) => {
        changed({
          ...draft,
          light: { ...draft.light, caustics: { ...draft.light.caustics, scale } },
        });
      }),
      numberRow(
        "Current direction",
        Math.round(Math.atan2(draft.current.direction[2], draft.current.direction[0]) * DEGREES),
        DIRECTION_RANGE,
        DIRECTION_STEP,
        (degrees) => {
          const angle = degrees / DEGREES;
          changed({
            ...draft,
            current: { ...draft.current, direction: [Math.cos(angle), 0, Math.sin(angle)] },
          });
        },
        (degrees) => `${String(degrees)}°`,
      ),
      numberRow("Current", draft.current.strength, CURRENT_RANGE, 0.005, (strength) => {
        changed({ ...draft, current: { ...draft.current, strength } });
      }),
      numberRow("Turbulence", draft.current.turbulence, UNIT, 0.05, (turbulence) => {
        changed({ ...draft, current: { ...draft.current, turbulence } });
      }),
    ),
    section(
      "File",
      element(
        "p",
        "panel__hint",
        "Export the scene as a JSON file (ready for public/scenes), or import one. The fish counts and the LED setup of the panel are saved with the scene.",
      ),
      buttonRow("Export JSON", () => {
        callbacks.onExport();
      }),
      buttonRow("Import JSON", () => {
        fileInput.click();
      }),
      fileInput,
      ...(state.canDelete
        ? [
            buttonRow("Delete this scene", () => {
              callbacks.onDelete();
            }),
          ]
        : []),
    ),
  );
  return box;
}
