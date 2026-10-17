import { z } from "zod";
import { isCustomSceneId } from "./customScenes";

/**
 * Card pictures of the viewer's own scenes: a frame of the tank, taken the
 * first time a saved scene is shown and kept in the browser next to the
 * scenes, like the bundled scenes' pictures in public/scenes/thumbnails.
 */

/** Only small JPEG pictures made by the app, never a link elsewhere. */
const jpegDataUrl = z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);

/** The pictures by scene id; entries that are not JPEG pictures are dropped. */
export function readScenePictures(stored: string | null): Record<string, string> {
  if (stored === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(stored);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  return Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] => jpegDataUrl.safeParse(entry[1]).success,
    ),
  );
}

/** The new storage content with a scene's picture set, or forgotten when `picture` is absent. */
export function writeScenePicture(stored: string | null, id: string, picture?: string): string {
  const others = Object.entries(readScenePictures(stored)).filter(([key]) => key !== id);
  return JSON.stringify(
    Object.fromEntries(picture === undefined ? others : [...others, [id, picture]]),
  );
}

/** The largest square in the middle of a frame, in its pixels. */
export function centerSquare(
  width: number,
  height: number,
): { readonly x: number; readonly y: number; readonly size: number } {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

/**
 * The card picture of a scene: a bundled scene's thumbnail under `base`,
 * or, for the viewer's own, the picture kept in the browser (none yet:
 * undefined, and one is taken when the scene shows).
 */
export function scenePictureUrl(
  id: string,
  stored: Readonly<Record<string, string>>,
  base: string,
): string | undefined {
  return isCustomSceneId(id) ? stored[id] : `${base}scenes/thumbnails/${id}.jpg`;
}
