import { Color, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { RockworkSpec } from "../scene/schema";
import type { Rockwork } from "../sim/rockwork";
import { floorHeight } from "../sim/terrain";
import { causticsPatch } from "./shaders/causticsPatch";
import { patchMaterial, type ShaderPatch } from "./shaders/patch";
import { surfacePatch } from "./shaders/surfacePatch";
import type { SurfaceLibrary } from "./surfaceLibrary";
import type { WaterUniforms } from "./uniforms";

/** Grid spacing of the ridge mesh, m: fine enough for material displacement. */
const CELL_SIZE = 0.025;
/** Off the ridge the mesh dips under the sand, so its edges blend in. */
const EDGE_SINK = 0.04;
const ROUGHNESS = 0.95;

export interface RockworkRenderer {
  readonly object: Mesh;
  dispose(): void;
}

/** The ridge body: a heightfield mesh that follows the rockwork surface. */
export function createRockworkRenderer(
  rockwork: Rockwork,
  spec: RockworkSpec,
  water: WaterUniforms,
  surfaces: SurfaceLibrary,
): RockworkRenderer {
  const { xMin, xMax, zMin, zMax } = rockwork.footprint;
  const width = xMax - xMin;
  const depth = zMax - zMin;
  const geometry = new PlaneGeometry(
    width,
    depth,
    Math.ceil(width / CELL_SIZE),
    Math.ceil(depth / CELL_SIZE),
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = rockwork.heightAt(x, z);
    positions.setY(index, floorHeight(x, z) + (height > 0 ? height : -EDGE_SINK));
  }
  geometry.computeVertexNormals();

  const patches: ShaderPatch[] =
    spec.material === undefined
      ? [causticsPatch(water)]
      : [
          surfacePatch(surfaces.get(spec.material.id), "triplanar", spec.material),
          causticsPatch(water),
        ];
  const material = patchMaterial(
    new MeshStandardMaterial({ color: new Color(spec.color), roughness: ROUGHNESS }),
    patches,
  );
  const object = new Mesh(geometry, material);
  object.name = "rockwork";
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
