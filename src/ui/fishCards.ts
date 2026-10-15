import type { Species } from "../scene/schema";
import { element, slider } from "./controls";

/** Picture size in device pixels: sharp on 2x screens at the card's CSS size. */
const PORTRAIT_WIDTH = 192;
const PORTRAIT_HEIGHT = 120;

/** One picture for the panel to have drawn: the species with its 3D model or procedural body. */
export interface PortraitRequest {
  readonly speciesId: string;
  readonly model: boolean;
  readonly canvas: HTMLCanvasElement;
}

/** Draws fish pictures into canvases; may finish later (models load first). */
export type DrawPortraits = (requests: readonly PortraitRequest[]) => void;

export interface FishCardsOptions {
  readonly species: readonly Species[];
  readonly counts: Readonly<Record<string, number>>;
  /** Species with a 3D model, and whether it is shown instead of the procedural body. */
  readonly fishModels: Readonly<Record<string, boolean>>;
  readonly drawPortraits: DrawPortraits;
  onCountChange(speciesId: string, count: number): void;
  onModelChange(speciesIds: readonly string[], enabled: boolean): void;
}

export interface FishCards {
  /** "All 3D / None 3D" buttons, or nothing when no species has a model. */
  readonly modelRow: HTMLElement | undefined;
  readonly grid: HTMLElement;
  /** Draws every picture the first time; later calls do nothing. */
  showPortraits(): void;
}

/** Species in the tank first, then the others; each group keeps the catalog order. */
export function cardOrder<T extends { readonly id: string }>(
  species: readonly T[],
  counts: Readonly<Record<string, number>>,
): T[] {
  const inTank = (entry: T): boolean => (counts[entry.id] ?? 0) > 0;
  return [...species.filter(inTank), ...species.filter((entry) => !inTank(entry))];
}

/**
 * A grid of cards, one per species: a picture, the name, a count slider and,
 * for species with a realistic model, a "3D" badge that switches between the
 * model and the lighter procedural body (the picture follows).
 */
export function createFishCards(options: FishCardsOptions): FishCards {
  const canvases = new Map<string, HTMLCanvasElement>();
  const badges = new Map<string, HTMLButtonElement>();
  const modelShown = (speciesId: string): boolean =>
    badges.get(speciesId)?.getAttribute("aria-pressed") === "true";
  let portraitsShown = false;

  const requestFor = (speciesId: string): PortraitRequest[] => {
    const canvas = canvases.get(speciesId);
    return canvas === undefined ? [] : [{ speciesId, model: modelShown(speciesId), canvas }];
  };

  const setBadge = (badge: HTMLButtonElement, enabled: boolean): void => {
    badge.setAttribute("aria-pressed", String(enabled));
    badge.title = enabled
      ? "Realistic 3D model. Click for the lighter procedural fish."
      : "Procedural fish. Click for the realistic 3D model.";
  };
  const setModels = (ids: readonly string[], enabled: boolean): void => {
    const changed = ids.filter((id) => badges.has(id) && modelShown(id) !== enabled);
    for (const id of ids) {
      const badge = badges.get(id);
      if (badge !== undefined) setBadge(badge, enabled);
    }
    options.onModelChange(ids, enabled);
    if (portraitsShown && changed.length > 0) {
      options.drawPortraits(changed.flatMap(requestFor));
    }
  };

  const modelIds = Object.keys(options.fishModels);
  let modelRow: HTMLElement | undefined;
  if (modelIds.length > 0) {
    modelRow = element("div", "panel__row panel__row--select");
    const buttons = element("div", "panel__presets");
    for (const [label, enabled] of [
      ["All 3D", true],
      ["None 3D", false],
    ] as const) {
      const button = element("button", "panel__button", label);
      button.type = "button";
      button.addEventListener("click", () => {
        setModels(modelIds, enabled);
      });
      buttons.append(button);
    }
    modelRow.append(element("span", "panel__label", "3D models"), buttons);
  }

  const grid = element("div", "fish-cards");
  for (const species of cardOrder(options.species, options.counts)) {
    const count = options.counts[species.id] ?? 0;
    const card = element("div", "fish-card");
    card.dataset.speciesCard = species.id;
    card.classList.toggle("fish-card--empty", count === 0);

    const picture = element("div", "fish-card__picture");
    const canvas = element("canvas", "fish-card__canvas");
    canvas.width = PORTRAIT_WIDTH;
    canvas.height = PORTRAIT_HEIGHT;
    canvas.setAttribute("aria-hidden", "true");
    canvases.set(species.id, canvas);
    picture.append(canvas);
    const enabled = options.fishModels[species.id];
    if (enabled !== undefined) {
      const badge = element("button", "panel__badge fish-card__badge", "3D");
      badge.type = "button";
      badge.dataset.model = species.id;
      setBadge(badge, enabled);
      badge.addEventListener("click", () => {
        setModels([species.id], !modelShown(species.id));
      });
      badges.set(species.id, badge);
      picture.append(badge);
    }

    const value = element("output", "fish-card__value", String(count));
    const input = slider(0, species.maxCount, 1, count);
    input.classList.add("fish-card__slider");
    input.dataset.species = species.id;
    input.setAttribute("aria-label", species.name);
    input.addEventListener("input", () => {
      value.textContent = input.value;
      card.classList.toggle("fish-card--empty", input.value === "0");
      options.onCountChange(species.id, Number(input.value));
    });
    const countRow = element("div", "fish-card__count");
    countRow.append(input, value);
    card.append(picture, element("span", "fish-card__name", species.name), countRow);
    grid.append(card);
  }

  return {
    modelRow,
    grid,
    showPortraits() {
      if (portraitsShown) return;
      portraitsShown = true;
      options.drawPortraits([...canvases.keys()].flatMap(requestFor));
    },
  };
}
