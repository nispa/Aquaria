import {
  Box3,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type InstancedMesh,
} from "three";
import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "../core/logger";
import { bundledObjects } from "../scene/objectFixtures";
import { PROP_GENERATORS, type PropGenerator } from "../scene/schema";
import { propTraitsOf, type Prop } from "../sim/layout";
import { createPropRenderer, PROP_STYLES, propGeometry } from "./propRenderer";
import type { ShapeRequest } from "./sceneryShapes";
import { createSurfaceLibrary } from "./surfaceLibrary";
import { neutralWaterUniforms } from "./uniforms";

/**
 * A prop's collision shape is rough, but sized like its mesh: its width,
 * depth and top are those of the kind's largest variant within these
 * shares, so fish neither pass through props nor stop short of them. The
 * shapes are the collision traits of the bundled objects named after each
 * generator (public/assets/objects/<generator>/object.json).
 */
const SMALLEST = 0.8;
const LARGEST = 1.25;
/** Paper-thin meshes (a fan coral) get a shape at least this thick, relative to the size. */
const THINNEST = 0.05;

type Kind = PropGenerator;
const objects = bundledObjects();

/** The box around every shape variant of a kind. */
function boundsOf(kind: Kind): Box3 {
  const bounds = new Box3();
  for (let variant = 0; variant < PROP_STYLES[kind].variants; variant += 1) {
    const geometry = propGeometry(kind, variant);
    geometry.computeBoundingBox();
    if (geometry.boundingBox !== null) bounds.union(geometry.boundingBox);
    geometry.dispose();
  }
  return bounds;
}

/** The generators a bundled object still uses. */
const kinds = PROP_GENERATORS.filter((kind) => objects.get(kind) !== undefined);

describe("prop collision shapes", () => {
  it.each(kinds)("are as wide, deep and tall as the mesh of %s", (kind) => {
    const traits = propTraitsOf(objects.get(kind), kind);
    if (traits === undefined) throw new Error(`No object for ${kind}.`);
    const { shape } = traits;
    const bounds = boundsOf(kind);

    const ratios = [
      shape.across / Math.max(-bounds.min.x, bounds.max.x, THINNEST),
      (shape.lift + shape.up) / Math.max(bounds.max.y, THINNEST),
      shape.along / Math.max(-bounds.min.z, bounds.max.z, THINNEST),
    ];

    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(SMALLEST);
      expect(ratio).toBeLessThan(LARGEST);
    }
  });
});

function modelRock(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 0.6, 0.8), new MeshStandardMaterial()));
  return root;
}

