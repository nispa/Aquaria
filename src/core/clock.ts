export interface FixedStepClockOptions {
  /** Duration of one simulation step, in seconds. */
  readonly stepSeconds: number;
  /** Longest frame delta accepted; longer frames (tab switches) are clamped. */
  readonly maxDeltaSeconds: number;
}

/**
 * Fixed time-step accumulator.
 *
 * The simulation always advances in equal steps regardless of frame rate, so
 * behavior is identical at 30, 60 or 144 fps and fully reproducible in tests.
 */
export interface FixedStepClock {
  /** Adds real frame time and returns how many simulation steps to run. */
  advance(deltaSeconds: number): number;
  /** Total simulated time, in seconds. */
  readonly elapsedSeconds: number;
  /** Fraction of a step left over, for render interpolation (0..1). */
  readonly alpha: number;
  readonly stepSeconds: number;
}

export function createFixedStepClock(options: FixedStepClockOptions): FixedStepClock {
  const { stepSeconds, maxDeltaSeconds } = options;
  if (stepSeconds <= 0) {
    throw new Error(`stepSeconds must be positive, got ${stepSeconds}.`);
  }

  let accumulator = 0;
  let steps = 0;

  return {
    advance(deltaSeconds) {
      accumulator += Math.min(Math.max(deltaSeconds, 0), maxDeltaSeconds);
      // A tiny epsilon keeps float drift from dropping a step (0.6 + 0.6 < 1.2).
      const due = Math.floor(accumulator / stepSeconds + 1e-9);
      accumulator = Math.max(accumulator - due * stepSeconds, 0);
      steps += due;
      return due;
    },
    get elapsedSeconds() {
      return steps * stepSeconds;
    },
    get alpha() {
      return accumulator / stepSeconds;
    },
    stepSeconds,
  };
}
