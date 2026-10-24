import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFishRecipe } from "./fishRecipe";
import { bodyEnds, bodyOutline, finOutline, outlineHeight, rounded } from "./fishOutline";

const guppy = parseFishRecipe(
  JSON.parse(
    readFileSync(new URL("../../public/assets/species/guppy/fish.json", import.meta.url), "utf8"),
  ),
  "guppy",
);

describe("outlineHeight", () => {
  it("passes through the traced points", () => {
    expect(outlineHeight(guppy.body.top, 0.08)).toBeCloseTo(0.1);
  });

  it("stays flat beyond the traced ends", () => {
    expect(outlineHeight(guppy.body.top, -0.5)).toBe(0.05);
  });
});

describe("rounded", () => {
  it("keeps the ends of the outline", () => {
    const outline = rounded([
      [0, 0],
      [1, 1],
      [2, 0],
    ]);

    expect([outline[0], outline[outline.length - 1]]).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
});

describe("bodyOutline", () => {
  it("runs from the snout along the back and returns along the belly", () => {
    const outline = bodyOutline(guppy);

    expect([outline[0]?.[0], outline[outline.length - 1]?.[0]]).toEqual([
      bodyEnds(guppy).snout,
      bodyEnds(guppy).snout,
    ]);
  });
});

describe("finOutline", () => {
  it("closes the tail on its base, just behind the peduncle", () => {
    const tail = guppy.fins.find((fin) => fin.id === "caudal");
    const outline = tail === undefined ? [] : finOutline(guppy, tail);

    expect(outline[outline.length - 1]).toEqual([-0.094, 0.035]);
  });

  it("spreads the pectoral fin back from its root", () => {
    const pectoral = guppy.fins.find((fin) => fin.id === "pectoral");
    const outline = pectoral === undefined ? [] : finOutline(guppy, pectoral);

    expect(Math.min(...outline.map(([x]) => x))).toBeLessThan(0.2 - 0.05);
  });
});