describe("createPropRenderer with 3D models", () => {
  it("loads and instances a model-only prop", async () => {
    const loads: string[] = [];
    const logger = createLogger("render", () => undefined);
    const surfaces = createSurfaceLibrary(() => Promise.reject(new Error("unused")), logger);
    const items: Prop[] = [
      {
        kind: "amphora",
        model: "assets/objects/amphora/model.glb",
        shape: { across: 0.4, up: 0.6, along: 0.4, sink: 0, lift: 0 },
        solid: true,
        color: "#c87d55",
        x: 0,
        z: -1,
        size: 0.5,
        rotation: 0,
        seed: 3,
        tags: ["shelter"],
      },
    ];
    const renderer = createPropRenderer(items, neutralWaterUniforms(), surfaces, (url) => {
      loads.push(url);
      return Promise.resolve(modelRock());
    });

    await renderer.settled();

    const mesh = renderer.object.children[0] as InstancedMesh | undefined;
    expect(loads).toEqual(["assets/objects/amphora/model.glb"]);
    expect(mesh?.count).toBe(1);
    renderer.dispose();
    surfaces.dispose();
  });

  it("draws a model prop with the material and texture it was made with", async () => {
    const texture = new Texture();
    const root = new Group();
    root.add(
      new Mesh(
        new BoxGeometry(1, 0.6, 0.8),
        new MeshStandardMaterial({ color: "#c04020", map: texture }),
      ),
    );
    const props: Prop[] = [
      {
        kind: "amphora",
        model: "assets/objects/amphora/model.glb",
        shape: { across: 0.5, up: 0.5, along: 0.5, sink: 0, lift: 0 },
        solid: true,
        color: "#8a8178",
        x: 0,
        z: -1,
        size: 0.4,
        rotation: 0,
        seed: 3,
        tags: [],
      },
    ];
    const renderer = createPropRenderer(
      props,
      neutralWaterUniforms(),
      createSurfaceLibrary(
        () => Promise.reject(new Error("unused")),
        createLogger("render", () => undefined),
      ),
      () => Promise.resolve(root),
    );

    await renderer.settled();
    const material = (renderer.object.children[0] as InstancedMesh | undefined)?.material as
      MeshStandardMaterial | undefined;

    expect([material?.map, material?.color.getHexString()]).toEqual([
      texture,
      new Color("#c04020").getHexString(),
    ]);
    renderer.dispose();
  });

  it("draws the procedural recipe without downloading the model when a prop has both", async () => {
    const loads: string[] = [];
    const logger = createLogger("render", () => undefined);
    const surfaces = createSurfaceLibrary(() => Promise.reject(new Error("unused")), logger);
    const items: Prop[] = [
      {
        kind: "rock",
        generator: "rock",
        model: "assets/objects/rock/model.glb",
        shape: { across: 0.5, up: 0.5, along: 0.5, sink: 0, lift: 0 },
        solid: true,
        color: "#777777",
        x: 0,
        z: -1,
        size: 0.4,
        rotation: 0,
        seed: 1,
        tags: [],
      },
    ];
    const renderer = createPropRenderer(items, neutralWaterUniforms(), surfaces, (url) => {
      loads.push(url);
      return Promise.resolve(modelRock());
    });

    await renderer.settled();

    expect(loads).toEqual([]);
    expect(renderer.object.children).toHaveLength(1);
    renderer.dispose();
    surfaces.dispose();
  });

  it("logs a warning when a model-only prop fails to load", async () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("render", (entry) => entries.push(entry));
    const surfaces = createSurfaceLibrary(() => Promise.reject(new Error("unused")), logger);
    const items: Prop[] = [
      {
        kind: "amphora",
        model: "assets/objects/amphora/model.glb",
        shape: { across: 0.4, up: 0.6, along: 0.4, sink: 0, lift: 0 },
        solid: true,
        color: "#c87d55",
        x: 0,
        z: -1,
        size: 0.5,
        rotation: 0,
        seed: 3,
        tags: ["shelter"],
      },
    ];
    const renderer = createPropRenderer(
      items,
      neutralWaterUniforms(),
      surfaces,
      () => Promise.reject(new Error("404")),
      logger,
    );

    await renderer.settled();

    expect([renderer.object.children.length, entries[0]?.level]).toEqual([0, "warn"]);
    renderer.dispose();
    surfaces.dispose();
  });
});

describe("prop shapes", () => {
  it("takes the shape of a generated prop from the given source", () => {
    const asked: ShapeRequest[] = [];
    const surfaces = createSurfaceLibrary(
      () => Promise.resolve(new Texture()),
      createLogger("render", () => undefined),
    );
    const items: Prop[] = [
      {
        kind: "rock",
        generator: "rock",
        shape: { across: 0.5, up: 0.5, along: 0.5, sink: 0, lift: 0 },
        solid: true,
        color: "#8a8178",
        x: 0,
        z: -1,
        size: 0.4,
        rotation: 0,
        seed: 3,
        tags: [],
      },
    ];

    const renderer = createPropRenderer(
      items,
      neutralWaterUniforms(),
      surfaces,
      undefined,
      undefined,
      (request) => {
        asked.push(request);
        return new BoxGeometry(3, 3, 3);
      },
    );

    const mesh = renderer.object.children[0] as InstancedMesh | undefined;
    mesh?.geometry.computeBoundingBox();
    expect([asked[0]?.kind, asked[0]?.generator, mesh?.geometry.boundingBox?.max.x]).toEqual([
      "prop",
      "rock",
      1.5,
    ]);
    renderer.dispose();
    surfaces.dispose();
  });
});
