import { element } from "./controls";

/**
 * The scenes as cards in the control panel: a square picture of each tank
 * and its name, one after another in the order of the scene index (the
 * viewer's own last), each group under its name (the bundled scenes are
 * grouped by the size of their tank), the open one highlighted, and a last card that opens
 * the scene editor. Scenes without a picture (the viewer's own) show
 * their initial on water.
 */

export interface SceneCardChoice {
  readonly id: string;
  readonly name: string;
}

export interface SceneCardChoiceGroup {
  readonly name: string;
  readonly scenes: readonly SceneCardChoice[];
}

export interface SceneCard extends SceneCardChoice {
  /** The group it belongs to, e.g. "Aquariums" or "My scenes". */
  readonly group: string;
  /** URL of the square picture, or undefined for a scene without one. */
  readonly picture: string | undefined;
  readonly selected: boolean;
  /** Whether the group's name goes before this card. */
  readonly firstOfGroup: boolean;
}

/** What every card shows, in order. */
export function sceneCardList(
  groups: readonly SceneCardChoiceGroup[],
  selected: string,
  pictureOf: (id: string) => string | undefined,
): SceneCard[] {
  return groups.flatMap((group) =>
    group.scenes.map((scene, place) => ({
      id: scene.id,
      name: scene.name,
      group: group.name,
      picture: pictureOf(scene.id),
      selected: scene.id === selected,
      firstOfGroup: place === 0,
    })),
  );
}

/** The letter a card without a picture shows. */
export function sceneInitial(name: string): string {
  const letter = /\p{L}|\p{N}/u.exec(name)?.[0];
  return letter === undefined ? "~" : letter.toUpperCase();
}

/** Stacked cubes: the scene editor card's icon. */
const EDITOR_ICON =
  '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
  '<path d="M12 3l5 2.5v5L12 13l-5-2.5v-5z"/><path d="M7 10.5l5 2.5v5L7 20.5 2 18v-5z"/>' +
  '<path d="M17 10.5l5 2.5v5l-5 2.5-5-2.5v-5z"/></svg>';

/** A card that opens a tool instead of a scene. */
function actionCard(
  action: string,
  iconMarkup: string,
  name: string,
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const card = element("button", "scene-card scene-card--tool");
  card.type = "button";
  card.dataset.action = action;
  const icon = element("span", "scene-card__picture scene-card__icon");
  icon.innerHTML = iconMarkup;
  card.setAttribute("aria-label", label);
  card.title = title;
  card.append(icon, element("span", "scene-card__name", name));
  card.addEventListener("click", onClick);
  return card;
}

export interface SceneCardsOptions {
  readonly groups: readonly SceneCardChoiceGroup[];
  readonly selected: string;
  readonly pictureOf: (id: string) => string | undefined;
  onSelect(sceneId: string): void;
  onOpenEditor(): void;
}

/** The cards in one grid, ready to go in the panel. */
export function createSceneCards(options: SceneCardsOptions): HTMLElement {
  const grid = element("div", "scene-cards");
  for (const card of sceneCardList(options.groups, options.selected, options.pictureOf)) {
    if (card.firstOfGroup) grid.append(element("h4", "scene-cards__group", card.group));
    const button = element("button", "scene-card");
    button.type = "button";
    button.dataset.scene = card.id;
    button.dataset.group = card.group;
    button.setAttribute("aria-pressed", String(card.selected));
    button.title = `${card.name} · ${card.group}`;
    const picture = element("span", "scene-card__picture");
    if (card.picture === undefined) {
      const initial = element("span", "scene-card__initial", sceneInitial(card.name));
      initial.setAttribute("aria-hidden", "true");
      picture.append(initial);
    } else {
      const image = element("img", "scene-card__image");
      image.src = card.picture;
      image.alt = "";
      image.loading = "lazy";
      picture.append(image);
    }
    button.append(picture, element("span", "scene-card__name", card.name));
    button.addEventListener("click", () => {
      if (!card.selected) options.onSelect(card.id);
    });
    grid.append(button);
  }
  grid.append(
    actionCard(
      "editor",
      EDITOR_ICON,
      "Editor",
      "Scene editor",
      "Scene editor: rock, plants, objects and the scene's water and light (E)",
      () => {
        options.onOpenEditor();
      },
    ),
  );
  return grid;
}
