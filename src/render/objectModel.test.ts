import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
  extractModelTraits,
  prepareObjectModel,
  strandAttribute,
  swayAttribute,
} from "./objectModel";

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

describe("strandAttribute", () => {
  it("reads each tentacle's strand value, as GLTFLoader names it", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("_strand", new Float32BufferAttribute([0.25, 0.25], 1));

    const strands = strandAttribute(geometry);

    expect([strands?.getX(0), strands?.getX(1)]).toEqual([0.25, 0.25]);
  });

  it("finds none on a plant whose model has no strands", () => {
    const geometry = new PlaneGeometry(1, 1);

    expect(strandAttribute(geometry)).toBeUndefined();
  });
});

describe("swayAttribute", () => {
  it("reads a custom glTF attribute and clamps it to 0..1", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 2, 0], 3));
    geometry.setAttribute("_SWAY", new Float32BufferAttribute([-0.2, 0.4, 1.5], 1));

    const sway = swayAttribute(geometry, "_SWAY");

    expect([sway.getX(0), sway.getX(1), sway.getX(2)]).toEqual([
      0,
      expect.closeTo(0.4) as number,
      1,
    ]);
  });

  it("finds the attribute even when GLTFLoader lowercased its name", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute("_bend", new Float32BufferAttribute([0.25, 0.75], 1));

    const sway = swayAttribute(geometry, "_BEND");

    expect([sway.getX(0), sway.getX(1)]).toEqual([0.25, 0.75]);
  });

  it("falls back to height from base (0) to tip (1) when no attribute is painted", () => {
    const geometry = new PlaneGeometry(1, 2, 1, 2);
    geometry.translate(0, 1, 0);

    const sway = swayAttribute(geometry);
    const positions = geometry.getAttribute("position");
    const pairs = Array.from({ length: positions.count }, (_, index) => [
      positions.getY(index) / 2,
      sway.getX(index),
    ]);

    for (const [expected, actual] of pairs) {
      expect(actual).toBeCloseTo(expected ?? 0);
    }
  });
});

describe("prepareObjectModel", () => {
  it("normalizes a plant model to stand on y = 0, centered on x/z, 1 unit tall, with aSway", () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(0.4, 2, 0.2), new MeshStandardMaterial());
    mesh.position.set(3, 5, -2);
    root.add(mesh);

    const variants = prepareObjectModel(root, "plant");
    const part = variants[0]?.parts[0];
    const bounds = boundsOf(part?.geometry ?? new BufferGeometry());
    const sway = part?.geometry.getAttribute("aSway");

    expect(variants).toHaveLength(1);
    expect([
      bounds.min.y,
      bounds.max.y,
      bounds.min.x + bounds.max.x,
      bounds.min.z + bounds.max.z,
      bounds.max.x - bounds.min.x,
    ]).toEqual([
      expect.closeTo(0) as number,
      expect.closeTo(1) as number,
      expect.closeTo(0) as number,
      expect.closeTo(0) as number,
      expect.closeTo(0.2) as number,
    ]);
    expect(sway).toBeDefined();
  });

  it("normalizes an object model to stand on y = 0, centered on x/z, 1 unit across", () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(4, 2, 1), new MeshStandardMaterial());
    mesh.position.set(-2, 3, 4);
    root.add(mesh);

    const variants = prepareObjectModel(root, "object");
    const part = variants[0]?.parts[0];
    const bounds = boundsOf(part?.geometry ?? new BufferGeometry());
    const size = bounds.getSize(new Vector3());

    expect(variants).toHaveLength(1);
    expect([
      bounds.min.y,
      bounds.min.x + bounds.max.x,
      bounds.min.z + bounds.max.z,
      Math.max(size.x, size.z),
      size.y,
    ]).toEqual([
      expect.closeTo(0) as number,
      expect.closeTo(0) as number,
      expect.closeTo(0) as number,
      expect.closeTo(1) as number,
      expect.closeTo(0.5) as number,
    ]);
  });

  it("keeps the normals the model was made with", () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 2, 1);
    const normals = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    root.add(new Mesh(geometry, new MeshStandardMaterial()));

    const part = prepareObjectModel(root, "object")[0]?.parts[0];
    const normal = part?.geometry.getAttribute("normal");

    expect([normal?.getX(0), normal?.getY(0), normal?.getZ(0)]).toEqual([0, 1, 0]);
  });

  it("splits top-level children spaced side by side into distinct variants", () => {
    const root = new Group();
    for (const [index, height] of [1, 2, 4].entries()) {
      const variant = new Group();
      variant.name = `variant-${String(index)}`;
      const mesh = new Mesh(new BoxGeometry(0.5, height, 0.5), new MeshStandardMaterial());
      mesh.position.set(index * 3, height / 2, 0);
      variant.add(mesh);
      root.add(variant);
    }

    const variants = prepareObjectModel(root, "object");
    const heights = variants.map((variant) => {
      const bounds = boundsOf(variant.parts[0]?.geometry ?? new BufferGeometry());
      return bounds.max.y - bounds.min.y;
    });

    expect(variants).toHaveLength(3);
    // Each 0.5-wide box is scaled to 1 wide (x2), so heights are 2, 4, 8.
    expect(heights).toEqual([
      expect.closeTo(2) as number,
      expect.closeTo(4) as number,
      expect.closeTo(8) as number,
    ]);
  });
});

describe("extractModelTraits", () => {
  it("reads and validates traits stored in glTF extras (userData.traits)", () => {
    const root = new Group();
    root.userData = {
      traits: {
        sway: { amount: 0.14, speed: 1.2 },
        tags: ["plant", "broad-leaf"],
      },
    };

    const traits = extractModelTraits(root, "anubias");

    expect(traits).toEqual({
      sway: { amount: 0.14, speed: 1.2, attribute: "_SWAY" },
      tags: ["plant", "broad-leaf"],
    });
  });

  it("finds traits on a child node when the exporter attached extras to the node", () => {
    const root = new Group();
    const child = new Group();
    child.userData = { traits: { tags: ["shelter"] } };
    root.add(child);

    expect(extractModelTraits(root, "cave")).toEqual({
      tags: ["shelter"],
    });
  });
});
