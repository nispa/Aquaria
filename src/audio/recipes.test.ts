import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { AMBIENCES, nextBubble, SWITCH_SOUNDS } from "./recipes";

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

describe("the water's sound by the size of the tank", () => {
  const meanGap = (size: keyof typeof AMBIENCES) => {
    const rng = createRng(3);
    return (
      Array.from({ length: 200 }, () => nextBubble(rng, true, AMBIENCES[size]).delaySeconds).reduce(
        (sum, delay) => sum + delay,
        0,
      ) / 200
    );
  };

  it("rumbles low in the open sea, under a home tank's hush", () => {
    expect(AMBIENCES.ocean.hush.filter).toBe("lowpass");
    expect(AMBIENCES.ocean.hush.hz).toBeLessThan(AMBIENCES.nano.hush.hz);
  });

  it("bubbles far less often in the open sea than in a home tank", () => {
    expect(meanGap("ocean")).toBeGreaterThan(meanGap("medium") * 3);
  });

  it("keeps the hush of every tank subtle", () => {
    for (const ambience of Object.values(AMBIENCES)) {
      expect(ambience.hush.bubblingLevel).toBeLessThan(0.02);
    }
  });

  it("keeps every bubble soft", () => {
    for (const ambience of Object.values(AMBIENCES)) {
      expect(ambience.bubbleLevel[1]).toBeLessThan(0.03);
    }
  });
});

describe("switch sounds", () => {
  it("sound higher switching on than switching off", () => {
    expect(SWITCH_SOUNDS["torch-on"].hz).toBeGreaterThan(SWITCH_SOUNDS["torch-off"].hz);
    expect(SWITCH_SOUNDS["lens-on"].endHz).toBeGreaterThan(SWITCH_SOUNDS["lens-on"].hz);
    expect(SWITCH_SOUNDS["lens-off"].endHz).toBeLessThan(SWITCH_SOUNDS["lens-off"].hz);
  });
});
