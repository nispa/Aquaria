import {
  AnimationClip,
  BoxGeometry,
  DataArrayTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type Material,
} from "three";
import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "../core/logger";
import { catalogFixture, sceneFixture } from "../scene/fixtures";
import { parseModelManifest, type ModelManifest } from "../scene/modelManifest";
import { parseCatalog, parseScene } from "../scene/parse";
import { posedFish } from "./fishPortraits";
import {
  createFishRenderer,
  modelMaterial,
  type AnimatedModelLoader,
  type ColoringLoader,
  type FishModelLoader,
} from "./fishRenderer";
import { createWaterUniforms } from "./uniforms";

const manifest = parseModelManifest(
  {
    name: "Box fish",
    credit: { author: "Someone", source: "https://example.org/fish", license: "CC0-1.0" },
  },
  "box-fish",
);
const withManifest = new Map<string, ModelManifest>([["box-fish", manifest]]);

function boxFish(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 0.3, 0.1), new MeshStandardMaterial()));
  return root;
}

/** The box fish with a texture, and two colorings of it. */
const coloredManifest = parseModelManifest(
  {
    name: "Box fish",
    colorings: {
      red: { name: "Red", texture: "colorings/red.png" },
      blue: { name: "Blue", texture: "colorings/blue.png" },
    },
    credit: { author: "Someone", source: "https://example.org/fish", license: "CC0-1.0" },
  },
  "box-fish",
);

function texturedBoxFish(): Group {
  const root = new Group();
  root.add(
    new Mesh(new BoxGeometry(1, 0.3, 0.1), new MeshStandardMaterial({ map: new Texture() })),
  );
  return root;
}

const patchesOf = (material: Material | Material[]): string =>
  (Array.isArray(material) ? material : [material])
    .map((each) => each.customProgramCacheKey())
    .join(" ");

interface SetupOptions {
  readonly load?: FishModelLoader;
  readonly loadColorings?: ColoringLoader;
  readonly coloring?: readonly string[];
  readonly loadAnimated?: AnimatedModelLoader;
  readonly manifests?: ReadonlyMap<string, ModelManifest>;
  readonly modelsOn?: boolean;
}

/** The first fixture species has a 3D model, "box-fish". */
function setup({
  load = () => Promise.resolve(boxFish()),
  loadAnimated,
  loadColorings,
  coloring,
  manifests = withManifest,
  modelsOn = true,
}: SetupOptions = {}) {
  const input = catalogFixture();
  input.species[0]!.model = "box-fish";
  if (coloring !== undefined) input.species[0]!.coloring = coloring.map((id) => ({ id }));
  const catalog = parseCatalog(input);
  const entries: LogEntry[] = [];
  const loads: string[] = [];
  const renderer = createFishRenderer(
    catalog,
    createWaterUniforms(parseScene(sceneFixture(), catalog)),
    createLogger("render", (entry) => entries.push(entry)),
    {
      manifests,
      load: (url) => {
        loads.push(url);
        return load(url);
      },
      ...(loadAnimated === undefined ? {} : { loadAnimated }),
      ...(loadColorings === undefined ? {} : { loadColorings }),
    },
    () => modelsOn,
  );
  const id = catalog.species[0]?.id ?? "";
  const shown = () =>
    renderer.object.children.filter((child) => child.visible).map((child) => child.name);
  const species = catalog.species[0];
  /** Puts one fish of the species with a model in the tank. */
  const swim = () => {
    renderer.update(species === undefined ? [] : [posedFish(species)]);
  };
  return { id, catalog, entries, loads, renderer, shown, swim };
}

