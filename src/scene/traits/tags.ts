import { z } from "zod";
import { tagSchema } from "../tags";
import { defineTrait } from "./defineTrait";

/**
 * What it is to a fish (`shelter`, `anemone`, `coral`…): fish look for
 * places by tag, never by object. A scene entry may retag its items.
 */
export const tags = defineTrait({
  id: "tags",
  summary: "what it is to a fish: a shelter, an anemone, coral…",
  schema: z.array(tagSchema).default([]),
});
