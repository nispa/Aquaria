import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  PlaneGeometry,
  TubeGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
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
  /** Smallest upward component of a branch direction: corals reach up, wood sprawls. */
  readonly minRise: number;
  /** Direction of the first branch; straight up when absent. */
  readonly start?: readonly [number, number, number];
}

const STAGHORN: BranchStyle = {
  levels: 3,
  children: [2, 3],
  spread: [0.35, 0.8],
  shrink: 0.75,
  trunk: { length: 0.35, radius: 0.05 },
  planar: false,
  minRise: 0.15,
};

const SEA_FAN: BranchStyle = {
  levels: 6,
  children: [2, 2],
  spread: [0.2, 0.5],
  shrink: 0.78,
  trunk: { length: 0.25, radius: 0.018 },
  planar: true,
  minRise: 0.15,
};

/** Vertical squash applied to driftwood after it grows. */
const DRIFTWOOD_FLATTEN = 0.55;

/** Driftwood: a thick, gnarled root that sprawls sideways with a few forks. */
const DRIFTWOOD: BranchStyle = {
  levels: 3,
  children: [1, 3],
  spread: [0.35, 0.9],
  shrink: 0.72,
  trunk: { length: 0.55, radius: 0.07 },
  planar: false,
  minRise: 0.02,
  start: [0.85, 0.5, 0.1],
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
      next.y = Math.max(next.y, style.minRise);
      grow(
        end,
        next.normalize(),
        length * style.shrink * rng.range(0.85, 1.1),
        radius * BRANCH_TAPER,
        level + 1,
      );
    }
  };
  const start = style.start === undefined ? UP.clone() : new Vector3(...style.start).normalize();
  grow(new Vector3(), start, style.trunk.length, style.trunk.radius, 0);
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

/** Moves each vertex of `geometry` with `move`, then recomputes normals. */
function reshape(
  geometry: BufferGeometry,
  move: (point: Vector3, angle: number, radius: number) => void,
): BufferGeometry {
  const positions = geometry.getAttribute("position");
  const point = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    move(point, Math.atan2(point.z, point.x), Math.hypot(point.x, point.z));
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  parts.forEach((part) => {
    part.dispose();
  });
  return merged;
}

const TABLE = { stalk: 0.18, plate: 0.5, thickness: 0.04, cup: 0.06, lobes: 3 } as const;

/** Table coral: a wide, slightly cupped plate with a wavy rim on a short stalk. */
export function tableCoralGeometry(rng: Rng): BufferGeometry {
  const stalk = new CylinderGeometry(0.06, 0.09, TABLE.stalk, 10);
  stalk.translate(0, TABLE.stalk / 2, 0);
  const phase = rng.range(0, Math.PI * 2);
  const wobble = rng.range(0.12, 0.22);
  const plate = new CylinderGeometry(TABLE.plate, TABLE.plate * 0.9, TABLE.thickness, 56, 4);
  reshape(plate, (point, angle, radius) => {
    const rim = 1 - wobble + wobble * Math.sin(angle * TABLE.lobes + phase);
    point.x *= rim;
    point.z *= rim;
    point.y += TABLE.stalk + TABLE.cup * Math.pow(radius / TABLE.plate, 2);
  });
  return fitFootprint(mergeParts([stalk, plate]));
}

const MUSHROOM = { radius: 0.5, flatten: 0.16, ridges: 32, ridgeHeight: 0.02 } as const;

