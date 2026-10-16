import { lerp } from "../core/math";
import type { SwimState } from "./behaviors";
import { CRUISE_RESPONSE } from "./behaviors/shared";
import { easeToward, MAX_BEND } from "./posture";

/**
 * Playing with the viewer, deliberately surreal. Circles drawn on the glass
 * near a fish hypnotize it: it stops, floats, turns with the circles and
 * rolls over and over; when they stop it comes round dizzy and swims in a
 * wobbly corkscrew for a while. Scribbling right on a fish tickles it: it
 * wriggles, flips belly up, then darts off in a zigzag.
 */

/** How long circles take to hypnotize a fish fully, and to wear off, s. */
const HYPNOSIS_SECONDS = 1.2;
const AWAKENING_SECONDS = 0.6;
/** Hypnosis this deep leaves the fish dizzy when it wears off. */
const DEEP_HYPNOSIS = 0.8;
export const DIZZY_SECONDS = 4;
/** Scribbling needed to tickle, s. */
const TICKLE_SECONDS = 0.4;
export const TICKLED_SECONDS = 2.6;
/** A tickled fish wriggles belly up for this long, then darts off. */
const WRIGGLE_SECONDS = 1;

/** A hypnotized fish drifts at this share of cruise speed… */
const HYPNOTIZED_SPEED = 0.05;
const HYPNOTIZED_THRUST = 0.3;
/** …turning this far ahead of its heading, radians, the way of the circles… */
const HYPNOTIZED_TURN = 1.2;
/** …and rolling over at this rate, rad/s. */
const HYPNOTIZED_ROLL_RATE = 3;

/** Dizzy wobble: heading swing (radians) and rate (rad/s), bob (body lengths) and rate, roll swing. */
const DIZZY_SWING = 0.9;
const DIZZY_SWING_RATE = 3;
const DIZZY_BOB = 1.5;
const DIZZY_BOB_RATE = 4.5;
const DIZZY_ROLL = 0.8;
const DIZZY_ROLL_RATE = 7;
const DIZZY_SPEED = 0.7;

/** Tickled: wriggle rate (rad/s) and strength (share of the tightest bend), then a zigzag dash. */
const WRIGGLE_RATE = 24;
const WRIGGLE_STRENGTH = 0.8;
const WRIGGLE_SPEED = 0.15;
const DASH_SPEED = 2.2;
const DASH_RESPONSE = 6;
const ZIGZAG_SWING = 0.8;
const ZIGZAG_RATE = 9;

/** How quickly the body rolls back upright or belly up, s. */
const ROLL_RESPONSE_SECONDS = 0.25;
const BELLY_UP = Math.PI;

export interface PlayState {
  /** 0 awake .. 1 deeply hypnotized. */
  hypnosis: number;
  /** 1 or -1: the way of the circles that hypnotized it. */
  spin: number;
  /** Whether the current hypnosis went deep. */
  deep: boolean;
  /** Seconds of dizziness left. */
  dizzy: number;
  /** 0..1: how close scribbling has come to tickling it. */
  tickle: number;
  /** Seconds of being tickled left. */
  tickled: number;
  /** Seconds since the fish was created, for wobbles and wriggles. */
  clock: number;
}

/** What the viewer's finger does to one fish this step. */
export interface PlayInput {
  /** 1 or -1 when circles are drawn near the fish, else 0. */
  readonly spin: number;
  /** Whether the finger scribbles right over the fish. */
  readonly scribbling: boolean;
}

export function createPlay(): PlayState {
  return { hypnosis: 0, spin: 1, deep: false, dizzy: 0, tickle: 0, tickled: 0, clock: 0 };
}

/** Whether the viewer's spell is on the fish: it then ignores everything but a fright. */
export function isEnchanted(state: PlayState): boolean {
  return state.hypnosis > 0 || state.dizzy > 0 || state.tickled > 0;
}

