import { z } from "zod";
import { formatIssues, SceneValidationError } from "../parse";
import { collision } from "./collision";
import { placement } from "./placement";
import { sway } from "./sway";
import { tags } from "./tags";

/** Every trait Aquaria carries out, by id. Adding one: a file here and a line below. */
export const TRAITS = { sway, collision, tags, placement } as const;

export type TraitId = keyof typeof TRAITS;

/** The traits of an object, each with all its parameters filled in. */
export type ObjectTraits = {
  readonly [Id in TraitId]?: z.output<(typeof TRAITS)[Id]["schema"]>;
};

export interface ParsedTraits {
  readonly traits: ObjectTraits;
  /** Traits skipped because Aquaria does not know them. */
  readonly warnings: readonly string[];
}

const isTraitId = (id: string): id is TraitId => Object.hasOwn(TRAITS, id);

/**
 * Validates an object's traits. A trait Aquaria does not know is skipped with
 * a warning (another program, or a newer Aquaria, may know it); a known one
 * with wrong parameters fails loudly. `objectId` names the object in messages.
 */
export function parseTraits(
  input: Readonly<Record<string, unknown>>,
  objectId: string,
): ParsedTraits {
  const traits: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const [id, parameters] of Object.entries(input)) {
    if (!isTraitId(id)) {
      warnings.push(`Object "${objectId}": unknown trait "${id}" skipped.`);
      continue;
    }
    const result = TRAITS[id].schema.safeParse(parameters);
    if (!result.success) {
      throw new SceneValidationError(
        formatIssues(`object "${objectId}"`, prefixed(result.error, ["traits", id])),
      );
    }
    traits[id] = result.data;
  }
  // Each entry was parsed by the schema of its own id.
  return { traits, warnings };
}

/** The error with its issues' paths under `prefix`, for messages that say where. */
function prefixed(error: z.ZodError, prefix: readonly string[]): z.ZodError {
  return new z.ZodError(
    error.issues.map((issue) => ({ ...issue, path: [...prefix, ...issue.path] })),
  );
}
