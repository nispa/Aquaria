import type { Rng } from "../core/rng";
import { floraEntryFor, propEntryFor } from "./objectEntries";
import type { ObjectManifest } from "./objectManifest";
import { MAX_FLORA_PER_ENTRY, MAX_PROPS_PER_ENTRY, type FloraSpec, type PropSpec } from "./schema";

/**
 * Editing a scene's plants and objects, as the scene editor does: placing
 * one at a spot, moving, turning, resizing and removing it, and letting
 * items fall when the blocks under them go. Pure: each edit returns new
 * entries. An entry whose items were drawn at random becomes an entry of
 * chosen spots (`at`) the first time one of its items is touched, keeping
 * every item where it stood.
 */

export interface Scenery {
  readonly flora: readonly FloraSpec[];
  readonly props: readonly PropSpec[];
}

/** One item: its entry in a section, and its place among the entry's items. */
export interface ItemRef {
  readonly section: "flora" | "props";
  readonly entry: number;
  readonly item: number;
}

/** A chosen spot, as the scene format writes it (see the scene's `at`). */
export interface Spot {
  readonly x: number;
  readonly z: number;
  /** Height above the sand, m; absent: on the rock under it, or the sand. */
  readonly y?: number | undefined;
  /** Degrees. */
  readonly rotation?: number | undefined;
  /** Rough diameter, m (objects). */
  readonly size?: number | undefined;
  /** Height, m (plants). */
  readonly height?: number | undefined;
}

/** An item where the layout put it (sim/layout), to turn into a chosen spot. */
export interface LaidOutItem {
  readonly x: number;
  readonly z: number;
  /** Radians. */
  readonly rotation: number;
  readonly size?: number;
  readonly height?: number;
  readonly elevation?: number;
}

const DEGREES_PER_RADIAN = 180 / Math.PI;
const FULL_TURN = 360;
/** Angles are kept to a thousandth of a degree: plenty, and tidy in the file. */
const ANGLE_PRECISION = 1000;

type Entry = FloraSpec | PropSpec;

/** Lengths are kept to the millimeter, the scene files' precision. */
const MILLIMETERS = 1000;
const tidyLength = (meters: number): number => Math.round(meters * MILLIMETERS) / MILLIMETERS;

/** A spot with its lengths to the millimeter. */
function tidySpot(spot: Spot): Spot {
  const tidy = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : tidyLength(value);
  const { y, size, height } = spot;
  return {
    ...spot,
    x: tidyLength(spot.x),
    z: tidyLength(spot.z),
    ...(y === undefined ? {} : { y: tidy(y) }),
    ...(size === undefined ? {} : { size: tidy(size) }),
    ...(height === undefined ? {} : { height: tidy(height) }),
  };
}

const tidyAngle = (degrees: number): number =>
  Math.round((((degrees % FULL_TURN) + FULL_TURN) % FULL_TURN) * ANGLE_PRECISION) / ANGLE_PRECISION;

/** The spots of an entry, its random items turned into chosen spots where they stood. */
function spotsOf(entry: Entry, laidOut: readonly LaidOutItem[]): Spot[] {
  if (entry.at !== undefined) return entry.at.slice(0, entry.count);
  return laidOut.map((item) => ({
    x: item.x,
    z: item.z,
    rotation: tidyAngle(item.rotation * DEGREES_PER_RADIAN),
    ...(item.size === undefined ? {} : { size: item.size }),
    ...(item.height === undefined ? {} : { height: item.height }),
  }));
}

/** The scenery with one entry's spots replaced. */
function withSpots(
  scenery: Scenery,
  ref: Pick<ItemRef, "section" | "entry">,
  spots: Spot[],
): Scenery {
  const replace = <T extends Entry>(entries: readonly T[]): T[] =>
    entries.map((entry, index) =>
      index === ref.entry ? { ...entry, count: spots.length, at: spots.map(tidySpot) } : entry,
    );
  return ref.section === "flora"
    ? { ...scenery, flora: replace(scenery.flora) }
    : { ...scenery, props: replace(scenery.props) };
}

/** Changes one item's spot; the entry's other items keep theirs. */
function editSpot(
  scenery: Scenery,
  ref: ItemRef,
  laidOut: readonly LaidOutItem[],
  change: (spot: Spot) => Spot | undefined,
): Scenery {
  const entry = scenery[ref.section][ref.entry];
  if (entry === undefined) return scenery;
  const spots = spotsOf(entry, laidOut);
  const spot = spots[ref.item];
  if (spot === undefined) return scenery;
  const changed = change(spot);
  if (changed === undefined) spots.splice(ref.item, 1);
  else spots[ref.item] = changed;
  return withSpots(scenery, ref, spots);
}

