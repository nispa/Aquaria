import {
  FLORA_KINDS,
  PROP_KINDS,
  type FloraSpec,
  type PropSpec,
  type Scene,
  type SpeciesCatalog,
  type SurfaceMaterialSpec,
} from "../scene/schema";
import { element, select, slider } from "./controls";

/**
 * The scene designer: a side panel that edits a copy of the current scene
 * (tank, water, light, rockwork, plants, objects and fish) and hands it back
 * to the app, which validates, stores and reloads it. Plain DOM, no state
 * outside the draft.
 */

export interface DesignerOptions {
  /** The scene to start from, with the current lights. */
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  /** Editing a saved custom scene: "Save" overwrites it and "Delete" is offered. */
  readonly isCustom: boolean;
  /** Surface material ids for the floor, rockwork and objects. */
  readonly materials: readonly string[];
}

export interface DesignerCallbacks {
  /** Show the draft on screen without saving it. */
  onPreview(scene: Scene): void;
  /** Validate and store the draft, then open it; `asNew` keeps the original. */
  onSave(scene: Scene, asNew: boolean): void;
  onExport(scene: Scene): void;
  onImport(file: File): void;
  onDelete(): void;
}

export interface Designer {
  open(): void;
  close(): void;
  toggle(): void;
  /** Shows why the draft could not be saved (validation message). */
  showError(message: string): void;
  dispose(): void;
}

const TANK = { width: [1, 12], height: [0.5, 6], depth: [0.5, 8] } as const;
const MAX_FLORA = 200;
const MAX_PROPS = 50;
const MAX_FISH = 50;
const MAX_PALETTE = 5;
const DEGREES = 180 / Math.PI;
const NO_MATERIAL = "none";
/** Auto preview waits this long after the last edit, so a slider drag rebuilds once. */
const AUTO_PREVIEW_DELAY_MS = 500;

const LABELS: Readonly<Record<string, string>> = {
  kelp: "Kelp",
  seagrass: "Seagrass",
  anemone: "Anemone",
  bush: "Macroalgae bush",
  carpet: "Carpet plant",
  fern: "Fern",
  stem: "Stem plant",
  rock: "Rock",
  starfish: "Starfish",
  shell: "Shell",
  "brain-coral": "Brain coral",
  "branch-coral": "Branching coral",
  "fan-coral": "Sea fan",
  "table-coral": "Table coral",
  "mushroom-coral": "Mushroom coral",
  "leather-coral": "Leather coral",
  driftwood: "Driftwood",
  "dragon-stone": "Dragon stone",
  moss: "Moss",
  pebble: "Pebble",
};

type Range = readonly [number, number];

/** #abc → #aabbcc: color inputs only accept the long form. */
function longHex(hex: string): string {
  return hex.length === 4 ? `#${hex.slice(1).replace(/./g, "$&$&")}` : hex;
}

/** A copy of `value` without `key`: clears an optional scene field. */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}

function heading(text: string): HTMLElement {
  return element("h3", "designer__heading", text);
}

function numberRow(
  label: string,
  value: number,
  range: Range,
  step: number,
  onChange: (value: number) => void,
  format: (value: number) => string = (shown) => String(shown),
): HTMLElement {
  const row = element("label", "panel__row");
  const output = element("output", "panel__value", format(value));
  const input = slider(range[0], range[1], step, value);
  input.addEventListener("input", () => {
    output.textContent = format(Number(input.value));
    markChanged(row, Number(input.value) !== value);
    onChange(Number(input.value));
  });
  row.append(element("span", "panel__label", label), input, output);
  return row;
}

function pairRows(
  label: string,
  value: Range,
  range: Range,
  step: number,
  onChange: (value: [number, number]) => void,
): HTMLElement[] {
  let current: [number, number] = [value[0], value[1]];
  const clamp = (next: [number, number]): [number, number] => [
    Math.min(next[0], next[1]),
    Math.max(next[0], next[1]),
  ];
  return [
    numberRow(`${label} min`, current[0], range, step, (low) => {
      current = [low, current[1]];
      onChange(clamp(current));
    }),
    numberRow(`${label} max`, current[1], range, step, (high) => {
      current = [current[0], high];
      onChange(clamp(current));
    }),
  ];
}