/** Advances hypnosis, dizziness and tickling by one step. */
export function updatePlay(state: PlayState, input: PlayInput, deltaSeconds: number): void {
  state.clock += deltaSeconds;
  state.dizzy = Math.max(state.dizzy - deltaSeconds, 0);
  state.tickled = Math.max(state.tickled - deltaSeconds, 0);
  if (input.spin !== 0) {
    state.hypnosis = Math.min(state.hypnosis + deltaSeconds / HYPNOSIS_SECONDS, 1);
    state.spin = input.spin;
    state.dizzy = 0;
    if (state.hypnosis >= DEEP_HYPNOSIS) state.deep = true;
  } else if (state.hypnosis > 0) {
    state.hypnosis = Math.max(state.hypnosis - deltaSeconds / AWAKENING_SECONDS, 0);
    if (state.hypnosis === 0 && state.deep) {
      state.dizzy = DIZZY_SECONDS;
      state.deep = false;
    }
  }
  if (input.scribbling && state.tickled === 0) {
    state.tickle += deltaSeconds / TICKLE_SECONDS;
    if (state.tickle >= 1) {
      state.tickle = 0;
      state.tickled = TICKLED_SECONDS;
    }
  } else {
    state.tickle = Math.max(state.tickle - deltaSeconds / TICKLE_SECONDS, 0);
  }
}

/** Seconds since the fish was tickled, while it is. */
function sinceTickled(state: PlayState): number {
  return TICKLED_SECONDS - state.tickled;
}

/**
 * Overrides the wishes of an enchanted fish heading `heading` (yaw, radians)
 * at height `height`, of body length `length`. Leaves others untouched.
 */
export function applyPlay(
  state: PlayState,
  wishes: SwimState,
  heading: number,
  height: number,
  length: number,
): void {
  const { clock } = state;
  if (state.tickled > 0) {
    wishes.height = height;
    if (sinceTickled(state) < WRIGGLE_SECONDS) {
      wishes.yaw = heading;
      wishes.speed = WRIGGLE_SPEED;
      wishes.response = CRUISE_RESPONSE;
    } else {
      wishes.yaw = heading + Math.sin(clock * ZIGZAG_RATE) * ZIGZAG_SWING;
      wishes.speed = DASH_SPEED;
      wishes.response = DASH_RESPONSE;
    }
    wishes.thrust = 1;
    return;
  }
  if (state.hypnosis > 0) {
    const depth = state.hypnosis;
    wishes.yaw = heading + state.spin * HYPNOTIZED_TURN * depth;
    wishes.height = height;
    wishes.speed = lerp(wishes.speed, HYPNOTIZED_SPEED, depth);
    wishes.thrust = lerp(wishes.thrust, HYPNOTIZED_THRUST, depth);
    wishes.response = CRUISE_RESPONSE;
    return;
  }
  if (state.dizzy > 0) {
    const fading = state.dizzy / DIZZY_SECONDS;
    wishes.yaw = heading + Math.sin(clock * DIZZY_SWING_RATE) * DIZZY_SWING * fading;
    wishes.height = height + Math.sin(clock * DIZZY_BOB_RATE) * DIZZY_BOB * length * fading;
    wishes.speed = DIZZY_SPEED;
    wishes.thrust = 1;
    wishes.response = CRUISE_RESPONSE;
  }
}

/** Folds an angle into -π..π. */
function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * The fish's roll about its length after one step, radians (0 upright, π
 * belly up): over and over while hypnotized, a corkscrew wobble while dizzy,
 * belly up while wriggling, otherwise easing back upright.
 */
export function nextRoll(state: PlayState, roll: number, deltaSeconds: number): number {
  if (state.hypnosis > 0) {
    return wrap(roll + state.spin * HYPNOTIZED_ROLL_RATE * state.hypnosis * deltaSeconds);
  }
  let target = 0;
  if (state.tickled > 0 && sinceTickled(state) < WRIGGLE_SECONDS) {
    target = Math.sign(roll) * BELLY_UP || BELLY_UP;
  } else if (state.dizzy > 0) {
    const fading = state.dizzy / DIZZY_SECONDS;
    target = Math.sin(state.clock * DIZZY_ROLL_RATE) * DIZZY_ROLL * fading;
  }
  if (roll === target) return roll;
  const eased = easeToward(roll, target, ROLL_RESPONSE_SECONDS, deltaSeconds);
  return Math.abs(eased - target) < 1e-3 ? target : eased;
}

/** The body bend of a wriggling (just tickled) fish, or undefined when it is not wriggling. */
export function wriggleBend(state: PlayState): number | undefined {
  if (state.tickled === 0 || sinceTickled(state) >= WRIGGLE_SECONDS) return undefined;
  return Math.sin(state.clock * WRIGGLE_RATE) * MAX_BEND * WRIGGLE_STRENGTH;
}
