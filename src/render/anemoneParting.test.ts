import { Vector3, Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { partingFish } from "./anemoneParting";

const anemone = { x: 0, z: -1, base: 0.3, height: 0.2 };
const out = () => Array.from({ length: 3 }, () => new Vector4());

describe("partingFish", () => {
  it("parts the tentacles around a fish in an anemone, by the fish's size", () => {
    const parting = out();

    const count = partingFish(
      [{ position: new Vector3(0.05, 0.4, -1), length: 0.1 }],
      [anemone],
      parting,
    );

    expect([count, parting[0]?.x, parting[0]?.w]).toEqual([
      1,
      0.05,
      expect.closeTo(0.15) as number,
    ]);
  });

  it("leaves out a fish swimming far above the anemone", () => {
    const count = partingFish(
      [{ position: new Vector3(0, 1.5, -1), length: 0.1 }],
      [anemone],
      out(),
    );

    expect(count).toBe(0);
  });

  it("leaves out a fish beside the anemone, out of its reach", () => {
    const count = partingFish(
      [{ position: new Vector3(1, 0.4, -1), length: 0.1 }],
      [anemone],
      out(),
    );

    expect(count).toBe(0);
  });

  it("keeps no more fish than there is room for", () => {
    const fish = Array.from({ length: 5 }, () => ({
      position: new Vector3(0, 0.4, -1),
      length: 0.1,
    }));

    expect(partingFish(fish, [anemone], out())).toBe(3);
  });
});
