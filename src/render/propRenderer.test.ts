import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { PROP_SHAPES } from "../sim/obstacles";
import { PROP_STYLES, propGeometry } from "./propRenderer";

/**
 * A prop's collision shape is rough, but sized like its mesh: its width,
 * depth and top are those of the kind's largest variant within these
 * shares, so fish neither pass through props nor stop short of them.
 */
const SMALLEST = 0.8;
const LARGEST = 1.25;
/** Paper-thin meshes (a fan coral) get a shape at least this thick, relative to the size. */
const THINNEST = 0.05;

type Kind = keyof typeof PROP_SHAPES;

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

const kinds = Object.keys(PROP_SHAPES) as Kind[];

describe("prop collision shapes", () => {
  it.each(kinds)("are as wide, deep and tall as the mesh of %s", (kind) => {
    const shape = PROP_SHAPES[kind];
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
