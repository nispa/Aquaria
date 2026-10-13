import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "../core/logger";
import { catalogFixture, sceneFixture } from "../scene/fixtures";
import { parseModelManifest, type ModelManifest } from "../scene/modelManifest";
import { parseCatalog, parseScene } from "../scene/parse";
import { createFishRenderer, type FishModelLoader } from "./fishRenderer";
import { createWaterUniforms } from "./uniforms";

const manifest = parseModelManifest(
  {
    name: "Box fish",
    credit: { author: "Someone", source: "https://example.org/fish", license: "CC0-1.0" },
  },
  "box-fish",
);

function boxFish(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 0.3, 0.1), new MeshStandardMaterial()));
  return root;
}

function setup(load: FishModelLoader, manifests = new Map<string, ModelManifest>()) {
  const input = catalogFixture();
  input.species[0]!.body = { type: "gltf", model: "box-fish" };
  const catalog = parseCatalog(input);
  const entries: LogEntry[] = [];
  const renderer = createFishRenderer(
    catalog,
    createWaterUniforms(parseScene(sceneFixture(), catalog)),
    createLogger("render", (entry) => entries.push(entry)),
    { manifests, load },
  );
  const meshNames = () => renderer.object.children.map((child) => child.name);
  return { catalog, entries, renderer, meshNames };
}

describe("createFishRenderer", () => {
  it("draws procedural species right away, before any model has loaded", () => {
    const { catalog, meshNames } = setup(() => new Promise(() => undefined));

    expect(meshNames()).toEqual(catalog.species.slice(1).map((species) => species.id));
  });

  it("adds a glTF species to the tank once its model has loaded", async () => {
    const { catalog, renderer, meshNames } = setup(
      () => Promise.resolve(boxFish()),
      new Map([["box-fish", manifest]]),
    );

    await renderer.settled();

    expect(meshNames()).toContain(catalog.species[0]?.id);
  });

  it("skips a species whose model fails to load, with a warning", async () => {
    const { catalog, entries, renderer, meshNames } = setup(
      () => Promise.reject(new Error("404")),
      new Map([["box-fish", manifest]]),
    );

    await renderer.settled();

    expect([meshNames().includes(catalog.species[0]?.id ?? ""), entries[0]?.level]).toEqual([
      false,
      "warn",
    ]);
  });

  it("skips a species whose model has no manifest, with a warning", () => {
    const { entries } = setup(() => Promise.resolve(boxFish()));

    expect(entries[0]?.details).toMatchObject({ model: "box-fish" });
  });
});
