import { describe, expect, it } from "vitest";
import { fishTextureLimit } from "./fishTextures";

describe("fishTextureLimit", () => {
  it("keeps fish textures whole on a 4K screen, where fish are biggest", () => {
    expect(fishTextureLimit(2160)).toBeUndefined();
  });

  it("brings fish textures down to 512 texels from QHD up", () => {
    expect(fishTextureLimit(1440)).toBe(512);
  });

  it("brings fish textures down to 256 texels below QHD", () => {
    expect(fishTextureLimit(1080)).toBe(256);
  });
});
