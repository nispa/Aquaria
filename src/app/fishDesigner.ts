import {
  BODY_LAYER_TEMPLATES,
  FIN_LAYER_TEMPLATES,
  parseFishRecipe,
  type FishRecipe,
} from "../scene/fishRecipe";
import { element } from "../ui/controls";
import { jsonEditor } from "../ui/jsonEditor";
import { createSideView, type PhotoPlacement } from "../ui/sideView";

/**
 * The fish maker page (`pnpm dev`, then /fish-designer.html): a fish recipe
 * traced over a photograph of the real fish, its strains painted layer by
 * layer, then built by Blender through the dev server (scripts/
 * fishMakerServer.ts) and shown in the model viewer below. See
 * docs/FISH_MODELS.md.
 */

const SPECIES_ID = /^[a-z0-9-]+$/;
/** Outlines and paths are dragged on the side view, not typed. */
const DRAGGED = new Set(["top", "bottom", "outline", "points"]);
/** The shape's parts typed in the panel; the strains have their own section. */
const SHAPE_KEYS = ["body", "eye", "mouth", "gills"] as const;
const PHOTO_RANGES = {
  x: { min: -1, max: 1, step: 0.005, value: -0.07 },
  z: { min: -0.6, max: 0.6, step: 0.005, value: 0 },
  width: { min: 0.2, max: 3, step: 0.01, value: 1.2 },
  opacity: { min: 0, max: 1, step: 0.05, value: 0.6 },
} as const;

type Strain = FishRecipe["strains"][number];
type FinPainter = NonNullable<Strain["fins"]>[string];

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  return response.json() as Promise<unknown>;
}

