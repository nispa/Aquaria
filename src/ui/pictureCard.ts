import { element } from "./controls";

/** Picture size in device pixels, the same on every card (fish, scenery, palette). */
export const PORTRAIT_WIDTH = 192;
export const PORTRAIT_HEIGHT = 120;

export interface PictureCard<Tag extends "div" | "button"> {
  readonly card: HTMLElementTagNameMap[Tag];
  /** Where the card's picture is drawn, later, by a small renderer of its own. */
  readonly canvas: HTMLCanvasElement;
}

/**
 * A card with a picture and a name, the look the panel's fish and scenery
 * cards share and the scene editor's palette reuses. The caller adds what
 * the card does (a count slider, or the card itself as a button).
 */
export function pictureCard<Tag extends "div" | "button">(
  tag: Tag,
  label: string,
): PictureCard<Tag> {
  const card = element(tag, "fish-card");
  const picture = element("div", "fish-card__picture");
  const canvas = element("canvas", "fish-card__canvas");
  canvas.width = PORTRAIT_WIDTH;
  canvas.height = PORTRAIT_HEIGHT;
  canvas.setAttribute("aria-hidden", "true");
  picture.append(canvas);
  const name = element("span", "fish-card__name", label);
  // Long names are cut short on the card; the full one shows on hover.
  name.title = label;
  card.append(picture, name);
  return { card, canvas };
}
