import { describe, expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { modelFileUrl, modelIdsOf, parseModelManifest } from "./modelManifest";
import { parseCatalog, SceneValidationError } from "./parse";

const credit = {
  author: "Microsoft",
  source: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish",
  license: "CC0-1.0",
};

describe("parseModelManifest", () => {
  it("fills in the defaults of a minimal manifest", () => {
    const manifest = parseModelManifest({ name: "Barramundi", credit }, "barramundi");

    expect(manifest).toMatchObject({
      file: "model.glb",
      forward: "+x",
      up: "+y",
      swimAmplitude: 0.07,
    });
  });

  it("accepts permissive code licenses such as MIT", () => {
    const manifest = parseModelManifest(
      { name: "Tetra", credit: { ...credit, license: "MIT" } },
      "tetra",
    );

    expect(manifest.credit.license).toBe("MIT");
  });

  it("rejects non-commercial licenses", () => {
    expect(() =>
      parseModelManifest(
        { name: "Betta", credit: { ...credit, license: "CC-BY-NC-4.0" } },
        "betta",
      ),
    ).toThrow(SceneValidationError);
  });

  it("rejects an up axis parallel to the forward axis", () => {
    expect(() =>
      parseModelManifest({ name: "Tuna", credit, forward: "+z", up: "-z" }, "tuna"),
    ).toThrow(/up must be perpendicular to forward/);
  });

  it("rejects files outside the model folder", () => {
    expect(() =>
      parseModelManifest({ name: "Tuna", credit, file: "../other/model.glb" }, "tuna"),
    ).toThrow(SceneValidationError);
  });

  it("names the model in its error messages", () => {
    expect(() => parseModelManifest({ credit }, "barramundi")).toThrow(/barramundi/);
  });
});

describe("modelFileUrl", () => {
  it("resolves the model file inside the model's folder", () => {
    const manifest = parseModelManifest({ name: "Barramundi", credit }, "barramundi");

    expect(modelFileUrl("barramundi", manifest)).toBe("assets/species/barramundi/model.glb");
  });
});

describe("modelIdsOf", () => {
  it("lists each model used by the catalog once", () => {
    const input = catalogFixture();
    input.species[0]!.body = { type: "gltf", model: "barramundi" };
    input.species[1]!.body = { type: "gltf", model: "barramundi" };

    expect(modelIdsOf(parseCatalog(input))).toEqual(["barramundi"]);
  });
});
