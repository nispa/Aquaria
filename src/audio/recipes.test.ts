import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { nextBubble, SWITCH_SOUNDS } from "./recipes";

describe("bubbles", () => {
  it("rise in pitch, briefly and softly", () => {
    const bubble = nextBubble(createRng(1), true);

    expect(bubble.endHz).toBeGreaterThan(bubble.startHz);
    expect(bubble.seconds).toBeLessThan(0.2);
    expect(bubble.level).toBeLessThan(0.1);
  });

  it("come more often in a tank with bubbling water", () => {
    const rng = createRng(2);
    const mean = (bubbling: boolean) =>
      Array.from({ length: 200 }, () => nextBubble(rng, bubbling).delaySeconds).reduce(
        (sum, delay) => sum + delay,
        0,
      ) / 200;

    expect(mean(true)).toBeLessThan(mean(false) / 2);
  });

  it("are the same for the same seed", () => {
    expect(nextBubble(createRng(5), true)).toEqual(nextBubble(createRng(5), true));
  });
});

describe("switch sounds", () => {
  it("sound higher switching on than switching off", () => {
    expect(SWITCH_SOUNDS["torch-on"].hz).toBeGreaterThan(SWITCH_SOUNDS["torch-off"].hz);
    expect(SWITCH_SOUNDS["lens-on"].endHz).toBeGreaterThan(SWITCH_SOUNDS["lens-on"].hz);
    expect(SWITCH_SOUNDS["lens-off"].endHz).toBeLessThan(SWITCH_SOUNDS["lens-off"].hz);
  });
});
