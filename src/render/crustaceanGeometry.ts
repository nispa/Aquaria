import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ProceduralCrustaceanBody } from "../scene/schema";

export type CrustaceanShape = ProceduralCrustaceanBody["shape"];

export interface CrustaceanProportions {
  readonly height: number;
  readonly thickness: number;
  readonly rostrumLength: number;
  readonly antennaeLength: number;
}

export const CRUSTACEAN_PROPORTIONS: Readonly<Record<CrustaceanShape, CrustaceanProportions>> = {
  shrimp: {
    height: 0.24,
    thickness: 0.16,
    rostrumLength: 0.18,
    antennaeLength: 0.45,
  },
  crab: {
    height: 0.22,
    thickness: 0.45,
    rostrumLength: 0.05,
    antennaeLength: 0.12,
  },
  "hermit-crab": {
    height: 0.3,
    thickness: 0.35,
    rostrumLength: 0.06,
    antennaeLength: 0.15,
  },
  starfish: {
    height: 0.1,
    thickness: 1,
    rostrumLength: 0,
    antennaeLength: 0,
  },
};

const STAR_ARMS = 5;
/** Points along each arm, from the middle out to the tip. */
const STAR_STEPS = 8;
/** Half the width of an arm at its root, and how high its ridge stands there, body lengths. */
const STAR_ARM_WIDTH = 0.11;
const STAR_RIDGE = 0.09;
/** Arms stiff near the middle, bending more towards their tips: their aFin. */
const STAR_BEND = 1.5;

const CARAPACE_SEGMENTS = { width: 16, height: 12 } as const;
const ABDOMEN_SEGMENTS = 5;

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

/** Marks every vertex of a part as carapace/body (0) or flexible limb/antennae/tail (1). */
function marked(part: BufferGeometry, limb: 0 | 1): BufferGeometry {
  const count = part.getAttribute("position").count;
  part.setAttribute("aFin", new Float32BufferAttribute(new Array<number>(count).fill(limb), 1));
  return part;
}

/** Carapace: front half of the shrimp, tapering towards the head at +x. */
function buildCarapace(proportions: CrustaceanProportions): BufferGeometry {
  const geom = new SphereGeometry(
    0.5,
    CARAPACE_SEGMENTS.width,
    CARAPACE_SEGMENTS.height,
  ).toNonIndexed();
  const positions = geom.getAttribute("position");
  // Centre carapace around x = 0.12, length ~0.45
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);

    // Taper forward and slightly flatten on sides
    const taper = Math.max(0.2, 1 - (x + 0.5) * 0.4);
    positions.setXYZ(
      index,
      x * 0.45 + 0.12,
      y * proportions.height * taper + 0.02,
      z * proportions.thickness * taper,
    );
  }
  geom.computeVertexNormals();
  return geom;
}

/** Rostrum: sharp serrated horn at the front tip pointing +x. */
function buildRostrum(proportions: CrustaceanProportions): BufferGeometry {
  const startX = 0.32;
  const tipX = startX + proportions.rostrumLength;
  const tipY = 0.06;
  const baseH = 0.035;
  // Triangular blade
  // prettier-ignore
  return flatPart([
    startX, 0.02, 0,          tipX, tipY, 0,           startX, 0.02 + baseH, 0,
    startX, 0.02, 0,          startX, 0.02 + baseH, 0, tipX, tipY, 0,
  ]);
}

/** Abdomen: segmented tail curling slightly downwards towards -x. */
function buildAbdomen(proportions: CrustaceanProportions): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const startX = -0.1;
  const segmentLength = 0.07;

  for (let i = 0; i < ABDOMEN_SEGMENTS; i += 1) {
    const t = i / ABDOMEN_SEGMENTS;
    const segGeom = new SphereGeometry(0.5, 12, 8).toNonIndexed();
    const pos = segGeom.getAttribute("position");
    const cx = startX - i * segmentLength;
    // Arching downwards
    const cy = -0.01 - Math.sin(t * Math.PI * 0.6) * 0.08;
    const scale = 1 - t * 0.45;

    for (let index = 0; index < pos.count; index += 1) {
      pos.setXYZ(
        index,
        pos.getX(index) * segmentLength * 1.5 + cx,
        pos.getY(index) * proportions.height * 0.85 * scale + cy,
        pos.getZ(index) * proportions.thickness * 0.85 * scale,
      );
    }
    segGeom.computeVertexNormals();
    parts.push(segGeom);
  }

  const merged = mergeGeometries(parts);
  parts.forEach((p) => {
    p.dispose();
  });
  return merged;
}

/** Tail fan (telson + uropods) at the rear tip of the abdomen. */
function buildTailFan(): BufferGeometry {
  const stemX = -0.44;
  const stemY = -0.08;
  const reach = 0.12;
  const halfSpread = 0.08;

  // 3 fan leaves
  // prettier-ignore
  return flatPart([
    // Central telson
    stemX, stemY, 0,                stemX - reach, stemY - 0.02, 0,       stemX - reach * 0.9, stemY + 0.01, 0,
    // Left uropod
    stemX, stemY, 0,                stemX - reach * 0.85, stemY - 0.01, halfSpread, stemX - reach, stemY - 0.02, 0,
    // Right uropod
    stemX, stemY, 0,                stemX - reach, stemY - 0.02, 0,       stemX - reach * 0.85, stemY - 0.01, -halfSpread,
  ]);
}