/** A spot without a height above the sand. */
function onTheGround(spot: Spot): Spot {
  const copy: { -readonly [Key in keyof Spot]: Spot[Key] } = { ...spot };
  delete copy.y;
  return copy;
}

/**
 * Adds an item of an object at a spot: to the entry of chosen spots the
 * scene already has for it, or to a new entry with the object's defaults
 * (always, with `newEntry`).
 */
export function placeItem(
  scenery: Scenery,
  id: string,
  object: ObjectManifest,
  spot: Spot,
  newEntry = false,
): { readonly scenery: Scenery; readonly ref: ItemRef } {
  const section = object.category === "plant" ? "flora" : "props";
  const entries: readonly Entry[] = scenery[section];
  const limit = section === "flora" ? MAX_FLORA_PER_ENTRY : MAX_PROPS_PER_ENTRY;
  const existing = newEntry
    ? -1
    : entries.findLastIndex(
        (entry) => entry.kind === id && entry.at !== undefined && entry.at.length < limit,
      );
  const entry = existing >= 0 ? existing : entries.length;
  const grown: Scenery =
    existing >= 0
      ? scenery
      : section === "flora"
        ? { ...scenery, flora: [...scenery.flora, floraEntryFor(id, object)] }
        : { ...scenery, props: [...scenery.props, propEntryFor(id, object)] };
  const target = grown[section][entry];
  const spots = [...(target?.at?.slice(0, target.count) ?? []), spot];
  return {
    scenery: withSpots(grown, { section, entry }, spots),
    ref: { section, entry, item: spots.length - 1 },
  };
}

/** A brush stroke's dab: its middle on the floor, its radius and how far apart its items stay, m. */
export interface Brush {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly spacing: number;
}

/** Tries per dab, for each item the dab could hold at its spacing. */
const TRIES_PER_ITEM = 1.5;
/** Most tries per dab, so a fine spacing in a big brush stays quick. */
const MAX_TRIES = 120;

/**
 * Paints items of an object within a brush dab, at random spots no closer
 * to each other (or to the object's items already there) than the spacing:
 * a carpet, a clump of plants, a scatter of pebbles. `groundAt` gives the
 * rest of an item's spot at (x, z) (its height above the sand on rock, and
 * any size or height of its own), or undefined where nothing can stand. Items go in the object's entry of chosen spots,
 * a new one when it is full.
 */
export function paintItems(
  scenery: Scenery,
  id: string,
  object: ObjectManifest,
  brush: Brush,
  groundAt: (x: number, z: number) => Omit<Spot, "x" | "z"> | undefined,
  rng: Rng,
): Scenery {
  const section = object.category === "plant" ? "flora" : "props";
  const limit = section === "flora" ? MAX_FLORA_PER_ENTRY : MAX_PROPS_PER_ENTRY;
  const taken: { x: number; z: number }[] = (scenery[section] as readonly Entry[])
    .filter((entry) => entry.kind === id)
    .flatMap((entry) => entry.at?.slice(0, entry.count) ?? []);
  const fits = Math.ceil((brush.radius / brush.spacing) ** 2);
  const tries = Math.min(Math.ceil(fits * TRIES_PER_ITEM), MAX_TRIES);
  let painted = scenery;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const distance = brush.radius * Math.sqrt(rng.next());
    const angle = rng.range(0, Math.PI * 2);
    const x = brush.x + Math.cos(angle) * distance;
    const z = brush.z + Math.sin(angle) * distance;
    const crowded = taken.some((other) => Math.hypot(other.x - x, other.z - z) < brush.spacing);
    const ground = crowded ? undefined : groundAt(x, z);
    if (ground === undefined) continue;
    const entries: readonly Entry[] = painted[section];
    const open = entries.findLastIndex(
      (entry) => entry.kind === id && entry.at !== undefined && entry.at.length < limit,
    );
    if (open < 0) {
      painted = placeItem(painted, id, object, { x, z, ...ground }, true).scenery;
    } else {
      const entry = entries[open];
      const spots = [...(entry?.at?.slice(0, entry.count) ?? []), { x, z, ...ground }];
      painted = withSpots(painted, { section, entry: open }, spots);
    }
    taken.push({ x, z });
  }
  return painted;
}

