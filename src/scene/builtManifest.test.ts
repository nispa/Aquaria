import { describe, expect, it } from "vitest";
import { builtManifest, parseBuiltValues } from "./builtManifest";

const values = parseBuiltValues({
  colorings: { classic: { name: "Classic", texture: "colorings/classic.webp" } },
  fins: {
    pectoral: {
      root: [
        [0.3, 0.02],
        [0.31, -0.04],
      ],
      side: 0.1,
      front: 0.32,
      back: 0.2,
      top: 0.03,
      bottom: -0.06,
    },
  },
  gills: { edge: 0.29, top: 0.07, bottom: -0.08 },
});

describe("builtManifest", () => {
  it("keeps what the builder does not measure, such as the fin's sweep and the gills' curve", () => {
    const manifest = builtManifest(
      {
        name: "Gramma",
        fins: { pectoral: { rest: 30, sweep: 40 } },
        gills: { edge: 0.2, curve: 3 },
      },
      "gramma",
      "Gramma",
      values,
    );

    expect([manifest.fins, manifest.gills]).toEqual([
      { pectoral: { rest: 30, sweep: 40, ...values.fins?.pectoral } },
      { edge: 0.29, curve: 3, top: 0.07, bottom: -0.08 },
    ]);
  });

  it("takes the colorings the builder painted", () => {
    expect(builtManifest({ name: "Gramma" }, "gramma", "Gramma", values).colorings).toEqual(
      values.colorings,
    );
  });

  it("starts a new fish's manifest with its eyes, mouth and credit", () => {
    const manifest = builtManifest(undefined, "harlequin-rasbora", "Harlequin rasbora", values);

    expect(manifest).toMatchObject({
      name: "Harlequin rasbora",
      mouth: { morphTarget: "MouthOpen" },
      eyes: { bones: ["Eye.L", "Eye.R"] },
      credit: {
        source:
          "https://github.com/nispa/Aquaria/blob/main/public/assets/species/harlequin-rasbora/fish.json",
        license: "CC0-1.0",
      },
    });
  });
});

describe("parseBuiltValues", () => {
  it("refuses values without colorings", () => {
    expect(() => parseBuiltValues({ fins: {} })).toThrow(/colorings/);
  });
});
