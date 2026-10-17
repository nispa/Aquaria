import { element } from "./controls";
import { pictureCard } from "./pictureCard";
import type { DrawSceneryPortraits, SceneryPortraitRequest } from "./sceneryCards";

/**
 * The scene editor's palette, along the right of the window, in tabs: a
 * card for every plant and every object (the object folders), with its
 * picture, like the panel's scenery cards, and the scene's own settings.
 * Choosing a card makes it what a tap on the tank sets down; choosing it
 * again puts it back.
 */

export interface PaletteItem {
  /** The object id, also the key of its picture. */
  readonly id: string;
  readonly name: string;
}

/** One tab of cards. */
export interface PaletteGroup {
  readonly title: string;
  readonly items: readonly PaletteItem[];
}

export interface PaletteOptions {
  /** Tabs of cards: plants, objects, rocks. */
  readonly groups: readonly PaletteGroup[];
  readonly drawPortraits: DrawSceneryPortraits;
  /** The Scene tab's content. */
  readonly settings: HTMLElement;
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

  const tabs = element("div", "palette__tabs");
  tabs.setAttribute("role", "tablist");
  const panes: { tab: HTMLButtonElement; pane: HTMLElement }[] = [];
  const show = (index: number): void => {
    panes.forEach(({ tab, pane }, paneIndex) => {
      tab.setAttribute("aria-selected", String(paneIndex === index));
      pane.hidden = paneIndex !== index;
    });
  };
  const tabPane = (title: string, pane: HTMLElement): void => {
    const tab = element("button", "palette__tab", title);
    tab.type = "button";
    tab.setAttribute("role", "tab");
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-label", title);
    const index = panes.length;
    tab.addEventListener("click", () => {
      show(index);
    });
    panes.push({ tab, pane });
    tabs.append(tab);
  };

  const group = (title: string, items: readonly PaletteItem[]): void => {
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
    tabPane(title, grid);
  };
  for (const { title, items } of options.groups) group(title, items);
  tabPane("Scene", options.settings);
  panel.append(tabs, ...panes.map(({ pane }) => pane));
  show(0);
  root.append(panel);
  options.drawPortraits(requests);

  return {
    setChosen,
    dispose() {
      panel.remove();
    },
  };
}
