import { BufferAttribute, BufferGeometry, Mesh } from "three";
import type { BlocksSpec } from "../scene/schema";
import type { Blockwork } from "../sim/blockwork";
import { blockMesh, poreSubdivisions } from "./blockMesh";
import { rockMaterial, type RockworkRenderer } from "./rockworkRenderer";
import type { SurfaceLibrary } from "./surfaceLibrary";
import type { WaterUniforms } from "./uniforms";

/** Relaxation passes: rounded rock, but the blocks' shape still reads. */
const SMOOTHING = 3;
/** Largest shift of the surface by noise, as a share of a block. */
const ROUGHNESS = 0.18;

/** Rock built from blocks, smoothed (see blockMesh). */
export function createBlockworkRenderer(
  blockwork: Blockwork,
  spec: BlocksSpec,
  tank: { readonly width: number; readonly depth: number },
  seed: number,
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
): RockworkRenderer {
  const mesh = blockMesh(tank, blockwork.grid, blockwork.cells, {
    smoothing: SMOOTHING,
    roughness: ROUGHNESS * spec.size,
    seed,
    ...(spec.pores === undefined
      ? {}
      : { pores: spec.pores, subdivisions: poreSubdivisions(spec.size, spec.pores.cell) }),
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  if (spec.pores !== undefined)
    geometry.setAttribute("aCavity", new BufferAttribute(mesh.cavity, 1));
  geometry.computeVertexNormals();
  const material = rockMaterial(spec, water, surfaces, spec.pores !== undefined);
  const object = new Mesh(geometry, material);
  object.name = "blockwork";
  object.castShadow = true;
  object.receiveShadow = true;

  return {
    object,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
