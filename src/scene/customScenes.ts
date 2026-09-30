import { parseScene, SceneValidationError } from "./parse";
import type { Scene, SpeciesCatalog } from "./schema";

/**
 * Scenes made in the scene designer: stored in the browser, exported to and
 * imported from JSON files. Custom ids start with "my-" so they never clash
 * with bundled scenes; exported files drop the prefix, ready for
 * public/scenes/ and the scene index.
 */

const CUSTOM_PREFIX = "my-";
const FALLBACK_SLUG = "scene";
const JSON_INDENT = 2;

/** "Barriera più bella!" becomes "barriera-piu-bella". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}

export function isCustomSceneId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

/** A free custom id for a scene name: "my-<slug>", numbered if taken. */
export function customSceneId(name: string, taken: readonly string[]): string {
  const base = `${CUSTOM_PREFIX}${slugify(name)}`;
  if (!taken.includes(base)) return base;
  let number = 2;
  while (taken.includes(`${base}-${number}`)) number += 1;
  return `${base}-${number}`;
}

/** Pretty JSON for a scene file; custom ids lose their prefix. */
export function exportScene(scene: Scene): string {
  const id = isCustomSceneId(scene.id) ? scene.id.slice(CUSTOM_PREFIX.length) : scene.id;
  return `${JSON.stringify({ ...scene, id }, null, JSON_INDENT)}\n`;
}

/** Reads a scene file, validates it and gives it a free custom id based on its own id. */
export function importScene(
  json: string,
  catalog: SpeciesCatalog,
  taken: readonly string[],
): { readonly id: string; readonly scene: Scene } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new SceneValidationError("The file is not valid JSON.");
  }
  const parsed = parseScene(data, catalog);
  const id = customSceneId(parsed.id, taken);
  return { id, scene: { ...parsed, id } };
}

/** Custom scenes in browser storage; entries that no longer validate are dropped. */
export function readCustomScenes(
  stored: string | null,
  catalog: SpeciesCatalog,
): Record<string, Scene> {
  if (stored === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(stored);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  const scenes: Record<string, Scene> = {};
  for (const [id, value] of Object.entries(data)) {
    try {
      scenes[id] = { ...parseScene(value, catalog), id };
    } catch {
      // A scene saved by an older version may no longer validate: skip it.
    }
  }
  return scenes;
}

/** Returns the new storage content with `scene` saved, or with `id` deleted. */
export function writeCustomScene(stored: string | null, scene: Scene): string;
export function writeCustomScene(stored: string | null, id: string, action: "delete"): string;
export function writeCustomScene(
  stored: string | null,
  sceneOrId: Scene | string,
  action?: "delete",
): string {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = stored === null ? {} : JSON.parse(stored);
    if (typeof parsed === "object" && parsed !== null) data = { ...parsed };
  } catch {
    data = {};
  }
  if (action === "delete" && typeof sceneOrId === "string") {
    return JSON.stringify(
      Object.fromEntries(Object.entries(data).filter(([id]) => id !== sceneOrId)),
    );
  }
  if (typeof sceneOrId !== "string") data[sceneOrId.id] = sceneOrId;
  return JSON.stringify(data);
}
