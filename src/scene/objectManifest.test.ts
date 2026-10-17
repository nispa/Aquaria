import { describe, expect, it } from "vitest";
import { objectMaterialUrl, parseObjectManifest, resolveAssetPath } from "./objectManifest";

const credit = {
  author: "A. Modeller",
  source: "https://example.com/stone",
  license: "CC0-1.0",
};

describe("parseObjectManifest", () => {
  it("accepts an object drawn by one of Aquaria's generators", () => {
    const { manifest } = parseObjectManifest(
      { name: "Rock", category: "object", recipe: { generator: "rock" } },
      "rock",
    );

    expect(manifest.recipe?.generator).toBe("rock");
  });

  it("accepts an object made of a model, with its credit", () => {
    const { manifest } = parseObjectManifest(
      { name: "Stone", category: "object", model: "model.glb", credit },
      "stone",
    );

    expect(manifest.model).toBe("model.glb");
  });

  it("rejects an object with neither a model nor a recipe", () => {
    expect(() => parseObjectManifest({ name: "Nothing", category: "object" }, "nothing")).toThrow(
      /model or a recipe/,
    );
  });

  it("asks who made a model", () => {
    expect(() =>
      parseObjectManifest({ name: "Stone", category: "object", model: "model.glb" }, "stone"),
    ).toThrow(/credit/);
  });

  it("rejects a generator Aquaria does not have", () => {
    expect(() =>
      parseObjectManifest(
        { name: "Lamp", category: "object", recipe: { generator: "lamp" } },
        "lamp",
      ),
    ).toThrow(/recipe\.generator/);
  });

  it("rejects a model outside its folder", () => {
    expect(() =>
      parseObjectManifest(
        { name: "Stone", category: "object", model: "../other/model.glb", credit },
        "stone",
      ),
    ).toThrow(/model/);
  });

  it("parses the traits, passing on warnings about unknown ones", () => {
    const { manifest, warnings } = parseObjectManifest(
      {
        name: "Kelp",
        category: "plant",
        recipe: { generator: "kelp" },
        traits: { sway: {}, glow: {} },
      },
      "kelp",
    );

    expect([manifest.traits.sway?.amount, warnings]).toEqual([
      0.05,
      ['Object "kelp": unknown trait "glow" skipped.'],
    ]);
  });
});

describe("resolveAssetPath", () => {
  it("follows a path relative to the object's folder", () => {
    expect(resolveAssetPath("assets/objects/rock", "../../materials/basalt/material.json")).toBe(
      "assets/materials/basalt/material.json",
    );
  });

  it("refuses a path that leaves the assets", () => {
    expect(resolveAssetPath("assets/objects/rock", "../../../index.html")).toBeUndefined();
  });
});

describe("objectMaterialUrl", () => {
  it("is the object's material file, from the site root", () => {
    const { manifest } = parseObjectManifest(
      {
        name: "Rock",
        category: "object",
        recipe: { generator: "rock" },
        material: "../../materials/reef-rock/material.json",
      },
      "rock",
    );

    expect(objectMaterialUrl("rock", manifest)).toBe("assets/materials/reef-rock/material.json");
  });
});
