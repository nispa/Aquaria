import {
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  TubeGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rng } from "../core/rng";

/**
 * Procedural geometry for scenery: rocks, starfish, corals, shells and
 * anemone tentacles.
 * Every shape stands on y = 0 and fits a footprint about one unit wide, so the
 * layout's `size` (m) is simply its scale.
 */

const UP = new Vector3(0, 1, 0);
const FOOTPRINT = 1;

/** Stands the geometry on y = 0, centres it and shrinks it into the unit footprint. */
function fitFootprint(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return geometry;
  const center = box.getCenter(new Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  const widest = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  if (widest > FOOTPRINT)
    geometry.scale(FOOTPRINT / widest, FOOTPRINT / widest, FOOTPRINT / widest);
  geometry.computeVertexNormals();
  return geometry;
}

const BRAIN = {
  radius: 0.48,
  flatten: 0.7,
  /** Groove depth, as a fraction of the radius. */
  groove: 0.05,
  /** Groove frequency and meander. */
  frequency: 26,
  meander: 0.35,
  segments: { width: 96, height: 40 },
} as const;

/** A flattened dome covered in meandering grooves. */
export function brainCoralGeometry(rng: Rng): BufferGeometry {
  const geometry = new SphereGeometry(
    BRAIN.radius,
    BRAIN.segments.width,
    BRAIN.segments.height,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const [a, b] = [rng.range(0, 10), rng.range(0, 10)];
  const positions = geometry.getAttribute("position");
  const point = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const warp = BRAIN.meander * Math.sin(point.z * 9 + a) + 0.2 * Math.sin(point.y * 11 + b);
    const ridge = Math.abs(Math.sin(BRAIN.frequency * (point.x + warp)));
    // Grooves fade out at the rim so the dome meets the sand cleanly.
    const rim = Math.min(point.y / (BRAIN.radius * 0.25), 1);
    point.multiplyScalar(1 + BRAIN.groove * (ridge - 1) * rim);
    positions.setXYZ(index, point.x, Math.max(point.y * BRAIN.flatten, 0), point.z);
  }
  return fitFootprint(geometry);
}

interface BranchStyle {
  readonly levels: number;
  readonly children: readonly [number, number];
  /** Angle between a child and its parent, radians. */
  readonly spread: readonly [number, number];
  /** Child length relative to its parent. */
  readonly shrink: number;
  readonly trunk: { readonly length: number; readonly radius: number };
  /** Keep every branch in the x-y plane (sea fans). */
  readonly planar: boolean;
}

const STAGHORN: BranchStyle = {
  levels: 3,
  children: [2, 3],
  spread: [0.35, 0.8],
  shrink: 0.75,
  trunk: { length: 0.35, radius: 0.05 },
  planar: false,
};

const SEA_FAN: BranchStyle = {
  levels: 6,
  children: [2, 2],
  spread: [0.2, 0.5],
  shrink: 0.78,
  trunk: { length: 0.25, radius: 0.018 },
  planar: true,
};

const BRANCH_RADIAL_SEGMENTS = 6;
/** Branches taper to this fraction of their base radius. */
const BRANCH_TAPER = 0.7;

function branches(style: BranchStyle, rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const rotation = new Quaternion();
  const grow = (
    start: Vector3,
    direction: Vector3,
    length: number,
    radius: number,
    level: number,
  ): void => {
    const cylinder = new CylinderGeometry(
      radius * BRANCH_TAPER,
      radius,
      length,
      BRANCH_RADIAL_SEGMENTS,
    );
    cylinder.translate(0, length / 2, 0);
    rotation.setFromUnitVectors(UP, direction);
    cylinder.applyQuaternion(rotation);
    cylinder.translate(start.x, start.y, start.z);
    parts.push(cylinder);
    if (level >= style.levels) return;
    const end = start.clone().addScaledVector(direction, length);
    const count = rng.int(style.children[0], style.children[1]);
    for (let child = 0; child < count; child += 1) {
      const tilt = rng.range(style.spread[0], style.spread[1]);
      // Planar fans alternate left (+x) and right (-x) within the x-y plane.
      const azimuth = style.planar ? (child % 2) * Math.PI : rng.range(0, Math.PI * 2);
      const side = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
      const next = direction
        .clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(side, Math.sin(tilt));
      // Corals grow towards the light: never let a branch point downwards.
      next.y = Math.max(next.y, 0.15);
      grow(
        end,
        next.normalize(),
        length * style.shrink * rng.range(0.85, 1.1),
        radius * BRANCH_TAPER,
        level + 1,
      );
    }
  };
  grow(new Vector3(), UP.clone(), style.trunk.length, style.trunk.radius, 0);
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  return fitFootprint(merged);
}

/** Staghorn-like coral: a few thick, forking branches reaching up. */
export function branchCoralGeometry(rng: Rng): BufferGeometry {
  return branches(STAGHORN, rng);
}

/** Gorgonian sea fan: a flat lace of thin branches. */
export function fanCoralGeometry(rng: Rng): BufferGeometry {
  return branches(SEA_FAN, rng);
}

const SHELL = {
  /** Opening angle of the fan, radians. */
  opening: 1.9,
  dome: 0.14,
  ribs: 14,
  ribHeight: 0.018,
  segments: { radial: 10, angular: 48 },
} as const;

/** A scallop: a ribbed, domed fan with a wavy edge. */
export function shellGeometry(rng: Rng): BufferGeometry {
  const geometry = new PlaneGeometry(1, 1, SHELL.segments.angular, SHELL.segments.radial);
  const ribPhase = rng.range(0, Math.PI);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    // Plane coordinates in -0.5..0.5 become (angle, distance from the hinge).
    const angle = positions.getX(index) * SHELL.opening;
    const along = positions.getY(index) + 0.5;
    const rib = Math.abs(Math.sin(angle * SHELL.ribs + ribPhase));
    const radius = along * 0.5 * (1 + 0.03 * rib);
    const height = SHELL.dome * Math.pow(Math.sin(Math.PI * Math.min(along, 0.95)), 0.8);
    positions.setXYZ(
      index,
      radius * Math.sin(angle),
      height + SHELL.ribHeight * rib * along,
      radius * Math.cos(angle),
    );
  }
  return fitFootprint(geometry);
}

