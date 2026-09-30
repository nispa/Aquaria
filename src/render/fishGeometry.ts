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
  /** torpedo: full height up to the head. disc: highest mid-body, pointed snout. */
  readonly profile: "torpedo" | "disc";
  readonly tailShape: "forked" | "fan";
  /** Anal fin height relative to body height; 0 = none. */
  readonly anal: number;
  /** Trailing dorsal filament height relative to body height; 0 = none. */
  readonly banner: number;
}

const STREAMLINED = { profile: "torpedo", tailShape: "forked", anal: 0, banner: 0 } as const;
const REEF_DISC = { profile: "disc", tailShape: "fan" } as const;

export const BODY_PROPORTIONS: Readonly<Record<Shape, BodyProportions>> = {
  disc: {
    height: 0.62,
    thickness: 0.13,
    tail: 0.75,
    dorsal: 0.35,
    swimAmplitude: 0.05,
    ...STREAMLINED,
  },
  round: {
    height: 0.4,
    thickness: 0.24,
    tail: 0.85,
    dorsal: 0.3,
    swimAmplitude: 0.07,
    ...STREAMLINED,
  },
  slender: {
    height: 0.22,
    thickness: 0.14,
    tail: 1.1,
    dorsal: 0.35,
    swimAmplitude: 0.09,
    ...STREAMLINED,
  },
  tall: {
    height: 0.78,
    thickness: 0.1,
    tail: 0.55,
    dorsal: 0.3,
    swimAmplitude: 0.04,
    anal: 0.25,
    banner: 0,
    ...REEF_DISC,
  },
  banner: {
    height: 0.8,
    thickness: 0.09,
    tail: 0.6,
    dorsal: 0.35,
    swimAmplitude: 0.04,
    anal: 0.35,
    banner: 1.1,
    ...REEF_DISC,
  },
};

const BODY_SEGMENTS = { width: 28, height: 16 } as const;
const FIN_SEGMENTS = 10;
const TAIL_FAN_SEGMENTS = 8;
/** Where the tail fin joins the body, along x. */
const TAIL_STEM = -0.42;

/** Height of the body profile at a point along it (0 = tail, 1 = nose), 0..1. */
function profileAt(proportions: BodyProportions, alongBody: number): number {
  if (proportions.profile === "torpedo") return Math.min(0.45 + alongBody * 0.95, 1.05);
  // Reef fish: a round disc that narrows to a pointed snout and a thin tail stem.
  const t = Math.min(Math.max(0.06 + 0.9 * alongBody, 0), 1);
  return Math.pow(Math.sin(Math.PI * t), 0.65);
}

/** Tapers the sphere into a fish, following the shape's profile. */
function shapeBody(proportions: BodyProportions): BufferGeometry {
  const body = new SphereGeometry(0.5, BODY_SEGMENTS.width, BODY_SEGMENTS.height).toNonIndexed();
  const positions = body.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const taper = profileAt(proportions, x + 0.5);
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

function forkedTail(proportions: BodyProportions): BufferGeometry {
  const half = (proportions.height / 2) * proportions.tail;
  // Forked tail: two triangles meeting at the tail stem.
  // prettier-ignore
  return flatPart([
    TAIL_STEM, 0, 0,   -0.66, half, 0,   -0.58, 0, 0,
    TAIL_STEM, 0, 0,   -0.58, 0, 0,      -0.66, -half, 0,
  ]);
}

/** Rounded fan tail of butterflyfish and angelfish. */
function fanTail(proportions: BodyProportions): BufferGeometry {
  const half = (proportions.height / 2) * proportions.tail;
  const reach = 0.18;
  const vertices: number[] = [];
  const point = (step: number): [number, number] => {
    const angle = (step / TAIL_FAN_SEGMENTS - 0.5) * Math.PI * 0.8;
    return [TAIL_STEM - reach * Math.cos(angle), half * Math.sin(angle) * 1.25];
  };
  for (let step = 0; step < TAIL_FAN_SEGMENTS; step += 1) {
    const [x0, y0] = point(step);
    const [x1, y1] = point(step + 1);
    vertices.push(TAIL_STEM, 0, 0, x0, y0, 0, x1, y1, 0);
  }
  return flatPart(vertices);
}

function forkedDorsal(proportions: BodyProportions): BufferGeometry {
  const top = proportions.height / 2;
  const fin = proportions.height * proportions.dorsal;
  return flatPart([0.12, top * 0.92, 0, -0.26, top * 0.6, 0, -0.08, top + fin, 0]);
}

/**
 * A soft fin along the back (side = 1) or belly (side = -1) between two
 * points along the body, highest towards the rear like a butterflyfish's.
 */
function softFin(
  proportions: BodyProportions,
  side: 1 | -1,
  from: number,
  to: number,
  finHeight: number,
): BufferGeometry {
  const vertices: number[] = [];
  const edge = (step: number): [number, number, number] => {
    const t = step / FIN_SEGMENTS;
    const x = from + (to - from) * t;
    const base = (proportions.height / 2) * profileAt(proportions, x + 0.5) * 0.9;
    const outer = base + finHeight * Math.pow(Math.sin(Math.PI * Math.min(t * 1.15, 1)), 0.6);
    return [x, side * base, side * outer];
  };
  for (let step = 0; step < FIN_SEGMENTS; step += 1) {
    const [x0, base0, outer0] = edge(step);
    const [x1, base1, outer1] = edge(step + 1);
    vertices.push(x0, base0, 0, x1, base1, 0, x0, outer0, 0);
    vertices.push(x1, base1, 0, x1, outer1, 0, x0, outer0, 0);
  }
  return flatPart(vertices);
}

/** The moorish idol's long filament, sweeping up and back from the dorsal fin. */
function bannerFin(proportions: BodyProportions): BufferGeometry {
  const top = (proportions.height / 2) * profileAt(proportions, 0.55);
  const rise = proportions.height * proportions.banner;
  // prettier-ignore
  return flatPart([
    0.1, top, 0,     -0.02, top, 0,       -0.18, top + rise * 0.6, 0,
    -0.02, top, 0,   -0.12, top + rise * 0.4, 0,   -0.18, top + rise * 0.6, 0,
    -0.12, top + rise * 0.4, 0,   -0.36, top + rise, 0,   -0.18, top + rise * 0.6, 0,
  ]);
}

/** Builds a one-body-length fish, nose towards +x, for the given shape. */
export function createFishGeometry(shape: Shape): BufferGeometry {
  const proportions = BODY_PROPORTIONS[shape];
  const reef = proportions.profile === "disc";
  const finHeight = proportions.height * proportions.dorsal;
  const parts = [
    shapeBody(proportions),
    proportions.tailShape === "fan" ? fanTail(proportions) : forkedTail(proportions),
    reef ? softFin(proportions, 1, 0.22, -0.4, finHeight) : forkedDorsal(proportions),
    ...(proportions.anal > 0
      ? [softFin(proportions, -1, 0.05, -0.4, proportions.height * proportions.anal)]
      : []),
    ...(proportions.banner > 0 ? [bannerFin(proportions)] : []),
  ];
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  merged.computeBoundingSphere();
  return merged;
}
