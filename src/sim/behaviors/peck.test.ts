import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { headingGap, startActivity } from "./harness";
import { peckActivity } from "./peck";

const place = new Vector3(1, 0.3, -1);
const LENGTH = 0.2;

/** A pecking fish already right above the place. */
function arrived(pecks: [number, number] = [3, 7]) {
  const pecking = startActivity(peckActivity, { pecks });
  pecking.context.position.set(place.x, place.y + LENGTH * 0.8, place.z);
  return pecking;
}

describe("peck", () => {
  it("swims towards the place at cruise speed, staying above it", () => {
    const pecking = startActivity(peckActivity);

    pecking.run(1 / 60);

    expect(pecking.wishes.speed).toBe(1);
    expect(headingGap(pecking.wishes.yaw, 0)).toBeLessThan(0.05);
    expect(pecking.wishes.height).toBeGreaterThan(place.y);
  });

  it("darts at the place with its mouth open, head down", () => {
    const pecking = arrived();
    let widest = 0;
    let steep = false;

    pecking.run(3, (wishes) => {
      widest = Math.max(widest, wishes.mouth);
      steep ||= wishes.steep;
    });

    expect(widest).toBe(1);
    expect(steep).toBe(true);
  });

  it("backs off with its mouth shut between pecks", () => {
    const pecking = arrived();
    const mouths: number[] = [];

    pecking.run(3, (wishes) => mouths.push(wishes.mouth));

    expect(mouths).toContain(0);
  });

  it("pecks as many times as drawn, then leaves", () => {
    const pecking = arrived([4, 4]);
    let darts = 0;
    let open = false;

    const ended = pecking.run(30, (wishes) => {
      if (wishes.mouth === 1 && !open) darts += 1;
      open = wishes.mouth === 1;
    });

    expect(darts).toBe(4);
    expect(ended).toBeDefined();
  });

  it("closes its mouth and stops diving when it leaves", () => {
    const pecking = arrived([1, 1]);

    pecking.run(30);

    expect(pecking.wishes.mouth).toBe(0);
    expect(pecking.wishes.steep).toBe(false);
  });

  it("gives up when it never gets there", () => {
    const pecking = startActivity(peckActivity);

    expect(pecking.run(60)).toBeDefined();
  });
});

describe("diving down", () => {
  it("dives steeply towards a place far below", () => {
    const pecking = startActivity(peckActivity);

    pecking.run(1 / 60);

    expect(pecking.wishes.steep).toBe(true);
  });
});
