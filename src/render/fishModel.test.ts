import {
  Box3,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { parseModelManifest, type ModelManifest } from "../scene/modelManifest";
import { modelAxisFrame, prepareFishModel } from "./fishModel";

const credit = { author: "Someone", source: "https://example.org/fish", license: "CC0-1.0" };

function manifest(overrides: Record<string, unknown> = {}): ModelManifest {
  return parseModelManifest({ name: "Test fish", credit, ...overrides }, "test-fish");
}

function boundsOf(geometry: Mesh["geometry"]): Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

/** A box fish 4 long along z, 1 high, 0.5 thick, placed away from the origin. */
function boxFishAlongZ(): Group {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(0.5, 1, 4), new MeshStandardMaterial());
  mesh.position.set(10, 5, -3);
  root.add(mesh);
  return root;
}

describe("modelAxisFrame", () => {
  it("turns the model's forward axis into +x", () => {
    const frame = modelAxisFrame("-z", "+y");

    const snout = new Vector3(0, 0, -1).applyMatrix4(frame);

    expect(snout.toArray().map((value) => Math.round(value))).toEqual([1, 0, 0]);
  });

  it("turns the model's up axis into +y", () => {
    const frame = modelAxisFrame("+z", "-x");

    const dorsal = new Vector3(-1, 0, 0).applyMatrix4(frame);

    expect(dorsal.toArray().map((value) => Math.round(value))).toEqual([0, 1, 0]);
  });
});

describe("prepareFishModel", () => {
  it("scales the model to one body length along x", () => {
    const [part] = prepareFishModel(boxFishAlongZ(), manifest({ forward: "+z" }));

    const size = boundsOf(part?.geometry ?? new BoxGeometry()).getSize(new Vector3());

    expect(size.x).toBeCloseTo(1);
  });

  it("centres the model so the snout is at x = +0.5", () => {
    const [part] = prepareFishModel(boxFishAlongZ(), manifest({ forward: "+z" }));

    const bounds = boundsOf(part?.geometry ?? new BoxGeometry());

    expect([bounds.max.x, bounds.min.y + bounds.max.y]).toEqual([
      expect.closeTo(0.5) as number,
      expect.closeTo(0) as number,
    ]);
  });

  it("keeps the model's proportions", () => {
    const [part] = prepareFishModel(boxFishAlongZ(), manifest({ forward: "+z" }));

    const size = boundsOf(part?.geometry ?? new BoxGeometry()).getSize(new Vector3());

    expect(size.y).toBeCloseTo(0.25);
  });

  it("returns one part per mesh, all in the same frame", () => {
    const root = boxFishAlongZ();
    const fin = new Mesh(new BoxGeometry(0.1, 0.5, 0.5), new MeshStandardMaterial());
    fin.position.set(10, 5.75, -3);
    root.add(fin);

    const parts = prepareFishModel(root, manifest({ forward: "+z" }));
    const bodyTop = boundsOf(parts[0]?.geometry ?? new BoxGeometry()).max.y;
    const finTop = boundsOf(parts[1]?.geometry ?? new BoxGeometry()).max.y;

    // The fin sticks out 0.5 of a 4-long body above the back: 0.125 body lengths.
    expect([parts.length, finTop - bodyTop]).toEqual([2, expect.closeTo(0.125) as number]);
  });

  it("leaves the loaded model untouched so it can be disposed separately", () => {
    const root = boxFishAlongZ();
    const original = (root.children[0] as Mesh).geometry;

    const [part] = prepareFishModel(root, manifest({ forward: "+z" }));

    expect(part?.geometry).not.toBe(original);
  });

  it("finds the morph target that opens the mouth", () => {
    const root = boxFishAlongZ();
    const mesh = root.children[0] as Mesh;
    const count = mesh.geometry.getAttribute("position").count;
    mesh.geometry.morphAttributes.position = [
      new Float32BufferAttribute(new Float32Array(count * 3), 3),
      new Float32BufferAttribute(new Float32Array(count * 3), 3),
    ];
    mesh.updateMorphTargets();
    mesh.morphTargetDictionary = { Blink: 0, MouthOpen: 1 };

    const [part] = prepareFishModel(
      root,
      manifest({ forward: "+z", mouth: { morphTarget: "MouthOpen" } }),
    );

    expect(part?.mouthMorphIndex).toBe(1);
  });

  it("scales morph target offsets with the model", () => {
    const root = boxFishAlongZ();
    const mesh = root.children[0] as Mesh;
    const count = mesh.geometry.getAttribute("position").count;
    const offsets = new Float32Array(count * 3).fill(0);
    offsets[2] = 4;
    mesh.geometry.morphAttributes.position = [new Float32BufferAttribute(offsets, 3)];
    mesh.geometry.morphTargetsRelative = true;

    const [part] = prepareFishModel(root, manifest({ forward: "+z" }));
    const morphed = part?.geometry.morphAttributes.position?.[0];

    expect(morphed?.getX(0)).toBeCloseTo(1);
  });
});
