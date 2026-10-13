import { describe, expect, it } from "vitest";
import { displayCatalog, referenceLength } from "./displaySize";
import { catalogFixture } from "./fixtures";
import { parseCatalog } from "./parse";
import type { SpeciesCatalog } from "./schema";

const TANK_WIDTH = 2;

/** Two species: a small one 4 cm long and a large one 64 cm long. */
function smallAndLarge(): SpeciesCatalog {
  const input = catalogFixture();
  input.species[0]!.length = { mean: 0.04, standardDeviation: 0.004 };
  input.species[0]!.speed = { cruise: 0.1, max: 0.4 };
  input.species[1]!.length = { mean: 0.64, standardDeviation: 0.064 };
  return parseCatalog(input);
}

const lengthOf = (catalog: SpeciesCatalog, index: number): number =>
  catalog.species[index]?.length.mean ?? Number.NaN;

describe("displayCatalog", () => {
  it("keeps real sizes at balance 0", () => {
    const catalog = smallAndLarge();

    expect(displayCatalog(catalog, TANK_WIDTH, 0)).toEqual(catalog);
  });

  it("draws every species at the reference length at balance 1", () => {
    const shown = displayCatalog(smallAndLarge(), TANK_WIDTH, 1);

    expect([lengthOf(shown, 0), lengthOf(shown, 1)]).toEqual([
      expect.closeTo(referenceLength(TANK_WIDTH)) as number,
      expect.closeTo(referenceLength(TANK_WIDTH)) as number,
    ]);
  });

  it("enlarges small fish and shrinks large ones in between", () => {
    const catalog = smallAndLarge();

    const shown = displayCatalog(catalog, TANK_WIDTH, 0.5);

    expect([
      lengthOf(shown, 0) > lengthOf(catalog, 0),
      lengthOf(shown, 1) < lengthOf(catalog, 1),
    ]).toEqual([true, true]);
  });

  it("keeps the larger species larger", () => {
    const shown = displayCatalog(smallAndLarge(), TANK_WIDTH, 0.8);

    expect(lengthOf(shown, 1)).toBeGreaterThan(lengthOf(shown, 0));
  });

  it("scales speeds with size, so a bigger fish swims the same body lengths per second", () => {
    const catalog = smallAndLarge();

    const shown = displayCatalog(catalog, TANK_WIDTH, 0.5);
    const factor = lengthOf(shown, 0) / lengthOf(catalog, 0);

    expect(shown.species[0]?.speed).toEqual({
      cruise: expect.closeTo(0.1 * factor) as number,
      max: expect.closeTo(0.4 * factor) as number,
    });
  });

  it("scales the size spread with the size", () => {
    const catalog = smallAndLarge();

    const shown = displayCatalog(catalog, TANK_WIDTH, 0.5);
    const factor = lengthOf(shown, 0) / lengthOf(catalog, 0);

    expect(shown.species[0]?.length.standardDeviation).toBeCloseTo(0.004 * factor);
  });
});

describe("referenceLength", () => {
  it("grows with the tank", () => {
    expect(referenceLength(4)).toBeCloseTo(referenceLength(2) * 2);
  });
});
