import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import type { RockworkSpec } from "../scene/schema";
import { createRockwork } from "./rockwork";
import { bandDepthRange } from "./tank";

const tank = { width: 6, height: 2.6, depth: 2.4 };
const spec: RockworkSpec = {
  bands: [1, 3],
  height: [0.3, 0.9],
  coverage: 0.85,
  thickness: 0.9,
  rocks: 40,
  color: "#8a7d70",
};
const halfWidthAt = (z: number): number => 3 + -z * 0.8;
const build = (seed = 1) => createRockwork(tank, spec, createRng(seed), halfWidthAt);

describe("rockwork ridge", () => {
  it("rises no higher than the requested maximum", () => {
    const rockwork = build();

    const heights = rockwork.samples(200).map(([x, z]) => rockwork.heightAt(x, z));

    expect(Math.max(...heights)).toBeLessThanOrEqual(spec.height[1] + 1e-9);
  });

  it("stands at least the minimum height along its crest", () => {
    const rockwork = build();

    const crest = rockwork.crest(50).map(([x, z]) => rockwork.heightAt(x, z));

    expect(Math.min(...crest)).toBeGreaterThanOrEqual(spec.height[0] - 1e-9);
  });

  it("stays inside its depth bands", () => {
    const { near, far } = bandDepthRange(tank, spec.bands);
    const { footprint } = build();

    expect(footprint.zMax).toBeLessThanOrEqual(near);
    expect(footprint.zMin).toBeGreaterThanOrEqual(far);
  });

  it("spans the requested share of the visible width", () => {
    const { footprint } = build();

    const width = footprint.xMax - footprint.xMin;

    expect(width).toBeGreaterThan(2 * halfWidthAt(footprint.zMax) * spec.coverage * 0.9);
  });

  it("is flat sand outside its footprint", () => {
    const rockwork = build();

    expect(rockwork.heightAt(rockwork.footprint.xMax + 0.5, rockwork.footprint.zMax)).toBe(0);
  });

  it("is the same for the same seed and different for another", () => {
    const [x, z] = build(1).crest(5)[2] ?? [0, 0];

    expect(build(1).heightAt(x, z)).toBe(build(1).heightAt(x, z));
    expect(build(2).heightAt(x, z)).not.toBe(build(1).heightAt(x, z));
  });
});

describe("rockwork rocks", () => {
  it("places the requested number of rocks", () => {
    expect(build().rocks).toHaveLength(spec.rocks);
  });

  it("sets each rock into the ridge surface, never floating above it", () => {
    const rockwork = build();

    const floating = rockwork.rocks.filter(
      (rock) => (rock.elevation ?? 0) > rockwork.heightAt(rock.x, rock.z),
    );

    expect(floating).toEqual([]);
  });

  it("uses the ridge color and material", () => {
    const material = { id: "reef-rock", tileSize: 0.45, displacement: 0.07 };
    const rockwork = createRockwork(tank, { ...spec, material }, createRng(1), halfWidthAt);

    expect(rockwork.rocks.every((rock) => rock.color === spec.color)).toBe(true);
    expect(rockwork.rocks.every((rock) => rock.material === material)).toBe(true);
  });
});
