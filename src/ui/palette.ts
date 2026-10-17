import { element } from "./controls";
import { pictureCard } from "./pictureCard";
import type { DrawSceneryPortraits, SceneryPortraitRequest } from "./sceneryCards";

/**
 * The scene editor's palette, along the right of the window: a card for
 * every plant and object (the object folders), with its picture, like the
 * panel's scenery cards. Choosing one makes it what a tap on the tank sets
 * down; choosing it again puts it back.
 */

export interface PaletteItem {
  /** The object id, also the key of its picture. */
  readonly id: string;
  readonly name: string;
}

export interface PaletteOptions {
  readonly plants: readonly PaletteItem[];
  readonly objects: readonly PaletteItem[];
  readonly drawPortraits: DrawSceneryPortraits;
  /** The chosen object, or undefined when the viewer put it back. */
  onChoose(id: string | undefined): void;
}

export interface Palette {
  /** Shows which object is chosen, if any (another tool may take over). */
  setChosen(id: string | undefined): void;
  dispose(): void;
}

export function createPalette(root: HTMLElement, options: PaletteOptions): Palette {
  const panel = element("aside", "palette");
  panel.setAttribute("aria-label", "Palette");
  const cards = new Map<string, HTMLButtonElement>();
  const requests: SceneryPortraitRequest[] = [];
  let chosen: string | undefined;

  const setChosen = (id: string | undefined): void => {
    chosen = id;
    for (const [cardId, card] of cards) card.setAttribute("aria-pressed", String(cardId === id));
  };

  const group = (title: string, items: readonly PaletteItem[]): void => {
    if (items.length === 0) return;
    const grid = element("div", "fish-cards");
    for (const item of items) {
      const { card, canvas } = pictureCard("button", item.name);
      card.type = "button";
      card.classList.add("palette__card");
      card.dataset.object = item.id;
      card.setAttribute("aria-label", item.name);
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", () => {
        const next = chosen === item.id ? undefined : item.id;
        setChosen(next);
        options.onChoose(next);
      });
      cards.set(item.id, card);
      requests.push({ key: item.id, canvas });
      grid.append(card);
    }
    panel.append(element("h2", "palette__heading", title), grid);
  };
  group("Plants", options.plants);
  group("Objects", options.objects);
  root.append(panel);
  options.drawPortraits(requests);

  return {
    setChosen,
    dispose() {
      panel.remove();
    },
  };
}