/** Gives the whole entry of an item one color. */
export function recolorEntry(scenery: Scenery, ref: ItemRef, color: string): Scenery {
  const recolor = <T extends Entry>(entries: readonly T[]): T[] =>
    entries.map((entry, index) => (index === ref.entry ? { ...entry, color } : entry));
  return ref.section === "flora"
    ? { ...scenery, flora: recolor(scenery.flora) }
    : { ...scenery, props: recolor(scenery.props) };
}

/** Moves an item to a spot (x, z and its height above the sand). */
export function moveItem(
  scenery: Scenery,
  ref: ItemRef,
  laidOut: readonly LaidOutItem[],
  to: Pick<Spot, "x" | "z" | "y">,
): Scenery {
  return editSpot(scenery, ref, laidOut, (spot) => ({
    ...onTheGround(spot),
    x: to.x,
    z: to.z,
    ...(to.y === undefined ? {} : { y: to.y }),
  }));
}

/** Turns an item about the vertical by some degrees. */
export function turnItem(
  scenery: Scenery,
  ref: ItemRef,
  laidOut: readonly LaidOutItem[],
  degrees: number,
): Scenery {
  return editSpot(scenery, ref, laidOut, (spot) => ({
    ...spot,
    rotation: tidyAngle((spot.rotation ?? 0) + degrees),
  }));
}

/**
 * Scales an item: an object's size or a plant's height. An item that has
 * neither yet (drawn from its entry's range) starts from the entry's middle.
 */
export function resizeItem(
  scenery: Scenery,
  ref: ItemRef,
  laidOut: readonly LaidOutItem[],
  factor: number,
): Scenery {
  const entry = scenery[ref.section][ref.entry];
  if (entry === undefined) return scenery;
  const middle = (range: readonly [number, number] | undefined): number | undefined =>
    range === undefined ? undefined : (range[0] + range[1]) / 2;
  return editSpot(scenery, ref, laidOut, (spot) => {
    if (ref.section === "flora") {
      const height = spot.height ?? middle("height" in entry ? entry.height : undefined);
      return height === undefined ? spot : { ...spot, height: height * factor };
    }
    const size = spot.size ?? middle("size" in entry ? entry.size : undefined);
    return size === undefined ? spot : { ...spot, size: size * factor };
  });
}

/** Removes an item. */
export function removeItem(
  scenery: Scenery,
  ref: ItemRef,
  laidOut: readonly LaidOutItem[],
): Scenery {
  return editSpot(scenery, ref, laidOut, () => undefined);
}

/**
 * Lets every item set at a height above the sand stand on what is under it
 * now: `supportAt` gives the height of the highest support at or below that
 * height, 0 for the sand (then the item simply stands on the ground).
 */
export function settleItems(
  scenery: Scenery,
  supportAt: (x: number, z: number, y: number) => number,
): Scenery {
  const settle = <T extends Entry>(entries: readonly T[]): T[] =>
    entries.map((entry) => {
      if (entry.at?.every((spot) => spot.y === undefined) !== false) return entry;
      const at = entry.at.map((spot) => {
        if (spot.y === undefined) return spot;
        const y = supportAt(spot.x, spot.z, spot.y);
        return y > 0 ? { ...spot, y } : onTheGround(spot);
      });
      return { ...entry, at };
    });
  return { flora: settle(scenery.flora), props: settle(scenery.props) };
}

interface Ball {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The nearest of the balls a ray passes through, by index; undefined when none. */
export function pickItem(
  balls: readonly Ball[],
  origin: Point,
  direction: Point,
): number | undefined {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return undefined;
  const dx = direction.x / length;
  const dy = direction.y / length;
  const dz = direction.z / length;
  let nearest: number | undefined;
  let nearestDistance = Infinity;
  balls.forEach((ball, index) => {
    const ox = ball.x - origin.x;
    const oy = ball.y - origin.y;
    const oz = ball.z - origin.z;
    const along = ox * dx + oy * dy + oz * dz;
    const apartSquared = ox * ox + oy * oy + oz * oz - along * along;
    if (along < 0 || apartSquared > ball.radius * ball.radius) return;
    if (along < nearestDistance) {
      nearestDistance = along;
      nearest = index;
    }
  });
  return nearest;
}
