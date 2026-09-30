import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * The list of scenes offered in the panel: `scenes/index.json`. The first one
 * opens when neither the URL nor a saved choice names another.
 */

const SCENE_ID = /^[a-z0-9-]+$/;

const sceneIndexSchema = z.object({
  scenes: z
    .array(z.string().regex(SCENE_ID, "Scene ids use lowercase letters, digits and dashes."))
    .min(1),
});

export interface SceneIndex {
  readonly scenes: readonly string[];
  readonly defaultScene: string;
}

export function parseSceneIndex(input: unknown): SceneIndex {
  const result = sceneIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("scene index", result.error));
  }
  const [defaultScene] = result.data.scenes;
  if (defaultScene === undefined) {
    throw new SceneValidationError("Invalid scene index: no scenes listed.");
  }
  return { scenes: result.data.scenes, defaultScene };
}

/**
 * The scene to open: the one named in the URL (even if unlisted, so scenes in
 * progress can be tried), else the saved choice if still listed, else the default.
 */
export function selectSceneId(
  index: SceneIndex,
  fromUrl: string | undefined,
  saved: string | undefined,
): string {
  if (fromUrl !== undefined) return fromUrl;
  if (saved !== undefined && index.scenes.includes(saved)) return saved;
  return index.defaultScene;
}

/** The display name of a scene file, read leniently: the full file is validated when opened. */
export function sceneName(input: unknown, id: string): string {
  const result = z.object({ name: z.string().min(1) }).safeParse(input);
  return result.success ? result.data.name : id;
}