/** Long antennae sweeping backwards and outward from the rostrum base. */
function buildAntennae(proportions: CrustaceanProportions): BufferGeometry {
  const rootX = 0.28;
  const rootY = 0.04;
  const len = proportions.antennaeLength;
  const spread = 0.12;

  // Left & right primary long antennae
  // prettier-ignore
  return flatPart([
    rootX, rootY, 0.02,             rootX + 0.08, rootY + 0.05, spread * 0.5,   rootX - len * 0.7, rootY + 0.15, spread,
    rootX, rootY, -0.02,            rootX - len * 0.7, rootY + 0.15, -spread,   rootX + 0.08, rootY + 0.05, -spread * 0.5,
  ]);
}

/** Walking legs (pereiopods) under the cephalothorax. */
function buildLegs(proportions: CrustaceanProportions): BufferGeometry {
  const legVertices: number[] = [];
  const legCount = 4;

  for (let i = 0; i < legCount; i += 1) {
    const lx = 0.22 - i * 0.06;
    const topY = -0.03;
    const midY = topY - 0.05;
    const footY = topY - 0.09;
    const zOffset = proportions.thickness * 0.35;

    // Left leg
    legVertices.push(
      lx,
      topY,
      zOffset,
      lx + 0.02,
      midY,
      zOffset + 0.04,
      lx + 0.01,
      footY,
      zOffset + 0.03,
    );
    // Right leg
    legVertices.push(
      lx,
      topY,
      -zOffset,
      lx + 0.01,
      footY,
      -(zOffset + 0.03),
      lx + 0.02,
      midY,
      -(zOffset + 0.04),
    );
  }

  return flatPart(legVertices);
}

/**
 * A starfish: five arms spreading flat from the middle, one body length
 * across, each with a rounded ridge along its back, tapering to its tip. Its
 * arms bend more towards their tips (aFin from 0 in the middle to 1).
 */
function buildStarfish(): BufferGeometry {
  const positions: number[] = [];
  const fins: number[] = [];
  const point = (x: number, y: number, z: number, reach: number): void => {
    positions.push(x, y, z);
    fins.push(Math.min(reach / 0.5, 1) ** STAR_BEND);
  };
  for (let arm = 0; arm < STAR_ARMS; arm += 1) {
    const angle = (arm / STAR_ARMS) * Math.PI * 2;
    const along = [Math.cos(angle), Math.sin(angle)] as const;
    const across = [-Math.sin(angle), Math.cos(angle)] as const;
    // Each slice of the arm: its left edge, its ridge and its right edge on top, one point below.
    const slice = (step: number): number[][] => {
      const reach = (step / STAR_STEPS) * 0.5;
      const taper = 1 - (step / STAR_STEPS) * 0.8;
      const half = STAR_ARM_WIDTH * taper;
      const ridge = STAR_RIDGE * taper;
      const at = (side: number, height: number): number[] => [
        along[0] * reach + across[0] * side,
        height,
        along[1] * reach + across[1] * side,
        reach,
      ];
      return [at(-half, ridge * 0.15), at(0, ridge), at(half, ridge * 0.15), at(0, 0)];
    };
    for (let step = 0; step < STAR_STEPS; step += 1) {
      const [nearLeft, nearRidge, nearRight, nearBelow] = slice(step);
      const [farLeft, farRidge, farRight, farBelow] = slice(step + 1);
      const quads = [
        [nearLeft, farLeft, farRidge, nearRidge],
        [nearRidge, farRidge, farRight, nearRight],
        [nearRight, farRight, farBelow, nearBelow],
        [nearBelow, farBelow, farLeft, nearLeft],
      ];
      for (const [a, b, c, d] of quads) {
        for (const corner of [a, b, c, a, c, d]) {
          const [x = 0, y = 0, z = 0, reach = 0] = corner ?? [];
          point(x, y, z, reach);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Array<number>((positions.length / 3) * 2).fill(0), 2),
  );
  geometry.setAttribute("aFin", new Float32BufferAttribute(fins, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Builds procedural geometry for the bottom walkers (shrimp, crab, hermit crab, starfish). */
export function createCrustaceanGeometry(shape: CrustaceanShape): BufferGeometry {
  if (shape === "starfish") return buildStarfish();
  const proportions = CRUSTACEAN_PROPORTIONS[shape];

  // Currently detailed for shrimp; crabs will specialize accordingly
  const carapace = buildCarapace(proportions);
  const rostrum = buildRostrum(proportions);
  const abdomen = buildAbdomen(proportions);
  const tailFan = buildTailFan();
  const antennae = buildAntennae(proportions);
  const legs = buildLegs(proportions);

  const parts = [
    marked(carapace, 0),
    marked(rostrum, 0),
    marked(abdomen, 0),
    marked(tailFan, 1),
    marked(antennae, 1),
    marked(legs, 1),
  ];

  const merged = mergeGeometries(parts);
  parts.forEach((p) => {
    p.dispose();
  });
  merged.computeBoundingSphere();
  return merged;
}
