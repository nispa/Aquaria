import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, parseScene } from "./parse";
import { parseSceneIndex } from "./sceneIndex";

const SCENES = new URL("../../public/scenes/", import.meta.url);
const sceneFiles = readdirSync(SCENES).filter((file) => file !== "index.json");

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

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
});
