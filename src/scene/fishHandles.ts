import type { FishRecipe } from "./fishRecipe";
import { bodyEnds, outlineHeight, type SidePoint } from "./fishOutline";

/**
 * The points of a fish recipe the fish maker page lets you drag on its side
 * view: the body's outline, the eye, the gill cover's edge, each fin's
 * outline and where it starts, ends or grows from. Moving one gives a new
 * recipe; the one given stays as it was.
 */
export interface Handle {
  /** Which point: "body.top.3", "eye", "fin.dorsal.outline.2", "fin.pectoral.root"… */
  readonly id: string;
  readonly at: SidePoint;
  /** What it shapes, for its color on the page. */
  readonly kind: "body" | "eye" | "gill" | "fin";
  /** Moves along x only (where a fin starts or ends along the body, the tail's base, the gill edge). */
  readonly alongX?: boolean;
}

/** Closest two points of an outline may come along x, so it keeps running from the snout back. */
const MIN_GAP = 0.005;
/** How far inside the outline a fin along it grows, as in fishOutline. */
const FIN_INSET = 0.006;

type Fin = FishRecipe["fins"][number];

function finHandles(recipe: FishRecipe, fin: Fin): Handle[] {
  const prefix = `fin.${fin.id}`;
  const outline = (points: readonly SidePoint[]): Handle[] =>
    points.map((at, index) => ({ id: `${prefix}.outline.${String(index)}`, at, kind: "fin" }));
  switch (fin.type) {
    case "body": {
      const height = (x: number): number => {
        const edge = outlineHeight(fin.upper ? recipe.body.top : recipe.body.bottom, x);
        return fin.upper ? edge - FIN_INSET : edge + FIN_INSET;
      };
      return [
        ...outline(fin.outline),
        { id: `${prefix}.start`, at: [fin.start, height(fin.start)], kind: "fin", alongX: true },
        { id: `${prefix}.end`, at: [fin.end, height(fin.end)], kind: "fin", alongX: true },
      ];
    }
    case "tail":
      return [
        ...outline(fin.outline),
        {
          id: `${prefix}.root`,
          at: [bodyEnds(recipe).peduncle + fin.root, 0],
          kind: "fin",
          alongX: true,
        },
      ];
    case "pectoral":
      return [{ id: `${prefix}.root`, at: fin.root, kind: "fin" }];
    case "pelvic":
      return [{ id: `${prefix}.root`, at: [fin.root[0], fin.root[2]], kind: "fin" }];
    case "filament":
      return fin.points.left.map(([x, , z], index) => ({
        id: `${prefix}.points.${String(index)}`,
        at: [x, z],
        kind: "fin",
      }));
  }
}

/** Every point the page lets you drag. */
export function recipeHandles(recipe: FishRecipe): Handle[] {
  const outline = (side: "top" | "bottom"): Handle[] =>
    recipe.body[side].map((at, index) => ({
      id: `body.${side}.${String(index)}`,
      at,
      kind: "body",
    }));
  const { gills } = recipe;
  return [
    ...outline("top"),
    ...outline("bottom"),
    { id: "eye", at: [recipe.eye.x, recipe.eye.z], kind: "eye" },
    ...(gills === undefined
      ? []
      : [
          {
            id: "gills",
            at: [gills.edge, (gills.top + gills.bottom) / 2] as SidePoint,
            kind: "gill" as const,
            alongX: true,
          },
        ]),
    ...recipe.fins.flatMap((fin) => finHandles(recipe, fin)),
  ];
}

/** x kept between its neighbours on an outline that runs from the snout (largest x) back. */
function between(points: readonly SidePoint[], index: number, x: number): number {
  const before = points[index - 1];
  const after = points[index + 1];
  const highest = before === undefined ? Infinity : before[0] - MIN_GAP;
  const lowest = after === undefined ? -Infinity : after[0] + MIN_GAP;
  return Math.min(Math.max(x, lowest), highest);
}

function moveFin(recipe: FishRecipe, fin: Fin, part: readonly string[], [x, z]: SidePoint): void {
  const [what, which] = part;
  const index = Number(which);
  switch (fin.type) {
    case "body":
      if (what === "outline") fin.outline[index] = [x, z];
      if (what === "start") fin.start = x;
      if (what === "end") fin.end = x;
      return;
    case "tail":
      if (what === "outline") fin.outline[index] = [x, z];
      if (what === "root") fin.root = x - bodyEnds(recipe).peduncle;
      return;
    case "pectoral":
      fin.root = [x, z];
      return;
    case "pelvic":
      fin.root = [x, fin.root[1], z];
      return;
    case "filament":
      for (const points of [fin.points.left, fin.points.right]) {
        const point = points[index];
        if (point !== undefined) points[index] = [x, point[1], z];
      }
      return;
  }
}

/** The recipe with one handle moved to `to` (side-view x, z); the one given is left untouched. */
export function moveHandle(recipe: FishRecipe, handle: Handle, to: SidePoint): FishRecipe {
  const next = structuredClone(recipe);
  const [x, z] = handle.alongX === true ? [to[0], handle.at[1]] : to;
  const [group, ...part] = handle.id.split(".");
  if (group === "body") {
    const side = part[0] === "top" ? next.body.top : next.body.bottom;
    const index = Number(part[1]);
    side[index] = [between(side, index, x), z];
  } else if (group === "eye") {
    next.eye.x = x;
    next.eye.z = z;
  } else if (group === "gills" && next.gills !== undefined) {
    next.gills.edge = x;
  } else if (group === "fin") {
    const [id, ...rest] = part;
    const fin = next.fins.find((each) => each.id === id);
    if (fin !== undefined) moveFin(next, fin, rest, [x, z]);
  }
  return next;
}
