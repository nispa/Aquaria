/**
 * Keeps the GPU from choking: picks the render height so that drawing a
 * frame costs no more than a budget. A frame's cost grows with the pixels
 * drawn, the square of the height, so the governor drops at once to the
 * height that fits when frames run over, and climbs back, by at most a
 * quarter at a time, when they have stayed well within the budget a while.
 */

/** How quickly the smoothed cost follows the frames, s. */
const SMOOTHING_SECONDS = 0.25;
/** Frames must run over budget this long before the height drops, s. */
const OVER_SECONDS = 0.3;
/** After a drop, aim this far under the budget, so one drop is enough. */
const DROP_AIM = 0.85;
/** The height climbs once a step up would still cost no more than this share of the budget… */
const CLIMB_SHARE = 0.8;
/** …by as much as that share allows, up to this factor at a time… */
const MOST_CLIMB = 1.25;
/** …and frames have been that cheap for this long, s. */
const UNDER_SECONDS = 3;

export interface ResolutionGovernorOptions {
  /** Lowest and highest render height, pixels. */
  readonly min: number;
  readonly max: number;
  /** Heights move in multiples of this, pixels. */
  readonly step: number;
  readonly start: number;
  /** What a frame may cost, ms. */
  readonly budgetMs: number;
}

export interface ResolutionGovernor {
  /** The render height to draw at now, pixels. */
  readonly height: number;
  /** Takes the cost of the frame just drawn (ms) and how long the frame lasted (s). */
  frame(costMs: number, seconds: number): void;
  /** A new highest height (the viewer's choice, the screen's own pixels). */
  setMax(max: number): void;
}

export function createResolutionGovernor(options: ResolutionGovernorOptions): ResolutionGovernor {
  const { min, step, budgetMs } = options;
  let max = Math.max(options.max, min);
  const clampHeight = (value: number): number =>
    Math.min(Math.max(Math.floor(value / step) * step, min), max);
  let height = clampHeight(options.start);
  let smoothed: number | undefined;
  let over = 0;
  let under = 0;

  /** Moves to `next`, expecting the cost to scale with its pixels. */
  const moveTo = (next: number): void => {
    if (smoothed !== undefined) smoothed *= (next / height) ** 2;
    height = next;
    over = 0;
    under = 0;
  };

  return {
    get height() {
      return height;
    },
    frame(costMs, seconds) {
      const blend = Math.min(seconds / SMOOTHING_SECONDS, 1);
      smoothed = smoothed === undefined ? costMs : smoothed + (costMs - smoothed) * blend;
      if (smoothed > budgetMs) {
        over += seconds;
        under = 0;
        if (over >= OVER_SECONDS && height > min) {
          moveTo(clampHeight(height * Math.sqrt((budgetMs * DROP_AIM) / smoothed)));
        }
        return;
      }
      over = 0;
      const climbed = Math.min(height + step, max);
      if (climbed > height && smoothed * (climbed / height) ** 2 <= budgetMs * CLIMB_SHARE) {
        under += seconds;
        if (under >= UNDER_SECONDS) {
          const room = Math.sqrt((budgetMs * CLIMB_SHARE) / smoothed);
          moveTo(Math.max(clampHeight(height * Math.min(room, MOST_CLIMB)), climbed));
        }
      } else {
        under = 0;
      }
    },
    setMax(next) {
      max = Math.max(next, min);
      if (height > max) moveTo(clampHeight(max));
    },
  };
}
