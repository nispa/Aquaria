import type { z } from "zod";
import { sceneSchema, speciesCatalogSchema, type Scene, type SpeciesCatalog } from "./schema";

/** Thrown when a scene or catalog file does not match its schema. */
export class SceneValidationError extends Error {
  override readonly name = "SceneValidationError";
}

export function formatIssues(source: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  return `Invalid ${source}:\n${lines.join("\n")}`;
}

/** Validates raw catalog data (usually parsed JSON). */
export function parseCatalog(input: unknown): SpeciesCatalog {
  const result = speciesCatalogSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("species catalog", result.error));
  }
  return result.data;
}

/**
 * Validates raw scene data and checks every fauna entry against the catalog:
 * the species must exist and its count stay within the species' maxCount.
 */
export function parseScene(input: unknown, catalog: SpeciesCatalog): Scene {
  const result = sceneSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("scene", result.error));
  }

  const known = new Set(catalog.species.map((species) => species.id));
  const unknown = result.data.fauna.filter((entry) => !known.has(entry.species));
  if (unknown.length > 0) {
    const names = unknown.map((entry) => `"${entry.species}"`).join(", ");
    throw new SceneValidationError(
      `Invalid scene "${result.data.id}": unknown species ${names}. Add them to the species catalog.`,
    );
  }

  const species = new Map(catalog.species.map((entry) => [entry.id, entry]));
  const crowded = result.data.fauna.filter(
    (entry) => entry.count > (species.get(entry.species)?.maxCount ?? Infinity),
  );
  if (crowded.length > 0) {
    const limits = crowded
      .map((entry) => `"${entry.species}" at most ${species.get(entry.species)?.maxCount ?? 0}`)
      .join(", ");
    throw new SceneValidationError(
      `Invalid scene "${result.data.id}": too many fish; the catalog allows ${limits}.`,
    );
  }

  return result.data;
}
