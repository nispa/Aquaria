import { z } from "zod";

/**
 * Aquarium LED lighting: four channels and a daily cycle. A scene may set its
 * own lights; the viewer may override them from the panel ("custom"). Every
 * field has the recommended value as its default, so partial setups work.
 */

const HOURS_PER_DAY = 24;
/** Dawn and dusk longer than this would overlap on the shortest day. */
const MAX_RAMP_HOURS = 6;
/** Moonlight is a faint blue glow, never a second day. */
const MAX_MOON_LEVEL = 0.3;
const MINUTES_PER_DAY = 1440;

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Expected a hex color such as #1f5fd6.");
const hour = z.number().min(0).max(HOURS_PER_DAY);
const level = z.number().min(0).max(1);

const channel = (color: string, peak: number) =>
  z
    .object({
      color: hexColor.default(color),
      /** Level at full daylight, 0..1. */
      level: level.default(peak),
    })
    .prefault({});

/** A complete setup; absent fields take the recommended values. */
export const customLightsSchema = z.object({
  channels: z
    .object({
      /** Daylight white: most of the brightness and the caustics. */
      white: channel("#fff1dc", 0.8),
      /** Actinic blue: first on and last off; makes corals fluoresce. */
      blue: channel("#3d6bff", 0.65),
      /** Violet/UV: little brightness, strong fluorescence. */
      violet: channel("#8a3dff", 0.35),
      /** A free color for custom looks and events; off in the recommended setup. */
      accent: channel("#ff6ad5", 0),
    })
    .prefault({}),
  /** Blue night light, 0..0.3. */
  moon: z.number().min(0).max(MAX_MOON_LEVEL).default(0.06),
  cycle: z
    .object({
      /**
       * fixed: always `hour`. clock: follows the local time. accelerated: a
       * whole day every `minutes`, starting from `hour`.
       */
      mode: z.enum(["fixed", "clock", "accelerated"]).default("fixed"),
      hour: hour.default(13),
      minutes: z.number().min(1).max(MINUTES_PER_DAY).default(10),
      /** White and violet reach full level after the ramp that starts here. */
      sunrise: hour.default(9),
      /** White and violet are off by here. */
      sunset: hour.default(21),
      /** Length of dawn and dusk, hours; blue runs one ramp longer at each end. */
      ramp: z.number().min(0.1).max(MAX_RAMP_HOURS).default(1.5),
    })
    .prefault({}),
});

/** Lights for a scene: the recommended setup when absent. */
export const lightsSchema = customLightsSchema.prefault({});

export type Lights = z.output<typeof lightsSchema>;
export type LightsInput = z.input<typeof lightsSchema>;
export type LightChannel = keyof Lights["channels"];
export type CycleMode = Lights["cycle"]["mode"];

export const LIGHT_CHANNELS: readonly LightChannel[] = ["white", "blue", "violet", "accent"];

/** The recommended reef setup: every default above. */
export const RECOMMENDED_LIGHTS: Lights = lightsSchema.parse({});
