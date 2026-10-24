import type { AddableScenery } from "../scene/scenery";
import { element } from "./controls";
import { pictureCard } from "./pictureCard";
import type { DrawSceneryPortraits, SceneryPortraitRequest } from "./sceneryCards";

/**
 * The window the panel's [ + ] card opens, in the middle of the screen: a
 * card for every plant and object of the catalog the scene does not hold
 * yet, with a search field. Choosing one adds it to the tank and closes it.
 */

export interface SceneryPickerOptions {
  readonly items: readonly AddableScenery[];
  /** Draws catalog pictures, keyed by object id. */
  readonly drawPortraits: DrawSceneryPortraits;
  onPick(id: string): void;
}

const GROUPS: readonly { readonly category: AddableScenery["category"]; readonly title: string }[] =
  [
    { category: "plant", title: "Plants" },
    { category: "object", title: "Corals, rocks and objects" },
  ];

/** Whether an item answers a search: every word of it in the name or id, any case. */
export function matchesSearch(item: AddableScenery, search: string): boolean {
  const text = `${item.name} ${item.id}`.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function openSceneryPicker(root: HTMLElement, options: SceneryPickerOptions): void {
  const backdrop = element("div", "picker");
  const dialog = element("div", "picker__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Add to the tank");

  const header = element("div", "picker__header");
  const title = element("h2", "picker__title", "Add to the tank");
  const search = element("input", "picker__search");
  search.type = "search";
  search.placeholder = "Search";
  search.setAttribute("aria-label", "Search");
  const close = element("button", "picker__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  header.append(title, search, close);

  const body = element("div", "picker__body");
  const requests: SceneryPortraitRequest[] = [];
  const cards: { readonly item: AddableScenery; readonly card: HTMLElement }[] = [];
  const sections: { readonly section: HTMLElement; readonly category: string }[] = [];
  for (const { category, title: groupTitle } of GROUPS) {
    const items = options.items.filter((item) => item.category === category);
    if (items.length === 0) continue;
    const section = element("section", "picker__group");
    const grid = element("div", "picker__cards");
    for (const item of items) {
      const { card, canvas } = pictureCard("button", item.name);
      card.type = "button";
      card.classList.add("palette__card");
      card.dataset.addScenery = item.id;
      card.addEventListener("click", () => {
        dismiss();
        options.onPick(item.id);
      });
      requests.push({ key: item.id, canvas });
      cards.push({ item, card });
      grid.append(card);
    }
    section.append(element("h3", "picker__heading", groupTitle), grid);
    sections.push({ section, category });
    body.append(section);
  }
  const empty = element("p", "picker__empty", "Everything in the catalog is in the tank already.");
  empty.hidden = cards.length > 0;
  body.append(empty);

  search.addEventListener("input", () => {
    for (const { item, card } of cards) card.hidden = !matchesSearch(item, search.value.trim());
    for (const { section, category } of sections) {
      section.hidden = cards.every(({ item, card }) => item.category !== category || card.hidden);
    }
  });

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss();
    // The panel's shortcut keys belong to the panel, not to this window.
    event.stopPropagation();
  };
  const dismiss = (): void => {
    window.removeEventListener("keydown", onKey, true);
    backdrop.remove();
  };
  close.addEventListener("click", dismiss);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) dismiss();
  });
  window.addEventListener("keydown", onKey, true);

  dialog.append(header, body);
  backdrop.append(dialog);
  root.append(backdrop);
  search.focus();
  options.drawPortraits(requests);
}
