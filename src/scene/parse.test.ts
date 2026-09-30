import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene, SceneValidationError } from "./parse";

describe("parseCatalog", () => {
  it("accepts a valid species catalog", () => {
    const catalog = parseCatalog(catalogFixture());

    expect(catalog.species.map((species) => species.id)).toEqual(["blue-tang", "sardine"]);
  });

  it("rejects duplicate species ids", () => {
    const input = catalogFixture();
    input.species.push({ ...input.species[0]! });

    expect(() => parseCatalog(input)).toThrow(/duplicate species id "blue-tang"/i);
  });

  it("rejects depth bands outside 0..4", () => {
    const input = catalogFixture();
    input.species[0]!.bands = [0, 5];

    expect(() => parseCatalog(input)).toThrow(SceneValidationError);
  });

  it("rejects an inverted band range", () => {
    const input = catalogFixture();
    input.species[0]!.bands = [3, 1];

    expect(() => parseCatalog(input)).toThrow(/bands/);
  });

  it("rejects colors that are not hex strings", () => {
    const input = catalogFixture();
    input.species[0]!.body = {
      type: "procedural",
      shape: "disc",
      colors: { base: "blue", accent: "#fff" },
    };

    expect(() => parseCatalog(input)).toThrow(/color/i);
  });

  it("accepts a glTF body with a model url", () => {
    const input = catalogFixture();
    input.species[0]!.body = { type: "gltf", url: "assets/species/tang.glb" };

    const catalog = parseCatalog(input);

    expect(catalog.species[0]?.body.type).toBe("gltf");
  });
});

describe("parseScene", () => {
  const catalog = parseCatalog(catalogFixture());

  it("accepts a valid scene", () => {
    const scene = parseScene(sceneFixture(), catalog);

    expect(scene.name).toBe("Tropical reef");
  });

  it("fills optional fields with defaults", () => {
    const input = sceneFixture();
    delete input.flora;
    delete input.props;

    const scene = parseScene(input, catalog);

    expect(scene.flora).toEqual([]);
    expect(scene.props).toEqual([]);
  });

  it("rejects fauna referring to a species missing from the catalog", () => {
    const input = sceneFixture();
    input.fauna.push({ species: "shark", count: 1 });

    expect(() => parseScene(input, catalog)).toThrow(/unknown species "shark"/i);
  });

  it("rejects more than 50 individuals of one species", () => {
    const input = sceneFixture();
    input.fauna[0]!.count = 51;

    expect(() => parseScene(input, catalog)).toThrow(SceneValidationError);
  });

  it("rejects a zero current direction", () => {
    const input = sceneFixture();
    input.current.direction = [0, 0, 0];

    expect(() => parseScene(input, catalog)).toThrow(/direction/);
  });

  it("reports the path of the invalid field in the error message", () => {
    const input = sceneFixture();
    input.tank.width = -1;

    expect(() => parseScene(input, catalog)).toThrow(/tank\.width/);
  });

  it("accepts a layered image backdrop", () => {
    const input = sceneFixture();
    input.backdrop = {
      type: "image",
      layers: [{ url: "backdrops/reef-far.webp", distance: 1 }],
    };

    const scene = parseScene(input, catalog);

    expect(scene.backdrop.type).toBe("image");
  });

  it("rejects input that is not an object", () => {
    expect(() => parseScene("reef", catalog)).toThrow(SceneValidationError);
  });
});

describe("species body patterns", () => {
  it("defaults the pattern of procedural bodies to a light belly", () => {
    const catalog = parseCatalog(catalogFixture());

    const body = catalog.species[0]?.body;

    expect(body?.type === "procedural" ? body.pattern : undefined).toBe("belly");
  });

  it("accepts the supported patterns", () => {
    const input = catalogFixture();
    input.species[0]!.body = {
      type: "procedural",
      shape: "round",
      pattern: "bands",
      colors: { base: "#ff6a13", accent: "#ffffff" },
    };

    const body = parseCatalog(input).species[0]?.body;

    expect(body?.type === "procedural" ? body.pattern : undefined).toBe("bands");
  });

  it("rejects unknown patterns", () => {
    const input = catalogFixture();
    input.species[0]!.body = {
      type: "procedural",
      shape: "round",
      pattern: "polka" as "bands",
      colors: { base: "#ff6a13", accent: "#ffffff" },
    };

    expect(() => parseCatalog(input)).toThrow(/pattern/);
  });
});

describe("surface materials", () => {
  const catalog = parseCatalog(catalogFixture());

  it("lets the floor use a textured material with a default tile size", () => {
    const input = sceneFixture();
    input.floor = { color: "#d8c49a", material: { id: "fine-sand" } };

    const scene = parseScene(input, catalog);

    expect(scene.floor.material).toEqual({ id: "fine-sand", tileSize: 1, displacement: 0 });
  });

  it("lets a prop entry use a textured material with displacement", () => {
    const input = sceneFixture();
    input.props = [
      {
        kind: "rock",
        count: 3,
        color: "#8a8070",
        material: { id: "reef-rock", tileSize: 0.6, displacement: 0.03 },
      },
    ];

    const scene = parseScene(input, catalog);

    expect(scene.props[0]?.material?.displacement).toBe(0.03);
  });

  it("rejects material ids that could escape the materials folder", () => {
    const input = sceneFixture();
    input.floor = { color: "#d8c49a", material: { id: "../secret" } };

    expect(() => parseScene(input, catalog)).toThrow(/floor\.material\.id/);
  });
});
