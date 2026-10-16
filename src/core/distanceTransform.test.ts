import { describe, expect, it } from "vitest";
import { squaredDistances } from "./distanceTransform";
import { createRng } from "./rng";

describe("squaredDistances", () => {
  it("measures along a line the squared distance to the nearest marked cell", () => {
    const marked = Uint8Array.from([0, 1, 0, 0, 0, 1]);

    const result = squaredDistances(marked, [6, 1, 1]);

    expect([...result]).toEqual([1, 0, 1, 4, 1, 0]);
  });

  it("measures in three dimensions, as the crow flies", () => {
    const size: [number, number, number] = [3, 3, 3];
    const marked = new Uint8Array(27);
    marked[0] = 1;

    const result = squaredDistances(marked, size);

    // The far corner, (2, 2, 2) from the marked one.
    expect(result[26]).toBe(12);
    // (1, 2, 0): x fastest, then y, then z.
    expect(result[1 + 2 * 3]).toBe(5);
  });

  it("agrees with checking every marked cell", () => {
    const size: [number, number, number] = [7, 5, 6];
    const rng = createRng(9);
    const marked = Uint8Array.from({ length: 7 * 5 * 6 }, () => (rng.next() < 0.08 ? 1 : 0));
    const at = (index: number) => [index % 7, Math.floor(index / 7) % 5, Math.floor(index / 35)];
    const nearest = (index: number): number => {
      const [x = 0, y = 0, z = 0] = at(index);
      let best = Infinity;
      marked.forEach((value, other) => {
        if (value === 0) return;
        const [ox = 0, oy = 0, oz = 0] = at(other);
        best = Math.min(best, (x - ox) ** 2 + (y - oy) ** 2 + (z - oz) ** 2);
      });
      return best;
    };

    const result = squaredDistances(marked, size);

    expect([...result]).toEqual(
      Array.from({ length: marked.length }, (_, index) => nearest(index)),
    );
  });

  it("leaves everything infinitely far when nothing is marked", () => {
    const result = squaredDistances(new Uint8Array(4), [2, 2, 1]);

    expect([...result].every((value) => value === Infinity)).toBe(true);
  });
});
