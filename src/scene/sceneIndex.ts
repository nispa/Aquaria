import { z } from "zod";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * The scenes offered in the panel, in named groups: `scenes/index.json`. The
 * first scene opens when neither the URL nor a saved choice names another;
 * on a phone, the `phone` scene opens instead, a small tank it draws well.
 */

const SCENE_ID = /^[a-z0-9-]+$/;

const sceneId = z.string().regex(SCENE_ID, "Scene ids use lowercase letters, digits and dashes.");

const sceneIndexSchema = z
  .object({
    /** Named groups shown in the panel, e.g. "Open sea" and "Aquariums". */
    groups: z.array(z.object({ name: z.string().min(1), scenes: z.array(sceneId) })).min(1),
    /** The scene a phone opens first; one of the listed scenes. */
    phone: sceneId.optional(),
  })
  .superRefine(({ groups, phone }, context) => {
    if (phone !== undefined && !groups.some((group) => group.scenes.includes(phone))) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: `The phone scene "${phone}" is not listed.`,
      });
    }
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
  /** The scene a phone opens first, when the index names one. */
  readonly phoneScene?: string | undefined;
}

export function parseSceneIndex(input: unknown): SceneIndex {
  const result = sceneIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("scene index", result.error));
  }
  const { groups, phone } = result.data;
  const scenes = groups.flatMap((group) => group.scenes);
  const [defaultScene] = scenes;
  if (defaultScene === undefined) {
    throw new SceneValidationError("Invalid scene index: no scenes listed.");
  }
  return { groups, scenes, defaultScene, phoneScene: phone };
}

/**
 * The scene to open: the one named in the URL (even if unlisted, so scenes in
 * progress can be tried), else the saved choice if still listed, else on a
 * phone the index's phone scene, else the default.
 */
export function selectSceneId(
  index: SceneIndex,
  fromUrl: string | undefined,
  saved: string | undefined,
  onPhone = false,
): string {
  if (fromUrl !== undefined) return fromUrl;
  if (saved !== undefined && index.scenes.includes(saved)) return saved;
  if (onPhone && index.phoneScene !== undefined) return index.phoneScene;
  return index.defaultScene;
}

/** The display name of a scene file, read leniently: the full file is validated when opened. */
export function sceneName(input: unknown, id: string): string {
  const result = z.object({ name: z.string().min(1) }).safeParse(input);
  return result.success ? result.data.name : id;
}

/** The index with one more group at the end (e.g. the viewer's own scenes). */
export function withGroup(index: SceneIndex, name: string, scenes: readonly string[]): SceneIndex {
  if (scenes.length === 0) return index;
  return {
    ...index,
    groups: [...index.groups, { name, scenes }],
    scenes: [...index.scenes, ...scenes],
  };
}
