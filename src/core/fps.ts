/** Counts rendered frames over a sliding window of `windowSeconds`. */
export interface FpsMeter {
  frame(deltaSeconds: number): void;
  /** Frames per second over the last full window; undefined until one has passed. */
  readonly fps: number | undefined;
}

export function createFpsMeter(windowSeconds: number): FpsMeter {
  let elapsed = 0;
  let frames = 0;
  let fps: number | undefined;

  return {
    frame(deltaSeconds) {
      elapsed += deltaSeconds;
      frames += 1;
      // Small epsilon: summing 1/60 sixty times lands a hair below 1.
      if (elapsed >= windowSeconds - 1e-9) {
        fps = Math.round(frames / elapsed);
        elapsed = 0;
        frames = 0;
      }
    },
    get fps() {
      return fps;
    },
  };
}
