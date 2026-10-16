import { z } from "zod";
import type { FLORA_KINDS, PROP_KINDS } from "./schema";

/**
 * Tags say what a plant or an object is to a fish: something to host in, to
 * hide in, to graze on. Fish look for places by tag (a clownfish keeps to an
 * `anemone`), never by kind, so a new kind only needs its tags here, and a
 * scene entry can retag its items (e.g. a rock pile used as `shelter`).
 */

export const tagSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Tags use lowercase letters, digits and dashes.");

type SceneryKind = (typeof FLORA_KINDS)[number] | (typeof PROP_KINDS)[number];

/** The tags of every kind, used when a scene entry sets none. */
export const DEFAULT_TAGS: Readonly<Record<SceneryKind, readonly string[]>> = {
  kelp: ["plant", "shelter"],
  seagrass: ["plant"],
  anemone: ["anemone", "shelter"],
  bush: ["plant", "algae", "shelter"],
  carpet: ["plant"],
  fern: ["plant", "shelter"],
  stem: ["plant", "shelter"],
  rock: ["rock", "algae"],
  starfish: ["starfish"],
  shell: ["shell"],
  "brain-coral": ["coral"],
  "branch-coral": ["coral", "shelter"],
  "fan-coral": ["coral"],
  "table-coral": ["coral", "shelter"],
  "mushroom-coral": ["coral"],
  "leather-coral": ["coral"],
  driftwood: ["wood", "shelter"],
  "dragon-stone": ["rock"],
  moss: ["plant", "algae"],
  pebble: [],
};

/** An entry's own tags, or its kind's. */
export function tagsOf(entry: {
  readonly kind: SceneryKind;
  readonly tags?: readonly string[] | undefined;
}): readonly string[] {
  return entry.tags ?? DEFAULT_TAGS[entry.kind];
}
