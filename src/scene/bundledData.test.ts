import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MATERIAL_MANIFEST_FILE,
  materialTextureUrls,
  parseMaterialManifest,
} from "./materialManifest";
import {
  EFFECT_MANIFEST_FILE,
  effectShaderUrl,
  parseEffectIndex,
  parseEffectManifest,
} from "./effectManifest";
import { checkSceneObjects, parseObjectIndex } from "./objectCatalog";
import { bundledObjects } from "./objectFixtures";
import { objectMaterialUrl, objectModelUrl } from "./objectManifest";
import { MODEL_MANIFEST_FILE, modelIdsOf, parseModelManifest } from "./modelManifest";
import { parseCatalog, parseScene } from "./parse";
import { parseSceneIndex } from "./sceneIndex";
import { parseLookIndex, parseSceneLook, sceneLookUrl } from "./sceneLook";

const SCENES = new URL("../../public/scenes/", import.meta.url);
const sceneFiles = readdirSync(SCENES).filter(
  (file) => file.endsWith(".json") && file !== "index.json",
);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const MODELS = "../../public/assets/species/";
const modelFolders = existsSync(new URL(MODELS, import.meta.url))
  ? readdirSync(new URL(MODELS, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
const MATERIALS = "../../public/assets/materials/";
const materialIds = (
  JSON.parse(readFileSync(new URL(`${MATERIALS}index.json`, import.meta.url), "utf8")) as {
    materials: string[];
  }
).materials;
const OBJECTS = new URL("../../public/assets/objects/", import.meta.url);
const objectFolders = readdirSync(OBJECTS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const objectIndex = parseObjectIndex(readJson("../../public/assets/objects/index.json"));
const EFFECTS = "../../public/effects/";
const effectIds = parseEffectIndex(readJson(`${EFFECTS}index.json`));
// Reading every object.json validates it: an invalid one throws here.
const objects = bundledObjects();
const assetCredits = readFileSync(new URL("../../ASSETS.md", import.meta.url), "utf8");

describe("bundled data files", () => {
  it("ships a valid species catalog", () => {
    expect(() => parseCatalog(readJson("../../public/species.json"))).not.toThrow();
  });

  it("ships a valid reef scene", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    expect(() => parseScene(readJson("../../public/scenes/reef.json"), catalog)).not.toThrow();
  });

  it.each(sceneFiles)("names only bundled plants and objects in %s", (file) => {
    const catalog = parseCatalog(readJson("../../public/species.json"));
    const scene = parseScene(readJson(`../../public/scenes/${file}`), catalog);

    expect(() => {
      checkSceneObjects(scene, objects);
    }).not.toThrow();
  });

  it.each(parseLookIndex(readJson("../../public/looks/index.json")))(
    "ships a valid %s look for the panel's list",
    (id) => {
      expect(() => parseSceneLook(readJson(`../../public/${sceneLookUrl(id)}`), id)).not.toThrow();
    },
  );

  it.each(sceneFiles)("names a valid look in %s, if any", (file) => {
    const catalog = parseCatalog(readJson("../../public/species.json"));
    const { look } = parseScene(readJson(`../../public/scenes/${file}`), catalog);

    expect(() => {
      if (look !== undefined) parseSceneLook(readJson(`../../public/${sceneLookUrl(look)}`), look);
    }).not.toThrow();
  });

  it.each(objectFolders)("gives the %s object a material that exists, if any", (id) => {
    const manifest = objects.get(id);
    const url = manifest === undefined ? undefined : objectMaterialUrl(id, manifest);

    expect(url === undefined || existsSync(new URL(`../../public/${url}`, import.meta.url))).toBe(
      true,
    );
  });

  it.each(objectFolders)("lists the %s object folder in the object index", (id) => {
    expect(objectIndex).toContain(id);
  });

  it.each(sceneFiles)("ships a valid scene in %s, named after its file", (file) => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    const scene = parseScene(readJson(`../../public/scenes/${file}`), catalog);

    expect(`${scene.id}.json`).toBe(file);
  });

  it("lists every scene file in the scene index, and nothing else", () => {
    const index = parseSceneIndex(readJson("../../public/scenes/index.json"));

    expect([...index.scenes].sort()).toEqual(
      sceneFiles.map((file) => file.replace(".json", "")).sort(),
    );
  });

  it("has a picture for the card of every scene in the scene index", () => {
    const index = parseSceneIndex(readJson("../../public/scenes/index.json"));

    const missing = index.scenes.filter(
      (id) => !existsSync(new URL(`../../public/scenes/thumbnails/${id}.jpg`, import.meta.url)),
    );

    expect(missing).toEqual([]);
  });

  it("lists every material folder in the material index, and nothing else", () => {
    const folders = readdirSync(new URL("../../public/assets/materials/", import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const index = readJson("../../public/assets/materials/index.json") as { materials: string[] };

    expect([...index.materials].sort()).toEqual(folders.sort());
  });

  it("lists every effect folder in the effect index, and nothing else", () => {
    const folders = readdirSync(new URL(EFFECTS, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect([...effectIds].sort()).toEqual(folders.sort());
  });

  it.each(effectIds)("ships a valid manifest and its shader for the %s effect", (id) => {
    const manifest = parseEffectManifest(readJson(`${EFFECTS}${id}/${EFFECT_MANIFEST_FILE}`), id);

    expect(
      existsSync(new URL(`../../public/${effectShaderUrl(id, manifest)}`, import.meta.url)),
    ).toBe(true);
  });

  it.each(modelFolders)("ships a valid manifest and model file for the %s model", (id) => {
    const manifest = parseModelManifest(readJson(`${MODELS}${id}/${MODEL_MANIFEST_FILE}`), id);

    expect(existsSync(new URL(`${MODELS}${id}/${manifest.file}`, import.meta.url))).toBe(true);
  });

  it.each(modelFolders)("credits the %s model in ASSETS.md", (id) => {
    const manifest = parseModelManifest(readJson(`${MODELS}${id}/${MODEL_MANIFEST_FILE}`), id);

    expect(assetCredits).toContain(manifest.credit.source);
  });

  it.each(modelFolders)("ships the texture of every coloring of the %s model", (id) => {
    const manifest = parseModelManifest(readJson(`${MODELS}${id}/${MODEL_MANIFEST_FILE}`), id);
    const textures = Object.values(manifest.colorings ?? {}).map(({ texture }) => texture);

    expect(
      textures.filter(
        (texture) => !existsSync(new URL(`${MODELS}${id}/${texture}`, import.meta.url)),
      ),
    ).toEqual([]);
  });

  it("lists every coloring a species wears in the species' model", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));
    const worn = catalog.species.flatMap(({ model, coloring }) =>
      model === undefined ? [] : (coloring ?? []).map(({ id }) => [model, id] as const),
    );

    expect(
      worn.filter(
        ([model, id]) =>
          parseModelManifest(readJson(`${MODELS}${model}/${MODEL_MANIFEST_FILE}`), model)
            .colorings?.[id] === undefined,
      ),
    ).toEqual([]);
  });

  it("ships a model folder for every species with a 3D model", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    expect(modelIdsOf(catalog).filter((id) => !modelFolders.includes(id))).toEqual([]);
  });

  it.each(materialIds)("ships a valid manifest and both textures for the %s material", (id) => {
    const manifest = parseMaterialManifest(
      readJson(`${MATERIALS}${id}/${MATERIAL_MANIFEST_FILE}`),
      id,
    );
    const { normal, surface } = materialTextureUrls(id, manifest);

    expect(
      [normal, surface].map((url) => existsSync(new URL(`../../public/${url}`, import.meta.url))),
    ).toEqual([true, true]);
  });

  it.each(objectFolders)("ships the model the %s object names, credited in ASSETS.md", (id) => {
    const manifest = objects.get(id);
    const url = manifest === undefined ? undefined : objectModelUrl(id, manifest);
    const credited = url === undefined || assetCredits.includes(manifest?.credit?.source ?? "?");
    const present =
      url === undefined || existsSync(new URL(`../../public/${url}`, import.meta.url));

    expect([present, credited]).toEqual([true, true]);
  });

  it.each(materialIds)("credits the %s material in ASSETS.md", (id) => {
    const manifest = parseMaterialManifest(
      readJson(`${MATERIALS}${id}/${MATERIAL_MANIFEST_FILE}`),
      id,
    );

    expect(assetCredits).toContain(manifest.credit.source);
  });
});