function section(parent: HTMLElement, title: string, open = true): HTMLElement {
  const box = element("details", "maker__section");
  box.open = open;
  box.append(element("summary", "maker__heading", title));
  parent.append(box);
  return box;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = element("button", "maker__button", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function slider(
  label: string,
  range: (typeof PHOTO_RANGES)[keyof typeof PHOTO_RANGES],
  onInput: (value: number) => void,
): HTMLElement {
  const row = element("label", "maker__field");
  const input = element("input", "");
  input.type = "range";
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = String(range.step);
  input.value = String(range.value);
  input.addEventListener("input", () => {
    onInput(Number(input.value));
  });
  row.append(element("span", "maker__key", label), input);
  return row;
}

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#side");
  const panel = document.querySelector<HTMLElement>("#controls");
  const viewer = document.querySelector<HTMLIFrameElement>("#viewer");
  if (canvas === null || panel === null || viewer === null) return;

  const list = (await fetchJson("/__fish/recipes")) as { id: string; name: string }[];
  let id = new URLSearchParams(window.location.search).get("id") ?? list[0]?.id ?? "";
  let recipe: FishRecipe | undefined;
  let strainIndex = 0;
  let photo: HTMLImageElement | undefined;
  let placement: PhotoPlacement = {
    x: PHOTO_RANGES.x.value,
    z: PHOTO_RANGES.z.value,
    width: PHOTO_RANGES.width.value,
    opacity: PHOTO_RANGES.opacity.value,
    flip: false,
  };

  const status = element("pre", "maker__status");
  const say = (text: string): void => {
    status.textContent = text;
  };
  const side = createSideView(canvas, (next) => {
    recipe = next;
  });
  const showViewer = (): void => {
    viewer.src = `/model-viewer.html?id=${id}&coloring=${String(strainIndex)}&spread=0.3&t=${String(Date.now())}`;
  };
  const changed = (): void => {
    if (recipe !== undefined) side.setRecipe(recipe);
  };

  // The species: a recipe to open, or the one open copied under a new id.
  const species = section(panel, "Fish");
  const picker = element("select", "maker__select");
  for (const entry of list) {
    const option = element("option", "", `${entry.name} (${entry.id})`);
    option.value = entry.id;
    picker.append(option);
  }
  const newId = element("input", "maker__text");
  newId.placeholder = "new-species-id";
  const copy = button("Copy as a new fish", () => {
    if (!SPECIES_ID.test(newId.value)) {
      say("A species id uses lowercase letters, digits and dashes.");
      return;
    }
    id = newId.value;
    say(`Now ${id}: Save writes public/assets/species/${id}/fish.json.`);
  });
  species.append(picker, newId, copy);

  // The photograph under the fish.
  const photoBox = section(panel, "Photograph");
  const file = element("input", "");
  file.type = "file";
  file.accept = "image/*";
  const place = (change: Partial<PhotoPlacement>): void => {
    placement = { ...placement, ...change };
    side.setPhoto(photo, placement);
  };
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (chosen === undefined) return;
    const image = new Image();
    image.addEventListener("load", () => {
      photo = image;
      place({});
    });
    image.src = URL.createObjectURL(chosen);
  });
  const flip = element("input", "");
  flip.type = "checkbox";
  flip.addEventListener("change", () => {
    place({ flip: flip.checked });
  });
  const flipRow = element("label", "maker__field");
  flipRow.append(element("span", "maker__key", "facing left"), flip);
  photoBox.append(
    file,
    slider("centre x", PHOTO_RANGES.x, (x) => {
      place({ x });
    }),
    slider("centre z", PHOTO_RANGES.z, (z) => {
      place({ z });
    }),
    slider("width", PHOTO_RANGES.width, (width) => {
      place({ width });
    }),
    slider("opacity", PHOTO_RANGES.opacity, (opacity) => {
      place({ opacity });
    }),
    flipRow,
  );

  const shape = section(panel, "Shape and fins", false);
  const paint = section(panel, "Strains");
  const actions = section(panel, "Build");

  /** The fins' painters a strain uses: its own, else the recipe's shared ones. */
  const painterOf = (strain: Strain, finId: string): FinPainter | undefined =>
    strain.fins?.[finId] ?? recipe?.finPaint?.[finId];

  const renderShape = (): void => {
    shape.replaceChildren(
      shape.firstElementChild ?? element("summary", "maker__heading", "Shape and fins"),
    );
    if (recipe === undefined) return;
    for (const key of SHAPE_KEYS) {
      const part = recipe[key];
      if (part === undefined) continue;
      shape.append(
        element("p", "maker__subheading", key),
        jsonEditor(part, { hidden: DRAGGED, onChange: changed }),
      );
    }
    for (const fin of recipe.fins) {
      shape.append(
        element("p", "maker__subheading", `fin: ${fin.id} (${fin.type})`),
        jsonEditor(fin, { hidden: DRAGGED, onChange: changed }),
      );
    }
  };

  const renderPaint = (): void => {
    paint.replaceChildren(
      paint.firstElementChild ?? element("summary", "maker__heading", "Strains"),
    );
    if (recipe === undefined) return;
    const strains = recipe.strains;
    const strainPicker = element("select", "maker__select");
    strains.forEach((strain, index) => {
      const option = element("option", "", strain.name);
      option.value = String(index);
      option.selected = index === strainIndex;
      strainPicker.append(option);
    });
    strainPicker.addEventListener("change", () => {
      strainIndex = Number(strainPicker.value);
      renderPaint();
      showViewer();
    });
    const strain = strains[strainIndex];
    paint.append(strainPicker);
    if (strain === undefined) return;
    paint.append(jsonEditor({ id: strain.id, name: strain.name }, { onChange: changed }));
    const header = element("p", "maker__subheading", "Body layers, first to last");
    paint.append(header);
    strain.body.forEach((layer, index) => {
      const box = element("details", "maker__layer");
      const title = element("summary", "", `${String(index + 1)}. ${layer.type}`);
      const move = (by: number): void => {
        const target = index + by;
        if (target < 0 || target >= strain.body.length) return;
        const [taken] = strain.body.splice(index, 1);
        if (taken !== undefined) strain.body.splice(target, 0, taken);
        renderPaint();
      };
      const tools = element("span", "maker__tools");
      tools.append(
        button("↑", () => {
          move(-1);
        }),
        button("↓", () => {
          move(1);
        }),
        button("✕", () => {
          strain.body.splice(index, 1);
          renderPaint();
        }),
      );
      title.append(tools);
      box.append(title, jsonEditor(layer, { onChange: changed }));
      paint.append(box);
    });
    const addPicker = element("select", "maker__select");
    for (const type of Object.keys(BODY_LAYER_TEMPLATES)) {
      const option = element("option", "", type);
      option.value = type;
      addPicker.append(option);
    }
    paint.append(
      addPicker,
      button("Add a body layer", () => {
        const template = BODY_LAYER_TEMPLATES[addPicker.value];
        if (template === undefined) return;
        strain.body.push(structuredClone(template));
        renderPaint();
      }),
    );
    for (const fin of recipe.fins) {
      const painter = painterOf(strain, fin.id);
      if (painter === undefined) continue;
      const own = strain.fins?.[fin.id] !== undefined;
      const box = element("details", "maker__layer");
      box.append(element("summary", "", `fin ${fin.id}${own ? "" : " (shared by every strain)"}`));
      box.append(jsonEditor(painter, { onChange: changed }));
      const layerPicker = element("select", "maker__select");
      for (const type of Object.keys(FIN_LAYER_TEMPLATES)) {
        const option = element("option", "", type);
        option.value = type;
        layerPicker.append(option);
      }
      box.append(
        layerPicker,
        button("Add a fin layer", () => {
          const template = FIN_LAYER_TEMPLATES[layerPicker.value];
          if (template === undefined) return;
          painter.layers = [...(painter.layers ?? []), structuredClone(template)];
          renderPaint();
        }),
      );
      paint.append(box);
    }
    paint.append(
      button("Copy this strain as a new one", () => {
        const copied = structuredClone(strain);
        copied.id = `${strain.id}-copy`;
        copied.name = `${strain.name} copy`;
        strains.push(copied);
        strainIndex = strains.length - 1;
        renderPaint();
      }),
    );
  };

  /** Checks the recipe and sends it to the dev server; true when it is saved (and built). */
  const send = async (action: "save" | "build"): Promise<boolean> => {
    if (recipe === undefined) return false;
    try {
      parseFishRecipe(recipe, id);
    } catch (error) {
      say(error instanceof Error ? error.message : String(error));
      return false;
    }
    say(action === "build" ? "Building in Blender…" : "Saving…");
    const result = (await fetchJson(`/__fish/${action}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipe),
    })) as { ok: boolean; error?: string; log?: string };
    say(
      result.ok ? (action === "build" ? "Built." : "Saved.") : (result.error ?? "It went wrong."),
    );
    return result.ok;
  };

  actions.append(
    button("Save", () => {
      void send("save");
    }),
    button("Build", () => {
      void send("build").then((built) => {
        if (built) showViewer();
      });
    }),
    status,
  );

  const open = async (next: string): Promise<void> => {
    id = next;
    picker.value = next;
    strainIndex = 0;
    const loaded = await fetchJson(`/assets/species/${next}/fish.json`);
    recipe = parseFishRecipe(loaded, next);
    side.setRecipe(recipe);
    renderShape();
    renderPaint();
    showViewer();
    say(`Opened ${next}.`);
  };
  picker.addEventListener("change", () => {
    void open(picker.value);
  });
  if (id !== "") await open(id);
}

void start();
