import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * The scenes offered in the panel, in named groups: `scenes/index.json`. The
 * first scene opens when neither the URL nor a saved choice names another.
 */

const SCENE_ID = /^[a-z0-9-]+$/;

const sceneId = z.string().regex(SCENE_ID, "Scene ids use lowercase letters, digits and dashes.");

const sceneIndexSchema = z
  .object({
    /** Named groups shown in the panel, e.g. "Open sea" and "Aquariums". */
    groups: z.array(z.object({ name: z.string().min(1), scenes: z.array(sceneId) })).min(1),
  })
  .superRefine(({ groups }, context) => {
    const seen = new Set<string>();
    for (const group of groups) {
      for (const id of group.scenes) {
        if (seen.has(id)) {
          context.addIssue({ code: "custom", message: `Scene "${id}" is listed twice.` });
        }
        seen.add(id);
      }
    }
  });

export interface SceneGroup {
  readonly name: string;
  readonly scenes: readonly string[];
}

export interface SceneIndex {
  readonly groups: readonly SceneGroup[];
  /** Every listed scene, in order. */
  readonly scenes: readonly string[];
  readonly defaultScene: string;
}

export function parseSceneIndex(input: unknown): SceneIndex {
  const result = sceneIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("scene index", result.error));
  }
  const { groups } = result.data;
  const scenes = groups.flatMap((group) => group.scenes);
  const [defaultScene] = scenes;
  if (defaultScene === undefined) {
    throw new SceneValidationError("Invalid scene index: no scenes listed.");
  }
  return { groups, scenes, defaultScene };
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
