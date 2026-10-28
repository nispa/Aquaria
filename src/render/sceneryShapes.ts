import type { BufferGeometry } from "three";
import type { PropGenerator } from "../scene/schema";
import { propGeometry } from "./propRenderer";

/**
 * The meshes Aquaria's generators grow for objects. They depend only on the
 * generator and the variant, never on the scene, so one grown shape serves
 * every rebuild of the scenery (render/shapeLibrary).
 */
export interface ShapeRequest {
  readonly kind: "prop";
  readonly generator: PropGenerator;
  readonly variant: number;
}

/** Hands out a new geometry for a shape; the caller owns and disposes it. */
export type ShapeSource = (request: ShapeRequest) => BufferGeometry;

export function shapeKey(request: ShapeRequest): string {
  return `prop|${request.generator}|${String(request.variant)}`;
}

/** Grows the shape. */
export function buildShape(request: ShapeRequest): BufferGeometry {
  return propGeometry(request.generator, request.variant);
}
