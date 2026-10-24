import type { FishRecipe } from "./fishRecipe";

/**
 * A fish recipe seen from the side, for the fish maker page: the body's
 * outline and each fin's, as polygons of (x, z) points in body lengths,
 * traced as `scripts/blender/fishkit.py` builds them (the same curves, in
 * two dimensions). Drawing only: Blender builds the real fish.
 */

export type SidePoint = readonly [number, number];
type Fin = FishRecipe["fins"][number];

/** How far inside the outline a fin along the top or bottom grows, as fishkit's Body.edge. */
const FIN_INSET = 0.006;
/** Chaikin passes that round a traced fin outline, as fishkit's `rounded`. */
const ROUNDING_PASSES = 3;
/** Points along each curve drawn. */
const SAMPLES = 64;
/** A fan's roundness when the recipe sets none, as fishkit's `fan_edge`. */
const DEFAULT_FAN_ROUNDNESS = 0.45;
const DEGREES = Math.PI / 180;

/**
 * The height of a traced outline at x: a Catmull-Rom curve through its
 * points, which run from the snout (largest x) back; flat beyond its ends.
 */
export function outlineHeight(points: readonly SidePoint[], x: number): number {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, p1] = points[index] ?? [0, 0];
    const [x2, p2] = points[index + 1] ?? [0, 0];
    if (x1 >= x && x >= x2) {
      const p0 = (points[Math.max(index - 1, 0)] ?? [0, 0])[1];
      const p3 = (points[Math.min(index + 2, points.length - 1)] ?? [0, 0])[1];
      const t = (x1 - x) / (x1 - x2);
      return (
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
      );
    }
  }
  const last = points[points.length - 1] ?? [0, 0];
  const first = points[0] ?? [0, 0];
  return x < last[0] ? last[1] : first[1];
}

/** Chaikin's corner cutting: a smooth outline through the corners, its ends kept. */
export function rounded(points: readonly SidePoint[], passes = ROUNDING_PASSES): SidePoint[] {
  let current = [...points];
  for (let pass = 0; pass < passes; pass += 1) {
    const first = current[0];
    const last = current[current.length - 1];
    if (first === undefined || last === undefined) return current;
    const smooth: SidePoint[] = [first];
    for (let index = 0; index < current.length - 1; index += 1) {
      const [ax, az] = current[index] ?? first;
      const [bx, bz] = current[index + 1] ?? last;
      smooth.push([ax + (bx - ax) * 0.25, az + (bz - az) * 0.25]);
      smooth.push([ax + (bx - ax) * 0.75, az + (bz - az) * 0.75]);
    }
    smooth.push(last);
    current = smooth;
  }
  return current;
}

const samples = (from: number, to: number): number[] =>
  Array.from({ length: SAMPLES + 1 }, (_, index) => from + ((to - from) * index) / SAMPLES);

/** Where the body ends: its snout and the caudal peduncle, from the top outline. */
export function bodyEnds(recipe: FishRecipe): {
  readonly snout: number;
  readonly peduncle: number;
} {
  const { top } = recipe.body;
  return { snout: top[0]?.[0] ?? 0, peduncle: top[top.length - 1]?.[0] ?? 0 };
}

/** The body's outline: along the top from the snout back, then along the bottom forward. */
export function bodyOutline(recipe: FishRecipe): SidePoint[] {
  const { snout, peduncle } = bodyEnds(recipe);
  const xs = samples(snout, peduncle);
  const top = xs.map((x): SidePoint => [x, outlineHeight(recipe.body.top, x)]);
  const bottom = xs.map((x): SidePoint => [x, outlineHeight(recipe.body.bottom, x)]);
  return [...top, ...bottom.reverse()];
}

/** A point on the body's outline at x, a hair inside it, where a fin along it grows. */
function bodyEdge(recipe: FishRecipe, x: number, upper: boolean): SidePoint {
  const height = outlineHeight(upper ? recipe.body.top : recipe.body.bottom, x);
  return [x, upper ? height - FIN_INSET : height + FIN_INSET];
}

/** A fan's edge from its lowest ray (u = 0) to its highest, as fishkit's `fan_edge`. */
function fanEdge(
  root: SidePoint,
  length: number,
  [top, bottom]: readonly [number, number],
  roundness: number,
  u: number,
): SidePoint {
  const angle = (bottom + (top - bottom) * u) * DEGREES;
  const reach = length * (1 - roundness + roundness * Math.sin(Math.PI * u));
  return [root[0] - Math.cos(angle) * reach, root[1] + Math.sin(angle) * reach];
}

const unit = (): number[] => samples(0, 1);

/** One fin's outline (for a pair, the left one), closed. */
export function finOutline(recipe: FishRecipe, fin: Fin): SidePoint[] {
  switch (fin.type) {
    case "body": {
      const start = bodyEdge(recipe, fin.start, fin.upper);
      const end = bodyEdge(recipe, fin.end, fin.upper);
      const edge = rounded([start, ...fin.outline, end]);
      const base = samples(fin.end, fin.start).map((x) => bodyEdge(recipe, x, fin.upper));
      return [...edge, ...base];
    }
    case "tail": {
      const rootX = bodyEnds(recipe).peduncle + fin.root;
      const half = fin.baseHeight / 2;
      return [...rounded(fin.outline), [rootX, -half], [rootX, half]];
    }
    case "pectoral": {
      const [dx, dz] = fin.base;
      const roundness = fin.roundness ?? DEFAULT_FAN_ROUNDNESS;
      const base = unit().map((u): SidePoint => [
        fin.root[0] + dx * u,
        fin.root[1] + dz * (u - 0.5),
      ]);
      const edge = unit()
        .reverse()
        .map((u) => fanEdge(fin.root, fin.length, fin.angles, roundness, u));
      return [...base, ...edge];
    }
    case "pelvic": {
      const root: SidePoint = [fin.root[0], fin.root[2]];
      const [dx, dz] = fin.base;
      const base = unit().map((u): SidePoint => [root[0] + dx * u, root[1] + dz * u]);
      const edgeAt = (u: number): SidePoint => {
        if ("fan" in fin.edge) {
          const { length, angles, roundness } = fin.edge.fan;
          return fanEdge(root, length, angles, roundness ?? DEFAULT_FAN_ROUNDNESS, u);
        }
        const [[x0, z0], [x1, z1]] = fin.edge.line;
        return [root[0] + x0 + (x1 - x0) * u, root[1] + z0 + (z1 - z0) * u];
      };
      return [...base, ...unit().reverse().map(edgeAt)];
    }
    case "filament": {
      const path = rounded(fin.points.left.map(([x, , z]): SidePoint => [x, z]));
      const [start, end] = fin.width;
      const last = Math.max(path.length - 1, 1);
      const back = path.map(([x, z], index): SidePoint => {
        const u = index / last;
        return [x - (start * (1 - u) + end), z];
      });
      return [...path, ...back.reverse()];
    }
  }
}
