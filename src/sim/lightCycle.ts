import { LIGHT_CHANNELS as CHANNELS, type LightChannel, type Lights } from "../scene/lights";

/**
 * The daily LED cycle: which hour it is, how bright each channel is at that
 * hour, and what the channels add up to. Pure, so the renderer only applies
 * the result and every rule here is unit-tested.
 */

const HOURS_PER_DAY = 24;
const SECONDS_PER_MINUTE = 60;
/** Rec. 709 luminance weights for linear RGB. */
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;
/** Brightness 1 = the recommended white channel at full level. */
const REFERENCE_LUMINANCE = 0.9;
const MAX_BRIGHTNESS = 2;
/** How much each channel excites coral fluorescence per unit level. */
const FLUORESCENCE_WEIGHT = { blue: 0.6, violet: 1 } as const;
/** Bright white light washes the glow out. */
const WHITE_MASKING = 0.6;

export type ChannelLevels = Readonly<Record<LightChannel, number>>;

export interface LightState {
  /** Normalized light color, linear RGB with the largest component 1. */
  readonly color: readonly [number, number, number];
  /** Overall brightness; 1 = full recommended daylight, 0 = dark. */
  readonly brightness: number;
  /** How strongly corals glow, 0..1. */
  readonly fluorescence: number;
}

export interface CycleInput {
  /** Local time of day in hours, from the wall clock. */
  readonly clockHour: number;
  /** Seconds since the aquarium started. */
  readonly elapsedSeconds: number;
}

/** The hour of the aquarium's day for the chosen cycle mode. */
export function cycleHour(cycle: Lights["cycle"], input: CycleInput): number {
  switch (cycle.mode) {
    case "fixed":
      return cycle.hour;
    case "clock":
      return input.clockHour;
    case "accelerated": {
      const days = input.elapsedSeconds / (cycle.minutes * SECONDS_PER_MINUTE);
      return (cycle.hour + days * HOURS_PER_DAY) % HOURS_PER_DAY;
    }
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * 0..1 for a light that switches on at `on` and off at `off` (hours, possibly
 * across midnight), fading over `ramp` hours at both ends.
 */
function onWindow(hour: number, on: number, off: number, ramp: number): number {
  const since = (hour - on + HOURS_PER_DAY) % HOURS_PER_DAY;
  const length = (off - on + HOURS_PER_DAY) % HOURS_PER_DAY;
  if (since > length) return 0;
  return smoothstep(0, ramp, since) * (1 - smoothstep(length - ramp, length, since));
}

function levelsInto(lights: Lights, hour: number, into: Record<LightChannel, number>): void {
  const { sunrise, sunset, ramp } = lights.cycle;
  const day = onWindow(hour, sunrise, sunset, ramp);
  // Actinic blue opens the day one ramp early and closes it one ramp late.
  const actinic = onWindow(hour, sunrise - ramp, sunset + ramp, ramp);
  const { white, blue, violet, accent } = lights.channels;
  into.white = white.level * day;
  into.blue = Math.max(blue.level * actinic, lights.moon);
  into.violet = violet.level * day;
  into.accent = accent.level * day;
}

/** Level of each channel at an hour of the day. */
export function channelLevels(lights: Lights, hour: number): ChannelLevels {
  const levels: Record<LightChannel, number> = { white: 0, blue: 0, violet: 0, accent: 0 };
  levelsInto(lights, hour, levels);
  return levels;
}

/** Decodes a #rgb or #rrggbb sRGB color to linear RGB. */
export function hexToLinear(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  const decode = (offset: number): number => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return [decode(0), decode(2), decode(4)];
}

type Rgb = [number, number, number];

/** Writes the mix of `levels` through pre-decoded channel colors into `into`. */
function mixInto(
  colors: Readonly<Record<LightChannel, Rgb>>,
  levels: ChannelLevels,
  into: { color: Rgb; brightness: number; fluorescence: number },
): void {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const channel of CHANNELS) {
    const rgb = colors[channel];
    red += rgb[0] * levels[channel];
    green += rgb[1] * levels[channel];
    blue += rgb[2] * levels[channel];
  }
  const luminance = red * LUMINANCE[0] + green * LUMINANCE[1] + blue * LUMINANCE[2];
  const peak = Math.max(red, green, blue);
  into.color[0] = peak > 0 ? red / peak : 0;
  into.color[1] = peak > 0 ? green / peak : 0;
  into.color[2] = peak > 0 ? blue / peak : 0;
  into.brightness = Math.min(luminance / REFERENCE_LUMINANCE, MAX_BRIGHTNESS);
  const excitation =
    levels.blue * FLUORESCENCE_WEIGHT.blue + levels.violet * FLUORESCENCE_WEIGHT.violet;
  into.fluorescence = Math.min(excitation * (1 - WHITE_MASKING * levels.white), 1);
}

function decodeChannels(lights: Lights): Record<LightChannel, Rgb> {
  return {
    white: hexToLinear(lights.channels.white.color),
    blue: hexToLinear(lights.channels.blue.color),
    violet: hexToLinear(lights.channels.violet.color),
    accent: hexToLinear(lights.channels.accent.color),
  };
}

/** What the channels add up to: light color, brightness and coral fluorescence. */
export function lightMix(lights: Lights, levels: ChannelLevels): LightState {
  const result = { color: [0, 0, 0] as Rgb, brightness: 0, fluorescence: 0 };
  mixInto(decodeChannels(lights), levels, result);
  return result;
}

export interface LightMixer {
  /** The light at an hour. Returns the same object every call: read it, do not keep it. */
  at(hour: number): LightState;
}

/**
 * Allocation-free light mixing for the render loop: channel colors are decoded
 * once and the result object is reused.
 */
export function createLightMixer(lights: Lights): LightMixer {
  const colors = decodeChannels(lights);
  const levels: Record<LightChannel, number> = { white: 0, blue: 0, violet: 0, accent: 0 };
  const result = { color: [0, 0, 0] as Rgb, brightness: 0, fluorescence: 0 };
  return {
    at(hour) {
      levelsInto(lights, hour, levels);
      mixInto(colors, levels, result);
      return result;
    },
  };
}
