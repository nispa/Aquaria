import { describe, expect, it } from "vitest";
import { materialTextureUrls, parseMaterialManifest } from "./materialManifest";

const credit = {
  author: "Dimitrios Savva",
  source: "https://polyhaven.com/a/dense_sand",
  license: "CC0-1.0",
};

describe("parseMaterialManifest", () => {
  it("names the textures of today's folders when it does not list them", () => {
    const manifest = parseMaterialManifest({ name: "Fine sand", credit }, "fine-sand");

    expect(materialTextureUrls("fine-sand", manifest)).toEqual({
      normal: "assets/materials/fine-sand/normal.ktx2",
      surface: "assets/materials/fine-sand/surface.ktx2",
    });
  });

  it("takes textures from other files in the folder", () => {
    const manifest = parseMaterialManifest(
      { name: "Slate", textures: { normal: "maps/n.ktx2", surface: "maps/s.ktx2" }, credit },
      "slate",
    );

    expect(materialTextureUrls("slate", manifest).normal).toBe(
      "assets/materials/slate/maps/n.ktx2",
    );
  });

  it("rejects a texture outside the folder", () => {
    expect(() =>
      parseMaterialManifest({ name: "Slate", textures: { normal: "../x.ktx2" }, credit }, "slate"),
    ).toThrow(/textures\.normal/);
  });

  it("keeps a texture tile of a meter unless set", () => {
    expect(parseMaterialManifest({ name: "Fine sand", credit }, "fine-sand").tileSize).toBe(1);
  });
});
