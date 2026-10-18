import { describe, expect, it } from "vitest";
import { assetCacheName, HASHED_BUILD_FILE, staleAssetCaches } from "./assetCache";

describe("asset caches", () => {
  it("names the cache of models and textures after the build", () => {
    expect(assetCacheName("9b2d5f7")).toBe("aquaria-assets-9b2d5f7");
  });

  it("drops the caches of earlier builds", () => {
    const names = ["aquaria-assets-111aaaa", "aquaria-assets-9b2d5f7", "aquaria-assets"];

    expect(staleAssetCaches(names, "aquaria-assets-9b2d5f7")).toEqual([
      "aquaria-assets-111aaaa",
      "aquaria-assets",
    ]);
  });

  it("leaves the app's own and other sites' caches alone", () => {
    const names = ["workbox-precache-v2-https://example.org/", "aquaria-assets-9b2d5f7"];

    expect(staleAssetCaches(names, "aquaria-assets-9b2d5f7")).toEqual([]);
  });
});

describe("hashed build files", () => {
  it("knows the bundles Vite names after their content", () => {
    expect(HASHED_BUILD_FILE.test("assets/index-BkUS6P5J.js")).toBe(true);
  });

  it("knows the transcoder named after its content", () => {
    expect(HASHED_BUILD_FILE.test("assets/basis_transcoder-VXdx5NbI.wasm")).toBe(true);
  });

  it("does not take the object list for a hashed file, so a new build updates it", () => {
    expect(HASHED_BUILD_FILE.test("assets/objects/index.json")).toBe(false);
  });

  it("does not take a fish manifest for a hashed file", () => {
    expect(HASHED_BUILD_FILE.test("assets/species/guppy/model.json")).toBe(false);
  });
});
