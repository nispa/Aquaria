import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createGesture, isScribbling, spinOf, trackFinger, type Gesture } from "./gesture";

const STEP = 1 / 60;

/** Feeds the finger path `at(t)` for `seconds`. */
function follow(
  gesture: Gesture,
  seconds: number,
  at: (time: number) => Vector3 | undefined,
): void {
  for (let time = 0; time < seconds; time += STEP) trackFinger(gesture, at(time), STEP);
}

/** A circle on the glass, 0.25 m wide, `turns` per second (negative: clockwise). */
const circle = (turns: number) => (time: number) => {
  const angle = 2 * Math.PI * turns * time;
  return new Vector3(Math.cos(angle) * 0.25, 1.5 + Math.sin(angle) * 0.25, 0);
};

/** Quick strokes left and right along nearly the same line, with a fast tremor, `strokes` per second. */
const scribble = (strokes: number) => (time: number) =>
  new Vector3(0.2 * Math.sin(Math.PI * strokes * time), 1.5 + 0.005 * Math.sin(97 * time), 0);

describe("finger gestures", () => {
  it("recognizes circles drawn counterclockwise", () => {
    const gesture = createGesture();

    follow(gesture, 1.5, circle(1.5));

    expect(spinOf(gesture)).toBe(1);
  });

  it("recognizes circles drawn clockwise", () => {
    const gesture = createGesture();

    follow(gesture, 1.5, circle(-1.5));

    expect(spinOf(gesture)).toBe(-1);
  });

  it("recognizes quick strokes back and forth as scribbling, not circles", () => {
    const gesture = createGesture();

    follow(gesture, 1.5, scribble(5));

    expect(isScribbling(gesture)).toBe(true);
    expect(spinOf(gesture)).toBe(0);
  });

  it("does not take circles for scribbling", () => {
    const gesture = createGesture();

    follow(gesture, 1.5, circle(1.5));

    expect(isScribbling(gesture)).toBe(false);
  });

  it("sees nothing in a finger moving slowly", () => {
    const gesture = createGesture();

    follow(gesture, 3, (time) => new Vector3(0.05 * time, 1.5, 0));

    expect([spinOf(gesture), isScribbling(gesture)]).toEqual([0, false]);
  });

  it("forgets the gesture when the finger leaves the glass", () => {
    const gesture = createGesture();
    follow(gesture, 1.5, circle(1.5));

    trackFinger(gesture, undefined, STEP);

    expect([spinOf(gesture), isScribbling(gesture)]).toEqual([0, false]);
  });

  it("copes with a finger that only moves on some steps", () => {
    const gesture = createGesture();

    // Pointer events at 20 Hz, simulation steps at 60 Hz.
    follow(gesture, 1.5, (time) => circle(1.5)(Math.floor(time * 20) / 20));

    expect(spinOf(gesture)).toBe(1);
  });
});
