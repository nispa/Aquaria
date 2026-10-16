import { element } from "./controls";

/**
 * The scenes as cards in the control panel: a square picture of each tank
 * and its name, one after another in the order of the scene index (the
 * viewer's own last), the open one highlighted, and a last card that opens
 * the scene designer. Scenes without a picture (the viewer's own) show
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
}

/** What every card shows, in order. */
export function sceneCardList(
  groups: readonly SceneCardChoiceGroup[],
  selected: string,
  pictureOf: (id: string) => string | undefined,
): SceneCard[] {
  return groups.flatMap((group) =>
    group.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      group: group.name,
      picture: pictureOf(scene.id),
      selected: scene.id === selected,
    })),
  );
}

/** The letter a card without a picture shows. */
export function sceneInitial(name: string): string {
  const letter = /\p{L}|\p{N}/u.exec(name)?.[0];
  return letter === undefined ? "~" : letter.toUpperCase();
}

/** A pencil over a frame: the scene designer card's icon. */
const DESIGNER_ICON =
  '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
  '<rect x="3" y="5" width="14" height="14" rx="2"/>' +
  '<path d="M3 15l4-4 3 3 3-4 4 5"/>' +
  '<path d="M15 13l6-6 2 2-6 6-3 1z" fill="currentColor" stroke="none"/></svg>';

export interface SceneCardsOptions {
  readonly groups: readonly SceneCardChoiceGroup[];
  readonly selected: string;
  readonly pictureOf: (id: string) => string | undefined;
  onSelect(sceneId: string): void;
  onOpenDesigner(): void;
}

/** The cards in one grid, ready to go in the panel. */
export function createSceneCards(options: SceneCardsOptions): HTMLElement {
  const grid = element("div", "scene-cards");
  for (const card of sceneCardList(options.groups, options.selected, options.pictureOf)) {
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
  const designer = element("button", "scene-card scene-card--designer");
  designer.type = "button";
  designer.dataset.action = "designer";
  const icon = element("span", "scene-card__picture scene-card__icon");
  icon.innerHTML = DESIGNER_ICON;
  designer.setAttribute("aria-label", "Scene designer");
  designer.title = "Scene designer: build and edit scenes";
  designer.append(icon, element("span", "scene-card__name", "Designer"));
  designer.addEventListener("click", () => {
    options.onOpenDesigner();
  });
  grid.append(designer);
  return grid;
}
