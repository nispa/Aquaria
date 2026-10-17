import { z } from "zod";
import type { ObjectManifest } from "./objectManifest";

/**
 * Tags say what a plant or an object is to a fish: something to host in, to
 * hide in, to graze on. Fish look for places by tag (a clownfish keeps to an
 * `anemone`), never by kind: an object lists its tags in its `tags` trait,
 * and a scene entry can retag its items (e.g. a rock pile used as `shelter`).
 */

export const tagSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Tags use lowercase letters, digits and dashes.");

/** An entry's own tags, or its object's (the `tags` trait), or none. */
export function tagsOf(
  entry: { readonly tags?: readonly string[] | undefined },
  object: ObjectManifest | undefined,
): readonly string[] {
  return entry.tags ?? object?.traits.tags ?? [];
}
