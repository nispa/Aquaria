import { describe, expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { parseCatalog } from "./parse";
import { SWIM_STYLE_IDS } from "./swimming";

function catalogWithSwim(swim: unknown) {
  const input = catalogFixture();
  return {
    species: input.species.map((species, index) => (index === 0 ? { ...species, swim } : species)),
  };
}

describe("swimming styles", () => {
  it("lets species without a style cruise", () => {
    const catalog = parseCatalog(catalogFixture());

    expect(catalog.species[0]?.swim.style).toBe("cruise");
  });

  it("fills every parameter of a chosen style with its default", () => {
    const catalog = parseCatalog(catalogWithSwim({ style: "burst-coast" }));

    expect(catalog.species[0]?.swim).toMatchObject({
      style: "burst-coast",
      burstSpeed: expect.any(Number) as number,
      coastSeconds: expect.any(Array) as number[],
    });
  });

  it("reads a style's parameters", () => {
    const catalog = parseCatalog(catalogWithSwim({ style: "hover", speed: 0.1 }));

    expect(catalog.species[0]?.swim).toMatchObject({ style: "hover", speed: 0.1 });
  });

  it("rejects unknown styles", () => {
    expect(() => parseCatalog(catalogWithSwim({ style: "moonwalk" }))).toThrow(/swim/);
  });

  it("rejects parameters of another style", () => {
    expect(() => parseCatalog(catalogWithSwim({ style: "cruise", burstSpeed: 2 }))).toThrow(
      /burstSpeed/,
    );
  });

  it("rejects an inverted coast duration", () => {
    expect(() =>
      parseCatalog(catalogWithSwim({ style: "burst-coast", coastSeconds: [3, 1] })),
    ).toThrow(/coastSeconds/);
  });

  it("offers the five styles of the roadmap and walking on the floor", () => {
    expect(SWIM_STYLE_IDS).toEqual(["cruise", "burst-coast", "hover", "glide", "patrol", "crawl"]);
  });
});
