import { Box3, type Mesh, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { encodeRuns } from "../scene/blocks";
import { bundledObjects } from "../scene/objectFixtures";
import type { BlocksSpec } from "../scene/schema";
import { bakeBlockworkGlb, bakeObjectGlb } from "./objectBake";
import { extractModelTraits, prepareObjectModel } from "./objectModel";

async function parseGlb(bytes: Uint8Array): Promise<Object3D> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  return gltf.scene;
}

function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((child) => {
    if ((child as Partial<Mesh>).isMesh === true) meshes.push(child as Mesh);
  });
  return meshes;
}

describe("bakeObjectGlb", () => {
  const objects = bundledObjects();
  it("bakes a prop recipe into a valid .glb at real size in meters with traits in extras", async () => {
    const rock = objects.get("rock");
    if (rock === undefined) throw new Error("Missing bundled rock object.");

    const glb = bakeObjectGlb("rock", rock, 3);
    const scene = await parseGlb(glb);
    const meshes = meshesOf(scene);
    const traits = extractModelTraits(scene, "rock");
    const variants = prepareObjectModel(scene, "object");
    const bounds = new Box3().setFromObject(meshes[0]!);

    // GLB header starts with "glTF" (0x46546c67).
    expect(new DataView(glb.buffer, glb.byteOffset, 4).getUint32(0, true)).toBe(0x46546c67);
    expect(meshes).toHaveLength(3);
    expect(bounds.max.y).toBeGreaterThan(0.15);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0.15);
    expect(traits).toEqual(rock.traits);
    expect(variants).toHaveLength(3);
  });
});

describe("bakeBlockworkGlb", () => {
  it("bakes block rock into a valid .glb with smoothed geometry, PBR material and traits in extras", async () => {
    const tank = { width: 2, height: 1, depth: 1 };
    const cells = new Uint8Array(4 * 2 * 2);
    cells[0] = 1;
    cells[1] = 1;
    const blocks: BlocksSpec = {
      size: 0.5,
      color: "#6e655c",
      runs: encodeRuns(cells),
    };

    const glb = bakeBlockworkGlb(tank, blocks, 42);
    const scene = await parseGlb(glb);
    const meshes = meshesOf(scene);
    const traits = extractModelTraits(scene, "blockwork");

    expect(meshes).toHaveLength(1);
    expect(meshes[0]?.geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(traits?.collision?.solid).toBe(true);
    expect(traits?.tags).toContain("rock");
  });
});
