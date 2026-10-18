import { describe, expect, it } from "vitest";
import { assetCacheName, staleAssetCaches } from "./assetCache";

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
