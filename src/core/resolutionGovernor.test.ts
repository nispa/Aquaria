import { describe, expect, it } from "vitest";
import { createResolutionGovernor, type ResolutionGovernor } from "./resolutionGovernor";

/** 60 fps with a quarter of the frame left to the rest of the computer. */
const BUDGET_MS = 12.5;
const FRAME_SECONDS = 1 / 60;

function governor(start = 2160): ResolutionGovernor {
  return createResolutionGovernor({ min: 540, max: 2160, step: 60, start, budgetMs: BUDGET_MS });
}

/** Feeds `seconds` of frames that each cost `costMs` at the current height. */
function run(subject: ResolutionGovernor, seconds: number, costAt: (height: number) => number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME_SECONDS) {
    subject.frame(costAt(subject.height), FRAME_SECONDS);
  }
}

/** A frame's cost grows with the pixels drawn: the square of the height. */
const gpu = (msAt1080: number) => (height: number) => msAt1080 * (height / 1080) ** 2;

describe("the resolution governor", () => {
  it("starts at the height it is given", () => {
    expect(governor(1440).height).toBe(1440);
  });

  it("lowers the resolution when frames cost more than the budget", () => {
    const subject = governor();

    run(subject, 2, gpu(10));

    expect(subject.height).toBeLessThan(2160);
  });

  it("settles where frames fit the budget", () => {
    const subject = governor();

    run(subject, 20, gpu(10));

    expect(gpu(10)(subject.height)).toBeLessThanOrEqual(BUDGET_MS);
    expect(gpu(10)(subject.height)).toBeGreaterThan(BUDGET_MS * 0.6);
  });

  it("drops fast from a resolution far too heavy", () => {
    const subject = governor();

    run(subject, 1.5, gpu(40));

    expect(gpu(40)(subject.height)).toBeLessThan(BUDGET_MS * 1.5);
  });

  it("climbs back when the frames get cheaper", () => {
    const subject = governor();
    run(subject, 10, gpu(20));
    const low = subject.height;

    run(subject, 30, gpu(2));

    expect(subject.height).toBeGreaterThan(low);
  });

  it("never goes above its maximum nor below its minimum", () => {
    const light = governor(1080);
    const heavy = governor();

    run(light, 30, gpu(0.5));
    run(heavy, 10, gpu(500));

    expect(light.height).toBe(2160);
    expect(heavy.height).toBe(540);
  });

  it("keeps to a lower maximum once given one", () => {
    const subject = governor();

    subject.setMax(1440);

    expect(subject.height).toBe(1440);
  });

  it("does not hop up and down around the edge of the budget", () => {
    const subject = governor();
    run(subject, 20, gpu(10));
    const heights = new Set<number>();

    run(subject, 20, (height) => {
      heights.add(height);
      return gpu(10)(height);
    });

    expect(heights.size).toBeLessThanOrEqual(2);
  });
});
