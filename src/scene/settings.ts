import { z } from "zod";
import { FULL_HD_HEIGHT, UHD_HEIGHT } from "../core/resolution";
import { MAX_INDIVIDUALS_PER_SPECIES } from "./schema";

/** Lowest render height offered, for weak GPUs (half of Full HD). */
const MIN_RENDER_HEIGHT = FULL_HD_HEIGHT / 2;

/** Viewer preferences saved in the browser. */
export const settingsSchema = z.object({
  /** Height of the drawing buffer in pixels; the canvas always fills the screen. */
  renderHeight: z.number().int().min(MIN_RENDER_HEIGHT).max(UHD_HEIGHT).default(UHD_HEIGHT),
  showFps: z.boolean().default(false),
  /** Population overrides per scene id, then per species id. */
  counts: z
    .record(
      z.string(),
      z.record(z.string(), z.number().int().min(0).max(MAX_INDIVIDUALS_PER_SPECIES)),
    )
    .default({}),
});

export type Settings = z.output<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export interface ParsedSettings {
  readonly settings: Settings;
  /** False when saved data was corrupted and the defaults were used instead. */
  readonly valid: boolean;
}

/**
 * Reads saved settings. Never throws: corrupted preferences must not stop the
 * aquarium from starting, so they are replaced by the defaults.
 */
export function parseSettings(input: unknown): ParsedSettings {
  if (input === null || input === undefined) {
    return { settings: DEFAULT_SETTINGS, valid: true };
  }
  const result = settingsSchema.safeParse(input);
  return result.success
    ? { settings: result.data, valid: true }
    : { settings: DEFAULT_SETTINGS, valid: false };
}
