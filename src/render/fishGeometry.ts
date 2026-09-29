import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Species } from "../scene/schema";

type Shape = Extract<Species["body"], { type: "procedural" }>["shape"];

export interface BodyProportions {
  /** Body height in body lengths. */
  readonly height: number;
  /** Body thickness in body lengths. */
  readonly thickness: number;
  /** Tail fin height relative to body height. */
  readonly tail: number;
  /** Dorsal fin height relative to body height. */
  readonly dorsal: number;
  /** Tail sweep in body lengths. */
  readonly swimAmplitude: number;
}

export const BODY_PROPORTIONS: Readonly<Record<Shape, BodyProportions>> = {
  disc: { height: 0.62, thickness: 0.13, tail: 0.75, dorsal: 0.35, swimAmplitude: 0.05 },
  round: { height: 0.4, thickness: 0.24, tail: 0.85, dorsal: 0.3, swimAmplitude: 0.07 },
  slender: { height: 0.22, thickness: 0.14, tail: 1.1, dorsal: 0.35, swimAmplitude: 0.09 },
};

const BODY_SEGMENTS = { width: 28, height: 16 } as const;

/** Tapers the sphere into a fish: full at the head, narrow at the tail. */
function shapeBody(proportions: BodyProportions): BufferGeometry {
  const body = new SphereGeometry(0.5, BODY_SEGMENTS.width, BODY_SEGMENTS.height).toNonIndexed();
  const positions = body.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const alongBody = x + 0.5; // 0 at the tail, 1 at the nose
    const taper = Math.min(0.45 + alongBody * 0.95, 1.05);
    positions.setXYZ(
      index,
      x,
      positions.getY(index) * proportions.height * taper,
      positions.getZ(index) * proportions.thickness * taper,
    );
  }
  body.computeVertexNormals();
  return body;
}

function flatPart(vertices: readonly number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Array<number>((vertices.length / 3) * 2).fill(0), 2),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function tailFin(proportions: BodyProportions): BufferGeometry {
  const half = (proportions.height / 2) * proportions.tail;
  // Forked tail: two triangles meeting at the tail stem.
  return flatPart([
    -0.42,
    0,
    0,
    -0.66,
    half,
    0,
    -0.58,
    0,
    0,
    -0.42,
    0,
    0,
    -0.58,
    0,
    0,
    -0.66,
    -half,
    0,
  ]);
}

function dorsalFin(proportions: BodyProportions): BufferGeometry {
  const top = proportions.height / 2;
  const fin = proportions.height * proportions.dorsal;
  return flatPart([0.12, top * 0.92, 0, -0.26, top * 0.6, 0, -0.08, top + fin, 0]);
}

/** Builds a one-body-length fish, nose towards +x, for the given shape. */
export function createFishGeometry(shape: Shape): BufferGeometry {
  const proportions = BODY_PROPORTIONS[shape];
  const parts = [shapeBody(proportions), tailFin(proportions), dorsalFin(proportions)];
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  merged.computeBoundingSphere();
  return merged;
}
