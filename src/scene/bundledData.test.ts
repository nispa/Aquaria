import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODEL_MANIFEST_FILE, modelIdsOf, parseModelManifest } from "./modelManifest";
import { parseCatalog, parseScene } from "./parse";
import { parseSceneIndex } from "./sceneIndex";

const SCENES = new URL("../../public/scenes/", import.meta.url);
const sceneFiles = readdirSync(SCENES).filter((file) => file !== "index.json");

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const MODELS = "../../public/assets/species/";
const modelFolders = existsSync(new URL(MODELS, import.meta.url))
  ? readdirSync(new URL(MODELS, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
const assetCredits = readFileSync(new URL("../../ASSETS.md", import.meta.url), "utf8");

describe("bundled data files", () => {
  it("ships a valid species catalog", () => {
    expect(() => parseCatalog(readJson("../../public/species.json"))).not.toThrow();
  });

  it("ships a valid reef scene", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    expect(() => parseScene(readJson("../../public/scenes/reef.json"), catalog)).not.toThrow();
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

  it("lists every material folder in the material index, and nothing else", () => {
    const folders = readdirSync(new URL("../../public/assets/materials/", import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const index = readJson("../../public/assets/materials/index.json") as { materials: string[] };

    expect([...index.materials].sort()).toEqual(folders.sort());
  });

  it.each(modelFolders)("ships a valid manifest and model file for the %s model", (id) => {
    const manifest = parseModelManifest(readJson(`${MODELS}${id}/${MODEL_MANIFEST_FILE}`), id);

    expect(existsSync(new URL(`${MODELS}${id}/${manifest.file}`, import.meta.url))).toBe(true);
  });

  it.each(modelFolders)("credits the %s model in ASSETS.md", (id) => {
    const manifest = parseModelManifest(readJson(`${MODELS}${id}/${MODEL_MANIFEST_FILE}`), id);

    expect(assetCredits).toContain(manifest.credit.source);
  });

  it("ships a model folder for every species with a 3D model", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    expect(modelIdsOf(catalog).filter((id) => !modelFolders.includes(id))).toEqual([]);
  });
});
