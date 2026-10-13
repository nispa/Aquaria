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
const withManifest = new Map<string, ModelManifest>([["box-fish", manifest]]);

function boxFish(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 0.3, 0.1), new MeshStandardMaterial()));
  return root;
}

interface SetupOptions {
  readonly load?: FishModelLoader;
  readonly manifests?: ReadonlyMap<string, ModelManifest>;
  readonly modelsOn?: boolean;
}

/** The first fixture species has a 3D model, "box-fish". */
function setup({
  load = () => Promise.resolve(boxFish()),
  manifests = withManifest,
  modelsOn = true,
}: SetupOptions = {}) {
  const input = catalogFixture();
  input.species[0]!.model = "box-fish";
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
    },
    () => modelsOn,
  );
  const id = catalog.species[0]?.id ?? "";
  const shown = () =>
    renderer.object.children.filter((child) => child.visible).map((child) => child.name);
  return { id, entries, loads, renderer, shown };
}

describe("createFishRenderer", () => {
  it("draws the procedural body while the model loads", () => {
    const { id, shown } = setup({ load: () => new Promise(() => undefined) });

    expect(shown()).toContain(id);
  });

  it("switches a species to its 3D model once it has loaded", async () => {
    const { id, renderer, shown } = setup();

    await renderer.settled();

    expect([shown().includes(`${id}/model`), shown().includes(id)]).toEqual([true, false]);
  });

  it("keeps the procedural body when the model fails to load, with a warning", async () => {
    const { id, entries, renderer, shown } = setup({
      load: () => Promise.reject(new Error("404")),
    });

    await renderer.settled();

    expect([shown().includes(id), entries[0]?.level]).toEqual([true, "warn"]);
  });

  it("keeps the procedural body when the model has no manifest, with a warning", () => {
    const { id, entries, shown } = setup({ manifests: new Map() });

    expect([shown().includes(id), entries[0]?.details]).toEqual([
      true,
      expect.objectContaining({ model: "box-fish" }),
    ]);
  });

  it("does not download models that are switched off", () => {
    const { loads } = setup({ modelsOn: false });

    expect(loads).toEqual([]);
  });

  it("goes back to the procedural body when the model is switched off", async () => {
    const { id, renderer, shown } = setup();
    await renderer.settled();

    renderer.setModelEnabled(id, false);

    expect([shown().includes(id), shown().includes(`${id}/model`)]).toEqual([true, false]);
  });

  it("loads the model when it is switched on later", async () => {
    const { id, renderer, shown } = setup({ modelsOn: false });

    renderer.setModelEnabled(id, true);
    await renderer.settled();

    expect(shown()).toContain(`${id}/model`);
  });
});
