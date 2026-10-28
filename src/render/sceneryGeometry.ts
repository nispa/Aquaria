import { IcosahedronGeometry, PlaneGeometry, Vector3, type BufferGeometry } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rng } from "../core/rng";

/**
 * Procedural geometry for the scenery still drawn in code: rocks, shells and
 * pebbles. Plants and corals are models made in Blender.
 * Every shape stands on y = 0 and fits a footprint about one unit wide, so the
 * layout's `size` (m) is simply its scale.
 */

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
