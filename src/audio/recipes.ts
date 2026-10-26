import type { Rng } from "../core/rng";
import type { TankSize } from "../scene/tankMeasures";

/**
 * The sounds of the aquarium, as plain numbers: Web Audio plays them (see
 * audio/soundBoard). They are synthesized; only a scene's ambience may be a
 * recording (scene/soundManifest), played as loud as `recordingLevel` says.
 */

/** One bubble: a short sine that rises as the bubble rises. */
export interface Bubble {
  /** Wait before it, s. */
  readonly delaySeconds: number;
  readonly startHz: number;
  readonly endHz: number;
  readonly seconds: number;
  /** Peak gain, 0..1 before the master volume. */
  readonly level: number;
}

type Range = readonly [number, number];

/**
 * How the water of a tank sounds: its bubbles and the steady hush under
 * them. A home tank hums softly with its pump and bubbles now and then
 * near the glass; the open sea is a low, far rumble where a bubble is rare.
 */
export interface Ambience {
  /** Wait between bubbles, s, when the water bubbles and when it is still. */
  readonly bubblingGap: Range;
  readonly stillGap: Range;
  readonly bubbleHz: Range;
  readonly bubbleLevel: Range;
  /** Looped noise, filtered: low-passed to a rumble, or band-passed to a soft rush. */
  readonly hush: {
    readonly filter: "lowpass" | "bandpass";
    readonly hz: number;
    readonly q: number;
    /** Gain when the water bubbles, and when it is still. */
    readonly bubblingLevel: number;
    readonly stillLevel: number;
  };
}

const BUBBLE_RISE: Range = [1.3, 1.9];
const BUBBLE_SECONDS: Range = [0.04, 0.12];

/** A home tank: the pump's soft rush, a bubble now and then, close by. */
const HOME_TANK: Ambience = {
  bubblingGap: [0.6, 3.5],
  stillGap: [4, 14],
  bubbleHz: [500, 1200],
  bubbleLevel: [0.006, 0.018],
  hush: { filter: "bandpass", hz: 380, q: 0.6, bubblingLevel: 0.012, stillLevel: 0.006 },
};

/** The sound of the water by the size of the tank. */
export const AMBIENCES: Readonly<Record<TankSize, Ambience>> = {
  nano: HOME_TANK,
  small: HOME_TANK,
  medium: HOME_TANK,
  // A big tank: deeper water, the pump farther off, bubbles a little lower and rarer.
  // Big tanks are watched to relax by: they stay as calm as a home tank, never louder.
  large: {
    bubblingGap: [1.5, 6],
    stillGap: [6, 20],
    bubbleHz: [350, 900],
    bubbleLevel: [0.004, 0.011],
    hush: { filter: "lowpass", hz: 300, q: 0.5, bubblingLevel: 0.009, stillLevel: 0.006 },
  },
  // The open sea, heard from under the water: a low, quiet rumble, and only now and then a bubble.
  ocean: {
    bubblingGap: [5, 16],
    stillGap: [12, 40],
    bubbleHz: [220, 600],
    bubbleLevel: [0.003, 0.009],
    hush: { filter: "lowpass", hz: 160, q: 0.4, bubblingLevel: 0.009, stillLevel: 0.007 },
  },
};

/**
 * The aquarium's first sound, kept for those who liked it: water bubbling
 * briskly over a soft rush of noise, the same in every tank.
 */
export const CLASSIC_AMBIENCE: Ambience = {
  bubblingGap: [0.08, 0.7],
  stillGap: [1.5, 6],
  bubbleHz: [380, 1100],
  bubbleLevel: [0.015, 0.05],
  hush: { filter: "bandpass", hz: 520, q: 0.7, bubblingLevel: 0.035, stillLevel: 0.018 },
};

/**
 * A recorded ambience (scene/soundManifest) plays this loud by the size of
 * the tank: recordings are normalized loud. Big tanks and the open sea are
 * watched to relax by, so they play softer than a home tank, not fuller.
 */
const RECORDING_GAIN: Readonly<Record<TankSize, number>> = {
  nano: 0.1,
  small: 0.11,
  medium: 0.12,
  large: 0.09,
  ocean: 0.08,
};

/** How loud a recording with its manifest's `level` plays in a tank of this size. */
export function recordingLevel(level: number, size: TankSize): number {
  return level * RECORDING_GAIN[size];
}

/** The next bubble of the ambient bubbling, drawn from `rng`. */
export function nextBubble(
  rng: Rng,
  bubbling: boolean,
  ambience: Ambience = AMBIENCES.medium,
): Bubble {
  const [shortest, longest] = bubbling ? ambience.bubblingGap : ambience.stillGap;
  // Squaring the draw bunches bubbles into little bursts with pauses between.
  const gap = shortest + (longest - shortest) * rng.next() ** 2;
  const startHz = rng.range(ambience.bubbleHz[0], ambience.bubbleHz[1]);
  return {
    delaySeconds: gap,
    startHz,
    endHz: startHz * rng.range(BUBBLE_RISE[0], BUBBLE_RISE[1]),
    seconds: rng.range(BUBBLE_SECONDS[0], BUBBLE_SECONDS[1]),
    level: rng.range(ambience.bubbleLevel[0], ambience.bubbleLevel[1]),
  };
}

/** A tap on the glass: a dull thud and a little click. */
export const TAP_SOUND = {
  thudHz: 95,
  thudEndHz: 55,
  thudSeconds: 0.22,
  thudLevel: 0.55,
  clickHz: 2400,
  clickSeconds: 0.025,
  clickLevel: 0.12,
} as const;

/** A pinch of food: a few soft ticks of flakes hitting the water. */
export const FEED_SOUND = {
  ticks: 7,
  /** Over this long, s. */
  spreadSeconds: 0.35,
  tickHz: [2600, 5200] as const,
  tickSeconds: 0.03,
  level: 0.07,
} as const;

export type SwitchSoundId = "torch-on" | "torch-off" | "lens-on" | "lens-off";

/** A switch: a sine from `hz` to `endHz` over `seconds`, at `level`. */
export interface SwitchSound {
  readonly hz: number;
  readonly endHz: number;
  readonly seconds: number;
  readonly level: number;
}

/** The torch clicks like a switch; the lens chimes like glass, rising on and falling off. */
export const SWITCH_SOUNDS: Readonly<Record<SwitchSoundId, SwitchSound>> = {
  "torch-on": { hz: 1800, endHz: 1500, seconds: 0.03, level: 0.25 },
  "torch-off": { hz: 1100, endHz: 900, seconds: 0.03, level: 0.22 },
  "lens-on": { hz: 1250, endHz: 1900, seconds: 0.18, level: 0.12 },
  "lens-off": { hz: 1900, endHz: 1250, seconds: 0.18, level: 0.1 },
};
