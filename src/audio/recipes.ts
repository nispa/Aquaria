import type { Rng } from "../core/rng";

/**
 * The sounds of the aquarium, as plain numbers: Web Audio plays them (see
 * audio/soundBoard). Every sound is synthesized, so there are no recordings
 * to license and nothing to download.
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

/** Bubbling water sends a bubble about this often, s; still water far less often. */
const BUBBLING_GAP: readonly [number, number] = [0.08, 0.7];
const STILL_GAP: readonly [number, number] = [1.5, 6];
const BUBBLE_HZ: readonly [number, number] = [380, 1100];
const BUBBLE_RISE: readonly [number, number] = [1.3, 1.9];
const BUBBLE_SECONDS: readonly [number, number] = [0.04, 0.12];
const BUBBLE_LEVEL: readonly [number, number] = [0.015, 0.05];

/** The next bubble of the ambient bubbling, drawn from `rng`. */
export function nextBubble(rng: Rng, bubbling: boolean): Bubble {
  const [shortest, longest] = bubbling ? BUBBLING_GAP : STILL_GAP;
  // Squaring the draw bunches bubbles into little bursts with pauses between.
  const gap = shortest + (longest - shortest) * rng.next() ** 2;
  const startHz = rng.range(BUBBLE_HZ[0], BUBBLE_HZ[1]);
  return {
    delaySeconds: gap,
    startHz,
    endHz: startHz * rng.range(BUBBLE_RISE[0], BUBBLE_RISE[1]),
    seconds: rng.range(BUBBLE_SECONDS[0], BUBBLE_SECONDS[1]),
    level: rng.range(BUBBLE_LEVEL[0], BUBBLE_LEVEL[1]),
  };
}

/** The steady hush of moving water under the bubbles. */
export const WATER_HUSH = {
  /** Band of the filtered noise, Hz. */
  centerHz: 520,
  q: 0.7,
  /** Gain when the water bubbles, and when it is still. */
  bubblingLevel: 0.035,
  stillLevel: 0.018,
} as const;

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
