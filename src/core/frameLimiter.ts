/**
 * Draws at most `limit` frames a second, whatever the display's refresh
 * rate: a frame is due once its interval has passed, give or take a little,
 * since refreshes never arrive exactly on time. 0 means no limit.
 */

/** How early a refresh may come and still count as on time, as a share of the interval. */
const EARLY_SHARE = 0.25;

export interface FrameLimiter {
  /** Whether to draw a frame at `nowMs` (the refresh's timestamp). */
  due(nowMs: number): boolean;
}

export function createFrameLimiter(limit: number): FrameLimiter {
  const interval = limit > 0 ? 1000 / limit : 0;
  let next = -Infinity;
  return {
    due(nowMs) {
      if (interval === 0) return true;
      if (nowMs < next - interval * EARLY_SHARE) return false;
      // Keep the cadence, but never try to catch up after a stall.
      next = Math.max(next, nowMs) + interval;
      return true;
    },
  };
}