describe("createFishRenderer", () => {
  it("draws the procedural body while the model loads", () => {
    const { id, shown, swim } = setup({ load: () => new Promise(() => undefined) });

    swim();

    expect(shown()).toContain(id);
  });

  it("does not build the body of a species with no fish in the tank", () => {
    const { id, renderer } = setup();

    renderer.update([]);

    expect(renderer.object.getObjectByName(id)).toBeUndefined();
  });

  it("does not download the model of a species with no fish in the tank", () => {
    const { loads, renderer } = setup();

    renderer.update([]);

    expect(loads).toEqual([]);
  });

  it("downloads the model when the first fish of its species appears", () => {
    const { loads, swim } = setup();

    swim();

    expect(loads).toHaveLength(1);
  });

  it("switches a species to its 3D model once it has loaded", async () => {
    const { id, renderer, shown, swim } = setup();

    swim();
    await renderer.settled();

    expect([shown().includes(`${id}/model`), shown().includes(id)]).toEqual([true, false]);
  });

  it("keeps the procedural body when the model fails to load, with a warning", async () => {
    const { id, entries, renderer, shown, swim } = setup({
      load: () => Promise.reject(new Error("404")),
    });

    swim();
    await renderer.settled();

    expect([shown().includes(id), entries[0]?.level]).toEqual([true, "warn"]);
  });

  it("dresses the model in the textures of the colorings its species wears", async () => {
    const urls: string[][] = [];
    const { id, renderer, swim } = setup({
      load: () => Promise.resolve(texturedBoxFish()),
      manifests: new Map([["box-fish", coloredManifest]]),
      coloring: ["blue", "red"],
      loadColorings: (textures) => {
        urls.push([...textures]);
        return Promise.resolve(new DataArrayTexture());
      },
    });

    swim();
    await renderer.settled();
    const model = renderer.object.getObjectByName(`${id}/model`) as Mesh;

    expect([urls, patchesOf(model.material).includes("fish-coloring")]).toEqual([
      [["assets/species/box-fish/colorings/blue.png", "assets/species/box-fish/colorings/red.png"]],
      true,
    ]);
  });

  it("keeps the model's own colors when its species wears a coloring the model lacks, with a warning", async () => {
    const { id, entries, renderer, swim } = setup({
      load: () => Promise.resolve(texturedBoxFish()),
      manifests: new Map([["box-fish", coloredManifest]]),
      coloring: ["green"],
      loadColorings: () => Promise.resolve(new DataArrayTexture()),
    });

    swim();
    await renderer.settled();
    const model = renderer.object.getObjectByName(`${id}/model`) as Mesh;

    expect([patchesOf(model.material).includes("fish-coloring"), entries[0]?.level]).toEqual([
      false,
      "warn",
    ]);
  });

  it("keeps the procedural body when the model has no manifest, with a warning", () => {
    const { id, entries, shown, swim } = setup({ manifests: new Map() });

    swim();

    expect([shown().includes(id), entries[0]?.details]).toEqual([
      true,
      expect.objectContaining({ model: "box-fish" }),
    ]);
  });

  it("does not download models that are switched off", () => {
    const { loads, swim } = setup({ modelsOn: false });

    swim();

    expect(loads).toEqual([]);
  });

  it("goes back to the procedural body when the model is switched off", async () => {
    const { id, renderer, shown, swim } = setup();
    swim();
    await renderer.settled();

    renderer.setModelEnabled(id, false);

    expect([shown().includes(id), shown().includes(`${id}/model`)]).toEqual([true, false]);
  });

  it("loads the model when it is switched on later", async () => {
    const { id, renderer, shown, swim } = setup({ modelsOn: false });
    swim();

    renderer.setModelEnabled(id, true);
    await renderer.settled();

    expect(shown()).toContain(`${id}/model`);
  });
});

describe("walking models", () => {
  const walking = parseModelManifest(
    {
      name: "Box crab",
      credit: { author: "Someone", source: "https://example.org/crab", license: "CC0-1.0" },
      animations: { walk: "Walk" },
    },
    "box-fish",
  );
  const walkers = () =>
    setup({
      manifests: new Map([["box-fish", walking]]),
      loadAnimated: () =>
        Promise.resolve({ root: boxFish(), clips: [new AnimationClip("Walk", 1, [])] }),
    });

  it("draws a species whose model walks as one animated body per individual", async () => {
    const { id, catalog, renderer, shown, swim } = walkers();
    const species = catalog.species[0];
    swim();
    await renderer.settled();

    renderer.update(species === undefined ? [] : [posedFish(species), posedFish(species)], 0.1);

    const bodies = renderer.object.getObjectByName(`${id}/animated`);
    expect([
      shown().includes(`${id}/animated`),
      shown().includes(`${id}/model`),
      shown().includes(id),
      bodies?.children.filter((body) => body.visible).length,
    ]).toEqual([true, false, false, 2]);
  });

  it("goes back to the procedural body when a walking model is switched off", async () => {
    const { id, renderer, shown, swim } = walkers();
    swim();
    await renderer.settled();

    renderer.setModelEnabled(id, false);

    expect([shown().includes(id), shown().includes(`${id}/animated`)]).toEqual([true, false]);
  });
});

describe("modelMaterial", () => {
  const water = createWaterUniforms(parseScene(sceneFixture(), parseCatalog(catalogFixture())));
  /** What the glTF loader makes of a material exported with alphaMode BLEND. */
  const blended = () => new MeshStandardMaterial({ transparent: true, depthWrite: false });

  it("writes depth for a model exported as blended, so depth effects do not hide it", () => {
    const material = modelMaterial(blended(), manifest, water);

    expect(material.depthWrite).toBe(true);
  });

  it("discards the clear texels of a model's texture, so cut-out fins do not hide what is behind", () => {
    const material = modelMaterial(blended(), manifest, water);

    expect(material.alphaTest).toBeGreaterThan(0);
  });
});
