/**
 * Finds, when the aquarium starts, how much it can show on this machine:
 * from a light base look it switches candidate features on one at a time,
 * measures the GPU cost of the frames, keeps a feature that leaves room
 * under the budget and takes away one that does not, then tries the next.
 * It judges the median frame, so a hitch (a model arriving, garbage
 * collection) does not decide for the whole second.
 */

/** After each change, frames are ignored this long: shaders compile, caches warm up, s… */
export const SETTLE_SECONDS = 0.5;
/** …and for at least this many frames, since the first ones may each take long. */
const SETTLE_FRAMES = 8;
/** Frames are then measured this long before deciding, s… */
export const MEASURE_SECONDS = 1;
/** …and at least this many of them. */
const MEASURE_FRAMES = 15;
/**
 * A feature stays when frames cost at most this share of the budget: the
 * rest is room for busier moments (more fish in view, a feeding).
 */
const HEADROOM_SHARE = 0.85;

/** Switch this feature on or off. */
export interface FeatureChange {
  readonly id: string;
  readonly enabled: boolean;
}

export interface FeatureCalibration {
  /** Whether every candidate has been tried (or none can be). */
  readonly done: boolean;
  /**
   * Takes the GPU cost of the frame just drawn (ms) and how long it lasted
   * (s); returns the changes to make now, usually none.
   */
  frame(costMs: number, seconds: number): readonly FeatureChange[];
}

const NO_CHANGES: readonly FeatureChange[] = [];

/** Tries `candidates` in order against a frame budget in ms. */
export function createFeatureCalibration(
  candidates: readonly string[],
  budgetMs: number,
): FeatureCalibration {
  let next = 0;
  /** The feature being measured, or undefined while measuring the base look. */
  let trying: string | undefined;
  let done = candidates.length === 0;
  let settling = 0;
  let settled = 0;
  let measuring = 0;
  /** Costs of the measured frames, ms; reused from one trial to the next. */
  const costs: number[] = [];

  const restart = (): void => {
    settling = 0;
    settled = 0;
    measuring = 0;
    costs.length = 0;
  };

  const median = (): number => {
    costs.sort((a, b) => a - b);
    return costs[Math.floor(costs.length / 2)] ?? 0;
  };

  /** Switches the next candidate on, or finishes when there is none. */
  const tryNext = (): FeatureChange | undefined => {
    const id = candidates[next];
    next += 1;
    trying = id;
    restart();
    if (id === undefined) {
      done = true;
      return undefined;
    }
    return { id, enabled: true };
  };

  const decide = (averageMs: number): readonly FeatureChange[] => {
    const fits = averageMs <= budgetMs * HEADROOM_SHARE;
    if (trying === undefined && !fits) {
      done = true;
      return NO_CHANGES;
    }
    const removed: FeatureChange[] =
      trying !== undefined && !fits ? [{ id: trying, enabled: false }] : [];
    const added = tryNext();
    return added === undefined ? removed : [...removed, added];
  };

  return {
    get done() {
      return done;
    },
    frame(costMs, seconds) {
      if (done) return NO_CHANGES;
      if (settling < SETTLE_SECONDS || settled < SETTLE_FRAMES) {
        settling += seconds;
        settled += 1;
        return NO_CHANGES;
      }
      costs.push(costMs);
      measuring += seconds;
      return measuring >= MEASURE_SECONDS && costs.length >= MEASURE_FRAMES
        ? decide(median())
        : NO_CHANGES;
    },
  };
}
