import {
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type InstancedMesh,
} from "three";
import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "../core/logger";
import type { Plant } from "../sim/layout";
import { createFloraRenderer } from "./floraRenderer";
import type { ShapeRequest } from "./sceneryShapes";
import { neutralWaterUniforms } from "./uniforms";

function modelLeaf(customAttr = "_SWAY"): Group {
  const root = new Group();
  const geometry = new BoxGeometry(0.2, 1, 0.05);
  geometry.translate(0, 0.5, 0);
  const count = geometry.getAttribute("position").count;
  const weights = new Float32Array(count).fill(0.42);
  geometry.setAttribute(customAttr, new Float32BufferAttribute(weights, 1));
  root.add(new Mesh(geometry, new MeshStandardMaterial()));
  return root;
}

describe("createFloraRenderer", () => {
  it("loads and instances a model-only plant with its custom sway attribute", async () => {
    const loads: string[] = [];
    const plants: Plant[] = [
      {
        kind: "vallisneria",
        model: "assets/objects/vallisneria/model.glb",
        sway: 0.12,
        swaySpeed: 1.4,
        swayAttribute: "_BEND",
        color: "#3a9a58",
        x: 0,
        z: -1,
        height: 0.8,
        rotation: 0,
        swayPhase: 0.5,
        seed: 7,
        tags: ["plant"],
      },
    ];
    const renderer = createFloraRenderer(plants, neutralWaterUniforms(), (url) => {
      loads.push(url);
      return Promise.resolve(modelLeaf("_bend"));
    });

    await renderer.settled();

    const mesh = renderer.object.children[0] as InstancedMesh | undefined;
    const sway = mesh?.geometry.getAttribute("aSway");
    expect(loads).toEqual(["assets/objects/vallisneria/model.glb"]);
    expect(mesh?.count).toBe(1);
    expect(sway?.getX(0)).toBeCloseTo(0.42);
    renderer.dispose();
  });

  it("draws a model plant with the material and texture it was made with", async () => {
    const texture = new Texture();
    const root = modelLeaf();
    const leaf = root.children[0] as Mesh;
    leaf.material = new MeshStandardMaterial({ map: texture });
    const plants: Plant[] = [
      {
        kind: "vallisneria",
        model: "assets/objects/vallisneria/model.glb",
        sway: 0.1,
        color: "#3a9a58",
        x: 0,
        z: -1,
        height: 0.8,
        rotation: 0,
        swayPhase: 0,
        seed: 1,
        tags: ["plant"],
      },
    ];
    const renderer = createFloraRenderer(plants, neutralWaterUniforms(), () =>
      Promise.resolve(root),
    );

    await renderer.settled();
    const material = (renderer.object.children[0] as InstancedMesh | undefined)?.material as
      MeshStandardMaterial | undefined;

    expect(material?.map).toBe(texture);
    renderer.dispose();
  });

  it("draws the procedural recipe without downloading the model when an object has both", async () => {
    const loads: string[] = [];
    const plants: Plant[] = [
      {
        kind: "kelp",
        generator: "kelp",
        model: "assets/objects/kelp/model.glb",
        sway: 0.12,
        color: "#3a9a58",
        x: 0,
        z: -1,
        height: 1.2,
        rotation: 0,
        swayPhase: 0,
        seed: 1,
        tags: ["plant"],
      },
    ];
    const renderer = createFloraRenderer(plants, neutralWaterUniforms(), (url) => {
      loads.push(url);
      return Promise.resolve(modelLeaf());
    });

    await renderer.settled();

    expect(loads).toEqual([]);
    expect(renderer.object.children).toHaveLength(1);
    renderer.dispose();
  });

  it("logs a warning and skips a model-only plant when the model fails to load", async () => {
    const entries: LogEntry[] = [];
    const plants: Plant[] = [
      {
        kind: "vallisneria",
        model: "assets/objects/vallisneria/model.glb",
        sway: 0.1,
        color: "#3a9a58",
        x: 0,
        z: -1,
        height: 0.8,
        rotation: 0,
        swayPhase: 0,
        seed: 1,
        tags: ["plant"],
      },
    ];
    const renderer = createFloraRenderer(
      plants,
      neutralWaterUniforms(),
      () => Promise.reject(new Error("404")),
      createLogger("render", (entry) => entries.push(entry)),
    );

    await renderer.settled();

    expect([renderer.object.children.length, entries[0]?.level]).toEqual([0, "warn"]);
    renderer.dispose();
  });
});

describe("plant shapes", () => {
  it("takes the shape of a generated plant from the given source", () => {
    const asked: ShapeRequest[] = [];
    const plants: Plant[] = [
      {
        kind: "kelp",
        generator: "kelp",
        sway: 0.12,
        color: "#3a9a58",
        x: 0,
        z: -1,
        height: 0.8,
        rotation: 0,
        swayPhase: 0.5,
        seed: 7,
        tags: ["plant"],
      },
    ];

    const renderer = createFloraRenderer(
      plants,
      neutralWaterUniforms(),
      undefined,
      undefined,
      (request) => {
        asked.push(request);
        return new BoxGeometry(3, 3, 3);
      },
    );

    const mesh = renderer.object.children[0] as InstancedMesh | undefined;
    expect([asked[0], mesh?.geometry.getAttribute("position").count]).toEqual([
      { kind: "plant", generator: "kelp" },
      new BoxGeometry(3, 3, 3).getAttribute("position").count,
    ]);
    renderer.dispose();
  });
});
