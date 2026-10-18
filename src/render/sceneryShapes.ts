import type { BufferGeometry } from "three";
import type { PlantGenerator, PropGenerator } from "../scene/schema";
import { FLORA_STYLES, plantShapeGeometry } from "./floraRenderer";
import { propGeometry } from "./propRenderer";

/**
 * The meshes Aquaria's generators grow for plants and objects. They depend
 * only on the generator and the variant, never on the scene, so one grown
 * shape serves every rebuild of the scenery (render/shapeLibrary).
 */
export type ShapeRequest =
  | { readonly kind: "prop"; readonly generator: PropGenerator; readonly variant: number }
  | { readonly kind: "plant"; readonly generator: PlantGenerator };

/** Hands out a new geometry for a shape; the caller owns and disposes it. */
export type ShapeSource = (request: ShapeRequest) => BufferGeometry;

export function shapeKey(request: ShapeRequest): string {
  return request.kind === "prop"
    ? `prop|${request.generator}|${String(request.variant)}`
    : `plant|${request.generator}`;
}

/** Grows the shape. */
export function buildShape(request: ShapeRequest): BufferGeometry {
  return request.kind === "prop"
    ? propGeometry(request.generator, request.variant)
    : plantShapeGeometry(FLORA_STYLES[request.generator]);
}
