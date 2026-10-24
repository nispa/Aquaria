import { describe, expect, it } from "vitest";
import { BODY_LAYER_TEMPLATES, FIN_LAYER_TEMPLATES, parseFishRecipe } from "./fishRecipe";

/** The smallest fish: a body, a tail, one strain. */
function recipe(): Record<string, unknown> {
  return {
    name: "Tiny",
    body: {
      top: [
        [0.3, 0.0],
        [-0.1, 0.03],
      ],
      bottom: [
        [0.3, 0.0],
        [-0.1, -0.03],
      ],
      thickness: { half: 0.05, rise: 0.3, power: 0.5, taper: 0.6, taperFrom: 0.3, min: 0.01 },
      roundness: 0.9,
    },
    eye: {
      x: 0.25,
      z: 0.01,
      radius: 0.02,
      depth: 0.5,
      rim: "#c0c0c0",
      iris: "#d0d0c0",
      pupil: "#080808",
      irisEdge: [55, 65],
      pupilEdge: [30, 36],
    },
    mouth: { reach: 0.05, drop: 0.02 },
    fins: [
      {
        id: "caudal",
        type: "tail",
        root: 0.006,
        baseHeight: 0.05,
        outline: [
          [-0.1, 0.03],
          [-0.3, 0.1],
          [-0.1, -0.03],
        ],
      },
    ],
    texture: { size: 256, parts: { body: [0, 0, 1, 0.5], caudal: [0, 0.5, 1, 0.5] } },
    materials: {
      skin: { roughness: 0.4, metallic: 0.1 },
      fins: { roughness: 0.5, metallic: 0 },
      eyes: { roughness: 0.05, metallic: 0 },
    },
    strains: [
      {
        id: "plain",
        name: "Plain",
        body: [{ type: "fill", color: "#808080" }],
        fins: {
          caudal: {
            rayed: {
              web: "#a0a0a0",
              ray: "#909090",
              root: "#808080",
              alphaRoot: 0.8,
              alphaEdge: 0.5,
              rays: 12,
            },
          },
        },
      },
    ],
  };
}

describe("parseFishRecipe", () => {
  it("accepts a fish with a body, a tail and one strain", () => {
    expect(parseFishRecipe(recipe(), "tiny").strains[0]?.id).toBe("plain");
  });

  it("refuses a fin with no rectangle in the texture", () => {
    const input = { ...recipe(), texture: { size: 256, parts: { body: [0, 0, 1, 0.5] } } };

    expect(() => parseFishRecipe(input, "tiny")).toThrow(/caudal.*no part in the texture/);
  });

  it("refuses a strain that leaves a fin unpainted", () => {
    const input = {
      ...recipe(),
      strains: [{ id: "plain", name: "Plain", body: [{ type: "fill", color: "#808080" }] }],
    };

    expect(() => parseFishRecipe(input, "tiny")).toThrow(/does not paint fin "caudal"/);
  });

  it("refuses a patch with neither bands nor any", () => {
    const input = {
      ...recipe(),
      strains: [
        {
          ...(recipe().strains as Record<string, unknown>[])[0],
          body: [
            { type: "fill", color: "#808080" },
            { type: "patch", color: "#ffffff" },
          ],
        },
      ],
    };

    expect(() => parseFishRecipe(input, "tiny")).toThrow(/bands or any/);
  });

  it("accepts every body layer the fish maker offers to add", () => {
    const strain = (recipe().strains as Record<string, unknown>[])[0];
    const input = {
      ...recipe(),
      strains: [
        {
          ...strain,
          body: [{ type: "fill", color: "#808080" }, ...Object.values(BODY_LAYER_TEMPLATES)],
        },
      ],
    };

    expect(() => parseFishRecipe(input, "tiny")).not.toThrow();
  });

  it("accepts every fin layer the fish maker offers to add", () => {
    const strain = (recipe().strains as Record<string, unknown>[])[0];
    const caudal = {
      rayed: {
        web: "#a0a0a0",
        ray: "#909090",
        root: "#808080",
        alphaRoot: 0.8,
        alphaEdge: 0.5,
        rays: 12,
      },
      layers: Object.values(FIN_LAYER_TEMPLATES),
    };
    const input = { ...recipe(), strains: [{ ...strain, fins: { caudal } }] };

    expect(() => parseFishRecipe(input, "tiny")).not.toThrow();
  });

  it("names the species in its error messages", () => {
    expect(() => parseFishRecipe({}, "guppy")).toThrow(/guppy/);
  });
});
