import type { SceneryEntry } from "../scene/scenery";
import { element, slider } from "./controls";
import { pictureCard } from "./pictureCard";

/** One picture for the panel to have drawn: one item of a scenery entry. */
export interface SceneryPortraitRequest {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

/** Draws scenery pictures into canvases; may finish later (stone textures load first). */
export type DrawSceneryPortraits = (requests: readonly SceneryPortraitRequest[]) => void;

export interface SceneryCardsOptions {
  readonly entries: readonly SceneryEntry[];
  /** Keys of the entries the viewer added: their cards can be taken away again. */
  readonly removable: ReadonlySet<string>;
  readonly drawPortraits: DrawSceneryPortraits;
  onCountChange(key: string, count: number): void;
  /** The [ + ] card was chosen: the viewer wants something the scene does not hold. */
  onAdd(): void;
  onRemove(key: string): void;
}

export interface SceneryCards {
  readonly grid: HTMLElement;
  /** Draws every picture the first time; later calls do nothing. */
  showPortraits(): void;
  /** Adds the card of an entry the viewer added, before the [ + ] card. */
  add(entry: SceneryEntry): void;
}

/**
 * A grid of cards like the fish cards, one per scenery entry of the scene:
 * a picture of one item, the name and a count slider. A last [ + ] card
 * adds what the scene does not hold; added entries can be taken away.
 */
export function createSceneryCards(options: SceneryCardsOptions): SceneryCards {
  const requests: SceneryPortraitRequest[] = [];
  let portraitsShown = false;

  const grid = element("div", "fish-cards");
  const cardFor = (entry: SceneryEntry, removable: boolean): HTMLElement => {
    const { card, canvas } = pictureCard("div", entry.label);
    card.dataset.sceneryCard = entry.key;
    card.classList.toggle("fish-card--empty", entry.count === 0);
    requests.push({ key: entry.key, canvas });

    const value = element("output", "fish-card__value", String(entry.count));
    const input = slider(0, entry.max, 1, entry.count);
    input.classList.add("fish-card__slider");
    input.dataset.scenery = entry.key;
    input.setAttribute("aria-label", entry.label);
    input.addEventListener("input", () => {
      value.textContent = input.value;
      card.classList.toggle("fish-card--empty", input.value === "0");
      options.onCountChange(entry.key, Number(input.value));
    });
    const countRow = element("div", "fish-card__count");
    countRow.append(input, value);
    card.append(countRow);
    if (removable) {
      const remove = element("button", "fish-card__remove", "×");
      remove.type = "button";
      remove.title = "Take away";
      remove.setAttribute("aria-label", `Take away ${entry.label}`);
      remove.addEventListener("click", () => {
        card.remove();
        options.onRemove(entry.key);
      });
      card.querySelector(".fish-card__picture")?.append(remove);
    }
    return card;
  };
  for (const entry of options.entries) {
    grid.append(cardFor(entry, options.removable.has(entry.key)));
  }

  const plus = element("button", "fish-card fish-card--add", "+");
  plus.type = "button";
  plus.title = "Add a plant or object the scene does not hold";
  plus.setAttribute("aria-label", "Add to the tank");
  plus.addEventListener("click", () => {
    options.onAdd();
  });
  grid.append(plus);

  return {
    grid,
    showPortraits() {
      if (portraitsShown) return;
      portraitsShown = true;
      options.drawPortraits(requests);
    },
    add(entry) {
      const card = cardFor(entry, true);
      plus.before(card);
      const request = requests.at(-1);
      if (portraitsShown && request !== undefined) options.drawPortraits([request]);
      card.scrollIntoView({ block: "nearest" });
    },
  };
}
