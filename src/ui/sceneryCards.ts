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
  readonly drawPortraits: DrawSceneryPortraits;
  onCountChange(key: string, count: number): void;
}

export interface SceneryCards {
  readonly grid: HTMLElement;
  /** Draws every picture the first time; later calls do nothing. */
  showPortraits(): void;
}

/**
 * A grid of cards like the fish cards, one per scenery entry of the scene:
 * a picture of one item, the name and a count slider.
 */
export function createSceneryCards(options: SceneryCardsOptions): SceneryCards {
  const requests: SceneryPortraitRequest[] = [];
  let portraitsShown = false;

  const grid = element("div", "fish-cards");
  for (const entry of options.entries) {
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
    grid.append(card);
  }

  return {
    grid,
    showPortraits() {
      if (portraitsShown) return;
      portraitsShown = true;
      options.drawPortraits(requests);
    },
  };
}
