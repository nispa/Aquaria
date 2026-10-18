import { describe, expect, it } from "vitest";
import { createGpuTimer } from "./gpuTimer";

/** A WebGL2 context without the timer query extension; counts the reads that wait for the GPU. */
function contextWithoutTimer() {
  const reads: number[] = [];
  const gl = {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    getExtension: () => null,
    readPixels: () => {
      reads.push(1);
    },
  } as unknown as WebGL2RenderingContext;
  return { gl, reads };
}

/** A clock that moves on by `stepMs` each time it is read. */
function steppingClock(stepMs: number): () => number {
  let now = 0;
  return () => {
    now += stepMs;
    return now;
  };
}

describe("GPU timer without the timer query extension", () => {
  it("times a frame by waiting for the GPU to finish it", () => {
    const { gl, reads } = contextWithoutTimer();
    const timer = createGpuTimer(gl, steppingClock(7));

    timer.begin();
    timer.end();

    expect([timer.supported, timer.blocking, timer.latestMs(), reads.length]).toEqual([
      true,
      true,
      7,
      1,
    ]);
  });

  it("stops waiting for the GPU once timing is switched off", () => {
    const { gl, reads } = contextWithoutTimer();
    const timer = createGpuTimer(gl, steppingClock(7));
    timer.begin();
    timer.end();

    timer.setEnabled(false);
    timer.begin();
    timer.end();

    expect([timer.latestMs(), reads.length]).toEqual([undefined, 1]);
  });
});
