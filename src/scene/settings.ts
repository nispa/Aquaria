import { z } from "zod";
import { customLightsSchema } from "./lights";
import { FULL_HD_HEIGHT, UHD_HEIGHT } from "../core/resolution";
import {
  MAX_FLORA_PER_ENTRY,
  MAX_INDIVIDUALS_PER_SPECIES,
  type Scene,
  type SpeciesCatalog,
} from "./schema";

/** Lowest render height offered, for weak GPUs (half of Full HD). */
export const MIN_RENDER_HEIGHT = FULL_HD_HEIGHT / 2;

/** Multisample anti-aliasing: smooth edges at a moderate cost in 4K memory. */
export const DEFAULT_MSAA_SAMPLES = 2;
export const MSAA_SAMPLE_CHOICES = [0, 2, 4, 8] as const;
export type MsaaSamples = (typeof MSAA_SAMPLE_CHOICES)[number];

/**
 * Frames drawn per second at most: 30, 60, or 0 for as many as the display
 * shows. A limit leaves the GPU room for the rest of the computer.
 */
export const FRAME_LIMIT_CHOICES = [30, 60, 0] as const;
export type FrameLimit = (typeof FRAME_LIMIT_CHOICES)[number];
export const DEFAULT_FRAME_LIMIT: FrameLimit = 60;

/** Viewer preferences saved in the browser. */
export const settingsSchema = z.object({
  /** Height of the drawing buffer in pixels; the canvas always fills the screen. */
  renderHeight: z.number().int().min(MIN_RENDER_HEIGHT).max(UHD_HEIGHT).default(UHD_HEIGHT),
  showFps: z.boolean().default(false),
  /** Frames per second at most (FRAME_LIMIT_CHOICES); DEFAULT_FRAME_LIMIT when absent. */
  frameLimit: z.union(FRAME_LIMIT_CHOICES.map((limit) => z.literal(limit))).optional(),
  /**
   * Whether the resolution drops when the GPU cannot keep up (and climbs
   * back, up to `renderHeight`); on when absent.
   */
  autoResolution: z.boolean().optional(),
  /** Whether the aquarium makes its sounds; on when absent. */
  sound: z.boolean().optional(),
  /** Sound volume 0..1; DEFAULT_VOLUME when absent. */
  volume: z.number().min(0).max(1).optional(),
  /**
   * Realistic mode: fish keep the hours of their species (resting at night)
   * and the playful spells (hypnosis, tickling) are off. Absent = off.
   */
  realistic: z.boolean().optional(),
  /** Multisample anti-aliasing samples; DEFAULT_MSAA_SAMPLES when absent. */
  msaaSamples: z.union(MSAA_SAMPLE_CHOICES.map((samples) => z.literal(samples))).optional(),
  /** On/off choice per look feature id; features not listed use their default. */
  look: z.record(z.string(), z.boolean()).optional(),
  /** The scene chosen last in the panel. */
  scene: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  /** 3D model (true) or procedural body (false) per species id; absent = the 3D model. */
  fishModels: z.record(z.string(), z.boolean()).optional(),
  /** How fish sizes are drawn: 0 real .. 1 all alike; DEFAULT_SIZE_BALANCE when absent. */
  sizeBalance: z.number().min(0).max(1).optional(),
  /** Open (true) or closed (false) per control panel section id; absent = the section's default. */
  panelSections: z.record(z.string(), z.boolean()).optional(),
  /** Custom LED setup; when absent the scene's own lights are used. */
  lights: customLightsSchema.optional(),
  /** Scenery count overrides per scene id, then per scenery key (see `sceneryEntries`). */
  scenery: z
    .record(z.string(), z.record(z.string(), z.number().int().min(0).max(MAX_FLORA_PER_ENTRY)))
    .optional(),
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

/** The frame limit the settings ask for. */
export function frameLimitOf(settings: Settings): FrameLimit {
  return settings.frameLimit ?? DEFAULT_FRAME_LIMIT;
}

/** A gentle volume: the bubbling stays in the background. */
export const DEFAULT_VOLUME = 0.6;

/** Whether the settings let the aquarium make its sounds. */
export function soundOf(settings: Settings): boolean {
  return settings.sound ?? true;
}

/** The sound volume the settings ask for, 0..1. */
export function volumeOf(settings: Settings): number {
  return settings.volume ?? DEFAULT_VOLUME;
}

/** Whether the settings let the resolution follow the GPU. */
export function autoResolutionOf(settings: Settings): boolean {
  return settings.autoResolution ?? true;
}

export interface ParsedSettings {
  readonly settings: Settings;
  /** False when saved data was corrupted and the defaults were used instead. */
  readonly valid: boolean;
}

/**
 * The render height a build starts at, from its configuration (e.g. a lighter
 * one for the web). Missing or unsupported values fall back to 4K.
 */
export function defaultRenderHeight(configured: string | undefined): number {
  const result = settingsSchema.shape.renderHeight.safeParse(Number(configured));
  return result.success ? result.data : DEFAULT_SETTINGS.renderHeight;
}

/**
 * Reads saved settings. Never throws: corrupted preferences must not stop the
 * aquarium from starting, so they are replaced by the defaults.
 * `startHeight` is the render height used until the viewer saves one.
 */
export function parseSettings(
  input: unknown,
  startHeight: number = DEFAULT_SETTINGS.renderHeight,
): ParsedSettings {
  const defaults: Settings = { ...DEFAULT_SETTINGS, renderHeight: startHeight };
  if (input === null || input === undefined) {
    return { settings: defaults, valid: true };
  }
  const result = settingsSchema.safeParse(input);
  if (!result.success) return { settings: defaults, valid: false };
  const savedHeight = typeof input === "object" && "renderHeight" in input;
  return {
    settings: savedHeight ? result.data : { ...result.data, renderHeight: startHeight },
    valid: true,
  };
}

/**
 * Returns a copy of the scene with the viewer's saved population counts.
 * Species no longer in the catalog are ignored so old settings never break a scene.
 */
export function applyCountOverrides(
  scene: Scene,
  overrides: Readonly<Record<string, number>>,
  catalog: SpeciesCatalog,
): Scene {
  const known = new Set(catalog.species.map((species) => species.id));
  const fauna = scene.fauna.map((entry) => ({
    species: entry.species,
    count: overrides[entry.species] ?? entry.count,
  }));
  for (const [species, count] of Object.entries(overrides)) {
    if (known.has(species) && !fauna.some((entry) => entry.species === species)) {
      fauna.push({ species, count });
    }
  }
  return { ...scene, fauna };
}