function colorRow(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const row = element("label", "panel__row panel__row--color");
  const input = element("input", "panel__color");
  input.type = "color";
  input.value = longHex(value);
  input.addEventListener("input", () => {
    markChanged(row, input.value.toLowerCase() !== longHex(value).toLowerCase());
    onChange(input.value);
  });
  row.append(element("span", "panel__label", label), input);
  return row;
}

function textRow(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const row = element("label", "panel__row panel__row--select");
  const input = element("input", "panel__text");
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => {
    markChanged(row, input.value !== value);
    onChange(input.value);
  });
  row.append(element("span", "panel__label", label), input);
  return row;
}

function selectRow(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const choice = select(label, options, value);
  choice.input.addEventListener("change", () => {
    markChanged(choice.row, choice.input.value !== value);
    onChange(choice.input.value);
  });
  return choice.row;
}

function checkRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = element("label", "panel__row panel__row--check");
  const input = element("input", "panel__check");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    markChanged(row, input.checked !== checked);
    onChange(input.checked);
  });
  row.append(input, element("span", "panel__label", label));
  return row;
}

/** A button that adds or removes entries: it counts as an edit. */
function editButton(label: string, onClick: () => void): HTMLButtonElement {
  return button(label, onClick, "panel__button", true);
}

/** Highlights a control whose value differs from the scene the designer started from. */
function markChanged(row: HTMLElement, changed: boolean): void {
  row.classList.toggle("designer__changed", changed);
}

function button(
  label: string,
  onClick: () => void,
  className = "panel__button",
  editsDraft = false,
): HTMLButtonElement {
  const node = element("button", className, label);
  node.type = "button";
  // Buttons that add or remove entries count as edits for the change tracking.
  if (editsDraft) node.dataset.edits = "1";
  node.addEventListener("click", onClick);
  return node;
}

/** One color or a palette of up to MAX_PALETTE colors, each item picks one. */
function paletteRows(
  value: string | readonly string[],
  onChange: (value: string | string[]) => void,
): HTMLElement {
  const box = element("div", "designer__palette");
  let colors = typeof value === "string" ? [value] : [...value];
  const render = (): void => {
    box.replaceChildren(element("span", "panel__label", colors.length > 1 ? "Palette" : "Color"));
    colors.forEach((color, index) => {
      const input = element("input", "panel__color");
      input.type = "color";
      input.value = longHex(color);
      input.addEventListener("input", () => {
        colors[index] = input.value;
        onChange(colors.length === 1 ? (colors[0] ?? input.value) : [...colors]);
      });
      box.append(input);
    });
    if (colors.length < MAX_PALETTE) {
      box.append(
        button(
          "+",
          () => {
            colors = [...colors, colors[colors.length - 1] ?? "#ffffff"];
            onChange([...colors]);
            render();
          },
          "designer__mini",
          true,
        ),
      );
    }
    if (colors.length > 1) {
      box.append(
        button(
          "−",
          () => {
            colors = colors.slice(0, -1);
            onChange(colors.length === 1 ? (colors[0] ?? "#ffffff") : [...colors]);
            render();
          },
          "designer__mini",
          true,
        ),
      );
    }
  };
  render();
  return box;
}

function materialRows(
  materials: readonly string[],
  value: SurfaceMaterialSpec | undefined,
  withDisplacement: boolean,
  onChange: (value: SurfaceMaterialSpec | undefined) => void,
): HTMLElement[] {
  let current = value;
  const rows: HTMLElement[] = [];
  const details = element("div", "designer__group");
  const renderDetails = (): void => {
    details.replaceChildren();
    if (current === undefined) return;
    details.append(
      numberRow("Tile size (m)", current.tileSize, [0.05, 3], 0.05, (tileSize) => {
        if (current === undefined) return;
        current = { ...current, tileSize };
        onChange(current);
      }),
    );
    if (withDisplacement) {
      details.append(
        numberRow("Relief (m)", current.displacement, [0, 0.2], 0.005, (displacement) => {
          if (current === undefined) return;
          current = { ...current, displacement };
          onChange(current);
        }),
      );
    }
  };
  rows.push(
    selectRow(
      "Material",
      [[NO_MATERIAL, "Plain color"], ...materials.map((id) => [id, id] as const)],
      current?.id ?? NO_MATERIAL,
      (id) => {
        current =
          id === NO_MATERIAL
            ? undefined
            : { id, tileSize: current?.tileSize ?? 1, displacement: current?.displacement ?? 0 };
        onChange(current);
        renderDetails();
      },
    ),
    details,
  );
  renderDetails();
  return rows;
}

