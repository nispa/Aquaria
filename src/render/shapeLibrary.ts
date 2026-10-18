import type { BufferGeometry } from "three";
import { buildShape, shapeKey, type ShapeSource } from "./sceneryShapes";

/**
 * Keeps the generators' shapes (render/sceneryShapes) for the whole visit.
 * The scenery is rebuilt when the viewer moves a slider, leaves the editor
 * or switches scene; growing the corals again each time stalled a phone for
 * about a second. Copying a kept shape costs next to nothing.
 */
export interface ShapeLibrary {
  /** A copy of a shape, which the caller owns; the shape is grown on first use. */
  readonly geometry: ShapeSource;
  dispose(): void;
}

export function createShapeLibrary(build: ShapeSource = buildShape): ShapeLibrary {
  const shapes = new Map<string, BufferGeometry>();
  return {
    geometry(request) {
      const key = shapeKey(request);
      let shape = shapes.get(key);
      if (shape === undefined) {
        shape = build(request);
        shapes.set(key, shape);
      }
      return shape.clone();
    },
    dispose() {
      for (const shape of shapes.values()) shape.dispose();
      shapes.clear();
    },
  };
}
