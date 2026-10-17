import { RECOMMENDED_LIGHTS } from "./lights";
import { describe, expect, it } from "vitest";
import { catalogFixture, sceneFixture } from "./fixtures";
import { parseCatalog, parseScene, SceneValidationError } from "./parse";
import { DEFAULT_APPETITE, DEFAULT_CURIOSITY, DEFAULT_SHYNESS } from "./schema";

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

  it("accepts a 3D model next to the procedural body", () => {
    const input = catalogFixture();
    input.species[0]!.model = "blue-tang";

    const catalog = parseCatalog(input);

    expect([catalog.species[0]?.body.type, catalog.species[0]?.model]).toEqual([
      "procedural",
      "blue-tang",
    ]);
  });

  it("rejects a model that is not a folder name", () => {
    const input = catalogFixture();
    input.species[0]!.model = "../tang";

    expect(() => parseCatalog(input)).toThrow(/model/);
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

  it("rejects more individuals than the species allows", () => {
    const input = catalogFixture();
    input.species[0]!.maxCount = 2;

    expect(() => parseScene(sceneFixture(), parseCatalog(input))).toThrow(/at most 2/);
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

describe("rockwork", () => {
  const catalog = parseCatalog(catalogFixture());

  it("accepts a rockwork ridge with defaults", () => {
    const input = sceneFixture();
    input.rockwork = { bands: [1, 3], height: [0.3, 0.9], color: "#8a7d70" };

    const scene = parseScene(input, catalog);

    expect(scene.rockwork).toMatchObject({ coverage: 0.85, thickness: 0.9, rocks: 40 });
  });

  it("rejects entries placed on rockwork when the scene has none", () => {
    const input = sceneFixture();
    input.props = [{ kind: "brain-coral", count: 2, color: "#b89a5e", on: "rockwork" }];

    expect(() => parseScene(input, catalog)).toThrow(/props\.0\.on.*no rockwork/i);
  });

  it("accepts a palette of colors for an entry", () => {
    const input = sceneFixture();
    input.props = [{ kind: "shell", count: 2, color: ["#ffffff", "#f3e6d4"] }];

    expect(() => parseScene(input, catalog)).not.toThrow();
  });
});

describe("blocks", () => {
  const catalog = parseCatalog(catalogFixture());
  /** The fixture's 8 × 4.5 × 5 m tank in 0.5 m blocks: 16 × 9 × 10. */
  const CELLS = 1440;

  it("accepts blocks whose runs fill the tank's grid", () => {
    const input = sceneFixture();
    input.blocks = { size: 0.5, runs: [CELLS - 40, 20, 20], color: "#8a7d70" };

    expect(parseScene(input, catalog).blocks?.runs).toEqual([CELLS - 40, 20, 20]);
  });

  it("rejects runs that do not fill the grid, saying how many cells it has", () => {
    const input = sceneFixture();
    input.blocks = { size: 0.5, runs: [100, 20], color: "#8a7d70" };

    expect(() => parseScene(input, catalog)).toThrow(/blocks\.runs.*120.*1440/);
  });

  it("rejects blocks smaller than the smallest size", () => {
    const input = sceneFixture();
    input.blocks = { size: 0.001, runs: [1], color: "#8a7d70" };

    expect(() => parseScene(input, catalog)).toThrow(/blocks\.size/);
  });

  it("lets entries grow on blocks, as on a ridge", () => {
    const input = sceneFixture();
    input.blocks = { size: 0.5, runs: [CELLS], color: "#8a7d70" };
    input.props = [{ kind: "brain-coral", count: 2, color: "#b89a5e", on: "rockwork" }];

    expect(() => parseScene(input, catalog)).not.toThrow();
  });
});

describe("placements", () => {
  const catalog = parseCatalog(catalogFixture());

  it("accepts plants and objects at chosen spots", () => {
    const input = sceneFixture();
    input.props = [
      { kind: "rock", count: 1, color: "#888888", at: [{ x: 1, z: -2, rotation: 90, size: 0.4 }] },
    ];

    expect(parseScene(input, catalog).props[0]?.at).toEqual([
      { x: 1, z: -2, rotation: 90, size: 0.4 },
    ]);
  });

  it("rejects a spot outside the tank", () => {
    const input = sceneFixture();
    input.props = [{ kind: "rock", count: 1, color: "#888888", at: [{ x: 9, z: -2 }] }];

    expect(() => parseScene(input, catalog)).toThrow(/props\.0\.at\.0.*outside the tank/);
  });
});

describe("scene lights", () => {
  const catalog = parseCatalog(catalogFixture());

  it("uses the recommended lights when the scene sets none", () => {
    const scene = parseScene(sceneFixture(), catalog);

    expect(scene.lights).toEqual(RECOMMENDED_LIGHTS);
  });

  it("lets a scene tune its own lights", () => {
    const input = sceneFixture();
    input.lights = { channels: { blue: { level: 0.2 } }, cycle: { mode: "clock" } };

    const scene = parseScene(input, catalog);

    expect([scene.lights.channels.blue.level, scene.lights.cycle.mode]).toEqual([0.2, "clock"]);
  });
});

describe("reef fish bodies", () => {
  it("accepts tall and banner bodies with the reef patterns", () => {
    const input = catalogFixture();
    input.species[0]!.body = {
      type: "procedural",
      shape: "banner",
      pattern: "idol",
      colors: { base: "#f4f1e6", accent: "#161616", detail: "#ffcc22" },
    };
    input.species[1]!.body = {
      type: "procedural",
      shape: "tall",
      pattern: "eye-bar",
      colors: { base: "#ffd23a", accent: "#1a1a1a" },
    };

    expect(() => parseCatalog(input)).not.toThrow();
  });

  it("uses the accent color for details when no detail color is given", () => {
    const input = catalogFixture();
    input.species[0]!.body = {
      type: "procedural",
      shape: "tall",
      pattern: "stripes",
      colors: { base: "#1d3fa8", accent: "#ffd84a" },
    };

    const body = parseCatalog(input).species[0]?.body;

    expect(body?.type === "procedural" ? body.colors.detail : undefined).toBe("#ffd84a");
  });
});

describe("water options", () => {
  const catalog = parseCatalog(catalogFixture());

  it("shows the water surface and bubbles by default", () => {
    const scene = parseScene(sceneFixture(), catalog);

    expect([scene.water.surface, scene.water.bubbles]).toEqual([1, true]);
  });

  it("lets an aquarium tone down the surface and turn bubbles off", () => {
    const input = sceneFixture();
    input.water = { ...input.water, surface: 0.2, bubbles: false };

    const scene = parseScene(input, catalog);

    expect([scene.water.surface, scene.water.bubbles]).toEqual([0.2, false]);
  });
});

describe("species behavior", () => {
  it("gives species without a behavior a moderate appetite", () => {
    const catalog = parseCatalog(catalogFixture());

    expect(catalog.species[0]?.behavior.appetite).toBe(DEFAULT_APPETITE);
  });

  it("reads a species' appetite", () => {
    const input = catalogFixture();
    input.species[0]!.behavior = { appetite: 0.9 };

    expect(parseCatalog(input).species[0]?.behavior.appetite).toBe(0.9);
  });

  it("rejects an appetite outside 0..1", () => {
    const input = catalogFixture();
    input.species[0]!.behavior = { appetite: 1.5 };

    expect(() => parseCatalog(input)).toThrow(/appetite/);
  });
});

describe("species reactions to the viewer", () => {
  it("gives species without them a default curiosity and shyness", () => {
    const behavior = parseCatalog(catalogFixture()).species[0]?.behavior;

    expect(behavior?.curiosity).toBe(DEFAULT_CURIOSITY);
    expect(behavior?.shyness).toBe(DEFAULT_SHYNESS);
  });

  it("reads curiosity and shyness", () => {
    const input = catalogFixture();
    input.species[0]!.behavior = { curiosity: 0.9, shyness: 0.1 };

    const behavior = parseCatalog(input).species[0]?.behavior;

    expect(behavior?.curiosity).toBe(0.9);
    expect(behavior?.shyness).toBe(0.1);
  });
});