function kindOptions(kinds: readonly string[]): (readonly [string, string])[] {
  return kinds.map((kind) => [kind, LABELS[kind] ?? kind] as const);
}

export function createDesigner(
  root: HTMLElement,
  options: DesignerOptions,
  callbacks: DesignerCallbacks,
): Designer {
  const original: Scene = structuredClone(options.scene);
  let draft: Scene = structuredClone(original);
  const aside = element("aside", "designer");
  aside.setAttribute("aria-label", "Scene designer");
  aside.hidden = true;
  const error = element("p", "panel__warning", "");
  error.hidden = true;
  const status = element("p", "designer__status", "");
  let autoPreview = false;
  let previewTimer: number | undefined;

  const preview = (): void => {
    window.clearTimeout(previewTimer);
    callbacks.onPreview(structuredClone(draft));
  };

  /** After any edit: flag unsaved changes, mark changed entries, auto-preview. */
  const edited = (): void => {
    const changed = JSON.stringify(draft) !== JSON.stringify(original);
    status.textContent = changed ? "Unsaved changes (highlighted)" : "";
    aside.querySelectorAll<HTMLElement>("[data-plant]").forEach((card) => {
      const index = Number(card.dataset.plant);
      markChanged(
        card,
        JSON.stringify(draft.flora[index]) !== JSON.stringify(original.flora[index]),
      );
    });
    aside.querySelectorAll<HTMLElement>("[data-object]").forEach((card) => {
      const index = Number(card.dataset.object);
      markChanged(
        card,
        JSON.stringify(draft.props[index]) !== JSON.stringify(original.props[index]),
      );
    });
    if (autoPreview) {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(preview, AUTO_PREVIEW_DELAY_MS);
    }
  };
  // Controls update the draft in their own handlers; these run after them (bubbling).
  aside.addEventListener("input", edited);
  aside.addEventListener("change", edited);
  aside.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("[data-edits]") !== null) {
      edited();
    }
  });

  const build = (): void => {
    const section = (title: string, ...rows: HTMLElement[]): HTMLElement => {
      const box = element("section", "panel__section");
      box.append(element("h2", "panel__heading", title), ...rows);
      return box;
    };

    // Scene, tank and water.
    const general = section(
      "Scene",
      textRow("Name", draft.name, (name) => {
        draft.name = name;
      }),
      numberRow("Seed", draft.seed, [0, 99999], 1, (seed) => {
        draft.seed = seed;
      }),
      heading("Tank (m)"),
      numberRow("Width", draft.tank.width, TANK.width, 0.1, (width) => {
        draft.tank = { ...draft.tank, width };
      }),
      numberRow("Height", draft.tank.height, TANK.height, 0.1, (height) => {
        draft.tank = { ...draft.tank, height };
      }),
      numberRow("Depth", draft.tank.depth, TANK.depth, 0.1, (depth) => {
        draft.tank = { ...draft.tank, depth };
      }),
    );

    const backdropRows: HTMLElement[] =
      draft.backdrop.type === "gradient"
        ? [
            colorRow("Background top", draft.backdrop.top, (top) => {
              if (draft.backdrop.type === "gradient") draft.backdrop = { ...draft.backdrop, top };
            }),
            colorRow("Background bottom", draft.backdrop.bottom, (bottom) => {
              if (draft.backdrop.type === "gradient")
                draft.backdrop = { ...draft.backdrop, bottom };
            }),
          ]
        : [];
    const water = section(
      "Water and floor",
      colorRow("Water", draft.water.color, (color) => {
        draft.water = { ...draft.water, color };
      }),
      numberRow("Murkiness", draft.water.fogDensity, [0, 1], 0.01, (fogDensity) => {
        draft.water = { ...draft.water, fogDensity };
      }),
      numberRow("Surface", draft.water.surface, [0, 1], 0.05, (surface) => {
        draft.water = { ...draft.water, surface };
      }),
      checkRow("Bubbles", draft.water.bubbles, (bubbles) => {
        draft.water = { ...draft.water, bubbles };
      }),
      ...backdropRows,
      colorRow("Floor", draft.floor.color, (color) => {
        draft.floor = { ...draft.floor, color };
      }),
      ...materialRows(options.materials, draft.floor.material, false, (material) => {
        draft.floor =
          material === undefined ? without(draft.floor, "material") : { ...draft.floor, material };
      }),
    );

    const light = section(
      "Light and current",
      element(
        "p",
        "panel__hint",
        "LED channels, fixture and day cycle come from the Lights section: the current setup is saved with the scene.",
      ),
      colorRow("Light tint", draft.light.color, (color) => {
        draft.light = { ...draft.light, color };
      }),
      numberRow("Intensity", draft.light.intensity, [0, 3], 0.05, (intensity) => {
        draft.light = { ...draft.light, intensity };
      }),
      numberRow("Caustics", draft.light.caustics.intensity, [0, 3], 0.05, (intensity) => {
        draft.light = { ...draft.light, caustics: { ...draft.light.caustics, intensity } };
      }),
      numberRow("Caustic size", draft.light.caustics.scale, [0.2, 6], 0.1, (scale) => {
        draft.light = { ...draft.light, caustics: { ...draft.light.caustics, scale } };
      }),
      numberRow(
        "Current direction",
        Math.round(Math.atan2(draft.current.direction[2], draft.current.direction[0]) * DEGREES),
        [-180, 180],
        5,
        (degrees) => {
          const angle = degrees / DEGREES;
          draft.current = { ...draft.current, direction: [Math.cos(angle), 0, Math.sin(angle)] };
        },
        (degrees) => `${degrees}°`,
      ),
      numberRow("Current", draft.current.strength, [0, 0.3], 0.005, (strength) => {
        draft.current = { ...draft.current, strength };
      }),
      numberRow("Turbulence", draft.current.turbulence, [0, 1], 0.05, (turbulence) => {
        draft.current = { ...draft.current, turbulence };
      }),
    );

    // Rockwork: on/off, then its settings.
    const rockworkBox = element("div", "designer__group");
    const renderRockwork = (): void => {
      rockworkBox.replaceChildren();
      const ridge = draft.rockwork;
      if (ridge === undefined) return;
      const set = (change: Partial<NonNullable<Scene["rockwork"]>>): void => {
        if (draft.rockwork !== undefined) draft.rockwork = { ...draft.rockwork, ...change };
      };
      rockworkBox.append(
        ...pairRows("Depth band", ridge.bands, [0, 4], 1, (bands) => {
          set({ bands });
        }),
        ...pairRows("Height (m)", ridge.height, [0.05, 3], 0.05, (height) => {
          set({ height });
        }),
        numberRow("Width share", ridge.coverage, [0, 1], 0.05, (coverage) => {
          set({ coverage });
        }),
        numberRow("Thickness (m)", ridge.thickness, [0.2, 4], 0.1, (thickness) => {
          set({ thickness });
        }),
        numberRow("Loose rocks", ridge.rocks, [0, 150], 1, (rocks) => {
          set({ rocks });
        }),
        colorRow("Color", ridge.color, (color) => {
          set({ color });
        }),
        ...materialRows(options.materials, ridge.material, true, (material) => {
          if (draft.rockwork === undefined) return;
          draft.rockwork =
            material === undefined
              ? without(draft.rockwork, "material")
              : { ...draft.rockwork, material };
        }),
      );
    };
    const rockwork = section(
      "Rockwork",
      checkRow("Reef ridge", draft.rockwork !== undefined, (enabled) => {
        if (enabled) {
          draft.rockwork = {
            bands: [1, 3],
            height: [0.3, 0.9],
            coverage: 0.85,
            thickness: 0.9,
            rocks: 40,
            color: "#8a7d70",
          };
        } else {
          delete draft.rockwork;
          // Entries placed on the ridge fall back to the sand.
          draft.flora = draft.flora.map((entry) => without(entry, "on"));
          draft.props = draft.props.map((entry) => without(entry, "on"));
          renderPlants();
          renderObjects();
        }
        renderRockwork();
      }),
      rockworkBox,
    );
    renderRockwork();

    // Plants and objects: lists of entries.
    const placementRow = (
      value: "sand" | "rockwork" | undefined,
      onChange: (value: "sand" | "rockwork") => void,
    ): HTMLElement[] =>
      draft.rockwork === undefined
        ? []
        : [
            selectRow(
              "Grows on",
              [
                ["sand", "Sand"],
                ["rockwork", "Rockwork"],
              ],
              value ?? "sand",
              (on) => {
                onChange(on === "rockwork" ? "rockwork" : "sand");
              },
            ),
          ];

    const plantsBox = element("div", "designer__list");
    const renderPlants = (): void => {
      plantsBox.replaceChildren();
      draft.flora.forEach((entry, index) => {
        const set = (change: Partial<FloraSpec>): void => {
          const current = draft.flora[index];
          if (current !== undefined) draft.flora[index] = { ...current, ...change };
        };
        const card = element("div", "designer__card");
        card.dataset.plant = String(index);
        card.append(
          selectRow("Kind", kindOptions(FLORA_KINDS), entry.kind, (kind) => {
            set({ kind: kind as FloraSpec["kind"] });
          }),
          textRow("Name", entry.name ?? "", (name) => {
            set({ name: name === "" ? undefined : name });
          }),
          numberRow("Count", entry.count, [0, MAX_FLORA], 1, (count) => {
            set({ count });
          }),
          ...pairRows("Depth band", entry.bands, [0, 4], 1, (bands) => {
            set({ bands });
          }),
          ...pairRows("Height (m)", entry.height, [0.01, 3], 0.01, (height) => {
            set({ height });
          }),
          paletteRows(entry.color, (color) => {
            set({ color });
          }),
          checkRow("Tinted tips", entry.tipColor !== undefined, (tinted) => {
            set({ tipColor: tinted ? "#e0553a" : undefined });
            renderPlants();
          }),
          ...(entry.tipColor === undefined
            ? []
            : [
                colorRow("Tip color", entry.tipColor, (tipColor) => {
                  set({ tipColor });
                }),
              ]),
          ...placementRow(entry.on, (on) => {
            set({ on });
          }),
          editButton("Remove", () => {
            draft.flora.splice(index, 1);
            renderPlants();
          }),
        );
        plantsBox.append(card);
      });
    };
    const plants = section(
      "Plants",
      plantsBox,
      editButton("Add plant", () => {
        draft.flora.push({
          kind: "seagrass",
          count: 20,
          bands: [0, 4],
          height: [0.1, 0.3],
          color: "#6fbf4a",
        });
        renderPlants();
      }),
    );
    renderPlants();

    const objectsBox = element("div", "designer__list");
    const renderObjects = (): void => {
      objectsBox.replaceChildren();
      draft.props.forEach((entry, index) => {
        const set = (change: Partial<PropSpec>): void => {
          const current = draft.props[index];
          if (current !== undefined) draft.props[index] = { ...current, ...change };
        };
        const card = element("div", "designer__card");
        card.dataset.object = String(index);
        card.append(
          selectRow("Kind", kindOptions(PROP_KINDS), entry.kind, (kind) => {
            set({ kind: kind as PropSpec["kind"] });
          }),
          textRow("Name", entry.name ?? "", (name) => {
            set({ name: name === "" ? undefined : name });
          }),
          numberRow("Count", entry.count, [0, MAX_PROPS], 1, (count) => {
            set({ count });
          }),
          paletteRows(entry.color, (color) => {
            set({ color });
          }),
          checkRow("Own size", entry.size !== undefined, (own) => {
            set({ size: own ? [0.1, 0.3] : undefined });
            renderObjects();
          }),
          ...(entry.size === undefined
            ? []
            : pairRows("Size (m)", entry.size, [0.01, 2], 0.01, (size) => {
                set({ size });
              })),
          checkRow("Own depth band", entry.bands !== undefined, (own) => {
            set({ bands: own ? [1, 3] : undefined });
            renderObjects();
          }),
          ...(entry.bands === undefined
            ? []
            : pairRows("Depth band", entry.bands, [0, 4], 1, (bands) => {
                set({ bands });
              })),
          ...materialRows(options.materials, entry.material, true, (material) => {
            set({ material });
          }),
          ...placementRow(entry.on, (on) => {
            set({ on });
          }),
          editButton("Remove", () => {
            draft.props.splice(index, 1);
            renderObjects();
          }),
        );
        objectsBox.append(card);
      });
    };
    const objects = section(
      "Objects",
      objectsBox,
      editButton("Add object", () => {
        draft.props.push({ kind: "rock", count: 5, color: "#8a8070" });
        renderObjects();
      }),
    );
    renderObjects();

    // Fish: one slider per species in the catalog.
    const countOf = (species: string): number =>
      draft.fauna.find((entry) => entry.species === species)?.count ?? 0;
    const fish = section(
      "Fish",
      ...options.catalog.species.map((species) =>
        numberRow(species.name, countOf(species.id), [0, MAX_FISH], 1, (count) => {
          const others = draft.fauna.filter((entry) => entry.species !== species.id);
          draft.fauna = count > 0 ? [...others, { species: species.id, count }] : others;
        }),
      ),
    );

    // Actions.
    const fileInput = element("input", "designer__file");
    fileInput.type = "file";
    fileInput.accept = "application/json,.json";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file !== undefined) callbacks.onImport(file);
      fileInput.value = "";
    });
    const actions = element("div", "designer__actions");
    const autoRow = element("label", "panel__row panel__row--check");
    const autoInput = element("input", "panel__check");
    autoInput.type = "checkbox";
    autoInput.checked = autoPreview;
    autoInput.name = "auto-preview";
    autoInput.addEventListener("change", () => {
      autoPreview = autoInput.checked;
    });
    autoRow.append(autoInput, element("span", "panel__label", "Auto preview"));
    actions.append(
      button("Preview", preview),
      button("Revert", () => {
        draft = structuredClone(original);
        build();
        edited();
        preview();
      }),
      button(options.isCustom ? "Save" : "Save as my scene", () => {
        callbacks.onSave(structuredClone(draft), !options.isCustom);
      }),
      ...(options.isCustom
        ? [
            button("Save as new", () => {
              callbacks.onSave(structuredClone(draft), true);
            }),
          ]
        : []),
      button("Export JSON", () => {
        callbacks.onExport(structuredClone(draft));
      }),
      button("Import JSON", () => {
        fileInput.click();
      }),
      ...(options.isCustom
        ? [
            button("Delete", () => {
              callbacks.onDelete();
            }),
          ]
        : []),
      button("Close", () => {
        aside.hidden = true;
      }),
      fileInput,
    );

    aside.replaceChildren(
      element("h1", "panel__title", "Scene designer"),
      error,
      status,
      actions,
      autoRow,
      general,
      water,
      light,
      rockwork,
      plants,
      objects,
      fish,
    );
  };
  // Built on first open: until then the page carries no designer controls.
  let built = false;
  const ensureBuilt = (): void => {
    if (built) return;
    built = true;
    build();
    root.append(aside);
  };

  return {
    open() {
      ensureBuilt();
      aside.hidden = false;
    },
    close() {
      aside.hidden = true;
    },
    toggle() {
      ensureBuilt();
      aside.hidden = !aside.hidden;
    },
    showError(message) {
      ensureBuilt();
      aside.hidden = false;
      error.textContent = message;
      error.hidden = message === "";
    },
    dispose() {
      aside.remove();
    },
  };
}
