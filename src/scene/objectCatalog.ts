import { z } from "zod";
import type { ObjectManifest } from "./objectManifest";
import { formatIssues, SceneValidationError } from "./parse";
import type { Scene } from "./schema";

/**
 * The plants and objects a tank can hold, by id (their folder in
 * `public/assets/objects/`, listed in its `index.json`).
 */
export interface ObjectCatalog {
  get(id: string): ObjectManifest | undefined;
  /** The ids of one category, in index order. */
  ids(category: ObjectManifest["category"]): readonly string[];
}

const objectIndexSchema = z.object({
  objects: z.array(
    z.string().regex(/^[a-z0-9-]+$/, "Object ids are folder names: lowercase, digits, dashes."),
  ),
});

/** Validates `public/assets/objects/index.json`: the object folders. */
export function parseObjectIndex(input: unknown): readonly string[] {
  const result = objectIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("object index", result.error));
  }
  return result.data.objects;
}

export function createObjectCatalog(
  entries: readonly (readonly [string, ObjectManifest])[],
): ObjectCatalog {
  const byId = new Map(entries);
  return {
    get: (id) => byId.get(id),
    ids: (category) =>
      entries.filter(([, manifest]) => manifest.category === category).map(([id]) => id),
  };
}

/**
 * Checks that every plant and object a scene names is in the catalog, and
 * of the right category; fails loudly with every problem, like a scene error.
 */
export function checkSceneObjects(scene: Scene, objects: ObjectCatalog): void {
  const problems: string[] = [];
  const check = (section: "flora" | "props", category: ObjectManifest["category"]): void => {
    scene[section].forEach((entry, index) => {
      const object = objects.get(entry.kind);
      const where = `${section}.${String(index)}.kind`;
      if (object === undefined) {
        problems.push(`  - ${where}: there is no object "${entry.kind}".`);
      } else if (object.category !== category) {
        problems.push(
          `  - ${where}: "${entry.kind}" is not a${category === "plant" ? " plant" : "n object"}.`,
        );
      }
    });
  };
  check("flora", "plant");
  check("props", "object");
  if (problems.length > 0) {
    throw new SceneValidationError(`Invalid scene "${scene.id}":\n${problems.join("\n")}`);
  }
}