/** Mushroom coral: a low disc with fine radial ridges and a central mouth. */
export function mushroomCoralGeometry(rng: Rng): BufferGeometry {
  const geometry = new SphereGeometry(MUSHROOM.radius, 72, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const phase = rng.range(0, Math.PI * 2);
  reshape(geometry, (point, angle, radius) => {
    const outward = radius / MUSHROOM.radius;
    const ridge = Math.abs(Math.sin(angle * MUSHROOM.ridges + phase)) * outward;
    const mouth = Math.exp(-Math.pow(outward / 0.12, 2)) * 0.03;
    const rim = 1 + 0.06 * Math.sin(angle * 5 + phase);
    point.x *= rim;
    point.z *= rim;
    point.y = point.y * MUSHROOM.flatten + ridge * MUSHROOM.ridgeHeight - mouth;
  });
  return fitFootprint(geometry);
}

const LEATHER = { stalk: 0.35, cap: 0.5, capHeight: 0.25, folds: 7, foldHeight: 0.07 } as const;

/** Leather (toadstool) coral: a thick stalk under a broad, folded cap. */
export function leatherCoralGeometry(rng: Rng): BufferGeometry {
  const stalk = new CylinderGeometry(0.12, 0.16, LEATHER.stalk, 14);
  stalk.translate(0, LEATHER.stalk / 2, 0);
  const cap = new SphereGeometry(LEATHER.cap, 56, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const phase = rng.range(0, Math.PI * 2);
  reshape(cap, (point, angle, radius) => {
    const outward = radius / LEATHER.cap;
    const fold = Math.sin(angle * LEATHER.folds + phase) * Math.pow(outward, 3);
    point.y = LEATHER.stalk * 0.9 + point.y * LEATHER.capHeight * 2 + fold * LEATHER.foldHeight;
  });
  return fitFootprint(mergeParts([stalk, cap]));
}

const BUSH = {
  stems: [7, 10] as const,
  leavesPerStem: 12,
  leafSize: [0.035, 0.06] as const,
  lean: 0.35,
} as const;

/**
 * A bushy macroalga (grape-like Caulerpa): curved stems crowded with small
 * round leaves. One unit tall from y = 0 so the plant sway can bend it.
 */
export function algaeBushGeometry(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const stemCount = rng.int(BUSH.stems[0], BUSH.stems[1]);
  for (let stem = 0; stem < stemCount; stem += 1) {
    const height = rng.range(0.6, 1);
    const azimuth = rng.range(0, Math.PI * 2);
    const lean = rng.range(0.1, BUSH.lean);
    const along = (t: number): Vector3 =>
      new Vector3(Math.cos(azimuth) * lean * t * t, height * t, Math.sin(azimuth) * lean * t * t);
    const curve = new CatmullRomCurve3([0, 0.33, 0.66, 1].map(along));
    parts.push(new TubeGeometry(curve, 8, 0.012, 5, false).toNonIndexed());
    for (let leaf = 0; leaf < BUSH.leavesPerStem; leaf += 1) {
      const t = 0.15 + (0.85 * (leaf + 0.5)) / BUSH.leavesPerStem;
      const blob = new IcosahedronGeometry(rng.range(BUSH.leafSize[0], BUSH.leafSize[1]), 0);
      const center = curve.getPointAt(t);
      blob.scale(1, 0.8, 1);
      blob.translate(
        center.x + rng.range(-0.04, 0.04),
        center.y,
        center.z + rng.range(-0.04, 0.04),
      );
      // Polyhedra are already non-indexed, like the tubes after toNonIndexed().
      parts.push(blob);
    }
  }
  const merged = mergeParts(parts);
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  if (box !== null) {
    merged.translate(0, -box.min.y, 0);
    merged.scale(1, 1 / (box.max.y - box.min.y), 1);
  }
  merged.computeVertexNormals();
  return merged;
}

/** Driftwood: a gnarled root sprawling sideways, for planted aquariums. */
export function driftwoodGeometry(rng: Rng): BufferGeometry {
  // Wood lies on the substrate: flatten the forks towards the ground.
  const geometry = branches(DRIFTWOOD, rng);
  geometry.scale(1, DRIFTWOOD_FLATTEN, 1);
  geometry.computeVertexNormals();
  return geometry;
}

const DRAGON = {
  radius: [0.34, 0.2] as const,
  height: 1.5,
  ridges: 9,
  ridgeDepth: 0.22,
  jag: 0.35,
  lean: 0.25,
  crownStart: 0.6,
  crownSectors: 6,
} as const;

/**
 * Dragon (Seiryu) stone: a tall, deeply grooved spire with a jagged crown,
 * the centrepiece of Iwagumi aquascapes.
 */
export function dragonStoneGeometry(rng: Rng): BufferGeometry {
  const geometry = new CylinderGeometry(DRAGON.radius[1], DRAGON.radius[0], DRAGON.height, 40, 24);
  geometry.translate(0, DRAGON.height / 2, 0);
  const phase = rng.range(0, 6);
  const twist = rng.range(-1, 1);
  const lean = rng.range(-1, 1) * DRAGON.lean;
  const crowns = Array.from({ length: DRAGON.crownSectors }, () => rng.range(1 - DRAGON.jag, 1));
  reshape(geometry, (point, angle) => {
    const up = point.y / DRAGON.height;
    const ridge = Math.abs(Math.sin(angle * DRAGON.ridges + up * twist * 3 + phase));
    const groove = 1 - DRAGON.ridgeDepth * ridge;
    point.x *= groove;
    point.z *= groove;
    // A jagged crown: above crownStart each sector of the top stops at its own height.
    if (up > DRAGON.crownStart) {
      const turn = (angle + Math.PI) / (Math.PI * 2);
      const sector = Math.floor(turn * DRAGON.crownSectors) % DRAGON.crownSectors;
      const above = (up - DRAGON.crownStart) * (crowns[sector] ?? 1);
      point.y = (DRAGON.crownStart + above) * DRAGON.height;
    }
    point.x += lean * point.y * 0.3;
  });
  return fitFootprint(geometry);
}

const MOSS = { flatten: 0.5, fuzz: 0.05, frequency: 40 } as const;

/** A moss cushion: a soft, fuzzy green dome. */
export function mossCushionGeometry(rng: Rng): BufferGeometry {
  const geometry = new SphereGeometry(0.5, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const a = rng.range(0, 10);
  const b = rng.range(0, 10);
  reshape(geometry, (point) => {
    const wave =
      Math.sin(point.x * MOSS.frequency + a) *
      Math.sin(point.z * MOSS.frequency + b) *
      Math.sin(point.y * MOSS.frequency);
    point.multiplyScalar(1 + MOSS.fuzz * wave);
    point.y = Math.max(point.y * MOSS.flatten, 0);
  });
  return fitFootprint(geometry);
}

/** A smooth, flattened river pebble. */
export function pebbleGeometry(rng: Rng): BufferGeometry {
  const faceted = new IcosahedronGeometry(0.5, 2);
  faceted.deleteAttribute("normal");
  faceted.deleteAttribute("uv");
  const geometry = mergeVertices(faceted);
  faceted.dispose();
  geometry.scale(1, rng.range(0.3, 0.5), rng.range(0.7, 1));
  return fitFootprint(geometry);
}

const FROND = { leaflets: 16, leafletLength: 0.22, leafletWidth: 0.035, stem: 0.008 } as const;

function flatLeaf(vertices: readonly number[]): BufferGeometry {
  const leaf = new BufferGeometry();
  leaf.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  leaf.setAttribute(
    "uv",
    new Float32BufferAttribute(new Array<number>((vertices.length / 3) * 2).fill(0.5), 2),
  );
  leaf.computeVertexNormals();
  return leaf;
}

/**
 * A fern frond, one unit tall from y = 0: a thin stem with paired leaflets
 * that shorten towards the tip. Instances splay several into a fern.
 */
export function fernFrondGeometry(rng: Rng): BufferGeometry {
  const stem = new CylinderGeometry(FROND.stem * 0.5, FROND.stem, 1, 4).toNonIndexed();
  stem.translate(0, 0.5, 0);
  const parts: BufferGeometry[] = [stem];
  const droop = rng.range(0.1, 0.3);
  for (let leaflet = 0; leaflet < FROND.leaflets; leaflet += 1) {
    const t = 0.12 + (0.86 * leaflet) / FROND.leaflets;
    const length = FROND.leafletLength * Math.sin(Math.PI * Math.min(t + 0.1, 1)) + 0.03;
    for (const side of [1, -1]) {
      const tip = side * length;
      const tipY = t + length * (0.35 - droop);
      // A thin diamond leaflet angled up and out from the stem.
      // prettier-ignore
      parts.push(flatLeaf([
        0, t, 0,   tip * 0.5, t + FROND.leafletWidth + length * 0.2, 0,   tip, tipY, 0,
        0, t, 0,   tip, tipY, 0,   tip * 0.5, t - FROND.leafletWidth + length * 0.1, 0,
      ]));
    }
  }
  return unitTall(mergeParts(parts));
}

const STEM = {
  stems: [3, 6] as const,
  whorlSpacing: 0.07,
  leavesPerWhorl: 4,
  leaf: 0.06,
  spread: 0.08,
} as const;

/**
 * An upright stem plant (Rotala, Ludwigia), one unit tall from y = 0: a few
 * stems with whorls of small leaves. The plant shader can tint the tips.
 */
export function stemPlantGeometry(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const stemCount = rng.int(STEM.stems[0], STEM.stems[1]);
  for (let stem = 0; stem < stemCount; stem += 1) {
    const height = rng.range(0.7, 1);
    const baseX = rng.range(-STEM.spread, STEM.spread);
    const baseZ = rng.range(-STEM.spread, STEM.spread);
    const leanX = rng.range(-STEM.spread, STEM.spread);
    const leanZ = rng.range(-STEM.spread, STEM.spread);
    const tube = new CylinderGeometry(0.006, 0.009, height, 4).toNonIndexed();
    tube.translate(baseX, height / 2, baseZ);
    parts.push(tube);
    for (let y = STEM.whorlSpacing; y < height; y += STEM.whorlSpacing) {
      const turn = rng.range(0, Math.PI);
      const along = y / height;
      for (let leaf = 0; leaf < STEM.leavesPerWhorl; leaf += 1) {
        const angle = turn + (leaf / STEM.leavesPerWhorl) * Math.PI * 2;
        // Polyhedra are non-indexed, like the stems after toNonIndexed().
        const blade = new IcosahedronGeometry(STEM.leaf, 0);
        blade.scale(1, 0.12, 0.35);
        blade.rotateZ(0.35);
        blade.rotateY(-angle);
        blade.translate(
          baseX + leanX * along + Math.cos(angle) * STEM.leaf * 0.8,
          y,
          baseZ + leanZ * along + Math.sin(angle) * STEM.leaf * 0.8,
        );
        parts.push(blade);
      }
    }
  }
  return unitTall(mergeParts(parts));
}

/** Stands a plant on y = 0 and scales it to exactly one unit tall. */
function unitTall(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box !== null) {
    geometry.translate(0, -box.min.y, 0);
    geometry.scale(1, 1 / (box.max.y - box.min.y), 1);
  }
  geometry.computeVertexNormals();
  return geometry;
}