const TENTACLE = { tipRadius: 0.2, baseRadius: 0.5, radialSegments: 6, heightSegments: 6 };

/**
 * One anemone tentacle, one unit tall from y = 0 and one unit wide at the base;
 * instances scale it. The plant sway bends it by its height like a blade.
 */
export function anemoneTentacleGeometry(): BufferGeometry {
  const geometry = new CylinderGeometry(
    TENTACLE.tipRadius,
    TENTACLE.baseRadius,
    1,
    TENTACLE.radialSegments,
    TENTACLE.heightSegments,
  );
  geometry.translate(0, 0.5, 0);
  return geometry;
}

const ROCK_DETAIL = 5;

/** A lumpy, flattened icosahedron; the seed makes every variant different. */
export function rockGeometry(rng: Rng): BufferGeometry {
  // Finely divided so a surface material can displace it. Polyhedra come with
  // separate vertices per face: merge them, or displacement tears the rock open.
  const faceted = new IcosahedronGeometry(0.5, ROCK_DETAIL);
  faceted.deleteAttribute("normal");
  faceted.deleteAttribute("uv");
  const geometry = mergeVertices(faceted);
  faceted.dispose();
  const [a, b, c] = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const lump =
      1 +
      0.22 * Math.sin(x * 5 + a) * Math.sin(y * 4 + b) * Math.sin(z * 5 + c) +
      0.08 * Math.sin(x * 13 + b + y * 11);
    positions.setXYZ(index, x * lump, Math.max(y * lump * 0.65, -0.1), z * lump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const STARFISH = {
  arms: 5,
  /** Arm length and base radius, relative to a one-unit body. */
  armLength: [0.42, 0.5] as const,
  armRadius: 0.1,
  /** Radius left at the tip, as a fraction of the base radius. */
  tipRadius: 0.25,
  /** Arms are flatter than they are wide. */
  flatten: 0.55,
  /** Sideways bend of an arm, radians. */
  bend: 0.45,
  /** How far a tip curls up off the sand, relative to the arm length. */
  tipLift: [0, 0.12] as const,
  disc: { radius: 0.17, height: 0.5 },
  /** Knobbly tubercles on the upper side. */
  tubercles: { height: 0.14, along: 38, around: 5 },
  segments: { along: 28, around: 12 },
} as const;

/** One tapering, knobbly arm lying on the sand along +x, bent sideways. */
function starfishArm(rng: Rng): BufferGeometry {
  const length = rng.range(STARFISH.armLength[0], STARFISH.armLength[1]);
  const bend = rng.range(-STARFISH.bend, STARFISH.bend);
  const lift = rng.range(STARFISH.tipLift[0], STARFISH.tipLift[1]) * length;
  const points = Array.from({ length: 5 }, (_, index) => {
    const t = index / 4;
    // The bend grows along the arm; the tip may curl up off the sand.
    const angle = bend * t * t;
    return new Vector3(
      Math.cos(angle) * t * length,
      STARFISH.armRadius * STARFISH.flatten + lift * t * t * t,
      Math.sin(angle) * t * length,
    );
  });
  const curve = new CatmullRomCurve3(points);
  const { along, around } = STARFISH.segments;
  const geometry = new TubeGeometry(curve, along, STARFISH.armRadius, around, false);
  const positions = geometry.getAttribute("position");
  const center = new Vector3();
  const offset = new Vector3();
  const phase = rng.range(0, Math.PI * 2);
  for (let index = 0; index < positions.count; index += 1) {
    const ring = Math.floor(index / (around + 1));
    const aroundIndex = index % (around + 1);
    const t = ring / along;
    curve.getPointAt(t, center);
    offset.fromBufferAttribute(positions, index).sub(center);
    const taper = 1 - (1 - STARFISH.tipRadius) * Math.pow(t, 1.3);
    offset.multiplyScalar(taper);
    offset.y *= STARFISH.flatten;
    if (offset.y > 0) {
      // Rows of tubercles along the top: bumps only on the upper half.
      const bump =
        Math.max(Math.sin(t * STARFISH.tubercles.along + phase), 0) *
        Math.max(Math.cos((aroundIndex / around) * Math.PI * 2 * STARFISH.tubercles.around), 0);
      offset.multiplyScalar(1 + STARFISH.tubercles.height * bump);
    } else {
      // The underside rests flat on the sand.
      offset.y *= 0.4;
    }
    positions.setXYZ(index, center.x + offset.x, center.y + offset.y, center.z + offset.z);
  }
  return geometry;
}

/**
 * A sea star: a domed central disc with five tapering, knobbly arms, each
 * bent a little differently so no two look alike or like a drawn star.
 */
export function starfishGeometry(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const disc = new SphereGeometry(STARFISH.disc.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  disc.scale(1, STARFISH.disc.height, 1);
  parts.push(disc);
  const rotation = new Quaternion();
  for (let arm = 0; arm < STARFISH.arms; arm += 1) {
    const geometry = starfishArm(rng);
    const angle = (arm / STARFISH.arms) * Math.PI * 2 + rng.range(-0.12, 0.12);
    rotation.setFromAxisAngle(UP, angle);
    geometry.applyQuaternion(rotation);
    parts.push(geometry);
  }
  // Tube and sphere geometries share attributes (position, normal, uv): merge directly.
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  return fitFootprint(merged);
}
