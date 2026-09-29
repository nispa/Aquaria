import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createRng(42);
    const second = createRng(42);

    const a = [first.next(), first.next(), first.next()];
    const b = [second.next(), second.next(), second.next()];

    expect(a).toEqual(b);
  });

  it("produces different sequences for different seeds", () => {
    const first = createRng(1);
    const second = createRng(2);

    expect(first.next()).not.toBe(second.next());
  });

  it("returns values in the half-open interval [0, 1)", () => {
    const rng = createRng(7);

    const values = Array.from({ length: 1000 }, () => rng.next());

    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it("returns ranged values within the requested bounds", () => {
    const rng = createRng(3);

    const values = Array.from({ length: 500 }, () => rng.range(-2, 5));

    expect(Math.min(...values)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...values)).toBeLessThan(5);
  });

  it("returns integers within the inclusive bounds", () => {
    const rng = createRng(9);

    const values = new Set(Array.from({ length: 500 }, () => rng.int(1, 3)));

    expect([...values].sort()).toEqual([1, 2, 3]);
  });

  it("returns normally distributed values centred on the mean", () => {
    const rng = createRng(11);
    const samples = 5000;

    const values = Array.from({ length: samples }, () => rng.normal(10, 2));
    const mean = values.reduce((sum, value) => sum + value, 0) / samples;

    expect(mean).toBeCloseTo(10, 0);
  });

  it("picks an element of the given list", () => {
    const rng = createRng(5);
    const items = ["a", "b", "c"] as const;

    const picked = rng.pick(items);

    expect(items).toContain(picked);
  });

  it("throws when picking from an empty list", () => {
    const rng = createRng(5);

    expect(() => rng.pick([])).toThrow(/empty/);
  });

  it("forks an independent but deterministic child generator", () => {
    const parentA = createRng(100);
    const parentB = createRng(100);

    const childA = parentA.fork();
    const childB = parentB.fork();

    expect(childA.next()).toBe(childB.next());
  });
});
