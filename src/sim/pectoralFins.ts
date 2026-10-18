import { clamp, smoothstep } from "../core/math";
import { easeToward } from "./posture";

/**
 * The pectoral fins, the paddles behind the gills. A clownfish hovering by
 * its anemone keeps station on them alone, beating them in turn several
 * times a second; cruising, its tail does the work and they only row along
 * together; in a dash it folds them against its body; it spreads them wide
 * to brake, and spreads the one on the inside of a turn to pivot on it.
 * Renderers turn this state into a stroke (render/shaders/fishPectoralPatch).
 */

/** Beats a second while hovering on the fins, and while cruising on the tail. */
const HOVER_RATE = 3.5;
const CRUISE_RATE = 2.2;
/** How hard the fins row along while the tail drives the fish, as a share of a full beat. */
const CRUISE_BEAT = 0.45;
/**
 * The fins carry the fish below this much work (speed in cruise speeds times
 * the style's thrust) and hand it over to the tail up to the second.
 */
const FIN_WORK: readonly [number, number] = [0.4, 1];
/** How much acceleration adds to the push: seconds of acceleration per cruise speed. */
const ACCELERATION_PUSH_SECONDS = 0.3;
/** The fins fold away as the push grows from the first to the second, in cruise speeds. */
const TUCK_PUSH: readonly [number, number] = [1.3, 1.9];
/** Slowing down by this many cruise speeds a second spreads the fins fully. */
const FULL_BRAKE = 1.5;
/** A bend (curvature times body length) this tight spreads the inner fin fully. */
const FULL_TURN_BEND = 1;
/** In a turn the outer fin draws in by this share of the inner one's spread. */
const OUTER_DRAW_IN = 0.5;
/** Seconds the fins take to follow a new stroke, as the body's other joints. */
const FIN_RESPONSE_SECONDS = 0.15;
const TURN = Math.PI * 2;

/** What drives the fins in one step. */
export interface FinDrive {
  /** Speed in cruise speeds. */
  readonly speedRatio: number;
  /** Change of speed, cruise speeds a second: negative when slowing down. */
  readonly acceleration: number;
  /** Body bend, curvature times body length, positive into a left turn (sim/posture). */
  readonly bend: number;
  /** How much the swimming style works the tail, 0 gliding .. 1 swimming. */
  readonly thrust: number;
}

/** The stroke the fins should settle into. */
export interface FinStroke {
  /** Beats a second. */
  readonly rate: number;
  /** 0 still .. 1 a full beat. */
  readonly beat: number;
  /** 0 both fins together .. 1 in turn, half a beat apart. */
  readonly alternation: number;
  /** -1 folded flat against the body .. 0 as modelled .. 1 spread wide, per side. */
  readonly spreadLeft: number;
  readonly spreadRight: number;
}

/** The fins of one fish, kept from step to step. */
export interface PectoralFins {
  /** Where each fin is in its beat, radians, 0..2π. */
  phaseLeft: number;
  phaseRight: number;
  beat: number;
  alternation: number;
  spreadLeft: number;
  spreadRight: number;
}

/** Fins at rest, as modelled, about to beat in turn from `phase`. */
export function createPectoralFins(phase: number): PectoralFins {
  return {
    phaseLeft: wrap(phase),
    phaseRight: wrap(phase + Math.PI),
    beat: 0,
    alternation: 1,
    spreadLeft: 0,
    spreadRight: 0,
  };
}

/** The stroke the fins settle into for how the fish is swimming now. */
export function pectoralStroke({ speedRatio, acceleration, bend, thrust }: FinDrive): FinStroke {
  const onFins = 1 - smoothstep(FIN_WORK[0], FIN_WORK[1], speedRatio * thrust);
  const push = speedRatio + acceleration * ACCELERATION_PUSH_SECONDS;
  const tuck = smoothstep(TUCK_PUSH[0], TUCK_PUSH[1], push);
  const brake = smoothstep(0, FULL_BRAKE, -acceleration);
  const turn = smoothstep(0, FULL_TURN_BEND, Math.abs(bend));
  const inner = brake + turn;
  const outer = brake - turn * OUTER_DRAW_IN;
  const left = bend > 0 ? inner : outer;
  const right = bend > 0 ? outer : inner;
  return {
    rate: CRUISE_RATE + (HOVER_RATE - CRUISE_RATE) * onFins,
    beat: (CRUISE_BEAT + (1 - CRUISE_BEAT) * onFins) * (1 - tuck),
    alternation: onFins,
    spreadLeft: clamp(left - tuck, -1, 1),
    spreadRight: clamp(right - tuck, -1, 1),
  };
}

/** Moves the fins on by `deltaSeconds` towards `stroke`. Allocation-free. */
export function stepPectoralFins(
  fins: PectoralFins,
  stroke: FinStroke,
  deltaSeconds: number,
): void {
  const ease = (from: number, to: number): number =>
    easeToward(from, to, FIN_RESPONSE_SECONDS, deltaSeconds);
  fins.beat = ease(fins.beat, stroke.beat);
  fins.alternation = ease(fins.alternation, stroke.alternation);
  fins.spreadLeft = ease(fins.spreadLeft, stroke.spreadLeft);
  fins.spreadRight = ease(fins.spreadRight, stroke.spreadRight);
  fins.phaseLeft = wrap(fins.phaseLeft + TURN * stroke.rate * deltaSeconds);
  fins.phaseRight = wrap(fins.phaseLeft + Math.PI * fins.alternation);
}

function wrap(phase: number): number {
  return ((phase % TURN) + TURN) % TURN;
}
