import { parseCatalog } from "../scene/parse";
import { DEBUG_TOOLS, launchQuery, type DebugTool, type LaunchOptions } from "./launchOptions";

/**
 * /debug.html (with `pnpm dev`): one page that opens every debug tool. The
 * aquarium with any scene, seed, hour, effects and the activity overlay or
 * collision shapes already on; the fish on the grid (model viewer); and a
 * reminder of the keys and commands. See README, "Debugging".
 */

interface SceneIndex {
  readonly groups: readonly { readonly name: string; readonly scenes: readonly string[] }[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return response.json();
}

function isSceneIndex(data: unknown): data is SceneIndex {
  return (
    typeof data === "object" && data !== null && "groups" in data && Array.isArray(data.groups)
  );
}

function option(value: string, label: string): HTMLOptionElement {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

/** The element with `id`, of the kind the page is known to have there. */
function byId<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`debug.html lacks the ${kind.name} #${id}`);
  return found;
}

/** A number typed in a field, or undefined when it is empty. */
function typedNumber(input: HTMLInputElement): number | undefined {
  return input.value.trim() === "" ? undefined : Number(input.value);
}

function readTankOptions(): LaunchOptions {
  const scene = byId("scene", HTMLSelectElement).value;
  const seed = typedNumber(byId("seed", HTMLInputElement));
  const hour = typedNumber(byId("hour", HTMLInputElement));
  const frozenSeconds = typedNumber(byId("frozen", HTMLInputElement));
  const effectsText = byId("effects", HTMLInputElement).value.trim();
  const debug = DEBUG_TOOLS.filter(
    (tool: DebugTool) => byId(`debug-${tool}`, HTMLInputElement).checked,
  );
  return {
    ...(scene === "" ? {} : { scene }),
    ...(seed === undefined ? {} : { seed }),
    ...(hour === undefined ? {} : { hour }),
    ...(frozenSeconds === undefined ? {} : { frozenSeconds }),
    ...(effectsText === "" ? {} : { effects: effectsText.split(",").map((id) => id.trim()) }),
    ...(debug.length === 0 ? {} : { debug }),
  };
}

async function start(): Promise<void> {
  const scenePicker = byId("scene", HTMLSelectElement);
  const index = await fetchJson("scenes/index.json");
  if (isSceneIndex(index)) {
    for (const group of index.groups) {
      const optionGroup = document.createElement("optgroup");
      optionGroup.label = group.name;
      for (const id of group.scenes) optionGroup.append(option(id, id));
      scenePicker.append(optionGroup);
    }
  }

  const speciesPicker = byId("viewer-species", HTMLSelectElement);
  const catalog = parseCatalog(await fetchJson("species.json"));
  for (const species of catalog.species) {
    const label = species.model === undefined ? species.name : `${species.name} (3D)`;
    speciesPicker.append(option(species.id, label));
  }

  const tankLink = byId("open-tank", HTMLAnchorElement);
  const refreshTank = (): void => {
    const href = `/${launchQuery(readTankOptions())}`;
    tankLink.href = href;
    tankLink.textContent = `Open the aquarium: ${href}`;
  };
  byId("tank", HTMLFormElement).addEventListener("input", refreshTank);
  refreshTank();

  const viewerLink = byId("open-viewer", HTMLAnchorElement);
  const refreshViewer = (): void => {
    const href = `/model-viewer.html?id=${speciesPicker.value}`;
    viewerLink.href = href;
    viewerLink.textContent = `Open the fish on the grid: ${href}`;
  };
  speciesPicker.addEventListener("change", refreshViewer);
  refreshViewer();
}

void start();
